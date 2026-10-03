import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { download } = require('../../apps/lg-webos/service/network.js');
const cli = createRequire(require.resolve('@webos-tools/cli/package.json'));
const { parse } = cli('acorn');
const { readFile } = await import('node:fs/promises');

async function fixture(run) {
  const m3u = '#EXTM3U x-tvg-url="https://example.com/guide.xml?password=secret"\n#EXTINF:-1,Teste\nhttps://example.com/live/test.m3u8\n';
  const server = createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/m3u' }); response.end(); }
    else if (request.url === '/gzip') { response.writeHead(200, { 'Content-Encoding': 'gzip' }); response.end(gzipSync(m3u)); }
    else if (request.url === '/m3u') response.end(m3u);
    else if (request.url === '/large') response.end('#EXTM3U\n' + 'a'.repeat(400000));
    else if (request.url === '/epg') response.end('<?xml version="1.0"?><tv><channel id="1"/></tv>');
    else if (request.url === '/empty') response.end();
    else if (request.url === '/slow') { request.on('close', () => response.destroy()); }
    else { response.writeHead(404); response.end('password=secret'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('service syntax is compatible with the Node 8 runtime', async () => {
  for (const filename of ['network.js', 'service.js', 'guide.js', 'catalog.js', 'xmltv.js', 'm3u-parser.bundle.js', 'xmltv-parser.bundle.js']) {
    parse(await readFile(new URL(`../../apps/lg-webos/service/${filename}`, import.meta.url), 'utf8'), { ecmaVersion: 2017 });
  }
});

test('M3U, redirects and gzip are read without browser APIs', () => fixture(async (base) => {
  for (const path of ['/m3u', '/redirect', '/gzip']) {
    const result = await download(base + path, { full: true, allowLoopback: true });
    assert.equal(result.http, 200);
    assert.equal(result.headerValid, true);
    assert.equal(result.complete, true);
    assert.ok(result.bytes > 0);
  }
}));

test('EPG root is detected and error bodies are not returned', () => fixture(async (base) => {
  const epg = await download(base + '/epg', { kind: 'EPG', full: true, allowLoopback: true });
  assert.equal(epg.headerValid, true);
  const error = await download(base + '/missing', { allowLoopback: true });
  assert.equal(error.error, 'HTTP_404');
  assert.equal(JSON.stringify(error).includes('secret'), false);
  const empty = await download(base + '/empty', { kind: 'EPG', allowLoopback: true });
  assert.equal(empty.error, 'EMPTY_BODY');
}));

test('sample, size and total-time limits stop downloads', () => fixture(async (base) => {
  const sample = await download(base + '/large', { allowLoopback: true });
  assert.equal(sample.complete, false);
  assert.equal(sample.error, undefined);
  const large = await download(base + '/large', { full: true, maxBytes: 1000, allowLoopback: true });
  assert.equal(large.error, 'SIZE_LIMIT');
  const slow = await download(base + '/slow', { timeoutMs: 50, allowLoopback: true });
  assert.equal(slow.error, 'TIMEOUT');
}));

test('rejects invalid protocols and private destinations by default', async () => {
  assert.equal((await download('file:///etc/passwd')).error, 'INVALID_URL');
  assert.equal((await download('http://127.0.0.1/')).error, 'PRIVATE_ADDRESS');
});

test('a completed download waits for its final asynchronous disk write', () => fixture(async (base) => {
  let persisted = false;
  const result = await download(base + '/m3u', { full: true, allowLoopback: true, onData: async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    persisted = true;
  } });
  assert.equal(result.complete, true);
  assert.equal(persisted, true);
  const failed = await download(base + '/m3u', { full: true, allowLoopback: true, onData: async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    throw Object.assign(new Error('private detail'), { code: 'ENOSPC' });
  } });
  assert.equal(failed.error, 'ENOSPC');
  assert.equal(failed.complete, false);
  assert.equal(JSON.stringify(failed).includes('private detail'), false);
}));
