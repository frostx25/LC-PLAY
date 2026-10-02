import type { CatalogKind } from "@lc-play/contracts";

// Category priorities follow the supplied TV screenshots, not title sorting.
const categoryPriorities: Record<CatalogKind, RegExp[]> = {
  LIVE: [
    /\bjogos? de hoje\b/,
    /\beventos?\b/,
    /\breality\b/,
    /\bglobo sudeste\b/,
    /\bglobo centro oeste\b/,
    /\bglobo sul\b/,
    /\bglobo norte\b/,
    /\bglobo nordeste\b/,
  ],
  MOVIE: [
    /\b4k\b/,
    /\bnetflix\b/,
    /\bdisney\b|\bmarvel\b/,
    /\bhbo\b|\bdc\b/,
    /\blook\b/,
    /\bprime video\b/,
    /\bglobo\s*play\b/,
    /\bapple tv\b/,
    /\bparamount\b/,
  ],
  SERIES: [
    /\bnetflix\b/,
    /\bdisney\b|\bmarvel\b/,
    /\bhbo\b|\bdc\b/,
    /\bprime video\b/,
    /\bglobo\s*play\b/,
    /\bparamount\b/,
    /\bapple tv\b/,
    /\bdivers[ao]s\b/,
    /^novelas$/,
    /^novelas mexicanas$/,
  ],
};

export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function cleanGroupLabel(value: string) {
  return value
    .replace(/^(canais?|filmes?|movies?|s[eé]ries?)\s*[|/:-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Outros";
}

function categoryScore(kind: CatalogKind, label: string): [number, number] {
  const normalized = normalizeText(cleanGroupLabel(label));
  if (/\badult[oa]s?\b|\bxxx\b|\+18\b/.test(normalized)) return [999, 0];
  const name = normalized.replace(/[|/:+-]+/g, " ").replace(/\s+/g, " ");
  if (kind === "MOVIE" && /\blancamentos?\b/.test(name)) {
    const year = name.match(/\b(?:19|20)\d{2}\b/);
    return [0, year ? -Number(year[0]) : 0];
  }
  const priority = categoryPriorities[kind].findIndex((pattern) => pattern.test(name));
  return [priority === -1 ? 100 : priority + 1, 0];
}

export function orderGroups(kind: CatalogKind, labels: readonly string[]): string[] {
  const groups = Array.from(new Set(labels.map(cleanGroupLabel)));
  return groups
    .map((label, index) => ({ label, index, score: categoryScore(kind, label) }))
    .sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.index - b.index)
    .map(({ label }) => label);
}

export function orderByGroup<T>(items: readonly T[], kind: CatalogKind, getGroup: (item: T) => string): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const label = cleanGroupLabel(getGroup(item));
    const bucket = buckets.get(label);
    if (bucket) bucket.push(item);
    else buckets.set(label, [item]);
  }
  return orderGroups(kind, Array.from(buckets.keys())).flatMap((label) => buckets.get(label) ?? []);
}
