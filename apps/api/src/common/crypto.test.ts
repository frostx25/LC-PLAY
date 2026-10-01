import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  normalizeActivationCode,
  randomActivationCode,
  safeEqual,
  sha256,
  verifyPassword,
} from "./crypto";

test("hash de senha valida somente a senha original", async () => {
  const stored = await hashPassword("uma-senha-forte");
  assert.equal(await verifyPassword("uma-senha-forte", stored), true);
  assert.equal(await verifyPassword("senha-incorreta", stored), false);
});

test("credenciais criptografadas podem ser recuperadas somente com a chave correta", () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptSecret("https://fonte.exemplo/lista.m3u", secret);
  assert.notEqual(encrypted, "https://fonte.exemplo/lista.m3u");
  assert.equal(decryptSecret(encrypted, secret), "https://fonte.exemplo/lista.m3u");
  assert.throws(() => decryptSecret(encrypted, Buffer.alloc(32, 8).toString("base64")));
});

test("chaves de ativação são legíveis e normalizadas antes do hash", () => {
  const code = randomActivationCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const normalized = normalizeActivationCode(code.toLowerCase());
  assert.equal(normalized.length, 12);
  assert.equal(safeEqual(sha256(normalized), sha256(normalized)), true);
});
