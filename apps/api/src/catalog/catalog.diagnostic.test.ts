import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { Playlist } from "@prisma/client";
import { encryptSecret } from "../common/crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { CatalogService } from "./catalog.service";
import type { DevicePrincipal } from "../devices/device-token.guard";

const key = "0123456789abcdef0123456789abcdef";
function fixture(overrides: Partial<Playlist> = {}) {
  return { id: "test", type: "M3U", sourceUrlEncrypted: encryptSecret("https://example.com/list?password=secret", key), epgUrlEncrypted: encryptSecret("https://example.com/epg", key), updatedAt: new Date(), ...overrides } as Playlist;
}
const service = () => new CatalogService({} as PrismaService, { getOrThrow: () => key } as unknown as ConfigService);

test("fonte EPG do dispositivo deriva somente a API da fonte vinculada, sem baixar M3U", () => {
  const playlist = fixture({ sourceUrlEncrypted: encryptSecret("https://provider.example/base/get.php?username=user&password=secret&type=m3u_plus", key) });
  const result = service().epgSourceForDevice({ playlist } as DevicePrincipal);
  assert.equal(result.sourceId, playlist.id);
  assert.equal(result.providerApiUrl, "https://provider.example/base/player_api.php?username=user&password=secret");
  assert.equal(result.revision.length, 64);
  assert.equal(service().epgSourceForDevice({ playlist: fixture() } as DevicePrincipal).providerApiUrl, null);
  assert.throws(() => service().epgSourceForDevice({ playlist: null } as DevicePrincipal), /Nenhuma fonte/);
  assert.throws(() => service().epgSourceForDevice({ playlist: fixture({ status: "PAUSED" }) } as DevicePrincipal), /pausada/);
});

test("fonte nativa e autorizada sem contato com o fornecedor", (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Nao deve baixar fontes"); });
  const playlist = fixture({ name: "QA", status: "ACTIVE" });
  const result = service().mediaSourceForDevice({ playlist } as DevicePrincipal);
  assert.equal(result.sourceId, playlist.id);
  assert.deepEqual(result.source, { id: playlist.id, name: "QA", type: "M3U" });
  assert.equal(result.sourceUrl, "https://example.com/list?password=secret");
  assert.equal(result.epgUrl, "https://example.com/epg");
  assert.throws(() => service().mediaSourceForDevice({ playlist: fixture({ type: "XTREAM" }) } as DevicePrincipal), /somente fontes M3U/);
  assert.throws(() => service().mediaSourceForDevice({ playlist: fixture({ status: "PAUSED" }) } as DevicePrincipal), /pausada/);
});
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

test("catálogo preserva a lista inteira além dos antigos limites e deduplica entre lotes", async (context) => {
  const lines = ["#EXTM3U"];
  for (let index = 0; index < 2100; index++) lines.push(`#EXTINF:-1 group-title="Canais | Abertos",Canal ${index}`, `https://example.com/live/${index}.ts`);
  for (let index = 0; index < 1600; index++) lines.push(`#EXTINF:-1 group-title="Filmes | Cinema",Filme ${index}`, `https://example.com/movie/${index}.mp4`);
  for (let series = 0; series < 800; series++) {
    for (let episode = 1; episode <= 12; episode++) lines.push(`#EXTINF:-1 group-title="Séries | Netflix",Série ${series} S01E${String(episode).padStart(2, "0")}`, `https://example.com/series/${series}-${episode}.mp4`);
  }
  lines.push('#EXTINF:-1 group-title="Canais | Abertos",Canal duplicado', "https://example.com/live/0.ts");
  context.mock.method(globalThis, "fetch", async () => new Response(lines.join("\n")));
  const catalogService = new CatalogService({ playlist: { update: async () => ({}) } } as unknown as PrismaService, { getOrThrow: () => key } as unknown as ConfigService);
  const device = { playlist: fixture({ name: "Completa", status: "ACTIVE", epgUrlEncrypted: null }) } as DevicePrincipal;
  const full = await catalogService.forDevice(device);
  assert.deepEqual(full.summary, { total: 13300, live: 2100, movies: 1600, series: 9600, seriesTitles: 800 });
  assert.equal(full.items.length, full.summary.total);
  assert.equal(full.truncated, false);
  assert.equal((await catalogService.forDevice(device, "MOVIE")).items.at(-1)?.name, "Filme 1599");
  const compact = await catalogService.forDevice(device, "SERIES", true);
  assert.equal(compact.seriesCollections?.length, 800);
  const series = compact.seriesCollections!.at(-1)!;
  const episodes = await catalogService.seriesForDevice(device, series.id);
  assert.equal(episodes.length, 12);
  assert.equal(episodes.at(-1)?.series?.episode, 12);
  await assert.rejects(catalogService.seriesForDevice(device, "nonexistent"), /não encontrada/);
});
