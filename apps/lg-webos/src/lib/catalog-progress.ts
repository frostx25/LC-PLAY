import type { CatalogKind, DeviceCatalog, DeviceMediaSource } from "@lc-play/contracts";

export const NATIVE_CATALOG_CACHE_MS = 6 * 60 * 60_000;
export const BROWSER_CATALOG_CACHE_MS = 5 * 60_000;

export type CatalogProgress = {
  stage: "source" | "download" | "index" | "library" | "episodes";
  kind?: CatalogKind;
  completed?: number;
  total?: number | null;
  items?: number;
  elapsedMs?: number;
  stalled?: boolean;
};

export function catalogExpiresAt(catalog: DeviceCatalog, now = Date.now()) {
  const refreshed = Date.parse(catalog.refreshedAt);
  return catalog.nativeCatalogId
    ? (Number.isFinite(refreshed) ? refreshed : now) + NATIVE_CATALOG_CACHE_MS
    : now + BROWSER_CATALOG_CACHE_MS;
}

export function canReuseCatalog(cached: { catalog: DeviceCatalog; expiresAt: number }, source: DeviceMediaSource, now = Date.now()) {
  return cached.expiresAt > now && cached.catalog.source.id === source.sourceId && cached.catalog.nativeRevision === source.revision;
}

export function describeCatalogProgress(progress: CatalogProgress) {
  const count = (value: number) => Math.max(0, value).toLocaleString("pt-BR");
  const bytes = (value: number) => `${(Math.max(0, value) / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  const completed = progress.completed ?? 0;
  const percent = progress.total && progress.total > 0 ? Math.min(100, Math.max(0, Math.floor(completed / progress.total * 100))) : null;
  const title = progress.stage === "source" ? "Verificando fonte"
    : progress.stage === "download" ? "Baixando lista"
    : progress.stage === "index" ? "Organizando catálogo"
    : progress.stage === "episodes" ? "Carregando episódios"
    : progress.kind === "MOVIE" ? "Carregando filmes" : progress.kind === "SERIES" ? "Carregando séries" : "Carregando canais";
  const detail = progress.stage === "source" ? "Aguardando resposta"
    : progress.stage === "download" ? `${bytes(completed)}${progress.total ? ` de ${bytes(progress.total)} · faltam ${bytes(progress.total - completed)}` : " recebidos"}`
    : progress.stage === "index" ? `${count(progress.items ?? 0)} itens organizados`
    : `${count(completed)}${progress.total !== undefined && progress.total !== null ? ` de ${count(progress.total)}` : ""} ${progress.stage === "episodes" ? "episódios" : "títulos"}`;
  let timing: string | null = null;
  if (progress.stage === "download" && progress.elapsedMs !== undefined) {
    const elapsed = Math.max(0, progress.elapsedMs);
    const speed = elapsed >= 2000 && completed > 0 && !progress.stalled ? completed / (elapsed / 1000) : null;
    const rate = speed === null ? null : speed >= 1048576
      ? `${bytes(speed)}/s`
      : `${(speed / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB/s`;
    const remaining = speed !== null && progress.total && progress.total > 0 ? Math.max(0, progress.total - completed) / speed : null;
    const estimate = progress.stalled ? "Aguardando dados"
      : remaining !== null ? `~ ${formatDuration(remaining)} restantes`
      : progress.total ? "Estimando tempo restante" : null;
    timing = [estimate, rate, `${formatDuration(elapsed / 1000)} decorridos`].filter(Boolean).join(" · ");
  }
  return { title, detail, percent, timing };
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return minutes ? `${minutes} min ${value % 60} s` : `${value} s`;
}
