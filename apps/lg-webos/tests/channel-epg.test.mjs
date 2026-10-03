import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { liveStreamId, nativeGuideSupported, loadChannelEpg } from '../src/lib/channel-epg.ts';

const require = createRequire(import.meta.url);
const { normalizeGuide, loadGuide } = require('../service/guide.js');
const network = require('../service/network.js');

test('extracts only numeric stream IDs from live media URLs', () => {
  assert.equal(liveStreamId('https://example.com/live/user/pass/123.m3u8?token=private'), '123');
  assert.equal(liveStreamId('https://example.com/456.ts'), '456');
  assert.equal(liveStreamId('https://example.com/789'), '789');
  assert.equal(liveStreamId('https://example.com/live/channel.m3u8'), null);
  assert.equal(liveStreamId('invalid'), null);
});

test('stream ID extraction works without Array.at in the LG C1 browser', () => {
  const original = Array.prototype.at;
  let result;
  try { Array.prototype.at = undefined; result = liveStreamId('https://example.com/live/user/pass/123.ts'); }
  finally { Array.prototype.at = original; }
  assert.equal(result, '123');
});

test('normalizes provider timestamps and UTF-8 titles into now and next', () => {
  const time = Date.parse('2026-10-03T03:00:00Z');
  const encoded = (text) => Buffer.from(text).toString('base64');
  const programme = (start, end, title) => ({ start_timestamp: (time + start) / 1000, stop_timestamp: (time + end) / 1000, title: encoded(title), description: encoded('Descrição do programa') });
  const result = normalizeGuide({ epg_listings: [programme(60000, 120000, 'A seguir'), programme(-60000, 60000, 'Notícias'), programme(-120000, -60000, 'Encerrado')] }, time);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.now.title, 'Notícias');
  assert.equal(result.now.description, 'Descrição do programa');
  assert.equal(result.next.title, 'A seguir');
  assert.equal(result.programmes.length, 2);
  assert.equal(normalizeGuide({ epg_listings: [] }, time).status, 'UNAVAILABLE');
  assert.equal(normalizeGuide({ epg_listings: [{ title: 'Invalid' }] }, time).status, 'UNAVAILABLE');
});

test('coalesces and caches guide requests without returning provider credentials', async (context) => {
  let calls = 0;
  context.mock.method(network, 'readJson', async (address) => {
    calls++;
    const url = new URL(address);
    assert.equal(url.searchParams.get('action'), 'get_short_epg');
    assert.equal(url.searchParams.get('stream_id'), '123');
    return { diagnostic: {}, data: { epg_listings: [{ start_timestamp: Date.now() / 1000 - 60, stop_timestamp: Date.now() / 1000 + 3600, title: Buffer.from('Programa atual').toString('base64') }] } };
  });
  const params = { sourceId: 'source-test', revision: '1', providerApiUrl: 'https://example.com/player_api.php?username=user&password=secret', streamId: '123' };
  const results = await Promise.all([loadGuide(params), loadGuide(params)]);
  assert.equal(calls, 1);
  assert.equal(results[0].now.title, 'Programa atual');
  assert.equal(JSON.stringify(results).includes('secret'), false);
  await loadGuide(params);
  assert.equal(calls, 1);
  await loadGuide({ ...params, revision: '2' });
  assert.equal(calls, 2);
});

test('browser preview does not call the TV service', async () => {
  const before = globalThis.window;
  try {
    globalThis.window = { webOS: { platform: { unknown: true } } };
    assert.equal(nativeGuideSupported(), false);
    assert.equal(await loadChannelEpg('source', { streamUrl: 'https://example.com/123.ts' }, 'token', new AbortController().signal), null);
  } finally { globalThis.window = before; }
});

test('maps a media URL ID to the provider channel ID before fetching EPG', async (context) => {
  const calls = [];
  context.mock.method(network, 'readJson', async (address) => {
    const url = new URL(address);
    calls.push(url.searchParams.get('action'));
    if (url.searchParams.get('action') === 'get_live_streams') return { diagnostic: {}, data: [{ stream_id: 999, name: 'Canal Teste', epg_channel_id: 'teste.br' }] };
    assert.equal(url.searchParams.get('stream_id'), '999');
    return { diagnostic: {}, data: { epg_listings: [{ start_timestamp: Date.now() / 1000 - 60, stop_timestamp: Date.now() / 1000 + 3600, title: Buffer.from('Programa correto').toString('base64') }] } };
  });
  const guide = await loadGuide({ sourceId: 'mapping-source', revision: 'r', providerApiUrl: 'https://example.com/player_api.php?username=user&password=secret', streamId: '123', channelName: 'Canal Teste', tvgId: 'teste.br' });
  assert.deepEqual(calls, ['get_live_streams', 'get_short_epg']);
  assert.equal(guide.now.title, 'Programa correto');
});

test('TV loads only its authorized source and discards another source response', async (context) => {
  const before = globalThis.window;
  try {
    let calls = 0;
    globalThis.window = { webOS: { platform: { tv: true }, service: { request(uri, options) {
      calls++;
      assert.equal(uri, 'luna://com.lcplay.tv.guide');
      assert.equal(options.parameters.streamId, '123');
      options.onSuccess({ status: 'AVAILABLE', now: null, next: null, programmes: [] });
      return { cancel() {} };
    } } } };
    context.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer token');
      return new Response(JSON.stringify({ sourceId: 'source', revision: 'r', providerApiUrl: 'https://example.com/player_api.php?username=user&password=secret' }));
    });
    const item = { streamUrl: 'https://example.com/live/123.ts' };
    assert.equal((await loadChannelEpg('source', item, 'token', new AbortController().signal)).status, 'AVAILABLE');
    assert.equal(calls, 1);
    assert.equal(await loadChannelEpg('other-source', item, 'token', new AbortController().signal), null);
    assert.equal(calls, 1);
  } finally { globalThis.window = before; }
});
