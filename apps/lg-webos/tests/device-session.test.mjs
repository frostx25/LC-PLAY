import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createDeviceSessionStore, LEGACY_TOKEN_KEY, SECURE_TOKEN_KEY } from '../src/lib/device-session.ts';

async function fixture() {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  let key;
  const keys = async (create) => key ?? (create ? key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) : null);
  return { entries, storage, keys, store: () => createDeviceSessionStore(storage, keys, webcrypto) };
}

test('migrates the same device token without persisting plaintext, and restores after a new session', async () => {
  const f = await fixture();
  f.storage.setItem(LEGACY_TOKEN_KEY, 'test-device.fixture-secret');
  assert.equal(await f.store().restore(), 'test-device.fixture-secret');
  assert.equal(f.storage.getItem(LEGACY_TOKEN_KEY), null);
  assert.ok(!f.storage.getItem(SECURE_TOKEN_KEY).includes('fixture-secret'));
  assert.equal(await f.store().restore(), 'test-device.fixture-secret');
  assert.equal((await f.keys(false)).extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('raw', await f.keys(false)));
});

test('uses a fresh nonce for every save and rejects altered ciphertext without resetting activation', async () => {
  const f = await fixture();
  await f.store().save('fixture-only');
  const before = f.storage.getItem(SECURE_TOKEN_KEY);
  await f.store().save('fixture-only');
  assert.notEqual(f.storage.getItem(SECURE_TOKEN_KEY), before);
  const value = JSON.parse(before);
  value.data = (value.data[0] === 'A' ? 'B' : 'A') + value.data.slice(1);
  f.storage.setItem(SECURE_TOKEN_KEY, JSON.stringify(value));
  await assert.rejects(f.store().restore(), /proteger a sessão/);
  assert.ok(f.storage.getItem(SECURE_TOKEN_KEY));
});

test('keeps the legacy token when migration cannot persist and never returns it as an unprotected fallback', async () => {
  const f = await fixture();
  f.storage.setItem(LEGACY_TOKEN_KEY, 'fixture-only');
  const store = createDeviceSessionStore({ ...f.storage, setItem: () => { throw new Error('Quota'); } }, f.keys, webcrypto);
  await assert.rejects(store.restore(), /proteger a sessão/);
  assert.equal(store.peek(), null);
  assert.equal(f.storage.getItem(LEGACY_TOKEN_KEY), 'fixture-only');
});

test('missing key does not silently replace a protected session; disconnect clears both storage formats', async () => {
  const f = await fixture();
  await f.store().save('fixture-only');
  const missing = createDeviceSessionStore(f.storage, async () => null, webcrypto);
  await assert.rejects(missing.restore());
  const store = f.store();
  await store.restore();
  store.clear();
  assert.equal(store.peek(), null);
  assert.equal(await f.store().restore(), null);
  assert.equal(f.storage.getItem(SECURE_TOKEN_KEY), null);
});
