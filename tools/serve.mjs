// Zero-dependency local static HTTP server for development, OG image rendering, and E2E verification.
// Usage: node tools/serve.mjs [--port 8080] [--dir .]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.zip': 'application/zip',
};

export function createStaticServer({ rootDir = root, port = 0, host = '127.0.0.1' } = {}) {
  const baseDir = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath.endsWith('/')) reqPath += 'index.html';
      const candidate = path.resolve(baseDir, `.${reqPath}`);
      if (candidate !== baseDir && !candidate.startsWith(`${baseDir}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let filePath = candidate;
      let status = 200;
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        if (fs.existsSync(idx) && fs.statSync(idx).isFile()) {
          filePath = idx;
        } else {
          status = 404;
          const fallback404 = path.join(baseDir, '404.html');
          if (fs.existsSync(fallback404)) {
            filePath = fallback404;
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(status, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        port: addr.port,
        url: `http://${host}:${addr.port}/`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const portIdx = process.argv.indexOf('--port');
  const dirIdx = process.argv.indexOf('--dir');
  const port = portIdx > 0 ? Number(process.argv[portIdx + 1]) : Number(process.env.PORT || 8080);
  const rootDir = dirIdx > 0 ? path.resolve(process.argv[dirIdx + 1]) : root;
  const srv = await createStaticServer({ rootDir, port });
  console.log(`Reply Debt local server listening at ${srv.url}`);
}
