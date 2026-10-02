import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { Playlist } from "@prisma/client";
import { encryptSecret } from "../common/crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "./catalog.service";

const key = "0123456789abcdef0123456789abcdef";
function fixture(overrides: Partial<Playlist> = {}) {
  return { id: "test", type: "M3U", sourceUrlEncrypted: encryptSecret("https://example.com/list?password=secret", key), epgUrlEncrypted: encryptSecret("https://example.com/epg", key), updatedAt: new Date(), ...overrides } as Playlist;
}
const service = () => new CatalogService({} as PrismaService, { getOrThrow: () => key } as unknown as ConfigService);
test("diagnóstico valida M3U e EPG e mede cada etapa sem devolver URLs", async (context) => {
  context.mock.method(globalThis, "fetch", async (url: URL) => new Response(url.pathname === "/epg"
    ? '<tv><programme channel="canal" start="20990101000000 +0000" stop="20990101010000 +0000"><title>Programa</title></programme></tv>'
    : '#EXTM3U\n#EXTINF:-1 tvg-id="canal" group-title="Canais",Canal\nhttps://example.com/live.ts\n'));
  const result = await service().diagnose(fixture());
  assert.equal(result.m3u.status, "OK"); assert.equal(result.m3u.count, 1);
  assert.equal(result.epg.status, "OK"); assert.equal(result.epg.count, 1);
  assert.ok(result.durationMs >= 0); assert.equal(JSON.stringify(result).includes("password"), false);
});
test("falhas têm mensagem segura e ausência de EPG não causa falso erro", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("https://example.com/?password=secret"); });
  const result = await service().diagnose(fixture({ epgUrlEncrypted: null }));
  assert.equal(result.m3u.status, "ERROR"); assert.equal(result.epg.status, "UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});
test("diagnóstico rejeita lista vazia e XML sem programação válida", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("<html>erro</html>"));
  const result = await service().diagnose(fixture());
  assert.equal(result.m3u.status, "ERROR"); assert.equal(result.epg.status, "ERROR");
});
test("requisições simultâneas compartilham diagnóstico e Xtream é explicitamente não suportado", async (context) => {
  let count = 0;
  context.mock.method(globalThis, "fetch", async () => { count++; return new Response('#EXTM3U\n#EXTINF:-1,Canal\nhttps://example.com/live.ts'); });
  const catalog = service(), playlist = fixture({ epgUrlEncrypted: null });
  const first = catalog.diagnose(playlist), second = catalog.diagnose(playlist);
  assert.equal(first, second); await first; assert.equal(count, 1);
  assert.equal((await catalog.diagnose(fixture({ type: "XTREAM", epgUrlEncrypted: null }))).m3u.status, "UNSUPPORTED");
});
