export const LEGACY_TOKEN_KEY = "lc_play_device_token";
export const SECURE_TOKEN_KEY = "lc_play_device_session_v1";
export const SESSION_DATABASE = "lc_play_private_storage";
const KEY_ID = "device-session-v1";
const aad = new TextEncoder().encode("com.lcplay.tv/device-session/v1");
const failure = () => new Error("Não foi possível proteger a sessão neste aparelho. Tente novamente.");

type KeyProvider = (create: boolean) => Promise<CryptoKey | null>;
type SessionRecord = { version: 1; iv: string; data: string };

function encode(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function createDeviceSessionStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, keys: KeyProvider, cryptography: Crypto) {
  let token: string | null | undefined;
  let restoring: Promise<string | null> | undefined;
  let epoch = 0;

  async function decrypt(raw: string) {
    const record = JSON.parse(raw) as SessionRecord;
    if (record.version !== 1 || typeof record.iv !== "string" || typeof record.data !== "string" || raw.length > 16_384) throw failure();
    const key = await keys(false);
    if (!key || key.extractable || key.algorithm.name !== "AES-GCM") throw failure();
    const iv = decode(record.iv);
    if (iv.length !== 12) throw failure();
    const decoded = await cryptography.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, decode(record.data));
    return new TextDecoder().decode(decoded);
  }

  async function save(value: string) {
    const generation = epoch;
    try {
      if (!value || value.length > 4_096) throw failure();
      const key = await keys(true);
      if (!key || key.extractable || key.algorithm.name !== "AES-GCM") throw failure();
      const iv = cryptography.getRandomValues(new Uint8Array(12));
      const encrypted = await cryptography.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, new TextEncoder().encode(value));
      const raw = JSON.stringify({ version: 1, iv: encode(iv), data: encode(new Uint8Array(encrypted)) });
      if (generation !== epoch) throw failure();
      storage.setItem(SECURE_TOKEN_KEY, raw);
      if (await decrypt(storage.getItem(SECURE_TOKEN_KEY) ?? "") !== value || generation !== epoch) throw failure();
      // Delete the legacy credential only after a persisted, authenticated round trip.
      storage.removeItem(LEGACY_TOKEN_KEY);
      token = value;
    } catch { throw failure(); }
  }

  function restore(): Promise<string | null> {
    if (token !== undefined) return Promise.resolve(token);
    if (restoring) return restoring;
    const generation = epoch;
    restoring = (async () => {
      try {
        const encrypted = storage.getItem(SECURE_TOKEN_KEY);
        const legacy = storage.getItem(LEGACY_TOKEN_KEY);
        if (encrypted) {
          const restored = await decrypt(encrypted);
          if (!restored || generation !== epoch) throw failure();
          token = restored;
          storage.removeItem(LEGACY_TOKEN_KEY);
        } else if (legacy) {
          await save(legacy);
        } else if (generation === epoch) token = null;
        return token ?? null;
      } catch { throw failure(); }
    })();
    // Attach after assignment so synchronous empty/error paths cannot leave a stale promise.
    void restoring.finally(() => { restoring = undefined; }).catch(() => undefined);
    return restoring;
  }

  return {
    restore, save,
    peek: () => token ?? null,
    prepare: async () => { if (!cryptography?.subtle || !await keys(true)) throw failure(); },
    clear: () => {
      epoch++;
      token = null;
      storage.removeItem(SECURE_TOKEN_KEY);
      storage.removeItem(LEGACY_TOKEN_KEY);
    },
  };
}

function indexedKey(create: boolean): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB || !window.crypto?.subtle) return reject(failure());
    let settled = false;
    const opening = indexedDB.open(SESSION_DATABASE, 1);
    const timeout = window.setTimeout(() => { settled = true; reject(failure()); }, 8_000);
    opening.onupgradeneeded = () => opening.result.createObjectStore("keys");
    opening.onerror = opening.onblocked = () => { settled = true; window.clearTimeout(timeout); reject(failure()); };
    opening.onsuccess = async () => {
      const database = opening.result;
      if (settled) { database.close(); return; }
      try {
        const generated = create ? await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) : null;
        if (settled) { database.close(); return; }
        const transaction = database.transaction("keys", create ? "readwrite" : "readonly");
        const store = transaction.objectStore("keys");
        const reading = store.get(KEY_ID);
        let key: CryptoKey | null = null;
        reading.onsuccess = () => {
          key = reading.result ?? generated;
          if (!reading.result && generated) store.put(generated, KEY_ID);
        };
        transaction.oncomplete = () => { if (!settled) { settled = true; resolve(key); } database.close(); window.clearTimeout(timeout); };
        transaction.onerror = transaction.onabort = () => { settled = true; database.close(); window.clearTimeout(timeout); reject(failure()); };
      } catch { settled = true; database.close(); window.clearTimeout(timeout); reject(failure()); }
    };
  });
}

let browserStore: ReturnType<typeof createDeviceSessionStore> | undefined;
const session = () => browserStore ??= createDeviceSessionStore(localStorage, indexedKey, window.crypto);
export const restoreDeviceSession = () => session().restore();
export const saveDeviceToken = (token: string) => session().save(token);
export const prepareDeviceSession = () => session().prepare();
export const getDeviceToken = () => session().peek();
export const clearDeviceToken = () => session().clear();
