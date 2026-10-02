import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReviewServer } from './lg-review-server.mjs';
import { reviewCatalog } from './lg-review-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/lg-store/previews');
const playerUrl = process.env.LG_PREVIEW_PLAYER_URL || 'http://127.0.0.1:5173/';
const browserChannel = process.env.LG_PREVIEW_BROWSER_CHANNEL || 'msedge';
await mkdir(output, { recursive: true });

const fixture = createReviewServer();
fixture.listen(0, '127.0.0.1');
await new Promise((resolvePromise, reject) => {
  fixture.once('listening', resolvePromise);
  fixture.once('error', reject);
});
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;

let browser;
const captures = [];
try {
  browser = await chromium.launch({ channel: browserChannel, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await context.addInitScript(() => localStorage.setItem('lc_play_device_token', 'qa-preview-token-not-a-production-secret'));
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/api/v1/device/configuration')) {
      await json({
        device: { id: 'lg-qa-preview', label: 'LG QA Preview', status: 'ACTIVE', expiresAt: '2027-12-31T23:59:59.000Z' },
        playlist: { id: 'local-qa-fixture', name: 'LC PLAY QA local', type: 'M3U', status: 'ACTIVE', itemCount: 6, lastSyncAt: new Date().toISOString() },
        features: {},
      });
      return;
    }
    if (url.pathname.endsWith('/api/v1/device/catalog')) {
      const kind = url.searchParams.get('kind') || 'LIVE';
      await json(reviewCatalog(fixtureUrl, kind));
      return;
    }
    if (url.pathname.endsWith('/api/v1/device/heartbeat')) { await json({ ok: true }); return; }
    await json({ message: 'Endpoint unavailable in isolated preview.' }, 404);
  });

  const response = await page.goto(playerUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  if (!response?.ok()) throw new Error(`Player preview returned HTTP ${response?.status() ?? 'unknown'}.`);
  await page.locator('.home-screen').waitFor({ state: 'visible', timeout: 20_000 });

  async function capture(name, selector) {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction((scope) => {
      const images = Array.from(document.querySelectorAll(`${scope} img`));
      return images.every((image) => image.complete && image.naturalWidth > 0);
    }, selector, { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(output, name), fullPage: false });
    captures.push(name);
  }

  async function waitForPreviewVideo() {
    await page.waitForFunction(() => {
      const video = document.querySelector('.live-preview video');
      return video instanceof HTMLVideoElement && video.readyState >= 2 && video.currentTime > 0.1 &&
        !document.querySelector('.live-preview .stream-status');
    }, undefined, { timeout: 15_000 });
  }

  await capture('01-home-browser-preview.png', '.home-screen');
  await page.getByRole('button', { name: /TV ao vivo/ }).click();
  await page.locator('.live-channel-pick').first().click();
  await waitForPreviewVideo();
  await capture('02-live-browser-preview.png', '.live-screen');
  await page.locator('.live-channel-pick').nth(1).click();
  await waitForPreviewVideo();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Filmes/ }).click();
  await capture('03-movies-browser-preview.png', '.catalog-screen');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Séries/ }).click();
  await capture('04-series-browser-preview.png', '.catalog-screen');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Ajustes/ }).click();
  await capture('05-settings-browser-preview.png', '.settings-screen');

  if (pageErrors.length || consoleErrors.length) {
    throw new Error(`Preview browser errors: ${[...pageErrors, ...consoleErrors].join(' | ')}`);
  }
  await writeFile(resolve(output, 'provenance.json'), JSON.stringify({
    status: 'INTERNAL_BROWSER_PREVIEW_NOT_TV_EVIDENCE',
    capturedAt: new Date().toISOString(),
    playerUrl,
    browserChannel,
    viewport: '1920x1080',
    data: 'Isolated API responses and original LC PLAY technical QA media. No production token, database or customer source was used.',
    playbackChecks: { mp4: 'PASS_IN_BROWSER_PREVIEW', hls: 'PASS_IN_BROWSER_PREVIEW' },
    captures,
  }, null, 2) + '\n');
  console.log(`Captured ${captures.length} internal previews in ${output}`);
} finally {
  await browser?.close();
  await new Promise((resolvePromise) => fixture.close(resolvePromise));
}
