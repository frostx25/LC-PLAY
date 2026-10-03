import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReviewServer } from './lg-review-server.mjs';
import { reviewCatalog } from './lg-review-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/lg-store/support-validation');
const url = process.env.LG_PREVIEW_PLAYER_URL || 'http://127.0.0.1:5173/';
await mkdir(output, { recursive: true });
const fixture = createReviewServer();
fixture.listen(0, '127.0.0.1');
await new Promise((done, reject) => { fixture.once('listening', done); fixture.once('error', reject); });
const origin = `http://127.0.0.1:${fixture.address().port}`;
let browser;
const report = { passed: false, productionTvTest: false, checks: [], errors: [] };
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await context.route('**/api/**', (route) => route.fulfill({ status: 503, json: { message: 'Offline support test' } }));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Ative esta TV' }).waitFor();
    await page.screenshot({ path: resolve(output, `activation-${viewport.width}.png`), fullPage: true });
    await page.locator('#activation-code').fill('TEST-TEST-TEST');
    assert.equal(await page.getByRole('button', { name: 'Ativar LC PLAY' }).isEnabled(), false);
    await page.getByRole('checkbox').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('checkbox').isChecked(), true);
    assert.equal(await page.getByRole('button', { name: 'Ativar LC PLAY' }).isEnabled(), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('checkbox').evaluate((element) => element === document.activeElement), false);
    const trigger = page.getByRole('button', { name: 'Privacidade', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Política de Privacidade' });
    await dialog.waitFor();
    assert.ok(await dialog.getByText(/Ascent no Brasil/).count());
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-modal="true"]'))), true);
    }
    const article = dialog.locator('article');
    await article.focus();
    await page.keyboard.press('ArrowDown');
    assert.ok(await article.evaluate((element) => element.scrollTop > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(output, `privacy-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
    for (const name of ['Suporte', 'Termos', 'Licenças']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('dialog').waitFor();
      if (name === 'Licenças') {
        assert.ok(await page.getByRole('dialog').getByText(/Apache License/).count());
        assert.ok(await page.getByRole('dialog').getByText(/react 19/i).count());
      }
      await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    }
    report.checks.push(`Activation/offline documents, scroll, Back and focus ${viewport.width}x${viewport.height}`);
    for (const path of ['/legal/', '/legal/privacidade', '/legal/termos']) {
      await page.goto(origin + path, { waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
    }
    await page.screenshot({ path: resolve(output, `legal-web-${viewport.width}.png`), fullPage: true });
    report.checks.push(`Legal web pages and assets ${viewport.width}x${viewport.height}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    if (!localStorage.getItem('lc_play_device_session_v1')) localStorage.setItem('lc_play_device_token', 'qa-preview-token-not-a-production-secret');
  });
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url());
    const configuration = { device: { id: 'lg-qa-preview', label: 'LG QA Preview', status: 'ACTIVE', expiresAt: null }, playlist: { id: 'qa', name: 'LC PLAY QA', type: 'M3U', status: 'ACTIVE' }, features: {} };
    return route.fulfill({ json: path.pathname.endsWith('/configuration') ? configuration : path.pathname.endsWith('/catalog') ? reviewCatalog(origin, path.searchParams.get('kind') || 'LIVE') : { ok: true } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.home-screen').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('lc_play_device_token')), null);
  assert.ok(await page.evaluate(() => Boolean(localStorage.getItem('lc_play_device_session_v1')) && !localStorage.getItem('lc_play_device_session_v1').includes('qa-preview-token')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.home-screen').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('lc_play_device_token')), null);
  report.checks.push('Real browser IndexedDB session migration and encrypted cold-page reload preserve activation');
  await page.getByRole('button', { name: /Ajustes/ }).click();
  await page.getByRole('button', { name: 'Suporte e documentos' }).click();
  await page.screenshot({ path: resolve(output, 'settings-support-1920.png') });
  await page.getByRole('button', { name: 'Termos', exact: true }).click();
  await page.getByRole('dialog', { name: 'Termos de Uso' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.settings-screen').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.home-screen').isVisible(), true);
  report.checks.push('Settings documents and Back preserve settings, then return Home');
  await page.evaluate(() => { window.__lgBackCalls = 0; window.webOS = { ...window.webOS, platform: { tv: true }, keyboard: { isShowing: () => false }, platformBack: () => { window.__lgBackCalls++; } }; });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__lgBackCalls), 1);
  report.checks.push('Home Back calls LG platformBack (mock, not physical proof)');
  await context.close();
  const activationContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  let activationCalls = 0;
  await activationContext.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/activate')) {
      activationCalls++;
      return route.fulfill({ json: { deviceToken: 'qa-activation-fixture-token' } });
    }
    return route.fulfill({ status: 503, json: { message: 'Configuration temporarily unavailable' } });
  });
  const activationPage = await activationContext.newPage();
  activationPage.on('pageerror', (error) => report.errors.push(error.message));
  await activationPage.goto(url, { waitUntil: 'networkidle' });
  await activationPage.locator('#activation-code').fill('TEST-TEST-TEST');
  assert.equal(await activationPage.getByRole('button', { name: 'Ativar LC PLAY' }).isEnabled(), false);
  assert.equal(activationCalls, 0);
  assert.equal(await activationPage.evaluate(() => localStorage.getItem('lc_play_preview_device_id')), null);
  await activationPage.getByRole('checkbox').check();
  await activationPage.getByRole('button', { name: 'Ativar LC PLAY' }).click();
  await activationPage.locator('.home-screen').waitFor();
  assert.equal(activationCalls, 1);
  assert.equal(await activationPage.evaluate(() => localStorage.getItem('lc_play_device_token')), null);
  assert.equal(await activationPage.evaluate(() => Boolean(localStorage.getItem('lc_play_device_session_v1'))), true);
  await activationPage.reload({ waitUntil: 'networkidle' });
  await activationPage.locator('.home-screen').waitFor();
  assert.equal(activationCalls, 1);
  report.checks.push('New activation saves encrypted session before configuration failure, reload never consumes a second code; identity requested only after agreement');
  await activationContext.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser?.close();
  await new Promise((done) => fixture.close(done));
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
