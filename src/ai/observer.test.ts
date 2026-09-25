// Unit tests for the AI observer: prompt grounding, strict JSON validation,
// and the worker state machine (fake worker, no model download).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiObserver,
  buildObserverPrompt,
  parseObserverJson,
  type FrameLike,
  type WorkerLike,
} from './observer';

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const CANDIDATES = ['Earth', 'Mars', 'Sol'];

function makeObserver(getFrame: () => FrameLike | null = () => null) {
  const fake = new FakeWorker();
  const observer = new AiObserver({
    createWorker: () => fake,
    modelId: 'test-model',
    intervalMs: 3000,
    maxTokens: 96,
    getFrame,
  });
  return { observer, fake };
}

function stubWebGpu(): void {
  vi.stubGlobal('navigator', { gpu: {} });
}

describe('buildObserverPrompt', () => {
  it('grounds the model with candidates, gesture, and the schema', () => {
    const prompt = buildObserverPrompt(CANDIDATES, 'POINT');
    expect(prompt).toContain('Earth');
    expect(prompt).toContain('Mars');
    expect(prompt).toContain('POINT');
    expect(prompt).toContain('"confidence"');
  });

  it('handles an empty scene gracefully', () => {
    expect(buildObserverPrompt([], 'NONE')).toContain('(no objects)');
  });
});

describe('parseObserverJson', () => {
  it('accepts clean JSON with a listed target', () => {
    const r = parseObserverJson(
      '{"intent":"pointing_at","target":"Mars","confidence":0.82}',
      CANDIDATES,
    );
    expect(r).toEqual({ intent: 'pointing_at', target: 'Mars', confidence: 0.82 });
  });

  it('tolerates chatter around the JSON and canonicalizes casing', () => {
    const r = parseObserverJson('Sure! {"intent":"grabbing", "target":"earth", "confidence":0.7} done.', CANDIDATES);
    expect(r).toEqual({ intent: 'grabbing', target: 'Earth', confidence: 0.7 });
  });

  it('rejects unknown intents and garbage', () => {
    expect(parseObserverJson('{"intent":"mind_control","target":null}', CANDIDATES)).toBeNull();
    expect(parseObserverJson('no json here', CANDIDATES)).toBeNull();
    expect(parseObserverJson('', CANDIDATES)).toBeNull();
  });

  it('degrades hallucinated targets to null at half confidence', () => {
    const r = parseObserverJson('{"intent":"pointing_at","target":"Krypton","confidence":0.9}', CANDIDATES);
    expect(r).toEqual({ intent: 'pointing_at', target: null, confidence: 0.45 });
  });

  it('defaults missing confidence to 0.5 and clamps the range', () => {
    expect(parseObserverJson('{"intent":"idle","target":null}', CANDIDATES)?.confidence).toBe(0.5);
    expect(parseObserverJson('{"intent":"idle","target":null,"confidence":7}', CANDIDATES)?.confidence).toBe(1);
  });
});

describe('AiObserver state machine', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts off and stays silent', () => {
    const { observer, fake } = makeObserver();
    observer.tick(1000, CANDIDATES, 'POINT');
    expect(fake.posted.length).toBe(0);
    expect(observer.snapshot().status).toBe('off');
  });

  it('refuses without WebGPU and explains why', () => {
    vi.stubGlobal('navigator', {});
    const { observer } = makeObserver();
    observer.setEnabled(true);
    const snap = observer.snapshot();
    expect(snap.status).toBe('no-webgpu');
    expect(snap.error).toContain('WebGPU');
  });

  it('loads, polls on interval, and stores validated readings', () => {    stubWebGpu();
    const frame: FrameLike = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const { observer, fake } = makeObserver(() => frame);
    observer.setEnabled(true);
    expect(fake.posted[0]).toEqual({ type: 'init', modelId: 'test-model' });
    expect(observer.snapshot().status).toBe('loading');

    fake.reply({ type: 'ready' });
    observer.tick(10000, CANDIDATES, 'POINT');
    expect(fake.posted.length).toBe(2); // init + first observe
    observer.tick(11000, CANDIDATES, 'POINT'); // throttled: no resend
    expect(fake.posted.length).toBe(2);

    fake.reply({ type: 'result', text: '{"intent":"pointing_at","target":"Earth","confidence":0.77}' });
    const snap = observer.snapshot();
    expect(snap.reading).toEqual({ intent: 'pointing_at', target: 'Earth', confidence: 0.77 });
    expect(snap.ageMs).not.toBeNull();

    observer.tick(14000, CANDIDATES, 'POINT'); // interval elapsed: polls again
    expect(fake.posted.length).toBe(3);
  });

  it('recovers from busy and surfaces worker errors', () => {
    stubWebGpu();
    const frame: FrameLike = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const { observer, fake } = makeObserver(() => frame);
    observer.setEnabled(true);
    fake.reply({ type: 'ready' });
    observer.tick(10000, CANDIDATES, 'POINT');
    fake.reply({ type: 'busy' });
    observer.tick(14000, CANDIDATES, 'POINT');
    expect(fake.posted.length).toBe(3); // retried after busy
    fake.reply({ type: 'error', message: 'boom' });
    const snap = observer.snapshot();
    expect(snap.status).toBe('error');
    expect(snap.error).toBe('boom');
  });

  it('reports no-camera without a frame and shuts down cleanly', () => {
    stubWebGpu();
    const { observer, fake } = makeObserver(() => null);
    observer.setEnabled(true);
    fake.reply({ type: 'ready' });
    observer.tick(10000, CANDIDATES, 'POINT');
    expect(observer.snapshot().status).toBe('no-camera');
    expect(fake.posted.length).toBe(1); // init only, no observe sent
    observer.setEnabled(false);
    expect(fake.terminated).toBe(true);
    expect(observer.snapshot().status).toBe('off');
  });

  it('normalizes 0–100 download progress to a 0–1 fraction', () => {
    stubWebGpu();
    const { observer, fake } = makeObserver(() => null);
    observer.setEnabled(true);
    fake.reply({ type: 'progress', progress: 45 });
    expect(observer.snapshot().progress).toBeCloseTo(0.45, 8);
    fake.reply({ type: 'progress', progress: 1 });
    expect(observer.snapshot().progress).toBeCloseTo(1, 8);
  });
});
