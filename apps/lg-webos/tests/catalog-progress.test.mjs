import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { canReuseCatalog, catalogExpiresAt, describeCatalogProgress } from '../src/lib/catalog-progress.ts';

const require = createRequire(import.meta.url);
const network = require('../service/network.js');

test('percentages use known totals only and are specific to the current stage', () => {
  assert.equal(describeCatalogProgress({ stage: 'source' }).percent, null);
  assert.equal(describeCatalogProgress({ stage: 'download', completed: 100 }).percent, null);
  assert.equal(describeCatalogProgress({ stage: 'download', completed: 100, total: 200 }).percent, 50);
  assert.equal(describeCatalogProgress({ stage: 'index', completed: 50, total: 100, items: 30 }).detail, '30 itens organizados');
  assert.equal(describeCatalogProgress({ stage: 'library', kind: 'MOVIE', completed: 1, total: 4 }).percent, 25);
  assert.equal(describeCatalogProgress({ stage: 'episodes', completed: 6, total: 6 }).percent, 100);
  assert.equal(describeCatalogProgress({ stage: 'library', completed: 20, total: 10 }).percent, 100);
});

test('remaining bytes and time estimates use the measured rate, never invent a missing total', () => {
  const measured = { stage: 'download', completed: 20 * 1048576, total: 50 * 1048576, elapsedMs: 10000 };
  const result = describeCatalogProgress(measured);
  assert.match(result.detail, /faltam 30 MB/);
  assert.equal(result.timing, '~ 15 s restantes · 2 MB/s · 10 s decorridos');
  const unknown = describeCatalogProgress({ ...measured, total: null });
  assert.equal(unknown.percent, null);
  assert.equal(unknown.timing, '2 MB/s · 10 s decorridos');
  assert.equal(unknown.detail, '20 MB recebidos');
  const stalled = describeCatalogProgress({ ...measured, stalled: true });
  assert.equal(stalled.timing, 'Aguardando dados · 10 s decorridos');
  const early = describeCatalogProgress({ ...measured, elapsedMs: 100 });
  assert.match(early.timing, /^Estimando tempo restante/);
  assert.equal(early.timing.includes('MB/s'), false);
  const complete = describeCatalogProgress({ ...measured, completed: measured.total });
  assert.match(complete.detail, /faltam 0 MB/);
  assert.match(complete.timing, /^~ 0 s restantes/);
});

test('navigation never extends the native snapshot lifetime and source changes invalidate a warm cache', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const catalog = { nativeCatalogId: 'local', nativeRevision: 'r1', source: { id: 'qa' }, refreshedAt: new Date(now).toISOString() };
  const cached = { catalog, expiresAt: catalogExpiresAt(catalog, now + 60000) };
  assert.equal(cached.expiresAt, now + 6 * 60 * 60000);
  assert.equal(canReuseCatalog(cached, { sourceId: 'qa', revision: 'r1' }, now + 60 * 60000), true);
  assert.equal(canReuseCatalog(cached, { sourceId: 'qa', revision: 'r2' }, now), false);
  assert.equal(canReuseCatalog(cached, { sourceId: 'other', revision: 'r1' }, now), false);
  assert.equal(canReuseCatalog(cached, { sourceId: 'qa', revision: 'r1' }, cached.expiresAt), false);
  assert.equal(catalogExpiresAt({ ...catalog, nativeCatalogId: undefined }, now), now + 5 * 60000);
});

test('download progress counts compressed transfer bytes and leaves chunked totals unknown', async () => {
  const text = '#EXTM3U\n' + '# comment\n'.repeat(10000);
  const compressed = gzipSync(text);
  const server = createServer((request, response) => {
    if (request.url === '/gzip') { response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length }); response.end(compressed); }
    else { response.write('#EXTM3U\n'); response.end('# comment\n'); }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const updates = [];
    const result = await network.download(origin + '/gzip', { full: true, allowLoopback: true, onProgress: (value) => updates.push(value) });
    assert.equal(result.error, undefined);
    assert.equal(result.bytes, Buffer.byteLength(text));
    assert.equal(result.transferredBytes, compressed.length);
    assert.equal(updates.at(-1).totalBytes, compressed.length);
    assert.equal(updates.at(-1).bytes, compressed.length);
    updates.length = 0;
    await network.download(origin + '/chunked', { full: true, allowLoopback: true, onProgress: (value) => updates.push(value) });
    assert.ok(updates.length > 0);
    assert.ok(updates.every((value) => value.totalBytes === null));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
