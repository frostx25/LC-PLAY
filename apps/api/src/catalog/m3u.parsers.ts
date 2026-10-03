import { createHash } from "node:crypto";
import type { CatalogItem, CatalogKind } from "@lc-play/contracts";
import playlistParser from "iptv-playlist-parser";

type CatalogSeed = Omit<CatalogItem, "now" | "next">;
const moviePattern = /\b(filmes?|movies?|cinema|vod)\b/i;
const seriesPattern = /\b(s[eé]ries?|series?|shows?)\b/i;

function classify(group: string, url: string): CatalogKind {
  const normalizedGroup = group.trim();
  if (/^(canais?|tv)\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/live\//i.test(url)) return "LIVE";
  if (/^s[eé]ries?\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/series\//i.test(url)) return "SERIES";
  if (/^(filmes?|movies?)\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/movie\//i.test(url)) return "MOVIE";
  const value = `${normalizedGroup} ${url}`;
  if (seriesPattern.test(value)) return "SERIES";
  return moviePattern.test(value) || /\.(mp4|mkv|avi)(?:\?|$)/i.test(url) ? "MOVIE" : "LIVE";
}

export function parseSeriesEpisode(name: string): CatalogItem["series"] {
  for (const pattern of [/^(.*?)[\s._-]+S(\d{1,3})[\s._-]*E(\d{1,4})(?:\b|$)/i, /^(.*?)[\s._-]+T(\d{1,3})[\s._-]*E(\d{1,4})(?:\b|$)/i, /^(.*?)[\s._-]+(\d{1,3})x(\d{1,4})(?:\b|$)/i]) {
    const match = name.match(pattern);
    if (!match) continue;
    const title = match[1]?.replace(/[|._-]+$/g, "").trim();
    const season = Number(match[2]);
    const episode = Number(match[3]);
    if (title && Number.isInteger(season) && Number.isInteger(episode)) return { title, season, episode };
  }
  return null;
}

function clean(value: string | undefined, fallback = "") { return value?.trim() || fallback; }

export function parseM3uCatalog(content: string, playlistId: string): { items: CatalogSeed[]; embeddedEpgUrl: string | null } {
  const parsed = playlistParser.parse(content);
  const seen = new Set<string>();
  const items: CatalogSeed[] = [];
  for (const entry of parsed.items) {
    const streamUrl = clean(entry.url);
    if (!/^https?:\/\//i.test(streamUrl) || seen.has(streamUrl)) continue;
    seen.add(streamUrl);
    const name = clean(entry.name, clean(entry.tvg?.name, "Conteúdo sem título"));
    const group = clean(entry.group?.title, "Outros");
    const kind = classify(group, streamUrl);
    items.push({ id: createHash("sha256").update(`${playlistId}:${streamUrl}`).digest("hex").slice(0, 24), name, kind, group, logo: clean(entry.tvg?.logo) || null, streamUrl, tvgId: clean(entry.tvg?.id) || null, series: kind === "SERIES" ? parseSeriesEpisode(name) : null });
  }
  const epgValue = parsed.header?.attrs?.["x-tvg-url"] ?? parsed.header?.attrs?.["url-tvg"];
  return { items, embeddedEpgUrl: epgValue?.split(",").map((value) => value.trim()).find(Boolean) ?? null };
}
