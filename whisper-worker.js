/* DSR Dictation - Whisper runs here, off the UI thread.
   On a phone a single transcription can take many seconds; doing that on the main
   thread froze the whole app ("Transcribing..." forever, buttons dead).
   Messages in : {type:'load', model} | {type:'run', id, audio:Float32Array(16 kHz)}
   Messages out: {type:'progress', file, loaded, total} | {type:'ready', device}
                 {type:'result', id, text, ms} | {type:'error', id?, message} */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;

let pipe = null, model = '', device = '';

async function hasWebGPU() {
  try { return !!(self.navigator && navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch (e) { return false; }
}

async function load(name) {
  if (pipe && model === name) { postMessage({ type: 'ready', device }); return; }
  pipe = null;
  const progress_callback = p => {
    if (p && p.status === 'progress' && p.file) postMessage({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0 });
  };
  // GPU is several times faster where the phone supports it; otherwise quantised WASM
  if (await hasWebGPU()) {
    try {
      pipe = await pipeline('automatic-speech-recognition', name, {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
      device = 'GPU';
    } catch (e) { pipe = null; }
  }
  if (!pipe) {
    pipe = await pipeline('automatic-speech-recognition', name, { device: 'wasm', dtype: 'q8', progress_callback });
    device = 'CPU';
  }
  model = name;
  postMessage({ type: 'ready', device });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') await load(m.model);
    else if (m.type === 'run') {
      if (!pipe) throw new Error('model not loaded');
      const t0 = performance.now();
      // English-only (.en) models reject task/language options
      const out = await pipe(m.audio, { chunk_length_s: 30 });
      postMessage({ type: 'result', id: m.id, text: ((out && out.text) || '').trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
