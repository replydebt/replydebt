// Main-thread client for the analysis worker, with a same-thread fallback for file:// and worker-blocked environments.
const WORKER_IDLE_TIMEOUT_MS = 60000;

let worker = null;
let workerBooted = false;
let workerPolicy = null;
let seq = 0;

function workerScriptUrl() {
  const expected = new URL('assets/app.bundle.js', document.baseURI).href;
  if (typeof window !== 'undefined' && window.trustedTypes?.createPolicy) {
    if (!workerPolicy) {
      workerPolicy = window.trustedTypes.createPolicy('app-worker', {
        createScriptURL(url) {
          const resolved = new URL(url, document.baseURI).href;
          if (resolved !== expected) throw new TypeError('Blocked unexpected worker script URL.');
          return resolved;
        },
      });
    }
    return workerPolicy.createScriptURL(expected);
  }
  return expected;
}

function getWorker() {
  if (worker !== null) return worker;
  if (typeof Worker === 'undefined' || location.protocol === 'file:') {
    worker = false;
    return false;
  }
  try {
    const w = new Worker(workerScriptUrl());
    workerBooted = false;
    w.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ready') workerBooted = true;
    });
    worker = w;
  } catch {
    worker = false;
  }
  return worker;
}

/** Pre-start the worker at page boot so zero network requests occur after archive selection. */
export function warmWorker() {
  getWorker();
}

/**
 * @param {{kind:'zip'|'csv'|'sample', file?:File, files?:File[], buffer?:ArrayBuffer, data?:object, override?:string}} input
 * @param {(step:string, pct:number) => void} onProgress
 */
export async function process(input, onProgress = () => {}) {
  const w = getWorker();
  if (!w) return fallback(input, onProgress);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    let timer = null;
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        try { w.terminate(); } catch { /* ignore */ }
        if (worker === w) {
          worker = null;
          workerBooted = false;
        }
        reject(new Error('Analysis timed out. Please try opening the archive again.'));
      }, WORKER_IDLE_TIMEOUT_MS);
    };
    const cleanup = () => {
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e) => {
      if (!e.data) return;
      workerBooted = true;
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') {
        armTimer();
        onProgress(e.data.step, e.data.pct);
        return;
      }
      cleanup();
      if (e.data.type === 'done') {
        resolve({ report: e.data.report, quotes: e.data.quotes, candidates: e.data.candidates });
      } else {
        reject(Object.assign(new Error(e.data.message || 'Could not analyze archive.'), { code: e.data.code || '' }));
      }
    };
    const onError = (e) => {
      e.preventDefault?.();
      const crashedMidRun = workerBooted;
      cleanup();
      try { w.terminate(); } catch { /* ignore */ }
      if (crashedMidRun) {
        if (worker === w) {
          worker = null;
          workerBooted = false;
        }
        reject(Object.assign(new Error('This archive caused the isolated background parser to stop unexpectedly and was blocked to protect your browser tab.'), { code: 'WORKER_CRASH' }));
        return;
      }
      if (worker === w) worker = false;
      fallback(input, onProgress).then(resolve, reject);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    armTimer();
    w.postMessage({ id, input });
  });
}

async function fallback(input, onProgress) {
  const { runPipeline } = await import('./pipeline.js');
  return runPipeline(input, onProgress);
}
