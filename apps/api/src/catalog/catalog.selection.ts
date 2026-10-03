import type { CatalogItem, CatalogKind, CatalogSeries, DeviceCatalog } from "@lc-play/contracts";

type SeriesEntry = CatalogSeries & { episodes: CatalogItem[] };
const seriesIndexes = new WeakMap<DeviceCatalog, Map<string, SeriesEntry>>();

export function catalogSeriesIndex(catalog: DeviceCatalog): Map<string, SeriesEntry> {
  const cached = seriesIndexes.get(catalog);
  if (cached) return cached;
  const collections = new Map<string, SeriesEntry>();
  for (const item of catalog.items) {
    if (item.kind !== "SERIES") continue;
    const title = item.series?.title ?? item.name;
    const group = item.group.replace(/^(canais?|filmes?|movies?|s[eé]ries)\s*[|/:-]\s*/i, "").replace(/\s+/g, " ").trim() || "Outros";
    const key = `${group}:${title}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const existing = collections.get(key);
    if (existing) {
      existing.episodes.push(item);
      existing.episodeCount += 1;
      existing.logo ||= item.logo;
    } else {
      collections.set(key, { id: item.id, title, group, logo: item.logo, episodeCount: 1, episodes: [item] });
    }
  }
  const index = new Map(Array.from(collections.values(), (series) => [series.id, series]));
  seriesIndexes.set(catalog, index);
  return index;
}

export function selectCatalogKind(catalog: DeviceCatalog, kind?: CatalogKind, compact = false): DeviceCatalog {
  if (!kind) return catalog;
  if (kind === "SERIES" && compact) {
    const seriesCollections = Array.from(catalogSeriesIndex(catalog).values(), ({ id, title, group, logo, episodeCount }) => ({ id, title, group, logo, episodeCount }));
    const counts = new Map<string, number>();
    for (const series of seriesCollections) counts.set(series.group, (counts.get(series.group) ?? 0) + 1);
    return { ...catalog, kind, items: [], seriesCollections, groups: Array.from(counts, ([name, count]) => ({ name, count })), truncated: catalog.truncated };
  }
  const items = catalog.items.filter((item) => item.kind === kind);
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
  const total = kind === "LIVE" ? catalog.summary.live : kind === "MOVIE" ? catalog.summary.movies : catalog.summary.series;
  return {
    ...catalog,
    kind,
    items,
    groups: Array.from(counts, ([name, count]) => ({ name, count })),
    truncated: total > items.length,
  };
}
