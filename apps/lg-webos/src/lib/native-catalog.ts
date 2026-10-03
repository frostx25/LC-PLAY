import type { CatalogItem, CatalogKind, CatalogSeries, DeviceCatalog, DeviceMediaSource, NativeCatalogPage, NativeCatalogSnapshot } from "@lc-play/contracts";
import { request } from "./device-api.ts";
import { nativeGuideSupported } from "./channel-epg.ts";

export const nativeCatalogSupported = nativeGuideSupported;

export function nativeCatalogCall<T>(method: string, parameters: Record<string, unknown>, signal: AbortSignal, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    let call: { cancel?: () => void } | undefined;
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); call?.cancel?.(); reject(error); };
    const abort = () => fail(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => fail(new Error("A TV demorou para carregar o conteúdo. Tente novamente.")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    try {
      call = window.webOS!.service!.request("luna://com.lcplay.tv.guide", {
        method, parameters,
        onSuccess: (response) => { if (settled) return; settled = true; cleanup(); resolve(response as T); },
        onFailure: () => fail(new Error("Não foi possível carregar o catálogo no aparelho. Verifique a fonte e tente novamente.")),
      });
    } catch { fail(new Error("Serviço de catálogo indisponível. Atualize o aplicativo na TV.")); }
  });
}

export async function loadNativeCatalog(kind: CatalogKind, token: string, signal: AbortSignal, force = false): Promise<DeviceCatalog> {
  const source = await request<DeviceMediaSource>("v1/device/media/source", { signal }, token, undefined, 15_000);
  const snapshot = await nativeCatalogCall<NativeCatalogSnapshot>("loadCatalog", { ...source, force }, signal, 110_000);
  if (snapshot.catalog.source.id !== source.sourceId || snapshot.revision !== source.revision) throw new Error("A fonte foi alterada. Atualize o conteúdo.");
  const items: CatalogItem[] = [];
  const seriesCollections: CatalogSeries[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: NativeCatalogPage = await nativeCatalogCall("catalogPage", { catalogId: snapshot.catalogId, sourceId: source.sourceId, revision: source.revision, kind, offset }, signal);
    if (kind === "SERIES") seriesCollections.push(...(page.seriesCollections ?? []));
    else items.push(...page.items);
    if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error("O catálogo retornou uma página inválida.");
    offset = page.nextOffset;
  }
  const expected = kind === "LIVE" ? snapshot.catalog.summary.live : kind === "MOVIE" ? snapshot.catalog.summary.movies : snapshot.catalog.summary.seriesTitles;
  if ((kind === "SERIES" ? seriesCollections.length : items.length) !== expected) throw new Error("O catálogo está incompleto. Atualize o conteúdo.");
  return { ...snapshot.catalog, kind, items, seriesCollections: kind === "SERIES" ? seriesCollections : undefined, nativeCatalogId: snapshot.catalogId, nativeRevision: snapshot.revision, epg: { ...snapshot.catalog.epg, mode: "CHANNEL" } };
}

export async function loadNativeEpisodes(catalogId: string, revision: string, sourceId: string, seriesId: string, token: string, signal: AbortSignal): Promise<CatalogItem[]> {
  const source = await request<DeviceMediaSource>("v1/device/media/source", { signal }, token, undefined, 15_000);
  if (source.sourceId !== sourceId || source.revision !== revision) throw new Error("A fonte foi alterada. Volte e atualize o catálogo.");
  const items: CatalogItem[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: NativeCatalogPage = await nativeCatalogCall("seriesEpisodes", { catalogId, revision, sourceId, seriesId, offset }, signal);
    items.push(...page.items);
    if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error("Página de episódios inválida.");
    offset = page.nextOffset;
  }
  return items;
}

export function clearNativeCatalog() {
  if (!nativeCatalogSupported()) return;
  void nativeCatalogCall("clearCatalog", {}, new AbortController().signal, 5_000).catch(() => undefined);
}
