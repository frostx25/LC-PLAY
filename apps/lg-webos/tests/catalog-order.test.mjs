import assert from "node:assert/strict";
import test from "node:test";
import { cleanGroupLabel, orderByGroup, orderGroups } from "../src/lib/catalog-order.ts";

test("TV prioriza jogos, eventos, reality e regiões na ordem da referência", () => {
  assert.deepEqual(orderGroups("LIVE", [
    "Canais | Record", "Canais | Globo Sul", "Canais | Globo Norte", "Canais | Globo Centro-Oeste",
    "Canais | Reality", "Canais | Eventos", "Canais | Jogos de hoje", "Canais | Globo Sudeste", "Canais | Abertos",
  ]), ["Jogos de hoje", "Eventos", "Reality", "Globo Sudeste", "Globo Centro-Oeste", "Globo Sul", "Globo Norte", "Record", "Abertos"]);
});

test("filmes priorizam lançamentos por ano e plataformas sem confundir Look com Prime Video", () => {
  assert.deepEqual(orderGroups("MOVIE", [
    "Filmes | Apple TV+", "Filmes | Prime Video", "Filmes | Look / Prime Video",
    "Filmes | HBO Max / DC", "Filmes | Disney+ / Marvel", "Filmes | Netflix",
    "Filmes | 4K", "Filmes | Lançamentos 2025", "Filmes | Lançamentos 2027",
    "Filmes | GloboPlay", "Filmes | Lançamentos 2026",
  ]), ["Lançamentos 2027", "Lançamentos 2026", "Lançamentos 2025", "4K", "Netflix", "Disney+ / Marvel",
    "HBO Max / DC", "Look / Prime Video", "Prime Video", "GloboPlay", "Apple TV+"]);
});

test("séries seguem plataformas, diversas e novelas na ordem da referência", () => {
  assert.deepEqual(orderGroups("SERIES", [
    "Séries | Novelas Mexicanas", "Séries | Novelas", "Séries | Diversas", "Séries | Apple TV+",
    "Séries | Paramount", "Séries | GloboPlay", "Séries | Prime Video", "Séries | HBO Max / DC",
    "Séries | Disney+ / Marvel", "Séries | Netflix",
  ]), ["Netflix", "Disney+ / Marvel", "HBO Max / DC", "Prime Video", "GloboPlay",
    "Paramount", "Apple TV+", "Diversas", "Novelas", "Novelas Mexicanas"]);
});

test("categorias extras mantêm a ordem da fonte, duplicadas são reunidas e adultos ficam no final", () => {
  assert.deepEqual(orderGroups("MOVIE", ["Filmes | Zeta", "Filmes | Adultos", "Filmes | Ação", "Zeta", "Filmes | Netflix"]),
    ["Netflix", "Zeta", "Ação", "Adultos"]);
  assert.equal(cleanGroupLabel("  "), "Outros");
  assert.deepEqual(orderGroups("SERIES", ["Novelas e Séries Turcas", "Novelas Mexicanas", "Novelas"]),
    ["Novelas", "Novelas Mexicanas", "Novelas e Séries Turcas"]);
});

test("todos os conteúdos seguem a ordem de categorias, preservando a sequência da fonte em cada uma", () => {
  for (const kind of ["LIVE", "MOVIE", "SERIES"]) {
    const items = [
      { id: 1, group: "Zeta", name: "Zulu" },
      { id: 2, group: "Alpha", name: "Alpha" },
      { id: 3, group: "Zeta", name: "Beta" },
    ];
    const result = orderByGroup(items, kind, (item) => item.group);
    assert.deepEqual(result.map((item) => item.id), [1, 3, 2]);
    assert.deepEqual(items.map((item) => item.id), [1, 2, 3]);
    assert.equal(result[0], items[0]);
    assert.deepEqual(orderByGroup([], kind, (item) => item.group), []);
  }
});
