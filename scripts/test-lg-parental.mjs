import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('artifacts/parental-validation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      localStorage.setItem('lc_play_device_token', 'parental-qa');
      localStorage.setItem('lc_play_favorite_channels', JSON.stringify(['LIVE-adult']));
    });
    const mediaRequests = [];
    await context.route('https://media.example/**', (route) => { mediaRequests.push(route.request().url()); return route.abort(); });
    const source = { id: 'parental-qa', name: 'Fonte QA', type: 'M3U' };
    const items = ['LIVE', 'MOVIE', 'SERIES'].flatMap((kind) => ['normal', 'adult'].map((type) => ({ id: `${kind}-${type}`, name: `Teste ${kind} ${type}`, kind, group: type === 'adult' ? 'Adultos' : 'Livre', logo: type === 'adult' ? 'https://media.example/adult-cover.jpg' : null, streamUrl: `https://media.example/${kind}-${type}.mp4`, tvgId: null, series: kind === 'SERIES' ? { title: `Teste ${kind} ${type}`, season: 1, episode: 1 } : null, now: null, next: null })));
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let body;
      if (url.pathname.endsWith('/configuration')) body = { device: { id: 'qa', label: 'QA', status: 'ACTIVE', expiresAt: null }, playlist: { ...source, status: 'ACTIVE', itemCount: 6, lastSyncAt: null }, features: {} };
      else if (url.pathname.endsWith('/catalog')) body = { source, summary: { total: 6, live: 2, movies: 2, series: 2, seriesTitles: 2 }, items: items.filter((item) => item.kind === (url.searchParams.get('kind') ?? 'LIVE')), truncated: false, refreshedAt: new Date().toISOString(), epg: { status: 'UNAVAILABLE', programmes: 0 } };
      else body = { serverTime: new Date().toISOString() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    const enterPin = async (pin) => {
      const dialog = page.getByRole('dialog');
      for (const digit of pin) await dialog.getByRole('button', { name: digit, exact: true }).click();
      await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    };
    for (const section of ['live', 'movies', 'series']) {
      await page.goto('http://127.0.0.1:5173/');
      await page.locator('.menu-live .menu-count').filter({ hasText: '2' }).waitFor();
      mediaRequests.length = 0;
      await page.locator(`.menu-${section}`).click();
      await page.getByRole('button', { name: /Adultos/ }).waitFor();
      assert.equal(await page.getByText(/Teste (LIVE|MOVIE|SERIES) adult/, { exact: true }).count(), 0);
      assert.equal(mediaRequests.some((url) => /adult/.test(url)), false, 'no adult covers or streams before authorization');
      if (section === 'live') {
        await page.getByRole('button', { name: /Favoritos/ }).click();
        assert.equal(await page.getByText('Teste LIVE adult', { exact: true }).count(), 0, 'saved adult favorites remain protected');
      }
      const search = page.getByRole('button', { name: section === 'live' ? 'Buscar canal' : section === 'movies' ? 'Buscar filme' : 'Buscar série', exact: true });
      await search.click();
      await page.getByRole('searchbox').fill('adult');
      await page.getByRole('searchbox').press('Enter');
      assert.equal(await page.getByText(/Teste (LIVE|MOVIE|SERIES) adult/, { exact: true }).count(), 0);
      await page.getByRole('button', { name: /Adultos/ }).click();
      await enterPin('1111');
      assert.match(await page.getByRole('dialog').textContent(), /PIN incorreto/);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: /Adultos/ }).click();
      if (section === 'live') {
        await page.screenshot({ path: resolve(output, `pin-${viewport.width}.png`) });
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.parental-dialog')), true);
      }
      await enterPin('0000');
      await page.getByText(`Teste ${section === 'live' ? 'LIVE' : section === 'movies' ? 'MOVIE' : 'SERIES'} adult`, { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
    }
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.menu-settings').click();
    await page.getByRole('button', { name: 'Controle parental', exact: true }).click();
    await page.getByRole('button', { name: 'Alterar PIN', exact: true }).click();
    await enterPin('0000'); await enterPin('1234'); await enterPin('1234');
    assert.equal(await page.evaluate(() => localStorage.getItem('lc_play_parental_pin')), '1234');
    await page.reload(); await page.locator('.menu-movies').click();
    await page.getByRole('button', { name: /Adultos/ }).click();
    await enterPin('0000');
    assert.match(await page.getByRole('dialog').textContent(), /PIN incorreto/);
    await enterPin('1234');
    await page.getByText('Teste MOVIE adult', { exact: true }).waitFor();
    await page.reload(); await page.locator('.menu-movies').click();
    await page.getByRole('button', { name: /Adultos/ }).click();
    for (let attempt = 0; attempt < 5; attempt++) await enterPin('1111');
    await enterPin('1234');
    assert.match(await page.getByRole('dialog').textContent(), /Aguarde 30 segundos/);
    console.log(`Parental ${viewport.width}: live/movies/series, hidden covers/search/favorites, wrong PIN, cancel, remote focus, default PIN, reload relock, change PIN and retry cooldown passed`);
    await context.close();
  }
} finally { await browser.close(); }
