import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Playlist } from "@prisma/client";
import type { CatalogItem, DeviceCatalog } from "@lc-play/contracts";
import { decryptSecret, sha256 } from "../common/crypto";
import type { DevicePrincipal } from "../devices/device-token.guard";
import { PrismaService } from "../prisma/prisma.service";
import { attachEpg, parseM3uCatalog, parseXmltv } from "./catalog.parsers";

const CATALOG_CACHE_MS = 5 * 60_000;
const MAX_CATALOG_BYTES = 150 * 1024 * 1024;
const MAX_EPG_BYTES = 80 * 1024 * 1024;
const MAX_DEVICE_ITEMS = 8_500;
const ITEM_LIMITS = { LIVE: 2_000, MOVIE: 1_500, SERIES: 5_000 } as const;
const MAX_SERIES_COLLECTIONS = 750;
const MAX_RETAINED_EPISODES_PER_SERIES = 8;

type CachedCatalog = { expiresAt: number; catalog: DeviceCatalog };
type M3uLoadResult = {
  items: CatalogItem[];
  embeddedEpgUrl: string | null;
  summary: DeviceCatalog["summary"];
  groups: Map<string, number>;
};

@Injectable()
export class CatalogService {
  private readonly cache = new Map<string, CachedCatalog>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forDevice(device: DevicePrincipal): Promise<DeviceCatalog> {
    const playlist = device.playlist;
    if (!playlist) throw new BadRequestException("Nenhuma fonte está vinculada a este dispositivo.");
    if (playlist.status === "PAUSED") throw new ServiceUnavailableException("A fonte vinculada está pausada.");
    if (playlist.type !== "M3U") {
      throw new BadRequestException("Esta versão do player aceita fontes M3U. O suporte Xtream será adicionado em seguida.");
    }

    const cacheKey = sha256([
      playlist.id,
      playlist.type,
      playlist.sourceUrlEncrypted,
      playlist.epgUrlEncrypted ?? "",
      playlist.usernameEncrypted ?? "",
      playlist.passwordEncrypted ?? "",
    ].join(":"));
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;

    try {
      const catalog = await this.loadM3u(playlist);
      this.cache.set(cacheKey, { expiresAt: Date.now() + CATALOG_CACHE_MS, catalog });
      await this.prisma.playlist.update({
        where: { id: playlist.id },
        data: {
          status: "ACTIVE",
          itemCount: catalog.summary.total,
          lastSyncAt: new Date(catalog.refreshedAt),
          lastError: catalog.epg.status === "ERROR" ? "Lista carregada, mas o EPG não pôde ser atualizado." : null,
        },
      });
      return catalog;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida ao carregar a fonte.";
      await this.prisma.playlist.update({
        where: { id: playlist.id },
        data: { status: "ERROR", lastError: message.slice(0, 500) },
      });
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException(message);
    }
  }

  private async loadM3u(playlist: Playlist): Promise<DeviceCatalog> {
    const encryptionKey = this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY");
    const sourceUrl = decryptSecret(playlist.sourceUrlEncrypted, encryptionKey);
    const parsed = await this.fetchM3u(sourceUrl, playlist.id);
    if (!parsed.items.length) throw new BadGatewayException("A lista M3U não contém itens válidos.");

    let items: CatalogItem[] = parsed.items.map((item) => ({ ...item, now: null, next: null }));
    let epgStatus: DeviceCatalog["epg"]["status"] = "UNAVAILABLE";
    let programmeCount = 0;
    const configuredEpg = playlist.epgUrlEncrypted
      ? decryptSecret(playlist.epgUrlEncrypted, encryptionKey)
      : parsed.embeddedEpgUrl;

    if (configuredEpg) {
      try {
        const epgContent = await this.fetchText(configuredEpg, MAX_EPG_BYTES, "Não foi possível baixar o EPG.");
        const guide = parseXmltv(epgContent);
        items = attachEpg(parsed.items, guide);
        programmeCount = Array.from(guide.values()).reduce(
          (total, programme) => total + Number(Boolean(programme.now)) + Number(Boolean(programme.next)),
          0,
        );
        epgStatus = "AVAILABLE";
      } catch {
        epgStatus = "ERROR";
      }
    }

    return {
      source: { id: playlist.id, name: playlist.name, type: playlist.type },
      summary: parsed.summary,
      groups: Array.from(parsed.groups, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      items: items.slice(0, MAX_DEVICE_ITEMS),
      truncated: parsed.summary.total > items.length,
      refreshedAt: new Date().toISOString(),
      epg: { status: epgStatus, programmes: programmeCount },
    };
  }

  private async fetchM3u(
    url: string,
    playlistId: string,
  ): Promise<M3uLoadResult> {
    const parsedUrl = this.parseHttpUrl(url, "A URL cadastrada para a fonte é inválida.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(parsedUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "LC-PLAY/0.1" },
      });
      if (!response.ok || !response.body) {
        throw new Error(`Não foi possível baixar a lista M3U. Resposta ${response.status}.`);
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_CATALOG_BYTES) {
        throw new Error("Não foi possível baixar a lista M3U. O arquivo excede o limite permitido.");
      }

      const decoder = new TextDecoder();
      const items: CatalogItem[] = [];
      const seriesBuckets = new Map<string, CatalogItem[]>();
      const retainedIds = new Set<string>();
      const retained = { LIVE: 0, MOVIE: 0, SERIES: 0 };
      const summary = { total: 0, live: 0, movies: 0, series: 0 };
      const groups = new Map<string, number>();
      let embeddedEpgUrl: string | null = null;
      let carry = "";
      let header = "#EXTM3U";
      let batch: string[] = [];
      let batchEntries = 0;
      let size = 0;

      const flush = () => {
        if (!batchEntries) return;
        const parsed = parseM3uCatalog(`${header}\n${batch.join("\n")}`, playlistId);
        embeddedEpgUrl ??= parsed.embeddedEpgUrl;
        for (const item of parsed.items) {
          summary.total += 1;
          if (item.kind === "LIVE") summary.live += 1;
          if (item.kind === "MOVIE") summary.movies += 1;
          if (item.kind === "SERIES") summary.series += 1;
          groups.set(item.group, (groups.get(item.group) ?? 0) + 1);
          if (item.kind === "SERIES") {
            const seriesKey = `${item.group}:${item.series?.title ?? item.name}`.toLocaleLowerCase("pt-BR");
            let bucket = seriesBuckets.get(seriesKey);
            if (!bucket) {
              if (seriesBuckets.size >= MAX_SERIES_COLLECTIONS) continue;
              bucket = [];
              seriesBuckets.set(seriesKey, bucket);
            }
            if (bucket.length < MAX_RETAINED_EPISODES_PER_SERIES) {
              bucket.push({ ...item, now: null, next: null });
            }
            continue;
          }
          if (retained[item.kind] >= ITEM_LIMITS[item.kind] || retainedIds.has(item.id)) continue;
          retainedIds.add(item.id);
          retained[item.kind] += 1;
          items.push({ ...item, now: null, next: null });
        }
        batch = [];
        batchEntries = 0;
      };

      const consumeLine = (line: string) => {
        if (line.startsWith("#EXTM3U")) {
          header = line;
          return;
        }
        batch.push(line);
        if (/^https?:\/\//i.test(line.trim())) batchEntries += 1;
        if (batchEntries >= 500) flush();
      };

      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_CATALOG_BYTES) {
          throw new Error("Não foi possível baixar a lista M3U. O arquivo excede o limite permitido.");
        }
        carry += decoder.decode(chunk, { stream: true });
        const lines = carry.split(/\r?\n/);
        carry = lines.pop() ?? "";
        for (const line of lines) consumeLine(line);
      }
      carry += decoder.decode();
      if (carry) consumeLine(carry);
      flush();

      const series = Array.from(seriesBuckets.values());
      for (let episodeIndex = 0; episodeIndex < MAX_RETAINED_EPISODES_PER_SERIES; episodeIndex += 1) {
        for (const bucket of series) {
          const item = bucket[episodeIndex];
          if (!item || retained.SERIES >= ITEM_LIMITS.SERIES || retainedIds.has(item.id)) continue;
          retainedIds.add(item.id);
          retained.SERIES += 1;
          items.push(item);
        }
      }
      return { items, embeddedEpgUrl, summary, groups };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Não foi possível baixar a lista M3U. Tempo limite excedido.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchText(url: string, maxBytes: number, failureMessage: string): Promise<string> {
    const parsedUrl = this.parseHttpUrl(url, "A URL cadastrada para a fonte é inválida.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(parsedUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "LC-PLAY/0.1" },
      });
      if (!response.ok || !response.body) throw new Error(`${failureMessage} Resposta ${response.status}.`);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > maxBytes) throw new Error(`${failureMessage} O arquivo excede o limite permitido.`);

      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error(`${failureMessage} O arquivo excede o limite permitido.`);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${failureMessage} Tempo limite excedido.`);
      }
      throw error instanceof Error ? error : new Error(failureMessage);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseHttpUrl(value: string, invalidMessage: string): URL {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value);
    } catch {
      throw new BadRequestException(invalidMessage);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new BadRequestException("A fonte precisa usar HTTP ou HTTPS.");
    }
    return parsedUrl;
  }
}
