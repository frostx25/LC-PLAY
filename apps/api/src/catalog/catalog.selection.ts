import type { CatalogKind, DeviceCatalog } from "@lc-play/contracts";

export function selectCatalogKind(catalog: DeviceCatalog, kind?: CatalogKind): DeviceCatalog {
  if (!kind) return catalog;
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
