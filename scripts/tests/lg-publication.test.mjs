import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { createReviewServer } from '../lg-review-server.mjs';
import { normalizeReviewUrl, parseByteRange, reviewCatalog, reviewItems, reviewM3u, reviewProgrammes, reviewXmltv } from '../lg-review-fixture.mjs';

test('review fixture contains unique URLs and only technical content', () => {
  const m3u = reviewM3u('http://127.0.0.1:4180');
  const urls = m3u.split('\n').filter((line) => line.startsWith('http'));
  assert.equal(urls.length, 6);
  assert.equal(new Set(urls).size, 6);
  assert.ok(urls.every((value) => new URL(value).host === '127.0.0.1:4180'));
  assert.match(m3u, /x-tvg-url="http:\/\/127.0.0.1:4180\/epg.xml"/);
  assert.deepEqual(reviewItems.map((item) => item.kind), ['LIVE', 'LIVE', 'MOVIE', 'MOVIE', 'SERIES', 'SERIES']);
});

test('base URL cannot inject a path or credentials into the source', () => {
  assert.equal(normalizeReviewUrl('http://192.168.15.8:4180/'), 'http://192.168.15.8:4180');
  for (const value of ['file:///tmp', 'http://user:pass@localhost:4180', 'http://localhost/path', 'http://localhost/?secret=x', 'http://localhost/#secret']) {
    assert.throws(() => normalizeReviewUrl(value));
  }
});

test('EPG remains current across dates and half-hour boundaries', () => {
  for (const value of ['2026-10-01T23:59:59Z', '2026-10-02T00:00:00Z', '2027-03-11T17:30:00Z']) {
    const now = new Date(value);
    const programmes = reviewProgrammes(now);
    assert.ok(Date.parse(programmes[0].startsAt) <= now.getTime());
    assert.ok(Date.parse(programmes[0].endsAt) > now.getTime());
    assert.equal(programmes[0].endsAt, programmes[1].startsAt);
    const xml = reviewXmltv(now);
    assert.equal((xml.match(/<programme /g) ?? []).length, 10);
    assert.equal((xml.match(/<channel /g) ?? []).length, 2);
    assert.match(xml, /\d{14} \+0000/);
  }
});

test('preview catalog is separate by kind and correctly groups episodes', () => {
  for (const kind of ['LIVE', 'MOVIE', 'SERIES']) {
    const catalog = reviewCatalog('http://127.0.0.1:4180', kind);
    assert.equal(catalog.items.length, 2);
    assert.equal(catalog.summary.total, 6);
    assert.ok(catalog.items.every((item) => item.kind === kind));
    assert.equal(catalog.groups[0].count, 2);
    assert.equal(Boolean(catalog.items[0].now), kind === 'LIVE');
  }
  assert.deepEqual(reviewCatalog('http://localhost:4180', 'SERIES').items.map((item) => item.series.episode), [1, 2]);
  assert.throws(() => reviewCatalog('http://localhost:4180', 'INVALID'));
});

test('media byte ranges handle seeking and reject malformed values', () => {
  assert.equal(parseByteRange(undefined, 100), null);
  assert.deepEqual(parseByteRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=80-200', 100), { start: 80, end: 99 });
  for (const value of ['bytes=100-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,2-3', 'bytes=a-b']) assert.equal(parseByteRange(value, 100), false);
});

test('read-only helper serves source and EPG, not app credentials or filesystem paths', async (t) => {
  const server = createReviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const playlist = await fetch(`${origin}/playlist.m3u`);
  assert.equal(playlist.status, 200);
  assert.match(await playlist.text(), /#EXTM3U/);
  assert.equal((await fetch(`${origin}/epg.xml`)).status, 200);
  const privacy = await fetch(`${origin}/legal/privacidade`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /noindex, nofollow/);
  assert.equal((await fetch(`${origin}/legal/termos`)).status, 200);
  assert.equal((await fetch(`${origin}/legal/styles.css`)).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await fetch(`${origin}/playlist.m3u`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${origin}/playlist.m3u`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${origin}/api/v1/device/activate`, { method: 'POST' })).status, 405);
  for (const path of ['/apps/api/.env', '/.env', '/%2e%2e%2f.env', '/media/%2e%2e%2f.env', '/legal/%2e%2e%2fprivacidade.md', '/assets/logo.svg']) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  const options = await fetch(`${origin}/media/sample.mp4`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
});

test('manifesto LG referencia recursos obrigatórios e splash 1920 por 1080', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../apps/lg-webos/public/appinfo.json', import.meta.url), 'utf8'));
  assert.equal(manifest.resolution, '1920x1080');
  assert.equal(manifest.iconColor, '#FF6656');
  assert.equal(manifest.splashBackground, 'splash.png');
  assert.ok(typeof manifest.appDescription === 'string' && manifest.appDescription.length <= 60);
  const metadata = await sharp(await readFile(new URL('../../apps/lg-webos/public/splash.png', import.meta.url))).metadata();
  assert.deepEqual([metadata.width, metadata.height, metadata.format], [1920, 1080, 'png']);
});
