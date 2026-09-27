/* DSR Dictation - Whisper runs here, off the UI thread.
   On a phone a single transcription can take many seconds; doing that on the main
   thread froze the whole app ("Transcribing..." forever, buttons dead).
   Messages in : {type:'load', model} | {type:'run', id, audio:Float32Array(16 kHz)}
   Messages out: {type:'progress', file, loaded, total} | {type:'ready', device}
                 {type:'result', id, text, ms} | {type:'error', id?, message} */
// self-hosted copy (not the CDN): its multi-threaded WASM spawns helper Workers from its own URL,
// and a Worker script must be same-origin
import { pipeline, env } from './vendor/transformers.min.js';

env.allowLocalModels = false;
// multi-threaded WASM needs cross-origin isolation (the service worker adds the headers)
const THREADS = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) : 1;
try { env.backends.onnx.wasm.numThreads = THREADS; } catch (e) {}

let pipe = null, model = '', device = '';

async function hasWebGPU() {
  try { return !!(self.navigator && navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch (e) { return false; }
}

async function load(name, noGpu) {
  if (pipe && model === name) { postMessage({ type: 'ready', device }); return; }
  pipe = null;
  const progress_callback = p => {
    if (p && p.status === 'progress' && p.file) postMessage({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0 });
  };
  // GPU is several times faster where the phone supports it; otherwise quantised WASM
  // (skipped once it has failed on this device – otherwise every load re-tries the GPU files)
  if (!noGpu && await hasWebGPU()) {
    postMessage({ type: 'stage', stage: 'starting the engine on the graphics chip (GPU)' });
    try {
      pipe = await pipeline('automatic-speech-recognition', name, {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
      device = 'GPU';
    } catch (e) { pipe = null; postMessage({ type: 'gpufail', message: String((e && e.message) || e) }); }
  }
  if (!pipe) {
    postMessage({ type: 'stage', stage: 'starting the engine on the CPU' });
    pipe = await pipeline('automatic-speech-recognition', name, { device: 'wasm', dtype: 'q8', progress_callback });
    device = 'CPU';
  }
  model = name;
  if (device === 'CPU') device = 'CPU ×' + THREADS;
  postMessage({ type: 'ready', device });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') await load(m.model, m.noGpu);
    else if (m.type === 'run') {
      if (!pipe) throw new Error('model not loaded');
      const t0 = performance.now();
      // English-only (.en) models reject task/language options.
      // Cap output tokens to what that much speech could hold (~4 tokens/s): on noise Whisper
      // can loop repeating itself up to 448 tokens, which on a phone CPU takes minutes.
      const secs = m.audio.length / 16000;
      const out = await pipe(m.audio, { chunk_length_s: 30, max_new_tokens: Math.min(440, Math.ceil(secs * 5) + 12) });
      postMessage({ type: 'result', id: m.id, text: ((out && out.text) || '').trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
