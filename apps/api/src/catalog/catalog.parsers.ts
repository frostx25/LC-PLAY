import type { CatalogItem, EpgProgramme } from "@lc-play/contracts";
import { XMLParser } from "fast-xml-parser";
export { parseM3uCatalog, parseSeriesEpisode } from "./m3u.parsers";

type CatalogSeed = Omit<CatalogItem, "now" | "next">;
type ProgrammePair = { now: EpgProgramme | null; next: EpgProgramme | null };

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
