// Renders tools/og.html at 1200x627 into assets/img/og-image.png using local headless Chrome/Edge.
// Usage: node tools/make-og.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = process.platform === 'win32'
    ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (fs.existsSync(c)) return c;
    } else {
      const r = spawnSync('which', [c], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  throw new Error('Could not locate Chrome/Chromium/Edge. Set CHROME=/path/to/chrome.');
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const chromeBin = findChrome();
  const srv = await createStaticServer({ rootDir: root, port: 0 });
  const cdpPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-og-'));
  const proc = spawn(chromeBin, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1200,627',
    'about:blank',
  ], { stdio: 'ignore' });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ws;
  let idSeq = 0;
  const pending = new Map();

  try {
    for (let i = 0; i < 50; i++) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
        ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        break;
      } catch {
        await sleep(150);
      }
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Could not connect to headless browser');

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    const send = (method, params = {}, sessionId) => {
      const id = ++idSeq;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 627, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `${srv.url}tools/og.html` }, sessionId);
    await sleep(500);

    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 627, scale: 1 },
    }, sessionId);

    const out = path.join(root, 'assets', 'img', 'og-image.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(out, buf);
    console.log(`Wrote ${path.relative(root, out)} (${(buf.length / 1024).toFixed(1)} KB)`);

    // Also render 180x180 PNG apple-touch-icon.png (full-bleed #2c365d square so iOS applies its squircle mask cleanly).
    const appleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 34 34"><rect width="34" height="34" fill="#2c365d"/><path d="M11 22.5L17 11.5L23 22.5Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><g fill="#fff"><circle cx="17" cy="11.5" r="3.6"/><circle cx="11" cy="22.5" r="3.6"/><circle cx="23" cy="22.5" r="3.6"/></g></svg>';
    await send('Emulation.setDeviceMetricsOverride', { width: 180, height: 180, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appleSvg)}` }, sessionId);
    await sleep(250);
    const { data: iconData } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 180, height: 180, scale: 1 },
    }, sessionId);
    const iconOut = path.join(root, 'assets', 'img', 'apple-touch-icon.png');
    const iconBuf = Buffer.from(iconData, 'base64');
    fs.writeFileSync(iconOut, iconBuf);
    console.log(`Wrote ${path.relative(root, iconOut)} (${(iconBuf.length / 1024).toFixed(1)} KB)`);

    await send('Browser.close').catch(() => {});
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    proc.kill();
    await srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 500);
  }
}
