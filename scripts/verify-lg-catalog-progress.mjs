import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReviewServer } from './lg-review-server.mjs';

const require = createRequire(import.meta.url);
const catalog = require('../apps/lg-webos/service/catalog.js');
const output = fileURLToPath(new URL('../artifacts/lg-progress-validation/', import.meta.url));
const preview = process.env.LG_PREVIEW_PLAYER_URL || 'http://127.0.0.1:5173/';
const deferred = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };
const media = createReviewServer().listen(0, '127.0.0.1');
await once(media, 'listening');
const mediaOrigin = `http://127.0.0.1:${media.address().port}`;
const lines = ['#EXTM3U'];
for (let index = 0; index < 2; index++) lines.push(`#EXTINF:-1 group-title="Canais | Testes",Canal ${index}`, `${mediaOrigin}/media/sample.mp4?channel=${index}`);
for (let index = 0; index < 500; index++) lines.push(`#EXTINF:-1 group-title="Filmes | Testes" tvg-logo="${mediaOrigin}/assets/poster-movie.png",Filme ${index}`, `${mediaOrigin}/media/sample.mp4?movie=${index}`);
for (let index = 1; index <= 500; index++) lines.push(`#EXTINF:-1 group-title="Séries | Testes" tvg-logo="${mediaOrigin}/assets/poster-series.png",Série de teste S01E${index}`, `${mediaOrigin}/media/sample.mp4?episode=${index}`);
const body = Buffer.from(lines.join('\n'));
let downloadGate = deferred();
let pageGate = deferred();
let episodeGate = deferred();
let downloads = 0;
let knownSize = true;
let holdMovies = false;
let holdEpisodes = false;
const server = createServer(async (_request, response) => {
  downloads++;
  response.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', ...(knownSize ? { 'Content-Length': body.length } : {}) });
  response.write(body.subarray(0, Math.floor(body.length / 2)));
  await downloadGate.promise;
  if (!response.destroyed) response.end(body.subarray(Math.floor(body.length / 2)));
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const source = { sourceId: 'progress-qa', revision: 'r1', source: { id: 'progress-qa', name: 'LC PLAY QA', type: 'M3U' }, sourceUrl: `http://127.0.0.1:${server.address().port}/list` };
await mkdir(output, { recursive: true });
let browser;
const report = { passed: false, physicalTvTest: false, checks: [], errors: [] };
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    await catalog.clear();
    downloads = 0; source.revision = 'r1';
    knownSize = viewport.width === 1920;
    downloadGate = deferred(); pageGate = deferred(); episodeGate = deferred();
    holdMovies = false; holdEpisodes = false;
    let sourceRequests = 0;
    let revisionUpdate = deferred();
    const loads = [];
    const context = await browser.newContext({ viewport });
    await context.route('**/vendor/webOSTV.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '/* Native service bridge is injected by this local test. */' }));
    const page = await context.newPage();
    await page.clock.install();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.exposeFunction('nativeLuna', async (method, parameters) => {
      if (method === 'loadCatalog') { loads.push(parameters.force); const result = await catalog.loadCatalog({ ...parameters, allowLoopback: true }); if (parameters.revision === 'r2') revisionUpdate.release(); return result; }
      if (method === 'catalogProgress') return catalog.progress(parameters);
      if (method === 'catalogPage') { if (holdMovies && parameters.kind === 'MOVIE' && parameters.offset >= 250) await pageGate.promise; return catalog.page(parameters); }
      if (method === 'seriesEpisodes') { if (holdEpisodes && parameters.offset >= 250) await episodeGate.promise; return catalog.episodes(parameters); }
      if (method === 'clearCatalog') return catalog.clear();
      if (method === 'loadGuide') return { status: 'UNAVAILABLE', now: null, next: null, programmes: [] };
      throw new Error('Unexpected Luna method');
    });
    await page.addInitScript(() => {
      localStorage.setItem('lc_play_device_token', 'local-progress-qa-only');
      window.webOS = { platform: { tv: true }, service: { request(_uri, options) {
        let cancelled = false;
        window.nativeLuna(options.method, options.parameters).then((response) => { if (!cancelled) options.onSuccess(response); }, () => { if (!cancelled) options.onFailure(); });
        return { cancel() { cancelled = true; } };
      } } };
    });
    await context.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const configuration = { device: { id: 'local-qa', label: 'LG QA', status: 'ACTIVE', expiresAt: null }, playlist: { ...source.source, status: 'ACTIVE' }, features: {} };
      if (path.endsWith('/media/source')) { sourceRequests++; return route.fulfill({ json: source }); }
      return route.fulfill({ json: path.endsWith('/configuration') ? configuration : path.endsWith('/epg/source') ? { sourceId: source.sourceId, revision: source.revision } : { ok: true } });
    });
    await page.goto(preview);
    const bar = page.getByRole('progressbar');
    await page.getByRole('status').filter({ hasText: 'Baixando lista' }).waitFor();
    await page.locator('.catalog-progress-details small').filter({ hasText: /[KM]B\/s/ }).waitFor();
    if (knownSize) {
      assert.ok(Number(await bar.getAttribute('aria-valuenow')) >= 49);
      assert.ok((await page.locator('.catalog-progress-details').innerText()).includes('faltam'));
      assert.ok((await page.locator('.catalog-progress-details small').innerText()).includes('restantes'));
    } else {
      assert.equal(await bar.getAttribute('aria-valuenow'), null);
      assert.equal((await page.locator('.catalog-progress-details').innerText()).includes('restantes'), false);
      assert.ok((await page.locator('.catalog-progress-details small').innerText()).includes('decorridos'));
    }
    const checkLayout = async () => {
      const bounds = await page.locator('.tv-page').boundingBox();
      const progress = await page.locator('.tv-shell > .catalog-progress').boundingBox();
      assert.ok(bounds.y + bounds.height <= progress.y + 1, 'progress does not cover the current view');
      assert.ok(progress.y + progress.height <= viewport.height + 1, 'progress fits the TV viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.ok(await page.locator('.home-backdrop').evaluate((image) => image.complete && image.naturalWidth > 0));
      if (await page.locator('.home-screen').count()) {
        const footer = await page.locator('.home-footer').boundingBox();
        const menu = await page.locator('.main-menu').boundingBox();
        assert.ok(menu.y + menu.height <= footer.y + 1, 'menu and footer do not overlap');
        assert.ok(footer.y + footer.height <= progress.y + 1, 'home footer does not cover progress');
      }
    };
    await checkLayout();
    await page.screenshot({ path: output + `download-${viewport.width}.png` });
    downloadGate.release();
    await bar.waitFor({ state: 'detached' });
    assert.equal(downloads, 1);
    holdMovies = true;
    await page.getByRole('button', { name: /^Filmes/ }).click();
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '50');
    await page.screenshot({ path: output + `movies-${viewport.width}.png` });
    assert.equal(downloads, 1, 'opening movies reads the downloaded catalog, not the provider again');
    pageGate.release(); holdMovies = false;
    await bar.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Séries/ }).click();
    await page.locator('.poster-card').first().waitFor();
    holdEpisodes = true;
    await page.locator('.poster-card').first().click();
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '50');
    assert.ok((await page.locator('.catalog-progress').innerText()).includes('250 de 500'));
    await page.screenshot({ path: output + `episodes-${viewport.width}.png` });
    episodeGate.release(); holdEpisodes = false;
    await bar.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const before = loads.length;
    await page.getByRole('button', { name: /^Filmes/ }).click();
    await page.locator('.poster-card').first().waitFor();
    assert.equal(loads.length, before, 'navigation reuses the in-memory movies');
    await page.keyboard.press('Escape');
    assert.equal(downloads, 1, 'returning Home does not download the playlist');
    const beforeChecks = sourceRequests;
    const checked = page.waitForResponse((response) => response.url().endsWith('/media/source'));
    await page.clock.fastForward(5 * 60000);
    await checked;
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'));
    assert.ok(sourceRequests > beforeChecks, 'background cycle checks the assigned source');
    assert.equal(loads.length, before, 'unchanged source does not reload catalog pages');
    assert.equal(downloads, 1);
    source.revision = 'r2';
    await page.clock.fastForward(5 * 60000);
    await revisionUpdate.promise;
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'));
    assert.equal(downloads, 2, 'source revision change refreshes before six-hour expiry');
    await page.getByRole('button', { name: /^Atualizar/ }).click();
    await bar.waitFor({ state: 'detached' });
    assert.equal(downloads, 3, 'manual update bypasses cache');
    assert.equal(loads.at(-1), true);
    report.checks.push(`Real native HTTP progress, ${knownSize ? 'measured remaining time/bytes' : 'unknown total without fabricated ETA'}, movies/episodes 50%, non-overlapping layout, Home/cache/source revision/manual refresh ${viewport.width}x${viewport.height}`);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  downloadGate.release(); pageGate.release(); episodeGate.release();
  await browser?.close();
  await catalog.clear();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => media.close(resolve));
  await writeFile(output + 'report.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
