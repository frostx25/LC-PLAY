import assert from "node:assert/strict";
import test from "node:test";
import { attachEpg, parseM3uCatalog, parseSeriesEpisode, parseXmltv, parseXmltvDate } from "./catalog.parsers";

test("interpreta M3U estendida e classifica os itens", () => {
  const content = `#EXTM3U x-tvg-url="https://example.com/epg.xml"
#EXTINF:-1 tvg-id="news.one" tvg-logo="https://example.com/news.png" group-title="Notícias",Canal Notícias
https://media.example.com/live/news.m3u8
#EXTINF:-1 group-title="Filmes",Filme de teste
https://media.example.com/movie/teste.mp4`;
  const parsed = parseM3uCatalog(content, "playlist-1");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0]?.kind, "LIVE");
  assert.equal(parsed.items[1]?.kind, "MOVIE");
  assert.equal(parsed.embeddedEpgUrl, "https://example.com/epg.xml");
});

test("mantém grupos de canais como TV ao vivo e identifica episódios", () => {
  const parsed = parseM3uCatalog(`#EXTM3U
#EXTINF:-1 group-title="Canais | Filmes & Series",Canal Sony HD
https://media.example.com/live/sony.m3u8
#EXTINF:-1 group-title="Séries | Globoplay",Zoey e a Sua Fantástica Playlist S02 E13
https://media.example.com/series/zoey/213.mp4`, "playlist-1");
  assert.equal(parsed.items[0]?.kind, "LIVE");
  assert.equal(parsed.items[1]?.kind, "SERIES");
  assert.deepEqual(parsed.items[1]?.series, {
    title: "Zoey e a Sua Fantástica Playlist",
    season: 2,
    episode: 13,
  });
  assert.equal(parseSeriesEpisode("Série sem numeração"), null);
});

test("associa programa atual e próximo pelo tvg-id", () => {
  const now = new Date("2026-09-30T23:30:00.000Z");
  const guide = parseXmltv(
    `<tv>
      <programme start="20260930230000 +0000" stop="20261001000000 +0000" channel="news.one"><title>Jornal</title></programme>
      <programme start="20261001000000 +0000" stop="20261001010000 +0000" channel="news.one"><title>Entrevista</title></programme>
    </tv>`,
    now,
  );
  const items = attachEpg(
    [{ id: "1", name: "Canal", kind: "LIVE", group: "Notícias", logo: null, streamUrl: "https://example.com/live.m3u8", tvgId: "news.one", series: null }],
    guide,
  );
  assert.equal(items[0]?.now?.title, "Jornal");
  assert.equal(items[0]?.next?.title, "Entrevista");
});

test("interpreta o fuso horário XMLTV", () => {
  assert.equal(parseXmltvDate("20260930203000 -0300")?.toISOString(), "2026-09-30T23:30:00.000Z");
});
