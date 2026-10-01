import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogItem, CatalogKind, DeviceCatalog } from "@lc-play/contracts";
import { selectCatalogKind } from "./catalog.selection";

function item(id: string, kind: CatalogKind, group: string): CatalogItem {
  return { id, kind, group, name: id, streamUrl: "https://example.invalid/media", logo: null, tvgId: null, series: null, now: null, next: null };
}

const catalog: DeviceCatalog = {
  source: { id: "source", name: "Teste", type: "M3U" },
  summary: { total: 104, live: 2, movies: 100, series: 2 },
  groups: [{ name: "Todos", count: 104 }],
  items: [item("live-1", "LIVE", "Abertos"), item("live-2", "LIVE", "Abertos"), item("movie", "MOVIE", "Cinema"), item("series", "SERIES", "Séries")],
  truncated: true,
  refreshedAt: "2026-10-01T12:00:00Z",
  epg: { status: "AVAILABLE", programmes: 2 },
};

test("carrega apenas a seção solicitada e mantém resumo e EPG", () => {
  const result = selectCatalogKind(catalog, "LIVE");
  assert.deepEqual(result.items.map((entry) => entry.id), ["live-1", "live-2"]);
  assert.deepEqual(result.groups, [{ name: "Abertos", count: 2 }]);
  assert.equal(result.kind, "LIVE");
  assert.equal(result.truncated, false);
  assert.deepEqual(result.summary, catalog.summary);
  assert.deepEqual(result.epg, catalog.epg);
});

test("indica truncamento da seção e preserva o catálogo compartilhado", () => {
  assert.equal(selectCatalogKind(catalog, "MOVIE").truncated, true);
  assert.equal(selectCatalogKind(catalog, "SERIES").items.length, 1);
  assert.equal(catalog.items.length, 4);
  assert.equal(catalog.kind, undefined);
  assert.equal(selectCatalogKind(catalog), catalog);
});
