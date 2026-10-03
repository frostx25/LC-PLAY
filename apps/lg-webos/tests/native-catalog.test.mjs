import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { loadNativeCatalog, loadNativeEpisodes, nativeCatalogCall } from '../src/lib/native-catalog.ts';

const require = createRequire(import.meta.url);
const catalog = require('../service/catalog.js');

test('TV imports the entire M3U incrementally, pages every item, and indexes all series episodes', async (context) => {
  const lines = ['#EXTM3U x-tvg-url="https://example.com/guide.xml"'];
  for (let i = 0; i < 2100; i++) lines.push(`#EXTINF:-1 group-title="Canais | Abertos",Canal ${i}`, `https://example.com/live/${i}.ts`);
  for (let i = 0; i < 1600; i++) lines.push(`#EXTINF:-1 group-title="Filmes | Cinema",Filme ${i}`, `https://example.com/movie/${i}.mp4`);
  for (let episode = 1; episode <= 300; episode++) {
    for (let series = 0; series < 4; series++) lines.push(`#EXTINF:-1 group-title="Séries | Netflix",Série ${series} S01E${episode}`, `https://example.com/series/${series}-${episode}.mp4`);
  }
  lines.push('#EXTINF:-1,Duplicado', 'https://example.com/live/0.ts');
  let downloads = 0;
  const server = createServer((_req, response) => { downloads++; response.end(lines.join('\n')); }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await catalog.clear();
    const params = { sourceId: 'qa', revision: 'r1', source: { id: 'qa', name: 'QA', type: 'M3U' }, sourceUrl: `http://127.0.0.1:${server.address().port}/list`, allowLoopback: true };
    const first = catalog.loadCatalog(params), second = catalog.loadCatalog(params);
    assert.equal(first, second, 'concurrent imports share one download');
    const snapshot = await first;
    assert.equal(catalog.progress(params).stage, 'ready');
    assert.equal(catalog.progress(params).items, 4900);
    assert.equal(catalog.progress({ sourceId: 'other', revision: 'r1' }).stage, 'source');
    assert.equal(JSON.stringify(catalog.progress(params)).includes('https:'), false, 'progress contains no provider addresses or credentials');
    assert.deepEqual(snapshot.catalog.summary, { total: 4900, live: 2100, movies: 1600, series: 1200, seriesTitles: 4 });
    assert.equal(snapshot.catalog.truncated, false);
    assert.equal((await catalog.loadCatalog(params)).catalogId, snapshot.catalogId, 'warm cache stays on the TV');
    const args = { catalogId: snapshot.catalogId, sourceId: 'qa', revision: 'r1' };
    const all = async (method, extra, field = 'items') => {
      let offset = 0; const items = [];
      while (offset !== null) { const page = await catalog[method]({ ...args, ...extra, offset }); items.push(...page[field]); offset = page.nextOffset; }
      return items;
    };
    const live = await all('page', { kind: 'LIVE' });
    assert.equal(live.length, 2100); assert.equal(live[2099].name, 'Canal 2099');
    const movies = await all('page', { kind: 'MOVIE' });
    assert.equal(movies.length, 1600); assert.equal(movies[1599].name, 'Filme 1599');
    const series = await all('page', { kind: 'SERIES' }, 'seriesCollections');
    assert.equal(series.length, 4); assert.equal(series[3].episodeCount, 300);
    const episodes = await all('episodes', { seriesId: series[3].id });
    assert.equal(episodes.length, 300); assert.equal(episodes[299].series.episode, 300);
    delete require.cache[require.resolve('../service/catalog.js')];
    const restarted = require('../service/catalog.js');
    const now = context.mock.method(Date, 'now', () => Date.parse(snapshot.catalog.refreshedAt) + 60 * 60000);
    assert.equal((await restarted.loadCatalog(params)).catalogId, snapshot.catalogId, 'disk cache survives service restart and an hour without redownloading');
    assert.equal(downloads, 1);
    now.mock.restore();
    assert.equal((await restarted.page({ ...args, kind: 'LIVE', offset: 2099 })).items[0].name, 'Canal 2099');
    await assert.rejects(catalog.page({ ...args, sourceId: 'another', kind: 'LIVE' }), /SOURCE_MISMATCH/);
    await assert.rejects(catalog.page({ ...args, revision: 'another', kind: 'LIVE' }), /SOURCE_MISMATCH/);
    await assert.rejects(catalog.page({ ...args, catalogId: '../outside', kind: 'LIVE' }), /INVALID_CATALOG/);
    await assert.rejects(catalog.page({ ...args, offset: -1, kind: 'LIVE' }), /INVALID_PAGE/);
    const manifest = await catalog.snapshot(snapshot.catalogId);
    assert.equal(manifest.epgUrl, 'https://example.com/guide.xml');
    assert.ok(manifest.diagnostic.diskBytes > 0);
    console.log(`Native fixture: ${snapshot.catalog.summary.total} items; ${manifest.diagnostic.durationMs}ms; RSS ${(manifest.diagnostic.peakRss / 1048576).toFixed(1)}MiB`);
    const refreshed = await catalog.loadCatalog({ ...params, force: true });
    assert.notEqual(refreshed.catalogId, snapshot.catalogId);
    assert.equal(downloads, 2, 'manual refresh always downloads');
    const expired = context.mock.method(Date, 'now', () => Date.parse(refreshed.catalog.refreshedAt) + 6 * 60 * 60000);
    const renewed = await catalog.loadCatalog(params);
    expired.mock.restore();
    assert.notEqual(renewed.catalogId, refreshed.catalogId, 'cache expires after six hours');
    assert.equal(downloads, 3);
    await assert.rejects(catalog.loadCatalog({ ...params, revision: 'bad', sourceUrl: 'data:bad' }), /INVALID_URL/);
    assert.equal((await catalog.page({ catalogId: refreshed.catalogId, sourceId: 'qa', revision: 'r1', kind: 'LIVE' })).items.length, 250, 'failed refresh preserves the last successful catalog');
  } finally { await catalog.clear(); await new Promise((resolve) => server.close(resolve)); }
});

test('native frontend reports real import and page progress and stops polling before reading pages', async (context) => {
  const previous = globalThis.window;
  const updates = [];
  let polls = 0;
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ sourceId: 'qa', revision: 'r', source: { id: 'qa', type: 'M3U' } })));
  try {
    globalThis.window = { webOS: { service: { request(_uri, options) {
      let timer;
      if (options.method === 'loadCatalog') timer = setTimeout(() => options.onSuccess({ catalogId: 'local', revision: 'r', catalog: { source: { id: 'qa' }, summary: { movies: 2 }, epg: {} } }), 1150);
      else if (options.method === 'catalogProgress') options.onSuccess(++polls === 1 ? { stage: 'download', completed: 10, total: 20 } : { stage: 'index', completed: 20, total: 20, items: 2 });
      else options.onSuccess({ items: [{ id: String(options.parameters.offset) }], nextOffset: options.parameters.offset === 0 ? 1 : null });
      return { cancel() { clearTimeout(timer); } };
    } } } };
    const result = await loadNativeCatalog('MOVIE', 'token', new AbortController().signal, false, (progress) => updates.push(progress));
    assert.equal(result.items.length, 2);
    assert.deepEqual(updates.map((entry) => entry.stage), ['source', 'download', 'index', 'library', 'library', 'library']);
    assert.deepEqual(updates.at(-1), { stage: 'library', kind: 'MOVIE', completed: 2, total: 2 });
    assert.equal(polls, 2);
    updates.length = 0;
    await loadNativeEpisodes('local', 'r', 'qa', 'series', 'token', new AbortController().signal, (progress) => updates.push(progress), 2);
    assert.deepEqual(updates.map((entry) => entry.completed), [0, 1, 2]);
    await assert.rejects(loadNativeEpisodes('local', 'r', 'qa', 'series', 'token', new AbortController().signal, undefined, 3), /incompletos/);
  } finally { globalThis.window = previous; }
});

test('aborting a catalog load cancels progress polling and ignores its late response', async (context) => {
  const previous = globalThis.window;
  const controller = new AbortController();
  const updates = [];
  let pollCallback;
  let cancelled = 0;
  let pollStarted;
  const started = new Promise((resolve) => { pollStarted = resolve; });
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ sourceId: 'qa', revision: 'r', source: { id: 'qa', type: 'M3U' } })));
  try {
    globalThis.window = { webOS: { service: { request(_uri, options) {
      if (options.method === 'catalogProgress') { pollCallback = options.onSuccess; pollStarted(); }
      return { cancel() { cancelled++; } };
    } } } };
    const result = loadNativeCatalog('MOVIE', 'token', controller.signal, false, (progress) => updates.push(progress));
    await started;
    controller.abort();
    await assert.rejects(result, { name: 'AbortError' });
    pollCallback({ stage: 'download', completed: 999 });
    assert.equal(cancelled, 2);
    assert.deepEqual(updates.map((entry) => entry.stage), ['source']);
  } finally { globalThis.window = previous; }
});

test('progress survives a transient failure and a TV reply slower than two seconds', async (context) => {
  const previous = globalThis.window;
  const updates = [];
  let polls = 0;
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ sourceId: 'qa', revision: 'r', source: { id: 'qa', type: 'M3U' } })));
  try {
    globalThis.window = { webOS: { service: { request(_uri, options) {
      let timer;
      if (options.method === 'loadCatalog') timer = setTimeout(() => options.onSuccess({ catalogId: 'local', revision: 'r', catalog: { source: { id: 'qa' }, summary: { movies: 1 }, epg: {} } }), 3600);
      else if (options.method === 'catalogProgress') {
        if (++polls === 1) options.onFailure();
        else timer = setTimeout(() => options.onSuccess({ stage: 'download', completed: 10, total: 20, elapsedMs: 3200 }), 2200);
      } else options.onSuccess({ items: [{ id: 'movie' }], nextOffset: null });
      return { cancel() { clearTimeout(timer); } };
    } } } };
    const result = await loadNativeCatalog('MOVIE', 'token', new AbortController().signal, false, (progress) => updates.push(progress));
    assert.equal(result.items.length, 1);
    assert.equal(polls, 2);
    assert.ok(updates.some((progress) => progress.stage === 'download' && progress.elapsedMs === 3200));
  } finally { globalThis.window = previous; }
});

test('native catalog requests cancel on navigation and ignore late replies', async () => {
  const previous = globalThis.window;
  try {
    let cancelled = 0;
    let callback;
    globalThis.window = { webOS: { service: { request(_uri, options) {
      callback = options.onSuccess;
      return { cancel() { cancelled++; } };
    } } } };
    const controller = new AbortController();
    const result = nativeCatalogCall('loadCatalog', {}, controller.signal);
    controller.abort();
    await assert.rejects(result, { name: 'AbortError' });
    assert.equal(cancelled, 1);
    callback({ catalogId: 'late' });
  } finally { globalThis.window = previous; }
});

test('native frontend uses only the authorized source, Luna pages and local episodes, never backend catalog', async (context) => {
  const previous = globalThis.window;
  const calls = [];
  try {
    context.mock.method(globalThis, 'fetch', async (address) => {
      assert.match(address, /\/media\/source$/);
      return new Response(JSON.stringify({ sourceId: 'qa', revision: 'r', source: { id: 'qa', name: 'QA', type: 'M3U' }, sourceUrl: 'https://provider.example/list', epgUrl: null, providerApiUrl: null }));
    });
    globalThis.window = { PalmServiceBridge: {}, webOS: { service: { request(_uri, options) {
      calls.push(options.method);
      let result;
      if (options.method === 'loadCatalog') result = { catalogId: 'local', revision: 'r', catalog: { source: { id: 'qa' }, summary: { live: 2 }, epg: { status: 'UNAVAILABLE', programmes: 0 } } };
      else result = { items: [{ id: options.parameters.offset === 0 ? 'first' : 'last' }], nextOffset: options.parameters.offset === 0 ? 1 : null };
      options.onSuccess(result); return {};
    } } } };
    const signal = new AbortController().signal;
    const result = await loadNativeCatalog('LIVE', 'token', signal);
    assert.deepEqual(result.items.map((item) => item.id), ['first', 'last']);
    assert.equal(result.nativeCatalogId, 'local');
    assert.deepEqual(calls, ['loadCatalog', 'catalogPage', 'catalogPage']);
    calls.length = 0;
    assert.equal((await loadNativeEpisodes('local', 'r', 'qa', 'series', 'token', signal)).length, 2);
    assert.deepEqual(calls, ['seriesEpisodes', 'seriesEpisodes']);
    await assert.rejects(loadNativeEpisodes('local', 'outdated', 'qa', 'series', 'token', signal), /fonte foi alterada/);
  } finally { globalThis.window = previous; }
});
