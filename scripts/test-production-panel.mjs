import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, 'deploy/.env.production');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
assert.ok(email && password, 'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD privately');
const panelUrl = process.env.PRODUCTION_PANEL_URL || 'https://lcplay.thxtech.site';
const apiUrl = process.env.PRODUCTION_API_URL || 'https://api-lcplay.thxtech.site';
assert.equal(new URL(panelUrl).protocol, 'https:');
assert.equal(new URL(apiUrl).protocol, 'https:');
const output = resolve(root, 'artifacts/production-validation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const pageErrors = [];

try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, baseURL: panelUrl });
    try {
      const unauthenticated = await context.request.get('/api/backend/admin/devices');
      assert.equal(unauthenticated.status(), 401);
      const health = await context.request.get(`${apiUrl}/api/health`);
      assert.equal(health.status(), 200);
      assert.equal((await health.json()).status, 'ok');
      const protectedSource = await context.request.get(`${apiUrl}/api/v1/device/media/source`);
      assert.equal(protectedSource.status(), 401);
      const preflight = await context.request.fetch(`${apiUrl}/api/v1/device/configuration`, {
        method: 'OPTIONS',
        headers: { Origin: 'file://com.lcplay.tv', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
      });
      assert.equal(preflight.status(), 204);
      assert.equal(preflight.headers()['access-control-allow-origin'], 'file://com.lcplay.tv');

      const page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto('/login');
      await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
      await page.locator('input[autocomplete="current-password"]').fill(password);
      const loginResult = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      assert.equal((await loginResult).status(), 200);
      await page.waitForURL(`${panelUrl}/`);
      await page.getByRole('heading', { level: 1, name: 'Vis\u00e3o geral', exact: true }).waitFor();
      const cookie = (await context.cookies()).find((entry) => entry.name === 'lc_admin_session');
      assert.ok(cookie?.secure && cookie.httpOnly);
      assert.equal(cookie.sameSite, 'Lax');

      const deviceResponse = await context.request.get('/api/backend/admin/devices');
      const sourceResponse = await context.request.get('/api/backend/admin/playlists');
      assert.equal(deviceResponse.status(), 200);
      assert.equal(sourceResponse.status(), 200);
      const devices = await deviceResponse.json();
      const sources = await sourceResponse.json();
      const tv = devices.find((entry) => entry.platform === 'LG_WEBOS' && entry.model === 'OLED55C1PSA');
      assert.equal(tv?.status, 'ACTIVE');
      assert.ok(tv.playlist && sources.some((entry) => entry.id === tv.playlist.id));
      for (const source of sources) {
        assert.equal('sourceUrl' in source || 'sourceUrlEncrypted' in source || 'password' in source, false);
      }

      for (const [path, title] of [['/devices', 'Dispositivos'], ['/playlists', 'Fontes'], ['/customers', 'Clientes'], ['/alerts', 'Alertas'], ['/logs', 'Atividade']]) {
        await page.goto(path);
        await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();
        await page.locator('.loading-panel, .loading-state').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.form-error').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Page overflow at ${path} (${viewport.width})`);
        if (path === '/devices') await page.screenshot({ path: resolve(output, `devices-${viewport.width}.png`), fullPage: true });
      }
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await page.waitForURL(`${panelUrl}/login`);
      assert.equal((await context.request.get('/api/backend/admin/devices')).status(), 401);
      console.log(`${viewport.width}: public HTTPS, login/logout, secure cookie, all panel pages, ${devices.length} device(s), ${sources.length} source(s), preserved activation, protected endpoints and webOS CORS passed`);
    } finally { await context.close(); }
  }
  assert.deepEqual(pageErrors, []);
} finally { await browser.close(); }
