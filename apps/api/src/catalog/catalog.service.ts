import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Playlist } from "@prisma/client";
import type { CatalogItem, CatalogKind, DeviceCatalog, SourceDiagnostic, SourceDiagnosticCheck } from "@lc-play/contracts";
import { decryptSecret, sha256 } from "../common/crypto";
import type { DevicePrincipal } from "../devices/device-token.guard";
import { PrismaService } from "../prisma/prisma.service";
import { attachEpg, parseM3uCatalog, parseXmltv } from "./catalog.parsers";
import { selectCatalogKind } from "./catalog.selection";
import { CatalogCache } from "./catalog.cache";

const MAX_CATALOG_BYTES = 150 * 1024 * 1024;
const MAX_EPG_BYTES = 80 * 1024 * 1024;
const MAX_DEVICE_ITEMS = 8_500;
const ITEM_LIMITS = { LIVE: 2_000, MOVIE: 1_500, SERIES: 5_000 } as const;
const MAX_SERIES_COLLECTIONS = 750;
const MAX_RETAINED_EPISODES_PER_SERIES = 8;

type M3uLoadResult = {
  items: CatalogItem[];
  embeddedEpgUrl: string | null;
  summary: DeviceCatalog["summary"];
  groups: Map<string, number>;
};

@Injectable()
export class CatalogService {
  private readonly cache = new CatalogCache();
  private readonly diagnostics = new Map<string, Promise<SourceDiagnostic>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forDevice(device: DevicePrincipal, kind?: CatalogKind): Promise<DeviceCatalog> {
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
    const catalog = await this.cache.get(cacheKey, () => this.loadAndPersist(playlist));
    return selectCatalogKind(catalog, kind);
  }

  diagnose(playlist: Playlist): Promise<SourceDiagnostic> {
    const key = `${playlist.id}:${playlist.updatedAt.toISOString()}`;
    const pending = this.diagnostics.get(key);
    if (pending) return pending;
    const result = this.runDiagnostic(playlist).finally(() => this.diagnostics.delete(key));
    this.diagnostics.set(key, result);
    return result;
  }

  private async runDiagnostic(playlist: Playlist): Promise<SourceDiagnostic> {
    const started = Date.now();
    const key = this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY");
    let epgUrl = playlist.epgUrlEncrypted ? decryptSecret(playlist.epgUrlEncrypted, key) : null;
    let m3u: SourceDiagnosticCheck;
    if (playlist.type !== "M3U") {
      m3u = { status: "UNSUPPORTED", durationMs: 0, message: "Diagnóstico Xtream ainda não disponível." };
    } else {
      try {
        const parsed = await this.fetchM3u(decryptSecret(playlist.sourceUrlEncrypted, key), playlist.id);
        if (!parsed.summary.total) throw new Error("A lista M3U não contém itens válidos.");
        epgUrl ||= parsed.embeddedEpgUrl;
        m3u = { status: "OK", durationMs: Date.now() - started, message: "Lista M3U válida.", count: parsed.summary.total };
      } catch (error) {
        m3u = { status: "ERROR", durationMs: Date.now() - started, message: diagnosticMessage(error, "M3U") };
      }
    }
    const epgStarted = Date.now();
    let epg: SourceDiagnosticCheck = { status: "UNAVAILABLE", durationMs: 0, message: "Nenhum EPG configurado ou detectado." };
    if (epgUrl) {
      try {
        const guide = parseXmltv(await this.fetchText(epgUrl, MAX_EPG_BYTES, "Não foi possível baixar o EPG."));
        if (!guide.size) throw new Error("O EPG não contém programação atual ou futura válida.");
        epg = { status: "OK", durationMs: Date.now() - epgStarted, message: "EPG válido; canais com programação atual ou futura.", count: guide.size };
      } catch (error) {
        epg = { status: "ERROR", durationMs: Date.now() - epgStarted, message: diagnosticMessage(error, "EPG") };
      }
    }
    return { checkedAt: new Date().toISOString(), durationMs: Date.now() - started, m3u, epg };
  }

  private async loadAndPersist(playlist: Playlist): Promise<DeviceCatalog> {
    try {
      const catalog = await this.loadM3u(playlist);
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
    const timeout = setTimeout(() => controller.abort(), 90_000);
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

function diagnosticMessage(error: unknown, kind: "M3U" | "EPG") {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Tempo limite excedido")) return `${kind}: tempo limite excedido.`;
  const status = message.match(/Resposta (\d{3})/);
  if (status) return `${kind}: servidor respondeu HTTP ${status[1]}.`;
  if (message.includes("excede o limite")) return `${kind}: arquivo excede o tamanho permitido.`;
  if (message.includes("não contém")) return kind === "M3U" ? "M3U sem itens válidos." : "EPG sem programação atual ou futura válida.";
  return `${kind}: não foi possível acessar ou interpretar a fonte. Verifique a URL, as credenciais e a disponibilidade do servidor.`;
}
