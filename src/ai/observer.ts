// AI observer manager (main thread). Owns the FastVLM worker lifecycle,
// polls one frame every few seconds, and validates the model's JSON into a
// strict reading. Output goes to the debug overlay ONLY — the observer never
// touches gestures, interaction, or the scene (validate first, wire later).

/** Messages the main thread sends into the worker. */
export type WorkerRequest =
  | { type: 'init'; modelId: string }
  | {
      type: 'observe';
      image: { data: Uint8ClampedArray; width: number; height: number };
      prompt: string;
      maxTokens: number;
    };

/** Minimal worker surface (real Worker or test fake). */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
  terminate(): void;
}

/** Downscaled video frame for the model. */
export interface FrameLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ObserverIntent = 'pointing_at' | 'grabbing' | 'exploring' | 'idle' | 'unclear';

const INTENTS: ObserverIntent[] = ['pointing_at', 'grabbing', 'exploring', 'idle', 'unclear'];

export interface ObserverReading {
  intent: ObserverIntent;
  /** Canonical candidate name, or null when no clear target. */
  target: string | null;
  confidence: number;
}

export type ObserverStatus = 'off' | 'loading' | 'ready' | 'error' | 'no-camera' | 'no-webgpu';

export interface ObserverSnapshot {
  status: ObserverStatus;
  /** 0..1 download progress while loading, else null. */
  progress: number | null;
  reading: ObserverReading | null;
  /** ms since the last accepted reading, else null. */
  ageMs: number | null;
  error: string | null;
}

/** Constrained user prompt: fixed schema + live candidate list + gesture. */
export function buildObserverPrompt(candidates: string[], gesture: string): string {
  const list = candidates.length > 0 ? candidates.join(', ') : '(no objects)';
  return (
    `The user's hand is visible. Current hand pose: ${gesture}. ` +
    `Visible objects: ${list}. ` +
    `Which fits best: "pointing_at" (hand clearly indicates one listed object), ` +
    `"grabbing" (closed or pinched hand on an object), ` +
    `"exploring" (hand moving, no clear target), ` +
    `"idle" (no hand or resting)? ` +
    `If pointing_at or grabbing, name the target from the list, else null. ` +
    `Reply with ONLY this JSON, no other text: ` +
    `{"intent": "...", "target": "<name from the list>"|null, "confidence": 0.0-1.0}`
  );
}

/**
 * Strict validation of model output. Tolerates chatter around the JSON;
 * degrades (never throws): unknown targets become null at half confidence.
 */
export function parseObserverJson(text: string, candidates: string[]): ObserverReading | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: { intent?: unknown; target?: unknown; confidence?: unknown };
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  if (typeof raw.intent !== 'string' || !(INTENTS as string[]).includes(raw.intent)) return null;
  let target: string | null = null;
  let confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.5;
  if (typeof raw.target === 'string') {
    const named: string = raw.target;
    const hit = candidates.find((c) => c.toLowerCase() === named.toLowerCase());
    if (hit) {
      target = hit; // canonical candidate spelling
    } else {
      target = null;
      confidence *= 0.5; // hallucinated target: keep intent, distrust it
    }
  }
  return { intent: raw.intent as ObserverIntent, target, confidence };
}

let sharedCanvas: HTMLCanvasElement | null = null;

/** Downscale-once frame grab from a playing video (reused canvas, no DOM churn). */
export function captureVideoFrame(video: HTMLVideoElement, targetWidth: number): FrameLike | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  if (typeof document === 'undefined') return null;
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  const scale = targetWidth / video.videoWidth;
  const w = targetWidth;
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  if (sharedCanvas.width !== w || sharedCanvas.height !== h) {
    sharedCanvas.width = w;
    sharedCanvas.height = h;
  }
  const ctx = sharedCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export class AiObserver {
  private worker: WorkerLike | null = null;
  private enabled = false;
  private status: ObserverStatus = 'off';
  private progress: number | null = null;
  private error: string | null = null;
  private reading: ObserverReading | null = null;
  private readingAt = 0;
  private lastSentAt = 0;
  private inFlight = false;
  /** Candidate list frozen at send time (honest validation set on receipt). */
  private pendingCandidates: string[] = [];

  constructor(
    private readonly opts: {
      createWorker: () => WorkerLike;
      modelId: string;
      intervalMs: number;
      maxTokens: number;
      getFrame: () => FrameLike | null;
    },
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled && this.worker) return;
    this.enabled = on;
    if (!on) {
      this.worker?.terminate();
      this.worker = null;
      this.status = 'off';
      this.inFlight = false;
      return;
    }
    if (typeof navigator !== 'undefined' && !('gpu' in navigator)) {
      this.status = 'no-webgpu';
      this.error = 'WebGPU unavailable — AI needs Chrome/Edge with a GPU.';
      return;
    }
    this.status = 'loading';
    this.progress = 0;
    this.error = null;
    const worker = this.opts.createWorker();
    this.worker = worker;
    worker.onmessage = (e: MessageEvent) => this.onWorkerMessage(e.data);
    worker.postMessage({ type: 'init', modelId: this.opts.modelId });
  }

  /** Called every render frame; throttles actual inference internally. */
  tick(now: number, candidates: string[], gesture: string): void {
    if (!this.enabled || !this.worker) return;
    if (this.status !== 'ready' && this.status !== 'no-camera') return;
    if (this.inFlight || now - this.lastSentAt < this.opts.intervalMs) return;
    const frame = this.opts.getFrame();
    if (!frame) {
      this.status = 'no-camera';
      return;
    }
    this.status = 'ready';
    this.inFlight = true;
    this.lastSentAt = now;
    this.pendingCandidates = [...candidates];
    const prompt = buildObserverPrompt(candidates, gesture);
    try {
      this.worker.postMessage(
        { type: 'observe', image: frame, prompt, maxTokens: this.opts.maxTokens },
        [frame.data.buffer as ArrayBuffer],
      );
    } catch (err) {
      this.inFlight = false;
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  snapshot(): ObserverSnapshot {
    return {
      status: this.status,
      progress: this.progress,
      reading: this.reading,
      ageMs: this.reading ? Math.max(0, performance.now() - this.readingAt) : null,
      error: this.error,
    };
  }

  private onWorkerMessage(data: unknown): void {
    const msg = data as { type?: string; text?: string; message?: string; progress?: number };
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'progress': {
        this.status = 'loading';
        const raw = typeof msg.progress === 'number' ? msg.progress : 0;
        // Transformers.js reports 0–100 percent; normalize defensively.
        const frac = raw > 1 ? raw / 100 : raw;
        this.progress = Math.min(1, Math.max(0, frac));
        break;
      }
      case 'ready':
        this.status = 'ready';
        this.progress = null;
        break;
      case 'busy':
        this.inFlight = false;
        break;
      case 'result':
        this.inFlight = false;
        this.reading = parseObserverJson(
          typeof msg.text === 'string' ? msg.text : '',
          this.pendingCandidates,
        );
        this.readingAt = performance.now();
        break;
      case 'error':
        this.inFlight = false;
        this.status = 'error';
        this.error = typeof msg.message === 'string' ? msg.message : 'Unknown worker error.';
        break;
    }
  }
}
