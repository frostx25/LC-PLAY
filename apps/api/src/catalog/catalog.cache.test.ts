import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import type { DeviceCatalog } from "@lc-play/contracts";
import { CatalogCache } from "./catalog.cache";

function catalog(name: string): DeviceCatalog {
  return {
    source: { id: name, name, type: "M3U" },
    summary: { total: 0, live: 0, movies: 0, series: 0 },
    groups: [], items: [], truncated: false,
    refreshedAt: "2026-10-01T12:00:00Z",
    epg: { status: "UNAVAILABLE", programmes: 0 },
  };
}

test("requisições simultâneas compartilham um único carregamento inicial", async () => {
  const cache = new CatalogCache();
  let loads = 0;
  const expected = catalog("fonte");
  let resolve!: (value: DeviceCatalog) => void;
  const result = new Promise<DeviceCatalog>((done) => { resolve = done; });
  const load = () => { loads++; return result; };
  const requests = [cache.get("same", load), cache.get("same", load), cache.get("same", load)];
  await setImmediate();
  assert.equal(loads, 1);
  resolve(expected);
  assert.deepEqual(await Promise.all(requests), [expected, expected, expected]);
  assert.equal(await cache.get("same", load), expected);
  assert.equal(loads, 1);
});

test("cache vencido atende a navegação enquanto uma única atualização ocorre", async () => {
  let now = 0;
  const cache = new CatalogCache(10, () => now);
  const original = catalog("original"), updated = catalog("updated");
  await cache.get("source", () => Promise.resolve(original));
  now = 11;
  let loads = 0;
  let resolve!: (value: DeviceCatalog) => void;
  const refresh = new Promise<DeviceCatalog>((done) => { resolve = done; });
  const load = () => { loads++; return refresh; };
  assert.equal(await cache.get("source", load), original);
  assert.equal(await cache.get("source", load), original);
  assert.equal(loads, 1);
  resolve(updated);
  await setImmediate();
  assert.equal(await cache.get("source", load), updated);
});

test("falha de atualização preserva conteúdo anterior e respeita espera para nova tentativa", async () => {
  let now = 0;
  const cache = new CatalogCache(10, () => now, 20);
  const expected = catalog("source");
  await cache.get("source", () => Promise.resolve(expected));
  now = 11;
  let loads = 0;
  const fail = () => { loads++; return Promise.reject(new Error("timeout")); };
  assert.equal(await cache.get("source", fail), expected);
  await setImmediate();
  assert.equal(await cache.get("source", fail), expected);
  assert.equal(loads, 1);
  now = 32;
  assert.equal(await cache.get("source", fail), expected);
  await setImmediate();
  assert.equal(loads, 2);
});

test("primeira falha não trava tentativas posteriores e fontes diferentes não compartilham dados", async () => {
  const cache = new CatalogCache();
  await assert.rejects(cache.get("a", () => Promise.reject(new Error("timeout"))), /timeout/);
  const a = catalog("a"), b = catalog("b");
  assert.equal(await cache.get("a", () => Promise.resolve(a)), a);
  assert.equal(await cache.get("b", () => Promise.resolve(b)), b);
  assert.equal(await cache.get("a", () => Promise.reject(new Error("must not reload"))), a);
});
