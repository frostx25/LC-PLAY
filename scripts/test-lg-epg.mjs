import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('artifacts/epg-validation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      localStorage.setItem('lc_play_device_token', 'epg-qa-token');
      window.__epgCalls = [];
      window.__nativeCatalogCalls = [];
      window.PalmServiceBridge = class {
        call(uri, payload) {
          const parameters = JSON.parse(payload);
          const method = uri.split('/').pop();
          if (method !== 'loadGuide') {
            window.__nativeCatalogCalls.push(method);
            const source = { id: 'epg-qa', name: 'Fonte QA', type: 'M3U' };
            const catalog = { source, summary: { total: 2, live: 2, movies: 0, series: 0, seriesTitles: 0 }, groups: [{ name: 'Canais', count: 2 }], truncated: false, refreshedAt: new Date().toISOString(), epg: { status: 'UNAVAILABLE', programmes: 0 } };
            const items = ['A', 'B'].map((name, index) => ({ id: name, name: `Canal ${name}`, kind: 'LIVE', group: 'Canais', logo: null, streamUrl: `https://media.example/live/qa/qa/${index ? 456 : 123}.ts`, tvgId: name, series: null, now: null, next: null }));
            const result = method === 'loadCatalog' ? { catalogId: 'local-qa', revision: 'qa', catalog } : method === 'catalogPage' ? { items: [items[parameters.offset]], nextOffset: parameters.offset === 0 ? 1 : null } : { cleared: true };
            this.timer = setTimeout(() => this.onservicecallback(JSON.stringify({ returnValue: true, ...result })), 20);
            return;
          }
          window.__epgCalls.push({ uri, streamId: parameters.streamId });
          const now = Date.now();
          this.timer = setTimeout(() => this.onservicecallback(JSON.stringify({ returnValue: true, status: 'AVAILABLE', now: { title: parameters.streamId === '123' ? 'Notícias A' : 'Notícias B', description: 'Programação atual com acentuação.', category: null, startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 600000).toISOString() }, next: { title: 'Próximo programa', description: null, category: null, startsAt: new Date(now + 600000).toISOString(), endsAt: new Date(now + 1200000).toISOString() }, programmes: [] })), parameters.streamId === '123' ? 1500 : 100);
        }
        cancel() { clearTimeout(this.timer); }
      };
    });
    await context.route('https://media.example/**', (route) => route.abort());
    let backendCatalogCalls = 0;
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const source = { id: 'epg-qa', name: 'Fonte QA', type: 'M3U' };
      let body;
      if (path.endsWith('/configuration')) body = { device: { id: 'qa', label: 'QA', status: 'ACTIVE', expiresAt: null }, playlist: { ...source, status: 'ACTIVE', itemCount: 2, lastSyncAt: null }, features: {} };
      else if (path.endsWith('/media/source')) body = { sourceId: source.id, revision: 'qa', source, sourceUrl: 'https://provider.example/list.m3u', epgUrl: null, providerApiUrl: null };
      else if (path.endsWith('/epg/source')) body = { sourceId: source.id, revision: 'qa', providerApiUrl: 'https://provider.example/player_api.php?username=qa&password=qa' };
      else if (path.includes('/catalog')) { backendCatalogCalls++; return route.fulfill({ status: 503, body: 'Backend catalog unavailable in native QA' }); }
      else body = { serverTime: new Date().toISOString() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.menu-live .menu-count').filter({ hasText: '2' }).waitFor();
    await page.locator('.menu-live').click();
    await page.locator('.live-channel-pick').filter({ hasText: 'Canal A' }).click();
    await page.waitForFunction(() => window.__epgCalls.some((entry) => entry.streamId === '123'));
    await page.locator('.live-channel-pick').filter({ hasText: 'Canal B' }).click();
    await page.locator('.live-now h2').filter({ hasText: 'Notícias B' }).waitFor();
    assert.match(await page.locator('.live-next').textContent(), /Próximo programa/);
    assert.match(await page.locator('.live-programme-title').textContent(), /EPG disponível/);
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('.live-now h2').textContent(), 'Notícias B', 'late guide from channel A does not replace B');
    await page.locator('.live-preview video').evaluate((element) => { window.__epgVideo = element; });
    await page.locator('.live-channel-pick').filter({ hasText: 'Canal B' }).click();
    await page.locator('.live-preview.is-fullscreen').waitFor();
    assert.equal(await page.locator('.live-preview video').evaluate((element) => element === window.__epgVideo), true);
    assert.equal(await page.locator('.live-preview.is-fullscreen .live-programme').count(), 0);
    await page.keyboard.press('Escape');
    await page.locator('.live-preview:not(.is-fullscreen)').waitFor();
    assert.equal(backendCatalogCalls, 0);
    assert.ok(await page.evaluate(() => window.__nativeCatalogCalls.includes('loadCatalog') && window.__nativeCatalogCalls.filter((method) => method === 'catalogPage').length === 2));
    await page.screenshot({ path: resolve(output, `epg-${viewport.width}.png`) });
    console.log(`EPG ${viewport.width}: native fallback, current/next, UTF-8, stale response, fullscreen and video identity passed`);
    await context.close();
  }
} finally { await browser.close(); }
