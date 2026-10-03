import { createRequire } from 'node:module';
import { createDecipheriv, createHash } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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
const nativeMode = process.env.LG_NATIVE_EPG === '1' || parentalMode || catalogMode;
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
    if (message.error) item.reject(new Error('Debugger protocol request failed'));
    else item.resolve(message.result);
  });
  command = function (method, params = {}, timeoutMs = 220000) {
    return new Promise((resolvePromise, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve: resolvePromise, reject, timer });
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
  if (catalogMode) {
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
  const reportName = catalogMode ? 'native-catalog-report.json' : parentalMode ? 'native-parental-report.json' : nativeMode ? 'native-epg-report.json' : process.env.LG_NETWORK_GUIDE_API === '1' ? 'guide-api-report.json' : process.env.LG_NETWORK_SOURCE_URL ? (process.env.LG_NETWORK_EPG_ONLY === '1' ? 'extra-epg-report.json' : 'extra-source-report.json') : process.env.LG_NETWORK_EPG_ONLY === '1' ? 'epg-retry-report.json' : process.env.LG_NETWORK_FULL_ONLY === '1' ? 'full-report.json' : 'report.json';
  await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2));
  try {
    const screenshot = await command('Page.captureScreenshot', { format: 'png' }, 10000);
    const imageName = catalogMode ? 'native-catalog.png' : parentalMode ? 'native-parental.png' : nativeMode ? 'native-epg.png' : process.env.LG_NETWORK_SOURCE_URL ? (process.env.LG_NETWORK_EPG_ONLY === '1' ? 'extra-epg.png' : 'extra-source.png') : 'lg-network-service.png';
    await writeFile(resolve(output, imageName), Buffer.from(screenshot.data, 'base64'));
  } catch { console.log('TV screenshot unavailable; the network report was saved.'); }
  if ((!nativeMode && providerBrowserRequests.length) || providerGuideBrowserRequests.length) throw new Error('Unexpected browser guide network activity');
  console.log(`Report: ${resolve(output, reportName)}`);
} finally {
  if (nativeMode && debuggerSocket?.readyState === WebSocket.OPEN && command) {
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
