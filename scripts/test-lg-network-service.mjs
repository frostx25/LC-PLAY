import { createRequire } from 'node:module';
import { createDecipheriv, createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
process.loadEnvFile(resolve(root, 'apps/api/.env'));
const require = createRequire(import.meta.url);
const cliRoot = dirname(require.resolve('@webos-tools/cli/package.json'));
const api = createRequire(resolve(root, 'apps/api/package.json'));
const { PrismaClient } = api('@prisma/client');
const output = resolve(root, 'artifacts/lg-network-validation');
const appDir = resolve(output, 'app');
const serviceDir = resolve(output, 'service');
const parentalMode = process.env.LG_NATIVE_PARENTAL === '1';
const catalogMode = process.env.LG_NATIVE_CATALOG === '1';
const supportMode = process.env.LG_NATIVE_SUPPORT === '1';
const reviewMode = process.env.LG_NATIVE_REVIEW === '1';
const stateMode = process.env.LG_NATIVE_STATE === '1';
const progressMode = process.env.LG_NATIVE_PROGRESS === '1';
const timingMode = process.env.LG_PROGRESS_REQUIRE_TIMING === '1';
const nativeMode = process.env.LG_NATIVE_EPG === '1' || parentalMode || catalogMode || supportMode || reviewMode || stateMode || progressMode;
const appId = nativeMode ? 'com.lcplay.tv' : 'com.lcplay.networktest';
const device = process.env.LG_TEST_DEVICE || 'lg-c1';

function ares(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(cliRoot, 'bin', `ares-${command}.js`), ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.stderr.on('data', (chunk) => { text += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(text) : reject(new Error(`ares-${command} failed: ${text}`)));
  });
}

function decrypt(value) {
  const secret = process.env.DATA_ENCRYPTION_KEY;
  const raw = Buffer.from(secret, 'base64');
  const key = raw.length === 32 && raw.toString('base64').replace(/=+$/, '') === secret.replace(/=+$/, '') ? raw : createHash('sha256').update(secret).digest();
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function loadSources() {
  if (process.env.LG_NETWORK_SOURCE_URL) {
    const sourceUrl = process.env.LG_NETWORK_SOURCE_URL;
    let epgUrl = process.env.LG_NETWORK_EPG_URL || undefined;
    if (!epgUrl && process.env.LG_NETWORK_EPG_ONLY === '1') {
      const source = new URL(sourceUrl);
      if (source.pathname === '/get.php' && source.searchParams.has('username') && source.searchParams.has('password')) {
        const candidate = new URL('/xmltv.php', source);
        for (const name of ['username', 'password']) candidate.searchParams.set(name, source.searchParams.get(name));
        epgUrl = candidate.href;
        console.log('Testing the conventional XMLTV endpoint; not supplied by the playlist header.');
      }
    }
    return [{ name: 'Fonte extra - teste temporario', url: sourceUrl, epgUrl }];
  }
  const prisma = new PrismaClient();
  try {
    const devices = await prisma.device.findMany({ where: { platform: 'LG_WEBOS', model: 'OLED55C1PSA' }, include: { playlist: true } });
    if (devices.length !== 1 || !devices[0].playlist) throw new Error('A unique LG C1 with a linked source is required');
    const alternative = await prisma.playlist.findFirst({ where: { tenantId: devices[0].tenantId, name: 'LG C1 - lista alternativa' } });
    return [devices[0].playlist, alternative].filter(Boolean).map((source) => ({ name: source.name, url: decrypt(source.sourceUrlEncrypted), epgUrl: source.epgUrlEncrypted ? decrypt(source.epgUrlEncrypted) : undefined }));
  } finally { await prisma.$disconnect(); }
}

await mkdir(output, { recursive: true });
if (!nativeMode) {
await mkdir(appDir, { recursive: true });
await mkdir(serviceDir, { recursive: true });
for (const filename of ['package.json', 'services.json', 'service.js']) {
  await copyFile(resolve(root, 'apps/lg-webos/network-probe/service', filename), resolve(serviceDir, filename));
}
await copyFile(resolve(root, 'apps/lg-webos/service/network.js'), resolve(serviceDir, 'network.js'));
await copyFile(resolve(root, 'apps/lg-webos/service/guide.js'), resolve(serviceDir, 'guide.js'));
for (const filename of ['appinfo.json', 'index.html']) {
  await copyFile(resolve(root, 'apps/lg-webos/network-probe/app', filename), resolve(appDir, filename));
}
for (const asset of ['icon.png', 'largeIcon.png']) {
  await copyFile(resolve(root, 'apps/lg-webos/public', asset), resolve(appDir, asset));
}
}
const sources = nativeMode ? [] : await loadSources();
if (!nativeMode) {
console.log(await ares('package', ['--no-minify', appDir, serviceDir, '--outdir', output]));
console.log(await ares('install', ['--device', device, resolve(output, `${appId}_0.1.0_all.ipk`)]));
}
if (reviewMode) console.log(await ares('launch', ['--close', '--device', device, appId]));
console.log(await ares('launch', ['--device', device, appId]));

let inspector;
let debuggerSocket;
let disconnectDebugger;
let command;
try {
  const inspectorUrl = await new Promise((resolvePromise, reject) => {
    inspector = spawn(process.execPath, [resolve(cliRoot, 'bin/ares-inspect.js'), '--device', device, appId], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    const timeout = setTimeout(() => reject(new Error('Inspector did not start')), 30000);
    const onData = (chunk) => {
      text += chunk;
      const match = /http:\/\/(?:localhost|127\.0\.0\.1):\d+\/[^\s]*/.exec(text);
      if (match) { clearTimeout(timeout); resolvePromise(new URL(match[0]).origin); }
    };
    inspector.stdout.on('data', onData);
    inspector.stderr.on('data', onData);
    inspector.on('error', (error) => { clearTimeout(timeout); reject(error); });
    inspector.on('close', (code) => { clearTimeout(timeout); reject(new Error(`Inspector exited ${code}: ${text}`)); });
  });
  const targets = await fetch(`${inspectorUrl}/json/list`, { signal: AbortSignal.timeout(10000) }).then((response) => response.json());
  const target = targets.find((entry) => entry.url.includes(appId));
  if (!target?.webSocketDebuggerUrl) throw new Error('Diagnostic app target unavailable');
  const ws = new URL(target.webSocketDebuggerUrl);
  ws.host = new URL(inspectorUrl).host;
  debuggerSocket = new WebSocket(ws.href);
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('Debugger connection timeout')), 10000);
    debuggerSocket.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
    debuggerSocket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Debugger connection failed')); }, { once: true });
  });
  disconnectDebugger = new Promise((resolvePromise) => debuggerSocket.addEventListener('close', resolvePromise, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const providerBrowserRequests = [];
  const providerGuideBrowserRequests = [];
  debuggerSocket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent' && /^https?:/.test(message.params.request.url)) {
      const address = new URL(message.params.request.url);
      providerBrowserRequests.push(address.hostname);
      if (address.pathname.endsWith('/player_api.php')) providerGuideBrowserRequests.push(address.hostname);
    }
    if (!message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(new Error(`Debugger protocol request failed: ${item.method} (${message.error.code}): ${String(message.error.message || '').replace(/https?:\/\/\S+/g, '[URL omitted]').slice(0, 160)}`));
    else item.resolve(message.result);
  });
  command = function (method, params = {}, timeoutMs = 220000) {
    return new Promise((resolvePromise, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve: resolvePromise, reject, timer, method });
      debuggerSocket.send(JSON.stringify({ id, method, params }));
    });
  };
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || '';
      const safeMessage = ['Device not activated', 'Guide source unavailable', 'Live catalog unavailable', 'Guide service unavailable'].find((message) => description.includes(message));
      throw new Error(safeMessage || `TV diagnostic execution failed (${result.exceptionDetails.text}, line ${result.exceptionDetails.lineNumber})`);
    }
    return result.result.value;
  }
  await command('Network.enable');
  if (!nativeMode) console.log(JSON.stringify({ app: await evaluate("({title: document.title, status: document.getElementById('status').textContent, runtime: document.getElementById('runtime').textContent})") }));
  const results = [];
  async function fingerprint() {
    // Raw values travel only over the local inspector and are never saved or printed.
    const state = await evaluate(`(async function () {
      var token = localStorage.getItem('lc_play_device_token');
      if (!token) throw new Error('Device not activated');
      var response = await fetch('https://api-lcplay.thxtech.site/api/v1/device/configuration', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Guide source unavailable');
      var configuration = await response.json();
      var storage = {};
      Object.keys(localStorage).filter(function (key) { return key.indexOf('lc_play_') === 0; }).sort().forEach(function (key) { storage[key] = localStorage.getItem(key); });
      return { storage: storage, configuration: { device: configuration.device, sourceId: configuration.playlist ? configuration.playlist.id : null } };
    })()`);
    const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const storage = Object.fromEntries(Object.entries(state.storage).map(([key, value]) => [key, hash(value)]));
    return { storage, configuration: hash(state.configuration), hasToken: Boolean(state.storage.lc_play_device_token) };
  }
  if (stateMode) {
    if (process.env.LG_NATIVE_TRACE === '1') {
      const trace = await evaluate(`(async function () {
        var response = await fetch('https://api-lcplay.thxtech.site/api/v1/device/media/source', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lc_play_device_token') } });
        if (!response.ok) throw new Error('Guide source unavailable');
        var source = await response.json();
        var counts = {};
        (window.__lcProgressCalls || []).forEach(function (call) { counts[call.method] = (counts[call.method] || 0) + 1; });
        var result = await new Promise(function (resolve) {
          var timer = setTimeout(function () { resolve({ timeout: true }); }, 10000);
          webOS.service.request('luna://com.lcplay.tv.guide', { method: 'catalogProgress', parameters: { sourceId: source.sourceId, revision: source.revision }, onSuccess: function (value) { clearTimeout(timer); resolve({ stage: value.stage, elapsedMs: value.elapsedMs, returnValue: value.returnValue }); }, onFailure: function (value) { clearTimeout(timer); resolve({ errorCode: value.errorCode, errorText: String(value.errorText || '').replace(/https?:\\/\\/\\S+/g, '[URL omitted]').slice(0, 160) }); } });
        });
        return { counts: counts, progressReply: result };
      })()`);
      console.log(JSON.stringify({ nativeProgressTrace: trace }));
    }
    const state = await fingerprint();
    await writeFile(resolve(output, 'before-progress-install.json'), JSON.stringify(state, null, 2));
    results.push({ activationChecked: state.hasToken, storageFingerprintSaved: true, productionConfigurationChecked: true });
    console.log('Original TV activation, stored settings and assigned production source fingerprint saved; no secrets recorded.');
  } else if (progressMode) {
    const before = JSON.parse(await readFile(resolve(output, 'before-progress-install.json'), 'utf8'));
    const after = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('TV activation, settings or assigned source changed during installation');
    console.log('Activation, PIN/favorites and production configuration preserved after installation.');
    async function waitFor(expression, timeoutMs = 150000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
      }
      throw new Error('TV catalog progress condition timed out');
    }
    await waitFor("!!document.querySelector('.menu-settings') && !!document.querySelector('.menu-refresh:not(:disabled)')");
    await evaluate(`(function () {
      window.__lcProgressCalls = [];
      window.__lcProgressSnapshot = null;
      window.__lcOriginalServiceRequest = webOS.service.request;
      webOS.service.request = function (uri, options) {
        var next = Object.assign({}, options);
        if (uri === 'luna://com.lcplay.tv.guide') {
          window.__lcProgressCalls.push({ method: options.method, force: Boolean(options.parameters.force) });
          if (options.method === 'loadCatalog') next.onSuccess = function (response) { window.__lcProgressSnapshot = { id: response.catalogId, total: response.catalog.summary.total, summary: response.catalog.summary }; options.onSuccess(response); };
        }
        return window.__lcOriginalServiceRequest.call(webOS.service, uri, next);
      };
      document.querySelector('.menu-refresh').click();
    })()`);
    const observed = [];
    let end = Date.now() + 150000;
    let complete = false;
    let capturedDownload = false;
    let capturedTiming = false;
    const timingSamples = [];
    while (Date.now() < end) {
      const state = await evaluate(`(function () {
        var bar = document.querySelector('.tv-shell > .catalog-progress');
        var track = bar && bar.querySelector('[role="progressbar"]');
        var timing = bar && bar.querySelector('.catalog-progress-details small');
        return { complete: Boolean(document.querySelector('.menu-refresh:not(:disabled)')), title: bar ? bar.querySelector('strong').textContent : null, text: track ? track.getAttribute('aria-valuetext') : null, percent: track ? track.getAttribute('aria-valuenow') : null, timing: timing ? timing.textContent : null, overflow: document.documentElement.scrollWidth > innerWidth || Boolean(bar && bar.scrollWidth > bar.clientWidth) };
      })()`);
      if (state.title && observed[observed.length - 1]?.title !== state.title) { observed.push(state); console.log('TV catalog stage: ' + state.title); }
      if (state.overflow) throw new Error('TV progress has horizontal overflow');
      if (!capturedDownload && state.title === 'Baixando lista') {
        const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
        await writeFile(resolve(output, 'native-progress-download.png'), Buffer.from(screenshot.data, 'base64'));
        capturedDownload = true;
      }
      if (state.title === 'Baixando lista' && state.timing && timingSamples.length < 10) timingSamples.push(state);
      if (timingMode && !capturedTiming && state.title === 'Baixando lista' && /[KM]B\/s/.test(state.timing || '')) {
        if (state.percent === null && /restantes/.test(state.timing)) throw new Error('TV displayed remaining time without a known total');
        if (state.percent !== null && !/restantes/.test(state.timing)) throw new Error('TV did not display measured remaining time for a known total');
        if (!/decorridos/.test(state.timing)) throw new Error('TV elapsed time was missing');
        const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
        await writeFile(resolve(output, 'native-download-timing.png'), Buffer.from(screenshot.data, 'base64'));
        timingSamples.push(state);
        capturedTiming = true;
        console.log('TV download timing: ' + state.timing + (state.percent === null ? ' (provider total unavailable)' : ''));
      }
      if (state.complete) { complete = true; break; }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
    if (!complete || !observed.some((entry) => entry.title === 'Baixando lista')) throw new Error('Real TV download progress not observed or catalog failed');
    if (timingMode && !capturedTiming) throw new Error('Measured download timing was not observed on the TV');
    const initial = await evaluate("window.__lcProgressSnapshot");
    if (!initial?.total) throw new Error('TV catalog did not load');
    const sections = [];
    for (const section of ['movies', 'series']) {
      await evaluate(`document.querySelector('.menu-${section}').click()`);
      await waitFor("!document.querySelector('.tv-shell > .catalog-progress') && !!document.querySelector('.poster-card')");
      const details = await evaluate("({ mounted: document.querySelectorAll('.poster-card').length, sameCatalog: window.__lcProgressSnapshot.id === " + JSON.stringify(initial.id) + ", heading: document.querySelector('.catalog-heading').textContent })");
      if (!details.sameCatalog) throw new Error('Opening a section unexpectedly reimported the catalog');
      sections.push({ section, ...details });
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true, cancelable: true }))");
      await waitFor("!!document.querySelector('.menu-settings')");
      const navigationEnd = await evaluate("window.__lcProgressCalls.length");
      await evaluate(`document.querySelector('.menu-${section}').click()`);
      await waitFor("!!document.querySelector('.poster-card') && !document.querySelector('.tv-shell > .catalog-progress')");
      if (await evaluate("window.__lcProgressCalls.length") !== navigationEnd) throw new Error('Repeat navigation did not reuse the memory cache');
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true, cancelable: true }))");
      await waitFor("!!document.querySelector('.menu-settings')");
      console.log('TV ' + section + ': complete catalog, same native snapshot and cached repeat navigation passed.');
    }
    const final = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(final)) throw new Error('TV activation/settings changed during progress test');
    const calls = await evaluate("window.__lcProgressCalls");
    if (calls.filter((entry) => entry.method === 'loadCatalog' && entry.force).length !== 1 || !calls.some((entry) => entry.method === 'catalogProgress')) throw new Error('Native import/progress calls did not match expectations');
    results.push({ physicalTv: true, activationPreserved: true, observedStages: observed, timingVerified: capturedTiming, timingSamples, realSummary: initial.summary, sections, forcedImports: 1, cacheReused: true, physicalRemote: 'NOT_TESTED', sixHourSession: 'NOT_TESTED' });
    await evaluate("webOS.service.request = window.__lcOriginalServiceRequest; delete window.__lcOriginalServiceRequest; delete window.__lcProgressCalls; delete window.__lcProgressSnapshot");
    console.log('TV native progress and cache verification passed; original Home is ready.');
  } else if (supportMode) {
    console.log('Checking offline support documents in the installed production package; activation is not modified.');
    async function waitFor(expression, timeoutMs = 120000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      const state = await evaluate("({hasToken: Boolean(localStorage.getItem('lc_play_device_token')), heading: document.querySelector('h1') ? document.querySelector('h1').textContent : null, focusLabel: document.activeElement.textContent.slice(0, 80), home: Boolean(document.querySelector('.menu-settings')), settings: Boolean(document.querySelector('.settings-screen')), live: Boolean(document.querySelector('.live-screen'))})");
      throw new Error('TV support UI condition timed out: ' + JSON.stringify(state));
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await evaluate("!!document.querySelector('.menu-settings')")) break;
      await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true, cancelable: true }))");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    await waitFor("!!document.querySelector('.menu-settings')");
    await evaluate("window.__lcSupportOriginalToken = localStorage.getItem('lc_play_device_token'); document.querySelector('.menu-settings').click()");
    await waitFor("!!document.querySelector('.settings-nav')");
    await evaluate("Array.from(document.querySelectorAll('.settings-nav button')).find(function (button) { return button.textContent.includes('Suporte e documentos'); }).click()");
    await waitFor("!!document.querySelector('.support-document-actions')");
    await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const checks = [];
    for (const label of ['Suporte', 'Privacidade', 'Termos']) {
      await evaluate(`(function () { var trigger = Array.from(document.querySelectorAll('.support-document-actions button')).find(function (button) { return button.textContent === ${JSON.stringify(label)}; }); trigger.focus(); trigger.click(); })()`);
      await waitFor("!!document.querySelector('.support-reader')");
      await waitFor("document.activeElement === document.querySelector('.support-reader [aria-label=\"Voltar\"]')", 10000);
      const details = await evaluate("({title: document.querySelector('#support-document-title').textContent, hasContact: document.querySelector('.support-reader-content').textContent.includes('suportelcplay@gmail.com'), overflow: document.documentElement.scrollWidth > innerWidth, fontSize: getComputedStyle(document.querySelector('.support-reader-content')).fontSize})");
      if (!details.hasContact || details.overflow) throw new Error('TV support content or layout failed');
      if (label === 'Privacidade') {
        await evaluate("document.querySelector('.support-reader-content').focus(); document.querySelector('.support-reader-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))");
        if (!await evaluate("document.querySelector('.support-reader-content').scrollTop > 0")) throw new Error('TV support scroll failed');
        const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
        await writeFile(resolve(output, 'native-support-privacy.png'), Buffer.from(screenshot.data, 'base64'));
      }
      await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true }))");
      await waitFor("!document.querySelector('.support-reader')");
      await waitFor(`!!document.querySelector('.settings-screen') && document.activeElement.textContent === ${JSON.stringify(label)}`, 10000);
      checks.push({ label, ...details, offline: true, scriptedBack: true });
    }
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const activationPreserved = await evaluate("localStorage.getItem('lc_play_device_token') === window.__lcSupportOriginalToken && Boolean(window.__lcSupportOriginalToken)");
    if (!activationPreserved) throw new Error('TV activation unexpectedly changed');
    await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true })); delete window.__lcSupportOriginalToken");
    await waitFor("!!document.querySelector('.menu-settings')");
    results.push({ checks, activationPreserved, nativeExitPopup: 'NOT_TESTED', physicalRemote: 'NOT_TESTED' });
    console.log('TV support: three offline documents, scrolling, scripted Back, focus and original activation passed. Physical remote and system exit popup remain pending.');
  } else if (reviewMode) {
    console.log('Testing the public owned QA fixture on the C1 with a temporary source response; no production device records are changed.');
    async function waitFor(expression, timeoutMs = 120000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      throw new Error('Owned QA TV condition timed out');
    }
    async function home() {
      for (let index = 0; index < 4; index++) {
        if (await evaluate("!!document.querySelector('.menu-settings')")) return;
        await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true, cancelable: true }))");
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      await waitFor("!!document.querySelector('.menu-settings')");
    }
    await waitFor("!!document.querySelector('.menu-settings')");
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    console.log('C1 original Home ready; starting temporary owned QA import.');
    const result = { physicalTv: true, reviewerActivationTest: false, sections: [], channels: [] };
    await evaluate(`(async function () {
      var api = 'https://api-lcplay.thxtech.site';
      window.__lcReviewToken = localStorage.getItem('lc_play_device_token');
      window.__lcReviewCount = document.querySelector('.menu-live .menu-count').textContent;
      var response = await fetch(api + '/api/v1/device/media/source', { headers: { Authorization: 'Bearer ' + window.__lcReviewToken } });
      if (!response.ok) throw new Error('Guide source unavailable');
      window.__lcReviewOriginalSource = (await response.json()).sourceId;
      var source = { sourceId: 'owned-qa-tv-session', revision: 'owned-qa-6daa307', source: { id: 'owned-qa-tv-session', name: 'LC PLAY QA - conteúdo técnico próprio', type: 'M3U' }, sourceUrl: 'https://lcplay.thxtech.site/playlist.m3u', epgUrl: 'https://lcplay.thxtech.site/epg.xml', providerApiUrl: null };
      window.__lcEpgOriginalFetch = window.fetch;
      window.fetch = function (address, init) {
        return window.__lcEpgOriginalFetch.call(window, address, init).then(function (response) {
          if (typeof address === 'string' && (address === api + '/api/v1/device/media/source' || address === api + '/api/v1/device/epg/source') && response.ok) return new Response(JSON.stringify(source), { status: 200, headers: { 'Content-Type': 'application/json' } });
          return response;
        });
      };
      document.querySelector('.menu-refresh').click();
    })()`);
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)') && document.querySelector('.menu-live .menu-count').textContent === '2'");
    console.log('Owned QA native catalog loaded: two channels; checking playback and XMLTV.');
    for (const section of ['live', 'movies', 'series']) {
      await evaluate(`document.querySelector('.menu-${section}').click()`);
      await waitFor(section === 'live' ? "document.querySelectorAll('.live-channel-pick').length === 2" : section === 'movies' ? "document.querySelectorAll('.poster-card').length === 2" : "document.querySelectorAll('.poster-card').length === 1");
      if (section === 'live') {
        for (const label of ['LC PLAY QA - clipe MP4', 'LC PLAY QA - clipe HLS']) {
          await evaluate(`Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === ${JSON.stringify(label)}; }).click()`);
          await waitFor("!!document.querySelector('.live-preview video') && document.querySelector('.live-preview video').readyState >= 3", 60000);
          await waitFor("!!document.querySelector('.live-now h2') && document.querySelector('.live-now h2').textContent.includes('Padrões de teste LC PLAY')", 60000);
          await evaluate("!!(window.__lcReviewVideo = document.querySelector('.live-preview video'))");
          await evaluate(`Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === ${JSON.stringify(label)}; }).click()`);
          const details = await evaluate("(function () { var video = document.querySelector('.live-preview video'); return { sameVideo: video === window.__lcReviewVideo, fullscreen: Boolean(document.querySelector('.live-preview.is-fullscreen')), epgOverlay: Boolean(document.querySelector('.live-preview.is-fullscreen .live-programme')), width: video.videoWidth, height: video.videoHeight, paused: video.paused, muted: video.muted, error: video.error ? video.error.code : null }; })()");
          if (!details.sameVideo || !details.fullscreen || details.epgOverlay || details.paused || details.muted || details.error || details.width !== 1280) throw new Error('Owned QA playback or fullscreen failed');
          result.channels.push({ label, ...details, epg: 'AVAILABLE' });
          console.log(`Owned QA ${label}: video, audio state, XMLTV and same-video fullscreen passed.`);
          await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true, cancelable: true }))");
          await waitFor("!document.querySelector('.live-preview.is-fullscreen')");
        }
      }
      try {
        const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
        await writeFile(resolve(output, `native-review-${section}.png`), Buffer.from(screenshot.data, 'base64'));
      } catch { console.log(`Owned QA ${section}: TV screenshot unavailable; playback checks remain separate.`); }
      if (section === 'movies' || section === 'series') {
        await evaluate("document.querySelector('.poster-card').click()");
        if (section === 'series') {
          await waitFor("document.querySelectorAll('.episode-grid button').length === 2");
          result.episodes = 2;
          await evaluate("document.querySelector('.episode-grid button').click()");
        }
        await waitFor("!!document.querySelector('.stream-player video') && document.querySelector('.stream-player video').readyState >= 3", 60000);
        const video = await evaluate("(function () { var video = document.querySelector('.stream-player video'); return { width: video.videoWidth, height: video.videoHeight, paused: video.paused, muted: video.muted, error: video.error ? video.error.code : null }; })()");
        if (video.paused || video.muted || video.error || video.width !== 1280) throw new Error('Owned QA movie or episode playback failed');
        result.sections.push({ section, ...video });
      }
      await home();
      console.log(`Owned QA ${section} passed on C1.`);
    }
    const original = await evaluate("({sourceId: window.__lcReviewOriginalSource, count: window.__lcReviewCount, hasToken: localStorage.getItem('lc_play_device_token') === window.__lcReviewToken})");
    if (!original.hasToken) throw new Error('TV activation unexpectedly changed');
    await evaluate("window.fetch = window.__lcEpgOriginalFetch; delete window.__lcEpgOriginalFetch; delete window.__lcReviewToken; delete window.__lcReviewCount; delete window.__lcReviewOriginalSource; delete window.__lcReviewVideo; document.querySelector('.menu-refresh').click()");
    console.log('Owned QA session complete; restoring the original native catalog.');
    await waitFor(`!!document.querySelector('.menu-refresh:not(:disabled)') && document.querySelector('.menu-live .menu-count').textContent === ${JSON.stringify(original.count)}`, 150000);
    result.originalSourceRestored = await evaluate(`(async function () { var response = await fetch('https://api-lcplay.thxtech.site/api/v1/device/media/source', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lc_play_device_token') } }); return response.ok && (await response.json()).sourceId === ${JSON.stringify(original.sourceId)}; })()`);
    if (!result.originalSourceRestored) throw new Error('Original source was not restored');
    results.push(result);
    console.log('C1 owned QA passed: native M3U, two channels MP4/HLS, XMLTV, fullscreen, two movies, one series/two episodes. Original source and catalog restored. Reviewer-code activation on a separate TV remains pending.');
  } else if (catalogMode) {
    console.log('Checking direct M3U import and catalogs in the installed LC PLAY, without backend catalog access.');
    const result = await evaluate(`(async function () {
      var token = localStorage.getItem('lc_play_device_token');
      var response = await fetch(${JSON.stringify(process.env.LG_TEST_API_URL || 'http://192.168.15.8:4100')} + '/api/v1/device/media/source', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Guide source unavailable');
      var source = await response.json();
      window.__lcEpgOriginalFetch = window.fetch; window.__lcBackendCatalogCalls = 0;
      window.fetch = function (address, init) {
        if (typeof address === 'string' && /\\/api\\/v1\\/device\\/catalog(?:\\?|\\/)/.test(address)) { window.__lcBackendCatalogCalls++; return Promise.reject(new Error('Backend catalog deliberately unavailable in native QA')); }
        return window.__lcEpgOriginalFetch.call(window, address, init);
      };
      var snapshot = await new Promise(function (resolve, reject) { webOS.service.request('luna://com.lcplay.tv.guide', { method: 'loadCatalog', parameters: Object.assign({}, source, { force: ${process.env.LG_NATIVE_CATALOG_FORCE === '1'} }), onSuccess: resolve, onFailure: function (error) { reject(new Error('Native catalog failed: ' + (error.errorCode || 'UNKNOWN'))); } }); });
      window.__lcNativeSource = source; window.__lcNativeCatalogId = snapshot.catalogId;
      return { catalogId: snapshot.catalogId, summary: snapshot.catalog.summary, diagnostic: snapshot.diagnostic };
    })()`);
    console.log(JSON.stringify(result));
    result.xmltv = await evaluate(`(async function () {
      var source = window.__lcNativeSource;
      var catalogId = window.__lcNativeCatalogId;
      var offset = 0; var item = null;
      function call(method, parameters) { return new Promise(function (resolve, reject) { webOS.service.request('luna://com.lcplay.tv.guide', { method: method, parameters: parameters, onSuccess: resolve, onFailure: function () { reject(new Error('Guide service unavailable')); } }); }); }
      while (!item && offset !== null) {
        var page = await call('catalogPage', { catalogId: catalogId, sourceId: source.sourceId, revision: source.revision, kind: 'LIVE', offset: offset });
        item = page.items.find(function (entry) { return /Globo SP FHD/i.test(entry.name) && entry.tvgId; }); offset = page.nextOffset;
      }
      if (!item) return { status: 'NO_MATCHING_CHANNEL' };
      var guide = await call('loadGuide', Object.assign({}, source, { catalogId: catalogId, providerApiUrl: null, streamId: null, tvgId: item.tvgId, channelName: item.name }));
      return { status: guide.status, now: guide.now ? guide.now.title : null, next: guide.next ? guide.next.title : null };
    })()`);
    console.log(JSON.stringify({ xmltv: result.xmltv }));
    async function waitFor(expression, timeoutMs = 120000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      throw new Error('Native catalog UI condition timed out');
    }
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    result.sections = [];
    for (const section of ['live', 'movies', 'series']) {
      await evaluate(`document.querySelector('.menu-${section}').click()`);
      await waitFor(section === 'live' ? "!!document.querySelector('.live-channel-pick')" : "!!document.querySelector('.poster-card')");
      const details = await evaluate(section === 'live' ? "({heading: document.querySelector('.live-channel-footer').textContent, mounted: document.querySelectorAll('.live-channel-pick').length})" : "({heading: document.querySelector('.catalog-heading').textContent, mounted: document.querySelectorAll('.poster-card').length})");
      result.sections.push({ section, ...details });
      console.log(JSON.stringify({ section, ...details }));
      if (section === 'live') {
        await evaluate("document.querySelector('.live-search .search-trigger').click()");
        await waitFor("!!document.querySelector('.live-search input')");
        await command('Input.insertText', { text: 'Globo SP FHD' });
        await waitFor("Array.from(document.querySelectorAll('.live-channel-pick')).some(function (button) { return button.querySelector('strong').textContent === 'Globo SP FHD'; })");
        await evaluate("Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === 'Globo SP FHD'; }).click()");
        await waitFor("document.querySelector('.live-programme-title').textContent.includes('EPG disponível')", 60000);
        result.epg = await evaluate("({now: document.querySelector('.live-now h2').textContent, next: document.querySelector('.live-next').textContent})");
        await waitFor("!!document.querySelector('.live-preview video') && document.querySelector('.live-preview video').readyState >= 3", 60000);
        await evaluate("!!(window.__lcEpgVideo = document.querySelector('.live-preview video'))");
        await evaluate("Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === 'Globo SP FHD'; }).click()");
        result.sameVideoInFullscreen = await evaluate("document.querySelector('.live-preview video') === window.__lcEpgVideo && !!document.querySelector('.live-preview.is-fullscreen') && !document.querySelector('.live-preview.is-fullscreen .live-programme')");
        if (!result.sameVideoInFullscreen) throw new Error('Fullscreen recreated the video or exposed EPG');
        result.video = await evaluate("(function () { var video = document.querySelector('.live-preview video'); return {readyState: video.readyState, width: video.videoWidth, height: video.videoHeight, paused: video.paused, muted: video.muted, errorCode: video.error ? video.error.code : null}; })()");
        console.log(JSON.stringify({ epg: result.epg, video: result.video, sameVideoInFullscreen: result.sameVideoInFullscreen }));
        await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true }))");
      }
      if (section === 'series') {
        await evaluate("document.querySelector('.poster-card').click()");
        await waitFor("!!document.querySelector('.episode-grid button')");
        result.episodes = await evaluate("({summary: document.querySelector('.series-summary p').textContent, visible: document.querySelectorAll('.episode-grid button').length})");
        await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
      }
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
      await waitFor("!!document.querySelector('.menu-live')");
    }
    result.backendCatalogCalls = await evaluate("window.__lcBackendCatalogCalls");
    if (result.backendCatalogCalls !== 0) throw new Error('TV attempted to load the backend catalog');
    results.push(result);
  } else if (parentalMode) {
    console.log('Checking parental controls in the installed LC PLAY with temporary, non-playable fixtures.');
    await evaluate(`(async function () {
      var token = localStorage.getItem('lc_play_device_token');
      var response = await fetch(${JSON.stringify(process.env.LG_TEST_API_URL || 'http://192.168.15.8:4100')} + '/api/v1/device/media/source', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Guide source unavailable');
      var source = await response.json();
      window.__lcEpgOriginalFetch = window.fetch;
      window.__lcOriginalServiceRequest = webOS.service.request;
      webOS.service.request = function (uri, options) {
        if (uri !== 'luna://com.lcplay.tv.guide' || ['loadCatalog', 'catalogPage', 'seriesEpisodes'].indexOf(options.method) === -1) return window.__lcOriginalServiceRequest.call(webOS.service, uri, options);
        var kind = options.parameters.kind || 'LIVE';
        var items = ['Livre', 'Adultos'].map(function (group) { return { id: kind + group, name: 'Teste ' + group, kind: kind, group: group, logo: null, streamUrl: '', tvgId: null, series: kind === 'SERIES' ? { title: 'Teste ' + group, season: 1, episode: 1 } : null, now: null, next: null }; });
        var catalog = { source: source.source, summary: { total: 6, live: 2, movies: 2, series: 2, seriesTitles: 2 }, groups: [], truncated: false, refreshedAt: new Date().toISOString(), epg: { status: 'UNAVAILABLE', programmes: 0 } };
        var result = options.method === 'loadCatalog' ? { catalogId: 'parental-qa', revision: source.revision, catalog: catalog } : kind === 'SERIES' ? { items: [], seriesCollections: items.map(function (item) { return { id: item.id, title: item.name, group: item.group, logo: null, episodeCount: 1 }; }), nextOffset: null } : { items: items, nextOffset: null };
        var timer = setTimeout(function () { options.onSuccess(result); }, 20);
        return { cancel: function () { clearTimeout(timer); } };
      };
    })()`);
    async function waitFor(expression, timeoutMs = 120000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
      }
      throw new Error('Native parental UI condition timed out');
    }
    async function enterPin(pin) {
      await evaluate(`(function () { var digits = ${JSON.stringify(pin)}; for (var i = 0; i < digits.length; i++) Array.from(document.querySelectorAll('.parental-keypad button')).find(function (button) { return button.textContent === digits[i]; }).click(); })()`);
      await waitFor("!!document.querySelector('.parental-confirm:not(:disabled)')");
      await evaluate("document.querySelector('.parental-confirm').click()");
    }
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    await evaluate("document.querySelector('.menu-refresh').click()");
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    const result = { nativeParental: [], sourceUnchanged: true };
    for (const section of ['live', 'movies', 'series']) {
      await evaluate(`document.querySelector('.menu-${section}').click()`);
      await waitFor("Array.from(document.querySelectorAll('.live-category-scroll button, .vod-categories button')).some(function (button) { return button.textContent.indexOf('Adultos') !== -1; })");
      if (!await evaluate("!document.body.textContent.includes('Teste Adultos')")) throw new Error('Adult fixture visible before PIN');
      await evaluate("Array.from(document.querySelectorAll('.live-category-scroll button, .vod-categories button')).find(function (button) { return button.textContent.indexOf('Adultos') !== -1; }).click()");
      await waitFor("!!document.querySelector('.parental-dialog')");
      await enterPin('1111');
      await waitFor("document.querySelector('.parental-error').textContent.indexOf('PIN incorreto') !== -1");
      await enterPin('0000');
      await waitFor("!document.querySelector('.parental-dialog') && document.body.textContent.includes('Teste Adultos')");
      result.nativeParental.push({ section, lockedInitially: true, rejectedWrongPin: true, defaultPinPassed: true });
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
      await waitFor("!!document.querySelector('.menu-settings')");
      await evaluate("document.querySelector('.menu-settings').click()");
      await evaluate("Array.from(document.querySelectorAll('.settings-nav button')).find(function (button) { return button.textContent.includes('Controle parental'); }).click()");
      await evaluate("Array.from(document.querySelectorAll('.parental-settings button')).find(function (button) { return button.textContent.includes('Bloquear agora'); }).click()");
      await evaluate("document.querySelector('.player-header .round-button').click()");
      console.log(`LG parental ${section}: locked, incorrect PIN rejected, 0000 accepted, relocked`);
    }
    await evaluate("document.querySelector('.menu-live').click()");
    await waitFor("!!document.querySelector('.live-category-scroll')");
    await evaluate("Array.from(document.querySelectorAll('.live-category-scroll button')).find(function (button) { return button.textContent.includes('Adultos'); }).click()");
    results.push(result);
  } else if (nativeMode) {
    console.log('Checking the installed LC PLAY guide with the linked source.');
    const apiUrl = process.env.LG_TEST_API_URL || 'http://192.168.15.8:4100';
    let overrideApiUrl = null;
    if (process.env.LG_NETWORK_SOURCE_URL) {
      const temporary = new URL(process.env.LG_NETWORK_SOURCE_URL);
      const provider = new URL('player_api.php', temporary);
      provider.search = '';
      for (const name of ['username', 'password']) provider.searchParams.set(name, temporary.searchParams.get(name));
      overrideApiUrl = provider.href;
    }
    const result = await evaluate(`(async function () {
      var api = ${JSON.stringify(apiUrl)};
      var token = localStorage.getItem('lc_play_device_token');
      if (!token) throw new Error('Device not activated');
      var options = { headers: { Authorization: 'Bearer ' + token } };
      var sourceResponse = await fetch(api + '/api/v1/device/epg/source', options);
      if (!sourceResponse.ok) throw new Error('Guide source unavailable');
      var source = await sourceResponse.json();
      var temporaryApi = ${JSON.stringify(overrideApiUrl)};
      if (temporaryApi) { source.providerApiUrl = temporaryApi; source.revision += '-temporary-epg-test'; }
      var catalogResponse = await fetch(api + '/api/v1/device/catalog?kind=LIVE&compact=true', options);
      if (!catalogResponse.ok) throw new Error('Live catalog unavailable');
      var catalog = await catalogResponse.json();
      var item = catalog.items.find(function (entry) { return /Globo SP FHD/i.test(entry.name); }) || catalog.items[0];
      var streamId = /^(\\d+)(?:\\.(?:ts|m3u8))?$/.exec(new URL(item.streamUrl).pathname.split('/').pop())[1];
      var guide = await new Promise(function (resolve, reject) { webOS.service.request('luna://com.lcplay.tv.guide', { method: 'loadGuide', parameters: Object.assign({}, source, { streamId: streamId, channelName: item.name, tvgId: item.tvgId }), onSuccess: resolve, onFailure: function () { reject(new Error('Guide service unavailable')); } }); });
      window.__lcEpgOriginalFetch = window.fetch;
      window.fetch = function (address, init) {
        return window.__lcEpgOriginalFetch.call(window, address, init).then(function (response) {
          if (temporaryApi && typeof address === 'string' && address.indexOf('/api/v1/device/epg/source') !== -1 && response.ok) return new Response(JSON.stringify(source), { status: 200, headers: { 'Content-Type': 'application/json' } });
          if (typeof address !== 'string' || address.indexOf('/api/v1/device/catalog?') === -1) return response;
          return response.json().then(function (data) { if (!data.items) return new Response(JSON.stringify(data), { status: response.status, headers: response.headers }); data.items = data.items.map(function (entry) { return Object.assign({}, entry, { now: null, next: null }); }); data.epg = { status: 'ERROR', programmes: 0 }; return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } }); });
        });
      };
      return { channel: item.name, sourceId: source.sourceId, temporarySource: Boolean(temporaryApi), guide: guide };
    })()`);
    console.log(JSON.stringify(result));
    results.push(result);
    if (result.guide.status !== 'AVAILABLE' || !result.guide.now || !result.guide.next) throw new Error('The real guide did not supply current and next programmes');
    async function waitFor(expression, timeoutMs = 120000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      }
      const state = await evaluate("({home: !!document.querySelector('.menu-live'), live: !!document.querySelector('.live-screen'), input: document.querySelector('.live-search input') ? document.querySelector('.live-search input').value : null, channels: Array.from(document.querySelectorAll('.live-channel-pick strong')).map(function (element) { return element.textContent; }).slice(0, 10), now: document.querySelector('.live-now h2') ? document.querySelector('.live-now h2').textContent : null})");
      throw new Error('Native EPG UI condition timed out: ' + JSON.stringify(state));
    }
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    await evaluate("document.querySelector('.menu-refresh').click()");
    await waitFor("!!document.querySelector('.menu-refresh:not(:disabled)')");
    await evaluate("document.querySelector('.menu-live').click()");
    const channelName = JSON.stringify(result.channel);
    await waitFor("!!document.querySelector('.live-search .search-trigger')");
    await evaluate("document.querySelector('.live-search .search-trigger').click()");
    await waitFor("!!document.querySelector('.live-search input')");
    await command('Input.insertText', { text: result.channel });
    await waitFor(`Array.from(document.querySelectorAll('.live-channel-pick')).some(function (button) { return button.querySelector('strong').textContent === ${channelName}; })`);
    await evaluate(`Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === ${channelName}; }).click()`);
    await waitFor(`!!document.querySelector('.live-now h2') && document.querySelector('.live-now h2').textContent === ${JSON.stringify(result.guide.now.title)}`, 45000);
    result.ui = await evaluate("({now: document.querySelector('.live-now h2').textContent, next: document.querySelector('.live-next').textContent, status: document.querySelector('.live-programme-title').textContent})");
    console.log(JSON.stringify({ nativeUi: result.ui }));
    await evaluate("!!(window.__lcEpgVideo = document.querySelector('.live-preview video'))");
    await evaluate(`Array.from(document.querySelectorAll('.live-channel-pick')).find(function (button) { return button.querySelector('strong').textContent === ${channelName}; }).click()`);
    result.sameVideoInFullscreen = await evaluate("document.querySelector('.live-preview video') === window.__lcEpgVideo && !!document.querySelector('.live-preview.is-fullscreen')");
    if (!result.sameVideoInFullscreen) throw new Error('Fullscreen recreated the video');
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true }))");
    result.video = await evaluate("(function () { var video = document.querySelector('.live-preview video'); return video ? { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight, paused: video.paused, errorCode: video.error ? video.error.code : null } : null; })()");
  }
  const modes = process.env.LG_NETWORK_GUIDE_API === '1' || process.env.LG_NETWORK_EPG_ONLY === '1' ? [] : process.env.LG_NETWORK_FULL_ONLY === '1' ? [true] : [false, true];
  for (const full of modes) {
    for (const source of sources) {
      console.log(`LG service: ${source.name} / ${full ? 'full transfer' : 'sample'}`);
      // URL parameters travel over the local debugger, not shell arguments or stored files.
      const result = await evaluate(`window.runNetworkProbe(${JSON.stringify({ ...source, full })})`);
      result.full = full;
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  if (process.env.LG_NETWORK_EPG_ONLY === '1') {
    for (const source of sources.filter((entry) => entry.epgUrl)) {
      console.log(`LG service: ${source.name} / EPG retry`);
      const result = await evaluate(`callService('probeEpg', ${JSON.stringify({ url: source.epgUrl })}, 100000)`);
      result.source = source.name;
      results.push(result);
      await evaluate(`appendResult(${JSON.stringify(source.name)}, 'EPG', ${JSON.stringify(result.epg)}); document.getElementById('status').textContent = 'Teste concluido'`);
      console.log(JSON.stringify(result));
    }
  }
  if (process.env.LG_NETWORK_GUIDE_API === '1') {
    for (const source of sources) {
      console.log(`LG service: ${source.name} / provider guide API`);
      const result = await evaluate(`callService('guideDiagnostic', ${JSON.stringify({ url: source.url })}, 180000)`);
      result.source = source.name;
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  const report = { testedAt: new Date().toISOString(), device, transport: 'webOS JS service / Node http(s)', providerBrowserRequests, providerGuideBrowserRequests, results };
  const reportName = stateMode ? 'native-state-report.json' : progressMode ? timingMode ? 'native-download-timing-report.json' : 'native-progress-report.json' : reviewMode ? 'native-review-report.json' : supportMode ? 'native-support-report.json' : catalogMode ? 'native-catalog-report.json' : parentalMode ? 'native-parental-report.json' : nativeMode ? 'native-epg-report.json' : process.env.LG_NETWORK_GUIDE_API === '1' ? 'guide-api-report.json' : process.env.LG_NETWORK_SOURCE_URL ? (process.env.LG_NETWORK_EPG_ONLY === '1' ? 'extra-epg-report.json' : 'extra-source-report.json') : process.env.LG_NETWORK_EPG_ONLY === '1' ? 'epg-retry-report.json' : process.env.LG_NETWORK_FULL_ONLY === '1' ? 'full-report.json' : 'report.json';
  await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2));
  try {
    const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
    const imageName = stateMode ? 'native-state.png' : progressMode ? 'native-progress-restored.png' : reviewMode ? 'native-review-restored.png' : supportMode ? 'native-support.png' : catalogMode ? 'native-catalog.png' : parentalMode ? 'native-parental.png' : nativeMode ? 'native-epg.png' : process.env.LG_NETWORK_SOURCE_URL ? (process.env.LG_NETWORK_EPG_ONLY === '1' ? 'extra-epg.png' : 'extra-source.png') : 'lg-network-service.png';
    await writeFile(resolve(output, imageName), Buffer.from(screenshot.data, 'base64'));
  } catch { console.log('TV screenshot unavailable; the network report was saved.'); }
  if ((!nativeMode && providerBrowserRequests.length) || providerGuideBrowserRequests.length) throw new Error('Unexpected browser guide network activity');
  console.log(`Report: ${resolve(output, reportName)}`);
} finally {
  if (nativeMode && debuggerSocket?.readyState === WebSocket.OPEN && command) {
    if (supportMode) {
      try { await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, 10000); } catch { /* Always restore networking after the offline test. */ }
    }
    try { await command('Runtime.evaluate', { expression: "if (window.__lcOriginalServiceRequest) { webOS.service.request = window.__lcOriginalServiceRequest; delete window.__lcOriginalServiceRequest; } if (window.__lcEpgOriginalFetch) { window.fetch = window.__lcEpgOriginalFetch; delete window.__lcEpgOriginalFetch; location.reload(); }" }, 10000); } catch { /* Closing the debugger must not retain a network mock. */ }
  }
  if (debuggerSocket) debuggerSocket.close();
  if (inspector && inspector.exitCode === null) {
    const closed = new Promise((resolvePromise) => inspector.once('close', resolvePromise));
    inspector.kill();
    await closed;
  }
  if (disconnectDebugger) await Promise.race([disconnectDebugger, new Promise((resolvePromise) => setTimeout(resolvePromise, 2000))]);
}
