import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/lg-submission/reviewer-access.private.json');
const api = new URL(process.env.LG_REVIEW_API_URL || 'http://127.0.0.1:4100');
if (!['http://127.0.0.1:4100', 'https://api-lcplay.thxtech.site'].includes(api.origin) || api.pathname !== '/' || api.search || api.hash || api.username || api.password) {
  throw new Error('Use only the local API or the approved LC PLAY production API origin.');
}
if (api.protocol === 'https:' && process.env.LG_REVIEW_PROVISION_APPROVED !== '1') {
  throw new Error('Production reviewer provisioning requires explicit approval: LG_REVIEW_PROVISION_APPROVED=1.');
}
const token = process.env.LG_REVIEW_ADMIN_TOKEN;
if (!token) throw new Error('Set LG_REVIEW_ADMIN_TOKEN privately; do not put it in Git, command arguments or submission files.');
try {
  await readFile(output);
  throw new Error('A private reviewer-access file already exists. Reuse it or archive it explicitly before creating another submission.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }

async function request(path, body) {
  const response = await fetch(`${api.origin}/api/admin/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Reviewer provisioning failed: HTTP ${response.status}. No automatic retry; inspect the isolated QA records before retrying.`);
  return response.json();
}

const state = { api: api.origin, preparedAt: new Date().toISOString(), completed: false, sourceId: null, devices: [] };
await mkdir(resolve(root, 'artifacts/lg-submission'), { recursive: true });
const save = () => writeFile(output, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
await save();
const sources = await request('playlists');
const name = 'LG QA - conteúdo técnico próprio';
let source = sources.find((entry) => entry.name === name);
if (!source) source = await request('playlists', { name, type: 'M3U', sourceUrl: 'https://lcplay.thxtech.site/playlist.m3u', epgUrl: 'https://lcplay.thxtech.site/epg.xml' });
state.sourceId = source.id;
await save();
for (let index = 1; index <= 5; index++) {
  const device = await request('devices', { label: `LG QA - revisão ${state.preparedAt.slice(0, 10)} TV ${index}`, platform: 'LG_WEBOS', playlistId: source.id, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() });
  const entry = { deviceId: device.id, label: device.label, code: null, expiresAt: null };
  state.devices.push(entry);
  await save();
  const activation = await request(`devices/${encodeURIComponent(device.id)}/activation-code`, { purpose: 'LG_REVIEW', ttlMinutes: 43_200 });
  entry.code = activation.code;
  entry.expiresAt = activation.expiresAt;
  await save();
}
state.completed = true;
await save();
console.log(`Prepared ${state.devices.length} isolated LG QA devices. Private codes saved to ${output}; never upload this file publicly or commit it.`);
