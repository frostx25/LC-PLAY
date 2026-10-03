import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const origin = 'https://lcplay.thxtech.site';
const checks = [];

async function request(path, status = 200, options = {}) {
  const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, status, `${path}: unexpected HTTP status`);
  checks.push({ path, method: options.method || 'GET', status });
  return response;
}

for (const path of ['/legal/', '/legal/privacidade', '/legal/termos']) {
  const response = await request(path);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /LC PLAY/);
  assert.ok(!html.includes('\uFFFD'), `${path}: invalid Unicode`);
}
await request('/legal/styles.css');

const playlist = await (await request('/playlist.m3u')).text();
assert.match(playlist, /^#EXTM3U/);
const urls = playlist.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('http'));
assert.equal(urls.length, 6);
assert.equal(new Set(urls).size, 6);
assert.ok(urls.every((url) => new URL(url).origin === origin));
assert.match(playlist, /x-tvg-url="https:\/\/lcplay\.thxtech\.site\/epg.xml"/);

const xml = await (await request('/epg.xml')).text();
assert.equal((xml.match(/<channel /g) || []).length, 2);
assert.equal((xml.match(/<programme /g) || []).length, 10);
assert.match(xml, /\d{14} \+0000/);

const media = await request('/media/sample.mp4', 206, { headers: { Range: 'bytes=0-1023' } });
assert.match(media.headers.get('content-range'), /^bytes 0-1023\/\d+$/);
assert.equal((await media.arrayBuffer()).byteLength, 1024);
const hls = await (await request('/media/clip.m3u8')).text();
assert.match(hls, /^#EXTM3U/);
assert.match(hls, /#EXT-X-ENDLIST/);
const segment = await request('/media/segment-000.ts', 200, { method: 'HEAD' });
assert.ok(Number(segment.headers.get('content-length')) > 0);
await request('/assets/store-icon-400.png', 200, { method: 'HEAD' });
await request('/media/sample.mp4', 204, { method: 'OPTIONS' });
await request('/playlist.m3u', 405, { method: 'POST' });

for (const path of ['/rights.json', '/.env', '/artifacts/lg-submission/reviewer-access.private.json', '/apps/api/.env', '/media/%2e%2e%2f.env']) {
  await request(path, 404);
}
const api = await fetch('https://api-lcplay.thxtech.site/api/v1/device/media/source', { signal: AbortSignal.timeout(20_000) });
assert.equal(api.status, 401);
checks.push({ path: 'api:/api/v1/device/media/source', status: 401 });

const output = resolve(root, 'artifacts/production-validation');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'lg-public.json'), JSON.stringify({ checkedAt: new Date().toISOString(), origin, checks }, null, 2) + '\n');
console.log(`${checks.length} checks passed: HTTPS documents, owned M3U/EPG/media, range requests and private-route isolation.`);
