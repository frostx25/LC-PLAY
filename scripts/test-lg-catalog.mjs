import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const playerUrl = process.env.LG_PREVIEW_PLAYER_URL || 'http://127.0.0.1:5173/';
const output = resolve('artifacts/catalog-validation');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const count = 10000;
const source = { id: 'qa-catalog', name: 'Catálogo de teste', type: 'M3U' };
const image = 'http://127.0.0.1:4180/assets/poster-movie.png';
const entry = (id, kind, name, group) => ({ id, kind, name, group, logo: image, streamUrl: '', tvgId: null, series: null, now: null, next: null });
const movies = Array.from({ length: count }, (_, index) => entry(`movie-${index}`, 'MOVIE', `Filme ${String(index).padStart(5, '0')}`, index < 5000 ? 'Filmes | Lançamentos 2026' : 'Filmes | 4K'));
const series = Array.from({ length: 9000 }, (_, index) => ({ id: `series-${index}`, title: `Série ${String(index).padStart(5, '0')}`, group: 'Netflix', logo: image, episodeCount: 30 }));
const live = Array.from({ length: 2500 }, (_, index) => entry(`live-${index}`, 'LIVE', `Canal ${index}`, 'Canais | Abertos'));
const catalog = (kind) => ({ kind, source, summary: { total: 282500, live: live.length, movies: movies.length, series: 270000 }, groups: [], items: kind === 'LIVE' ? live : kind === 'MOVIE' ? movies : [], ...(kind === 'SERIES' ? { seriesCollections: series } : {}), truncated: false, refreshedAt: '2026-10-02T12:00:00Z', epg: { status: 'UNAVAILABLE', programmes: 0 } });
let currentPage;

try {
  await mkdir(output, { recursive: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem('lc_play_device_token', 'qa-only-token'));
    let episodeRequests = 0;
    let failEpisodes = true;
    await context.route('**/api/v1/device/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/configuration')) return route.fulfill({ json: { device: { id: 'qa', label: 'Teste', status: 'ACTIVE', expiresAt: null }, playlist: { ...source, status: 'ACTIVE', itemCount: 282500, lastSyncAt: null }, features: {} } });
      if (url.pathname.endsWith('/heartbeat')) return route.fulfill({ json: {} });
      if (url.pathname.includes('/catalog/series/')) {
        episodeRequests++;
        if (failEpisodes) return route.fulfill({ status: 502, json: { message: 'Falha de teste. Tente novamente.' } });
        return route.fulfill({ json: Array.from({ length: 30 }, (_, index) => ({ ...entry(`ep-${index}`, 'SERIES', `Série S${index < 15 ? '01' : '02'}E${index % 15 + 1}`, 'Netflix'), series: { title: 'Série', season: index < 15 ? 1 : 2, episode: index % 15 + 1 } })) });
      }
      assert.equal(url.searchParams.get('compact'), 'true');
      return route.fulfill({ json: catalog(url.searchParams.get('kind')) });
    });
    const page = await context.newPage();
    currentPage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(playerUrl);
    await page.locator('.home-screen').waitFor();
    await page.getByRole('button', { name: /^Filmes/ }).click();
    await page.locator('.content-card').first().waitFor();
    await page.waitForFunction(() => document.querySelector('.content-card img')?.naturalWidth > 0);
    assert.equal(await page.locator('.content-card').first().getAttribute('aria-setsize'), String(count));
    assert.ok(await page.locator('.content-card').count() <= 60, 'bounded mounted cards');
    assert.equal(await page.locator('.pagination').count(), 0);
    const columns = await page.locator('.poster-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
    assert.equal(columns, viewport.width <= 640 ? 2 : 5);
    assert.equal(await page.locator('.content-card').first().evaluate((node) => node.querySelector('strong').getBoundingClientRect().bottom <= node.querySelector('.content-art').getBoundingClientRect().top), true);
    await page.screenshot({ path: resolve(output, `movies-${viewport.width}.png`), fullPage: viewport.width < 640 });
    await page.locator('.content-card').first().focus();
    for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowDown');
    assert.ok(Number(await page.evaluate(() => document.activeElement?.getAttribute('data-poster-index'))) > 24, 'arrows continue past the old page size');
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-poster-index') === '9999');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => Number(document.activeElement?.getAttribute('data-poster-index'))), 9999 - columns);
    await page.getByRole('button', { name: 'Buscar filme', exact: true }).click();
    await page.getByRole('searchbox').fill('Filme 09999');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.content-card').count(), 1);
    assert.equal(await page.locator('.content-card strong').textContent(), 'Filme 09999');
    await page.keyboard.press('Escape');
    await page.locator('.home-screen').waitFor();
    await page.getByRole('button', { name: /^Séries/ }).click();
    await page.locator('.content-card').first().waitFor();
    assert.equal(await page.locator('.content-card').first().getAttribute('aria-setsize'), '9000');
    await page.locator('.content-card').first().focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-poster-index') === '8999');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).waitFor();
    failEpisodes = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('button', { name: 'Temporada 2', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Temporada 2', exact: true }).click();
    assert.equal(await page.locator('.episode-grid button').count(), 15);
    assert.ok(episodeRequests >= 2);
    assert.ok((await page.locator('.episode-grid button').last().textContent()).includes('Episódio 15'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-poster-index') === '8999');
    await page.screenshot({ path: resolve(output, `series-end-${viewport.width}.png`), fullPage: viewport.width < 640 });
    console.log(`${viewport.width}: complete counts, image rendering, ${columns} columns, bounded DOM, arrows, last item, global search, episode retry, full seasons and restored focus passed`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: resolve(output, 'failure.png') });
    console.log(await currentPage.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 500), selected: document.querySelector('[data-catalog-selected]')?.outerHTML.slice(0, 250), scroll: document.querySelector('.poster-viewport')?.scrollTop, first: document.querySelector('.content-card')?.getAttribute('data-poster-index'), last: [...document.querySelectorAll('.content-card')].at(-1)?.getAttribute('data-poster-index') })));
  }
  throw error;
} finally {
  await browser.close();
}
