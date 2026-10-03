import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const playerUrl = new URL(process.env.LG_PREVIEW_PLAYER_URL || 'http://127.0.0.1:5173/');
playerUrl.searchParams.set('demo', '1');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = resolve('artifacts/search-validation');

try {
  await mkdir(output, { recursive: true });
  await page.goto(playerUrl.href);
  await page.locator('.home-screen').waitFor();
  for (const scenario of [
    { menu: 'TV ao vivo', label: 'Buscar canal', entry: '.live-channel-pick', query: 'Jornal', result: '.live-channel-pick', filename: 'live' },
    { menu: 'Filmes', label: 'Buscar filme', entry: '.vod-categories button', query: 'Cinema', result: '.content-card', filename: 'movies' },
    { menu: 'Séries', label: 'Buscar série', entry: '.vod-categories button', query: 'Horizonte', result: '.content-card', filename: 'series' },
  ]) {
    await page.getByRole('button', { name: new RegExp(scenario.menu) }).click();
    const trigger = page.getByRole('button', { name: scenario.label, exact: true });
    await trigger.waitFor();
    await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), scenario.entry);
    await page.locator(scenario.entry).first().focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true, `${scenario.menu}: arrow selects search`);
    assert.equal(await page.locator('input[type="search"]').count(), 0, `${scenario.menu}: navigation does not start editing`);
    await page.keyboard.press('ArrowDown');
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), false, `${scenario.menu}: arrows leave search`);
    assert.equal(await page.locator('input[type="search"]').count(), 0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const input = page.getByRole('searchbox', { name: scenario.label });
    await input.waitFor();
    assert.equal(await input.evaluate((node) => node === document.activeElement), true);
    await input.fill(scenario.query);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await input.evaluate((node) => node === document.activeElement), true, 'arrows stay in text editing');
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    assert.equal(await input.inputValue(), scenario.query.slice(0, -1), 'Backspace edits instead of leaving the screen');
    await input.fill(scenario.query);
    await page.keyboard.press('Enter');
    await trigger.waitFor();
    assert.equal(await trigger.textContent(), scenario.query);
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.locator(scenario.result).count(), 1, 'query filters content');
    await page.screenshot({ path: resolve(output, `${scenario.filename}-search.png`) });
    await trigger.click();
    await input.waitFor();
    await input.fill('');
    await page.keyboard.press('Escape');
    await trigger.waitFor();
    assert.equal(await trigger.textContent(), scenario.label);
    assert.equal(await page.locator('.home-screen').count(), 0, 'Back closes editing before leaving catalog');
    await trigger.click();
    await input.waitFor();
    await input.evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true })));
    await trigger.waitFor();
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true, 'LG Back restores search focus');
    await page.keyboard.press('Escape');
    await page.locator('.home-screen').waitFor();
    console.log(`${scenario.menu}: focus, arrows, OK, click, filtering, Backspace and LG Back passed`);
  }
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
