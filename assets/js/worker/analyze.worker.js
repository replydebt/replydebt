// Runs parsing and analysis off the main thread so the UI remains responsive on large archives.
import { runPipeline } from '../app/pipeline.js';

self.postMessage({ type: 'ready' });

self.onmessage = async (event) => {
  const { id, input } = event.data || {};
  if (!id || !input) return;
  try {
    const result = await runPipeline(input, (step, pct) => self.postMessage({ id, type: 'progress', step, pct }));
    self.postMessage({
      id,
      type: 'done',
      report: result.report,
      quotes: result.quotes,
      candidates: result.candidates,
    });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err), code: err?.code || '' });
  }
};
