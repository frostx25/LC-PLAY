import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (process.env.LG_REVIEW_PROVISION_APPROVED !== '1') throw new Error('Explicit approval required to create an isolated production QA test device.');
process.loadEnvFile(resolve(root, 'deploy/.env.production'));
const api = 'https://api-lcplay.thxtech.site/api';
const reviewer = JSON.parse(await readFile(resolve(root, 'artifacts/lg-submission/reviewer-access.private.json'), 'utf8'));
assert.equal(reviewer.completed, true);
assert.equal(reviewer.devices.length, 5);
let adminToken;
let deviceToken;
let createdId;
const checks = [];

async function request(path, { body, method = body ? 'POST' : 'GET', token = adminToken, status = 200 } = {}) {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, status, `${path}: unexpected HTTP status`);
  checks.push({ path, method, status });
  return response.json();
}

const login = await request('/auth/login', { body: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }, status: 201 });
assert.equal(login.user.role, 'OWNER');
adminToken = login.accessToken;
const devices = await request('/admin/devices');
const tv = devices.find((device) => device.model === 'OLED55C1PSA');
const qa = devices.find((device) => device.id === reviewer.devices[0].deviceId);
assert.equal(tv?.status, 'ACTIVE');
assert.equal(qa?.status, 'PENDING');
assert.ok(qa.customerId);

try {
  const device = await request('/admin/devices', { body: { label: `LG QA - teste API ${randomUUID().slice(0, 8)}`, platform: 'LG_WEBOS', customerId: qa.customerId, playlistId: reviewer.sourceId, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() }, status: 201 });
  createdId = device.id;
  const path = `/admin/devices/${encodeURIComponent(createdId)}`;
  await request(path + '/activation-code', { body: { purpose: 'STANDARD', ttlMinutes: 43_200 }, status: 400 });
  await request(`/admin/devices/${encodeURIComponent(tv.id)}/activation-code`, { body: { purpose: 'LG_REVIEW', ttlMinutes: 43_200 }, status: 400 });
  const activation = await request(path + '/activation-code', { body: { purpose: 'LG_REVIEW', ttlMinutes: 43_200 }, status: 201 });
  assert.ok(Date.parse(activation.expiresAt) - Date.now() > 29 * 86_400_000);
  const body = { code: activation.code, platform: 'LG_WEBOS', platformDeviceId: `QA-API-${randomUUID()}`, model: 'QA API - not a physical TV', osVersion: 'QA', appVersion: '0.1.0' };
  // Race only the new test code, never any code reserved for LG reviewers.
  const attempts = await Promise.all([0, 1].map(() => fetch(api + '/v1/device/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })));
  assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 400]);
  deviceToken = (await attempts.find((response) => response.status === 201).json()).deviceToken;
  checks.push({ path: '/v1/device/activate', concurrentStatuses: [201, 400] });
  const configuration = await request('/v1/device/configuration', { token: deviceToken });
  assert.equal(configuration.device.id, createdId);
  const source = await request('/v1/device/media/source', { token: deviceToken });
  assert.equal(source.sourceUrl, 'https://lcplay.thxtech.site/playlist.m3u');
  assert.equal(source.epgUrl, 'https://lcplay.thxtech.site/epg.xml');
  await request(path, { method: 'PATCH', body: { status: 'SUSPENDED' } });
  await request('/v1/device/configuration', { token: deviceToken, status: 401 });
  await request(path + '/renew', { body: { days: 30 }, status: 201 });
  await request('/v1/device/configuration', { token: deviceToken, status: 401 });
  await request(path, { method: 'PATCH', body: { status: 'ACTIVE' } });
  await request('/v1/device/configuration', { token: deviceToken });
  await request(path, { method: 'PATCH', body: { expiresAt: new Date(Date.now() - 60_000).toISOString() } });
  await request('/v1/device/configuration', { token: deviceToken, status: 401 });
  await request(path + '/renew', { body: { days: 90 }, status: 201 });
  await request(path, { method: 'PATCH', body: { playlistId: null } });
  const noSource = await request('/v1/device/configuration', { token: deviceToken });
  assert.equal(noSource.playlist, null);
} finally {
  if (createdId) await request(`/admin/devices/${encodeURIComponent(createdId)}`, { method: 'DELETE' });
}
await request('/v1/device/configuration', { token: deviceToken, status: 401 });
const after = await request('/admin/devices');
assert.equal(after.length, devices.length);
const preservedTv = after.find((device) => device.id === tv.id);
for (const field of ['customerId', 'playlistId', 'status', 'expiresAt', 'activatedAt']) assert.deepEqual(preservedTv[field], tv[field]);
assert.ok(reviewer.devices.every((entry) => after.some((device) => device.id === entry.deviceId && device.status === 'PENDING')));
const output = resolve(root, 'artifacts/production-validation');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'lg-review-api.json'), JSON.stringify({ checkedAt: new Date().toISOString(), physicalTvTest: false, originalC1Preserved: true, fiveReviewerCodesNotConsumed: true, checks }, null, 2) + '\n');
console.log('Isolated QA API passed: 30-day review access, single-use race, suspension, expiry, renewal, missing source and token revocation. C1 and five reviewer codes preserved.');
