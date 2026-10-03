import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { normalizeReviewUrl, parseByteRange, reviewM3u, reviewXmltv } from './lg-review-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/lg-store');
const legalPages = new Map([
  ['/legal', ['index.html', 'text/html; charset=utf-8']],
  ['/legal/', ['index.html', 'text/html; charset=utf-8']],
  ['/legal/privacidade', ['privacidade.html', 'text/html; charset=utf-8']],
  ['/legal/termos', ['termos.html', 'text/html; charset=utf-8']],
  ['/legal/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const allowed = new Map([
  ['/assets/store-icon-400.png', ['assets/store-icon-400.png', 'image/png']],
  ['/assets/splash-candidate-1920.png', ['assets/splash-candidate-1920.png', 'image/png']],
  ['/assets/poster-live.png', ['assets/poster-live.png', 'image/png']],
  ['/assets/poster-movie.png', ['assets/poster-movie.png', 'image/png']],
  ['/assets/poster-series.png', ['assets/poster-series.png', 'image/png']],
  ['/media/sample.mp4', ['media/sample.mp4', 'video/mp4']],
  ['/media/clip.m3u8', ['media/clip.m3u8', 'application/vnd.apple.mpegurl']],
  ...Array.from({ length: 4 }, (_, index) => {
    const filename = `segment-${String(index).padStart(3, '0')}.ts`;
    return [`/media/${filename}`, [`media/${filename}`, 'video/mp2t']];
  }),
]);

export function createReviewServer({ baseUrl = 'http://127.0.0.1:4180', publicOnly = false } = {}) {
  const base = normalizeReviewUrl(baseUrl);
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Range');
    response.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (publicOnly) response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      send(405, 'Read-only resource.'); return;
    }
    try {
      const pathname = new URL(request.url, base).pathname;
      if (pathname === '/') {
        if (publicOnly) { send(404, 'Not found.'); return; }
        send(200, await readFile(resolve(root, 'docs/publicacao-lg/preview.html'), 'utf8'), 'text/html; charset=utf-8'); return;
      }
      if (pathname === '/playlist.m3u') { send(200, reviewM3u(base), 'application/x-mpegURL; charset=utf-8'); return; }
      if (pathname === '/epg.xml') { send(200, reviewXmltv(), 'application/xml; charset=utf-8'); return; }
      if (!publicOnly && pathname === '/rights.json') { send(200, await readFile(resolve(output, 'rights.json'), 'utf8'), 'application/json; charset=utf-8'); return; }
      const legalPage = legalPages.get(pathname);
      if (legalPage) {
        send(200, await readFile(resolve(root, 'docs/publicacao-lg/public-site', legalPage[0]), 'utf8'), legalPage[1]); return;
      }
      const asset = allowed.get(pathname);
      if (!asset) { send(404, 'Not found.'); return; }
      const filename = resolve(output, asset[0]);
      const { size } = await stat(filename);
      const range = parseByteRange(request.headers.range, size);
      response.setHeader('Accept-Ranges', 'bytes');
      if (range === false) {
        response.setHeader('Content-Range', `bytes */${size}`);
        send(416, 'Invalid byte range.'); return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? size - 1;
      response.setHeader('Content-Type', asset[1]);
      response.setHeader('Content-Length', end - start + 1);
      if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      response.writeHead(range ? 206 : 200);
      if (request.method === 'HEAD') { response.end(); return; }
      await pipeline(createReadStream(filename, { start, end }), response);
    } catch (error) {
      if (!response.headersSent) send(error.code === 'ENOENT' ? 503 : 500, 'QA asset unavailable. Run pnpm lg:store:assets first.');
      else if (!response.destroyed) response.destroy();
    }
  });
}

export function createPublicReviewServer({ baseUrl }) {
  const base = normalizeReviewUrl(baseUrl);
  if (!base.startsWith('https://')) throw new Error('Public LG review requires HTTPS.');
  return createReviewServer({ baseUrl: base, publicOnly: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.LG_REVIEW_HOST || '127.0.0.1';
  const port = Number(process.env.LG_REVIEW_PORT || 4180);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid LG_REVIEW_PORT.');
  if (host !== '127.0.0.1' && !process.env.LG_REVIEW_BASE_URL) {
    throw new Error('Set LG_REVIEW_BASE_URL to the LAN address before exposing the fixture.');
  }
  const baseUrl = normalizeReviewUrl(process.env.LG_REVIEW_BASE_URL || `http://127.0.0.1:${port}`);
  const server = createReviewServer({ baseUrl });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`Local QA source: ${baseUrl}/`);
    console.log(`M3U: ${baseUrl}/playlist.m3u`);
    console.log(`EPG: ${baseUrl}/epg.xml`);
    console.log('Read-only fixture, without authentication. Never expose it on the public Internet.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
