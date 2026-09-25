// FastVLM-0.5B observer worker. Runs entirely off the main thread: loads
// the ONNX model on WebGPU once, then answers one-frame visual questions.
// Heavy transformers.js imports live ONLY in this chunk — the main bundle
// never pays for them, and the worker is only created when AI is enabled.

import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
} from '@huggingface/transformers';
import type { WorkerRequest } from './observer';

interface Loaded {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>>;
}

let loaded: Loaded | null = null;
let loading: Promise<void> | null = null;
let busy = false;

const post = (msg: unknown): void => {
  self.postMessage(msg);
};

async function ensureLoaded(modelId: string): Promise<void> {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      const processor = await AutoProcessor.from_pretrained(modelId, {
        progress_callback: (info: { status?: string; file?: string; progress?: number }) => {
          if (info?.status === 'progress') {
            post({ type: 'progress', file: info.file, progress: info.progress ?? 0 });
          }
        },
      });
      const fast = {
        device: 'webgpu',
        dtype: {
          embed_tokens: 'fp16',
          vision_encoder: 'q4',
          decoder_model_merged: 'q4',
        },
      } as const;
      let model;
      try {
        model = await AutoModelForImageTextToText.from_pretrained(modelId, fast);
      } catch (err) {
        // Weak iGPUs / software GL (and some mobiles) lack fp16: retry fully
        // quantized rather than dying. Any other error still propagates.
        if (!/fp16/i.test(err instanceof Error ? err.message : String(err))) throw err;
        model = await AutoModelForImageTextToText.from_pretrained(modelId, {
          device: 'webgpu',
          dtype: 'q4',
        });
      }
      loaded = { processor, model };
    })();
  }
  await loading;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as WorkerRequest;
  try {
    if (msg.type === 'init') {
      await ensureLoaded(msg.modelId);
      post({ type: 'ready' });
      return;
    }
    if (msg.type === 'observe') {
      if (!loaded) {
        post({ type: 'error', message: 'Model not loaded yet.' });
        return;
      }
      if (busy) {
        post({ type: 'busy' });
        return;
      }
      busy = true;
      try {
        const { processor, model } = loaded;
        const frame = new RawImage(msg.image.data, msg.image.width, msg.image.height, 4);
        const messages = [
          {
            role: 'system',
            content: 'You observe a hand-controlled 3D app. Reply with ONLY JSON, no other text.',
          },
          { role: 'user', content: `<image>\n${msg.prompt}` },
        ];
        const formatted = processor.apply_chat_template(messages, { add_generation_prompt: true });
        const inputs = await processor(frame, formatted);
        const generate = model.generate({
          ...inputs,
          max_new_tokens: msg.maxTokens,
          do_sample: false,
        });
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Inference timed out after 120 s.')), 120000);
        });
        const output = (await Promise.race([generate, timeout])) as unknown as
          | number[][]
          | { toString(): string };
        const text = Array.isArray(output)
          ? processor.batch_decode(output, { skip_special_tokens: true })[0]
          : String(output);
        post({ type: 'result', text });
      } finally {
        busy = false;
      }
    }
  } catch (err) {
    busy = false;
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
