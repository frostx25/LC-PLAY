import type { CatalogItem, CatalogKind, EpgProgramme } from "@lc-play/contracts";
import { XMLParser } from "fast-xml-parser";
import playlistParser from "iptv-playlist-parser";
import { sha256 } from "../common/crypto";

type CatalogSeed = Omit<CatalogItem, "now" | "next">;
type ProgrammePair = { now: EpgProgramme | null; next: EpgProgramme | null };

const moviePattern = /\b(filmes?|movies?|cinema|vod)\b/i;
const seriesPattern = /\b(s[eé]ries?|series?|shows?)\b/i;

function classify(group: string, url: string): CatalogKind {
  const normalizedGroup = group.trim();
  if (/^(canais?|tv)\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/live\//i.test(url)) return "LIVE";
  if (/^s[eé]ries?\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/series\//i.test(url)) return "SERIES";
  if (/^(filmes?|movies?)\s*(?:[|/:\-]|$)/i.test(normalizedGroup) || /\/movie\//i.test(url)) return "MOVIE";
  const value = `${normalizedGroup} ${url}`;
  if (seriesPattern.test(value)) return "SERIES";
  if (moviePattern.test(value) || /\.(mp4|mkv|avi)(?:\?|$)/i.test(url)) {
    return "MOVIE";
  }
  return "LIVE";
}

export function parseSeriesEpisode(name: string): CatalogItem["series"] {
  const patterns = [
    /^(.*?)[\s._-]+S(\d{1,3})[\s._-]*E(\d{1,4})(?:\b|$)/i,
    /^(.*?)[\s._-]+T(\d{1,3})[\s._-]*E(\d{1,4})(?:\b|$)/i,
    /^(.*?)[\s._-]+(\d{1,3})x(\d{1,4})(?:\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;
    const title = match[1]?.replace(/[|._-]+$/g, "").trim();
    const season = Number(match[2]);
    const episode = Number(match[3]);
    if (title && Number.isInteger(season) && Number.isInteger(episode)) return { title, season, episode };
  }
  return null;
}

function clean(value: string | undefined, fallback = ""): string {
  return value?.trim() || fallback;
}

export function parseM3uCatalog(content: string, playlistId: string): {
  items: CatalogSeed[];
  embeddedEpgUrl: string | null;
} {
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
    items.push({
      id: sha256(`${playlistId}:${streamUrl}`).slice(0, 24),
      name,
      kind,
      group,
      logo: clean(entry.tvg?.logo) || null,
      streamUrl,
      tvgId: clean(entry.tvg?.id) || null,
      series: kind === "SERIES" ? parseSeriesEpisode(name) : null,
    });
  }

  const epgValue = parsed.header?.attrs?.["x-tvg-url"] ?? parsed.header?.attrs?.["url-tvg"];
  const embeddedEpgUrl = epgValue?.split(",").map((value) => value.trim()).find(Boolean) ?? null;
  return { items, embeddedEpgUrl };
}

function xmlText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  if (Array.isArray(value)) return xmlText(value[0]);
  if (value && typeof value === "object") {
    return xmlText((value as Record<string, unknown>)["#text"]);
  }
  return null;
}

export function parseXmltvDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{4}|Z))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", zone] = match;
  const offset = zone && zone !== "Z" ? `${zone.slice(0, 3)}:${zone.slice(3)}` : "Z";
  const result = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function parseXmltv(content: string, now = new Date()): Map<string, ProgrammePair> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "#text",
    processEntities: false,
  });
  const document = parser.parse(content) as { tv?: { programme?: unknown | unknown[] } };
  const programmes = Array.isArray(document.tv?.programme)
    ? document.tv.programme
    : document.tv?.programme
      ? [document.tv.programme]
      : [];
  const guide = new Map<string, ProgrammePair>();
  const currentTime = now.getTime();

  for (const raw of programmes) {
    if (!raw || typeof raw !== "object") continue;
    const programme = raw as Record<string, unknown>;
    const channel = typeof programme.channel === "string" ? programme.channel.trim().toLowerCase() : "";
    const startsAt = parseXmltvDate(programme.start);
    const endsAt = parseXmltvDate(programme.stop);
    const title = xmlText(programme.title);
    if (!channel || !startsAt || !endsAt || !title) continue;
    if (endsAt.getTime() <= currentTime) continue;

    const normalized: EpgProgramme = {
      title,
      description: xmlText(programme.desc),
      category: xmlText(programme.category),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
    const pair = guide.get(channel) ?? { now: null, next: null };
    if (startsAt.getTime() <= currentTime && endsAt.getTime() > currentTime) {
      pair.now = normalized;
    } else if (startsAt.getTime() > currentTime) {
      const currentNext = pair.next ? new Date(pair.next.startsAt).getTime() : Number.POSITIVE_INFINITY;
      if (startsAt.getTime() < currentNext) pair.next = normalized;
    }
    guide.set(channel, pair);
  }

  return guide;
}

export function attachEpg(items: CatalogSeed[], guide: Map<string, ProgrammePair>): CatalogItem[] {
  return items.map((item) => {
    const programme = item.tvgId ? guide.get(item.tvgId.toLowerCase()) : undefined;
    return { ...item, now: programme?.now ?? null, next: programme?.next ?? null };
  });
}
