import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type FormEvent,
  type ReactNode,
} from "react";
import type { CatalogItem, CatalogKind, ChannelEpg, DeviceCatalog, DeviceMediaSource } from "@lc-play/contracts";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Film,
  Heart,
  KeyRound,
  Layers3,
  LifeBuoy,
  LayoutGrid,
  ListVideo,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  MonitorPlay,
  Play,
  Radio,
  RefreshCw,
  Settings,
  Tv,
  Wifi,
} from "lucide-react";
import { isAuthenticationFailure, request } from "./lib/device-api";
import { APP_VERSION } from "./lib/release";
import { SearchField } from "./components/SearchField";
import { SupportDocuments } from "./components/SupportDocuments";
import { VirtualPosterGrid } from "./components/VirtualPosterGrid";
import { CatalogProgress } from "./components/CatalogProgress";
import { canReuseCatalog, catalogExpiresAt, type CatalogProgress as Progress } from "./lib/catalog-progress";
import { ParentalControlProvider } from "./components/ParentalControl";
import { useParentalControl } from "./lib/parental-context";
import { isAdultGroup } from "./lib/parental";
import { getLgDeviceIdentity, handleLgPlatformBack } from "./lib/webos";
import { loadChannelEpg, nativeGuideSupported } from "./lib/channel-epg";
import { clearNativeCatalog, loadNativeCatalog, loadNativeEpisodes, nativeCatalogSupported } from "./lib/native-catalog";
import { useSpatialNavigation } from "./lib/spatial-navigation";
import { CHANNEL_ROW_HEIGHT, virtualChannelRange } from "./lib/virtual-range";
import { cleanGroupLabel, normalizeText, orderByGroup, orderGroups } from "./lib/catalog-order";
import "./App.css";

type Mode = "loading" | "activation" | "home";
type View = "HOME" | CatalogKind | "SETTINGS";
type Configuration = {
  device: { id: string; label: string; status: string; expiresAt: string | null };
  playlist: {
    id: string;
    name: string;
    type: string;
    status: string;
    itemCount: number;
    lastSyncAt: string | null;
  } | null;
  features: Record<string, boolean>;
};

type SeriesCollection = {
  id: string;
  title: string;
  group: string;
  logo: string | null;
  episodes: CatalogItem[];
  episodeCount: number;
};

const TOKEN_KEY = "lc_play_device_token";
const clockFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function App() {
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");
  const [mode, setMode] = useState<Mode>(() =>
    demo ? "home" : localStorage.getItem(TOKEN_KEY) ? "loading" : "activation",
  );
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [catalog, setCatalog] = useState<DeviceCatalog | null>(() => demo ? createDemoCatalog() : null);
  const [catalogLoading, setCatalogLoading] = useState(!demo);
  const [catalogProgress, setCatalogProgress] = useState<Progress | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const kindRef = useRef<CatalogKind>("LIVE");
  const loadedKindRef = useRef<CatalogKind | null>(null);
  const catalogRequestRef = useRef<AbortController | null>(null);
  const catalogCacheRef = useRef(new Map<CatalogKind, { catalog: DeviceCatalog; expiresAt: number }>());

  useSpatialNavigation(mode !== "loading");

  useEffect(() => {
    if (mode === "home") return;
    const handleBack = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.key === "Escape" || event.key === "Backspace" || event.keyCode === 461)) return;
      if (event.key === "Backspace" && document.activeElement instanceof HTMLInputElement) return;
      if (handleLgPlatformBack()) event.preventDefault();
    };
    window.addEventListener("keydown", handleBack);
    return () => window.removeEventListener("keydown", handleBack);
  }, [mode]);

  const clearDeviceSession = useCallback(() => {
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    catalogCacheRef.current.clear();
    clearNativeCatalog();
    loadedKindRef.current = null;
    kindRef.current = "LIVE";
    localStorage.removeItem(TOKEN_KEY);
    setConfiguration(null);
    setCatalog(null);
    setCatalogLoading(false);
    setCatalogProgress(null);
    setCatalogError("");
    setConnectionError("");
    setMode("activation");
  }, []);

  const loadCatalog = useCallback(async (kind = kindRef.current, options: { background?: boolean; force?: boolean } = {}) => {
    if (demo) {
      setCatalog(createDemoCatalog());
      setCatalogLoading(false);
      setCatalogError("");
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (options.background && catalogRequestRef.current) return;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setCatalogProgress(null);
    const cached = catalogCacheRef.current.get(kind);
    if (cached) {
      setCatalog(cached.catalog);
      loadedKindRef.current = kind;
    } else if (loadedKindRef.current !== kind) {
      setCatalog(null);
      loadedKindRef.current = null;
    }
    setCatalogError("");
    if (cached && cached.expiresAt > Date.now() && !options.force && !options.background) {
      setCatalogLoading(false);
      return;
    }
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    if (!options.background || !cached) {
      setCatalogLoading(true);
      setCatalogProgress({ stage: "source", kind });
    }
    try {
      if (options.background && cached?.catalog.nativeCatalogId && !options.force) {
        const source = await request<DeviceMediaSource>("v1/device/media/source", { signal: controller.signal }, token, undefined, 15_000);
        if (canReuseCatalog(cached, source)) return;
      }
      if (controller.signal.aborted) return;
      setCatalogLoading(true);
      setCatalogProgress({ stage: "source", kind });
      const nextCatalog = nativeCatalogSupported()
        ? await loadNativeCatalog(kind, token, controller.signal, options.force, (progress) => {
          if (catalogRequestRef.current === controller && !controller.signal.aborted) setCatalogProgress(progress);
        })
        : await request<DeviceCatalog>(`v1/device/catalog?kind=${kind}&compact=true`, { signal: controller.signal }, token, undefined, 115_000);
      if (!controller.signal.aborted) {
        for (const entry of catalogCacheRef.current.values()) {
          if (entry.catalog.source.id !== nextCatalog.source.id || entry.catalog.nativeCatalogId !== nextCatalog.nativeCatalogId) {
            catalogCacheRef.current.clear();
            break;
          }
        }
        catalogCacheRef.current.set(kind, { catalog: nextCatalog, expiresAt: catalogExpiresAt(nextCatalog) });
        loadedKindRef.current = kind;
        setCatalog(nextCatalog);
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (isAuthenticationFailure(caught)) clearDeviceSession();
        else setCatalogError(caught instanceof Error ? caught.message : "Não foi possível carregar o catálogo.");
      }
    } finally {
      if (catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setCatalogLoading(false);
        setCatalogProgress(null);
      }
    }
  }, [clearDeviceSession, demo]);

  const refreshAll = useCallback(async () => {
    if (demo) return loadCatalog();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setCatalogLoading(true);
    setCatalogProgress({ stage: "source", kind: kindRef.current });
    setCatalogError("");
    try {
      const nextConfiguration = await request<Configuration>("v1/device/configuration", undefined, token, undefined, 15_000);
      setConfiguration(nextConfiguration);
      setConnectionError("");
      const previousSource = catalogCacheRef.current.values().next().value?.catalog.source.id;
      catalogCacheRef.current.clear();
      if (previousSource && previousSource !== nextConfiguration.playlist?.id) {
        setCatalog(null);
        loadedKindRef.current = null;
      }
      if (nextConfiguration.playlist) {
        await loadCatalog(kindRef.current, { force: true });
      } else {
        catalogRequestRef.current?.abort();
        loadedKindRef.current = null;
        setCatalog(null);
        setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
      }
    } catch (caught) {
      if (isAuthenticationFailure(caught)) clearDeviceSession();
      else setCatalogError(caught instanceof Error ? caught.message : "Não foi possível atualizar o conteúdo.");
    } finally {
      if (!catalogRequestRef.current) { setCatalogLoading(false); setCatalogProgress(null); }
    }
  }, [clearDeviceSession, demo, loadCatalog]);

  const changeCatalogKind = useCallback((kind: CatalogKind) => {
    kindRef.current = kind;
    if (!demo && loadedKindRef.current !== kind) void loadCatalog(kind);
  }, [demo, loadCatalog]);

  useEffect(() => () => catalogRequestRef.current?.abort(), []);

  useEffect(() => {
    if (demo) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    request<Configuration>("v1/device/configuration", undefined, token, undefined, 15_000)
      .then((data) => {
        setConfiguration(data);
        setConnectionError("");
        if (!data.playlist) {
          setCatalogLoading(false);
          setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
        } else {
          void loadCatalog();
        }
        setMode("home");
      })
      .catch((caught: unknown) => {
        if (isAuthenticationFailure(caught)) {
          clearDeviceSession();
          return;
        }
        setCatalogLoading(false);
        setCatalogError(caught instanceof Error ? caught.message : "Não foi possível conectar ao serviço.");
        setMode("home");
      });
  }, [clearDeviceSession, demo, loadCatalog]);

  useEffect(() => {
    if (mode !== "home" || demo) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const heartbeat = () => {
      void request(
        "v1/device/heartbeat",
        { method: "POST", body: JSON.stringify({ appVersion: APP_VERSION }) },
        token,
        undefined,
        15_000,
      ).then(() => setConnectionError("")).catch((caught: unknown) => {
        if (isAuthenticationFailure(caught)) clearDeviceSession();
        else setConnectionError("Conexão temporariamente indisponível. O aparelho continuará ativado.");
      });
    };
    heartbeat();
    const heartbeatTimer = window.setInterval(heartbeat, 120_000);
    const catalogTimer = window.setInterval(() => {
      if (!document.hidden) void loadCatalog(kindRef.current, { background: true });
    }, 5 * 60_000);
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(catalogTimer);
    };
  }, [clearDeviceSession, demo, loadCatalog, mode]);

  if (mode === "loading") return <BootScreen />;
  if (mode === "activation") {
    return (
      <ActivationScreen
        onActivated={(data, token) => {
          catalogCacheRef.current.clear();
          loadedKindRef.current = null;
          localStorage.setItem(TOKEN_KEY, token);
          setConfiguration(data);
          if (!data.playlist) {
            setCatalogLoading(false);
            setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
          } else {
            void loadCatalog();
          }
          setMode("home");
        }}
        onDemo={import.meta.env.DEV ? () => {
          setCatalog(createDemoCatalog());
          setCatalogLoading(false);
          setMode("home");
        } : undefined}
      />
    );
  }

  return (
    <PlayerExperience
      configuration={configuration}
      catalog={catalog}
      loading={catalogLoading}
      progress={catalogProgress}
      error={catalogError || connectionError}
      demo={demo}
      onRefresh={refreshAll}
      onCatalogKind={changeCatalogKind}
      onDisconnect={clearDeviceSession}
    />
  );
}

function Brand() {
  return (
    <div className="tv-brand">
      <span className="tv-brand-mark"><span>LC</span><Play fill="currentColor" /></span>
      <span>LC <strong>PLAY</strong></span>
    </div>
  );
}

function BootScreen() {
  return (
    <main className="boot-screen">
      <Brand />
      <LoaderCircle className="spin" size={38} />
    </main>
  );
}

function ActivationScreen({
  onActivated,
  onDemo,
}: {
  onActivated: (configuration: Configuration, token: string) => void;
  onDemo?: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formattedCode = useMemo(() => {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
  }, [code]);

  async function activate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const identity = await getLgDeviceIdentity();
      const response = await request<{ deviceToken: string }>("v1/device/activate", {
        method: "POST",
        body: JSON.stringify({
          code: formattedCode,
          platform: "LG_WEBOS",
          platformDeviceId: identity.id,
          model: identity.model,
          osVersion: identity.osVersion,
          appVersion: APP_VERSION,
        }),
      }, undefined, undefined, 20_000);
      const nextConfiguration = await request<Configuration>(
        "v1/device/configuration",
        undefined,
        response.deviceToken,
        undefined,
        15_000,
      );
      onActivated(nextConfiguration, response.deviceToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na ativação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="activation-screen">
      <section className="activation-panel">
        <Brand />
        <div className="activation-copy">
          <span className="activation-kicker"><KeyRound size={21} />ATIVAÇÃO SEGURA</span>
          <h1>Ative esta TV</h1>
          <p>Informe a chave vinculada a este dispositivo.</p>
        </div>
        <form className="activation-form" onSubmit={activate}>
          <label htmlFor="activation-code">Chave do dispositivo</label>
          <input
            id="activation-code"
            data-focusable
            autoFocus
            autoComplete="off"
            inputMode="text"
            value={formattedCode}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={14}
          />
          {error ? <p className="tv-error" role="alert">{error}</p> : null}
          <button data-focusable type="submit" className="tv-primary" disabled={loading || formattedCode.length < 14}>
            {loading ? <LoaderCircle className="spin" /> : <Check />}
            {loading ? "Ativando" : "Ativar LC PLAY"}
          </button>
          {onDemo ? <button data-focusable type="button" className="tv-ghost" onClick={onDemo}>Abrir demonstração</button> : null}
        </form>
        <SupportDocuments compact />
        <footer>LC PLAY · Seu conteúdo. Sua tela.</footer>
      </section>
      <section className="activation-visual" aria-label="Entretenimento LC PLAY">
        <img width="1920" height="1080" src={`${import.meta.env.BASE_URL}assets/lc-play-home.png`} alt="Colagem de entretenimento com cidade, esporte, música e natureza" />
        <div className="activation-visual-caption">
          <span><MonitorPlay size={20} />LG webOS</span>
          <strong>Uma tela.<br />Tudo organizado.</strong>
        </div>
      </section>
    </main>
  );
}

function PlayerExperience(props: Parameters<typeof PlayerContent>[0]) {
  return <ParentalControlProvider key={`${props.configuration?.device.id}:${props.configuration?.playlist?.id}`}><PlayerContent {...props} /></ParentalControlProvider>;
}

function PlayerContent({
  configuration,
  catalog,
  loading,
  progress,
  error,
  demo,
  onRefresh,
  onCatalogKind,
  onDisconnect,
}: {
  configuration: Configuration | null;
  catalog: DeviceCatalog | null;
  loading: boolean;
  progress: Progress | null;
  error: string;
  demo: boolean;
  onRefresh: () => Promise<void>;
  onCatalogKind: (kind: CatalogKind) => void;
  onDisconnect: () => void;
}) {
  const [view, setView] = useState<View>("HOME");
  const [group, setGroup] = useState("Todos");
  const [playing, setPlaying] = useState<CatalogItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesCollection | null>(null);
  const parental = useParentalControl();
  const selectGroup = (next: string) => { if (isAdultGroup(next)) parental.authorize(() => setGroup(next)); else setGroup(next); };
  const playItem = (item: CatalogItem) => { if (isAdultGroup(item.group)) parental.authorize(() => setPlaying(item)); else setPlaying(item); };

  const openView = (nextView: View) => {
    if (nextView === "LIVE" || nextView === "MOVIE" || nextView === "SERIES") onCatalogKind(nextView);
    setGroup("Todos");
    setSelectedSeries(null);
    setView(nextView);
  };

  useEffect(() => {
    const onBack = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.key === "Escape" || event.key === "Backspace" || event.keyCode === 461)) return;
      if (event.key === "Backspace" && document.activeElement instanceof HTMLInputElement) return;
      if (playing) {
        event.preventDefault();
        setPlaying(null);
      } else if (selectedSeries) {
        event.preventDefault();
        setSelectedSeries(null);
      } else if (view !== "HOME") {
        event.preventDefault();
        setView("HOME");
      } else if (handleLgPlatformBack()) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onBack);
    return () => window.removeEventListener("keydown", onBack);
  }, [playing, selectedSeries, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (document.activeElement instanceof HTMLInputElement || document.querySelector("[aria-modal='true']")) return;
      const visible = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.offsetParent !== null);
      const target = playing
        ? document.querySelector<HTMLElement>(playing.kind === "LIVE" ? ".live-preview.is-fullscreen" : ".stream-player")
        : visible(".live-channel-row.selected .live-channel-pick") ??
          visible("[data-catalog-selected]") ??
          visible("[data-autofocus][data-focusable]");
      target?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [group, playing, selectedSeries, view]);

  return (
    <main className="tv-shell">
      <div className="tv-page">
      {view === "HOME" ? (
        <HomeScreen
          configuration={configuration}
          catalog={catalog}
          loading={loading}
          error={error}
          onOpen={openView}
          onRefresh={onRefresh}
        />
      ) : null}
      {view === "SETTINGS" ? (
        <SettingsScreen
          configuration={configuration}
          catalog={catalog}
          loading={loading}
          error={error}
          demo={demo}
          onBack={() => setView("HOME")}
          onRefresh={onRefresh}
          onDisconnect={onDisconnect}
        />
      ) : null}
      {view === "LIVE" ? (
        <LiveTvScreen
          catalog={catalog}
          loading={loading}
          error={error}
          demo={demo}
          fullscreenOpen={playing !== null}
          onOpen={openView}
          onPlay={playItem}
          onRefresh={onRefresh}
          onAuthenticationFailure={onDisconnect}
        />
      ) : null}
      {view === "MOVIE" ? (
        <CatalogScreen
          kind={view}
          catalog={catalog}
          loading={loading}
          error={error}
          group={group}
          onGroup={selectGroup}
          onBack={() => setView("HOME")}
          onPlay={playItem}
          onRefresh={onRefresh}
        />
      ) : null}
      {view === "SERIES" ? (
        <div className="series-browser" hidden={selectedSeries !== null}>
        <SeriesScreen
          catalog={catalog}
          loading={loading}
          error={error}
          group={group}
          onGroup={selectGroup}
          onBack={() => setView("HOME")}
          onSelect={(series) => { if (isAdultGroup(series.group)) parental.authorize(() => setSelectedSeries(series)); else setSelectedSeries(series); }}
          onRefresh={onRefresh}
        />
        </div>
      ) : null}
      {view === "SERIES" && selectedSeries ? (
        <SeriesDetails key={selectedSeries.id} series={selectedSeries} catalog={catalog} onAuthenticationFailure={onDisconnect} onBack={() => setSelectedSeries(null)} onPlay={playItem} />
      ) : null}
      {playing && playing.kind !== "LIVE" ? <StreamPlayer item={playing} /> : null}
      </div>
      {loading && !playing && progress ? <CatalogProgress progress={progress} /> : null}
    </main>
  );
}

function PlayerHeader({ sourceName, onBack }: { sourceName: string; onBack?: () => void }) {
  const time = useClock();
  return (
    <header className="player-header">
      <div className="player-header-start">
        {onBack ? <button data-focusable className="round-button" onClick={onBack} aria-label="Voltar"><ArrowLeft /></button> : null}
        <Brand />
      </div>
      <div className="player-status">
        <span className="source-state"><span />{sourceName}</span>
        <time>{time}</time>
      </div>
    </header>
  );
}

function HomeScreen({
  configuration,
  catalog,
  loading,
  error,
  onOpen,
  onRefresh,
}: {
  configuration: Configuration | null;
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  onOpen: (view: View) => void;
  onRefresh: () => Promise<void>;
}) {
  const sourceName = configuration?.playlist?.name ?? catalog?.source.name ?? "Sem fonte vinculada";
  const contentDisabled = !catalog && !loading;
  const tiles: Array<{
    view: CatalogKind;
    label: string;
    caption: string;
    count: number | undefined;
    className: string;
    icon: ReactNode;
  }> = [
    { view: "LIVE", label: "TV ao vivo", caption: "Canais e programação", count: catalog?.summary.live, className: "menu-live", icon: <Radio /> },
    { view: "MOVIE", label: "Filmes", caption: "Catálogo por categoria", count: catalog?.summary.movies, className: "menu-movies", icon: <Film /> },
    { view: "SERIES", label: "Séries", caption: "Temporadas e episódios", count: catalog?.summary.seriesTitles ?? catalog?.summary.series, className: "menu-series", icon: <Tv /> },
  ];

  return (
    <section className="home-screen">
      <PlayerHeader sourceName={sourceName} />
      <img className="home-backdrop" width="1920" height="1080" src={`${import.meta.env.BASE_URL}assets/lc-play-home.png`} alt="" />
      <div className="home-intro">
        <Brand />
        <h1>O que vamos assistir?</h1>
      </div>
      <div className="main-menu">
        {tiles.map((tile, index) => (
          <button
            key={tile.view}
            data-focusable
            data-autofocus={index === 0 ? "" : undefined}
            className={`menu-card ${tile.className}`}
            disabled={contentDisabled}
            onClick={() => onOpen(tile.view)}
          >
            <span className="menu-icon">{tile.icon}</span>
            <span className="menu-copy"><strong>{tile.label}</strong><small>{tile.caption}</small></span>
            <span className="menu-count">{loading && !catalog ? "..." : formatCount(tile.count ?? 0)}</span>
          </button>
        ))}
        <button data-focusable className="menu-card menu-refresh" onClick={() => void onRefresh()} disabled={loading}>
          <span className="menu-icon">{loading ? <LoaderCircle className="spin" /> : <RefreshCw />}</span>
          <span className="menu-copy"><strong>Atualizar</strong><small>Sincronizar conteúdo</small></span>
        </button>
        <button data-focusable className="menu-card menu-settings" onClick={() => onOpen("SETTINGS")}>
          <span className="menu-icon"><Settings /></span>
          <span className="menu-copy"><strong>Ajustes</strong><small>Dispositivo e fonte</small></span>
        </button>
      </div>
      <div className="home-footer">
        <span><Wifi />{catalog?.epg.mode === "CHANNEL" ? "EPG por canal" : catalog?.epg.status === "AVAILABLE" ? "EPG atualizado" : "EPG indisponível"}</span>
        <span>{error || (catalog ? `${formatCount(catalog.summary.total)} itens disponíveis` : loading ? "Carregando sua fonte..." : "Vincule uma fonte no painel")}</span>
      </div>
    </section>
  );
}

function LiveTvScreen({
  catalog,
  loading,
  error,
  demo,
  fullscreenOpen,
  onOpen,
  onPlay,
  onRefresh,
  onAuthenticationFailure,
}: {
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  demo: boolean;
  fullscreenOpen: boolean;
  onOpen: (view: View) => void;
  onPlay: (item: CatalogItem) => void;
  onRefresh: () => Promise<void>;
  onAuthenticationFailure: () => void;
}) {
  const time = useClock();
  const channels = useMemo(() => orderByGroup(catalog?.items.filter((item) => item.kind === "LIVE") ?? [], "LIVE", (item) => item.group), [catalog]);
  const parental = useParentalControl();
  const groups = useMemo(() => buildGroups(channels, "LIVE"), [channels]);
  const [group, setGroup] = useState("Todos");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("lc_play_favorite_channels") ?? "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    }
    catch { return []; }
  });
  const channelIndex = useMemo(() => channels.map((item) => ({ item, group: cleanGroupLabel(item.group), search: normalizeText(`${item.name} ${item.now?.title ?? ""}`) })), [channels]);
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of channelIndex) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    return counts;
  }, [channelIndex]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const favoriteFilter = favoritesOnly ? favoriteSet : null;
  const normalizedQuery = normalizeText(query);
  const filtered = useMemo(() => {
    const items = channelIndex.filter((entry) =>
      (parental.unlocked || !isAdultGroup(entry.item.group)) &&
      (group === "Todos" || entry.group === group) &&
      (!favoriteFilter || favoriteFilter.has(entry.item.id)) &&
      (!normalizedQuery || entry.search.includes(normalizedQuery)),
    ).map((entry) => entry.item);
    return items;
  }, [channelIndex, group, favoriteFilter, normalizedQuery, parental.unlocked]);
  const selected = channels.find((item) => item.id === selectedId && (parental.unlocked || !isAdultGroup(item.group))) ?? null;
  const [channelGuide, setChannelGuide] = useState<{ key: string; guide: ChannelEpg | null; loading: boolean } | null>(null);
  const guideKey = `${catalog?.source.id}:${selected?.id}`;
  const activeGuide = channelGuide?.key === guideKey ? channelGuide : null;
  const programme = {
    now: activeGuide?.guide?.now ?? selected?.now ?? null,
    next: activeGuide?.guide?.next ?? selected?.next ?? null,
  };

  useEffect(() => {
    if (demo || !selected || !catalog || !nativeGuideSupported()) return;
    const currentTime = Date.now();
    if (selected.now && selected.next && Date.parse(selected.now.endsAt) > currentTime && Date.parse(selected.next.endsAt) > currentTime) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setChannelGuide({ key: guideKey, guide: null, loading: true });
      void loadChannelEpg(catalog.source.id, selected, token, controller.signal, catalog.nativeCatalogId).then((guide) => {
        if (!controller.signal.aborted) setChannelGuide({ key: guideKey, guide, loading: false });
      }).catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setChannelGuide({ key: guideKey, guide: null, loading: false });
        if (isAuthenticationFailure(caught)) onAuthenticationFailure();
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [catalog, selected, guideKey, demo, time, onAuthenticationFailure]);

  const toggleFavorite = useCallback((id: string) => {
    const next = favoriteSet.has(id) ? favorites.filter((favorite) => favorite !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem("lc_play_favorite_channels", JSON.stringify(next)); } catch { /* Mantém favoritos na sessão quando o armazenamento está cheio. */ }
  }, [favorites, favoriteSet]);

  return (
    <section className="live-screen">
      <div className="live-main">
        <header className="live-topbar">
          <div className="live-topbar-start">
            <button data-focusable className="live-home" onClick={() => onOpen("HOME")} title="Início" aria-label="Início"><ArrowLeft /></button>
            <Brand />
          </div>
          <nav className="live-nav" aria-label="Seções do player">
            <button data-focusable className="active" aria-current="page" title="TV ao vivo" aria-label="TV ao vivo"><Radio /><span>TV ao vivo</span></button>
            <button data-focusable onClick={() => onOpen("MOVIE")} title="Filmes" aria-label="Filmes"><Film /><span>Filmes</span></button>
            <button data-focusable onClick={() => onOpen("SERIES")} title="Séries" aria-label="Séries"><Tv /><span>Séries</span></button>
          </nav>
          <div className="live-topbar-meta"><span title={catalog?.source.name}>{catalog?.source.name ?? "Sua fonte"}</span><time>{time}</time><button data-focusable className="live-home" onClick={() => onOpen("SETTINGS")} title="Configurações" aria-label="Configurações"><Settings /></button></div>
        </header>

        <div className="live-workspace">
          <aside className="live-categories" aria-label="Categorias de canais">
            <div className="live-column-heading"><span><LayoutGrid />Categorias</span><small>{groups.length - 1}</small></div>
            <div className="live-category-scroll">
              <button data-focusable className={group === "Todos" && !favoritesOnly ? "active" : ""} onClick={() => { setGroup("Todos"); setFavoritesOnly(false); }} aria-pressed={group === "Todos" && !favoritesOnly}><span>Todos os canais</span><small>{channels.length}</small></button>
              <button data-focusable className={favoritesOnly ? "active" : ""} onClick={() => { setGroup("Todos"); setFavoritesOnly(true); }} aria-pressed={favoritesOnly}><span><Heart />Favoritos</span><small>{channels.filter((item) => favoriteSet.has(item.id)).length}</small></button>
              {groups.filter((name) => name !== "Todos").map((name) => (
                <button key={name} data-focusable title={name} aria-pressed={group === name && !favoritesOnly} className={group === name && !favoritesOnly ? "active" : ""} onClick={() => { const select = () => { setGroup(name); setFavoritesOnly(false); }; if (isAdultGroup(name)) parental.authorize(select); else select(); }}>
                  <span>{isAdultGroup(name) && !parental.unlocked ? <LockKeyhole size={18} /> : null}{name}</span><small>{name === "Todos" ? channels.length : groupCounts.get(name) ?? 0}</small>
                </button>
              ))}
            </div>
          </aside>

          <section className="live-channel-column" aria-label="Canais">
            <div className="live-channel-tools">
              <SearchField className="live-search" value={query} onChange={setQuery} placeholder="Buscar canal" />
            </div>
            <VirtualChannelList items={filtered} selectedId={selected?.id ?? null} favorites={favoriteSet} onSelect={(id) => { if (id === selectedId && selected) onPlay(selected); else setSelectedId(id); }} onFavorite={toggleFavorite}>
              {loading && !catalog ? <p className="live-empty">Carregando canais...</p> : null}
              {!loading && !filtered.length ? <div className="live-empty"><p>{error || (favoritesOnly ? "Nenhum canal favorito nesta categoria." : "Nenhum canal encontrado.")}</p>{error ? <button data-focusable onClick={() => void onRefresh()}>Tentar novamente</button> : null}</div> : null}
            </VirtualChannelList>
            <footer className="live-channel-footer">{filtered.length} {filtered.length === 1 ? "canal" : "canais"} nesta seleção</footer>
          </section>

          <section className="live-feature" aria-label="Canal selecionado">
            <div
              className={`live-preview${fullscreenOpen ? " is-fullscreen" : ""}`}
              role={fullscreenOpen ? "dialog" : undefined}
              aria-modal={fullscreenOpen ? true : undefined}
              aria-label={fullscreenOpen ? selected?.name ?? "TV ao vivo" : undefined}
              tabIndex={-1}
            >
              {selected && !demo && selected.streamUrl ? <StreamVideo key={selected.id} item={selected} /> : <div className="live-preview-art"><img width="1920" height="1080" src={`${import.meta.env.BASE_URL}assets/lc-play-home.png`} alt="" /><p>{selected ? "Prévia de demonstração" : "Escolha um canal"}</p></div>}
              <span className="live-badge">AO VIVO</span>
            </div>
            <div className="live-selected-info"><span className="live-selected-icon"><Radio /></span><div><h1>{selected?.name ?? "Escolha um canal"}</h1><span>{selected ? cleanGroupLabel(selected.group) : "TV ao vivo"}</span></div></div>
            <div className="live-programme">
              <div className="live-programme-title"><span>PROGRAMAÇÃO</span><span>{activeGuide?.loading ? "Carregando EPG" : programme.now || programme.next ? "EPG disponível" : "Sem EPG"}</span></div>
              {selected ? <>
                <div className="live-now"><span>AGORA</span><div><small>{programme.now ? `${formatTime(programme.now.startsAt)} – ${formatTime(programme.now.endsAt)}` : "Horário não informado"}</small><h2>{programme.now?.title ?? "Programação não informada"}</h2><p>{programme.now?.description ?? "Escolha o canal para assistir à transmissão ao vivo."}</p></div></div>
                <div className="live-progress"><span style={{ width: `${programmeProgress(programme.now)}%` }} /></div>
                <div className="live-next"><span>A SEGUIR</span><strong>{programme.next ? `${formatTime(programme.next.startsAt)} · ${programme.next.title}` : "Sem informação"}</strong></div>
              </> : <p className="live-programme-empty">Selecione um canal para ver a programação.</p>}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

const VirtualChannelList = memo(function VirtualChannelList({ items, selectedId, favorites, onSelect, onFavorite, children }: {
  items: CatalogItem[];
  selectedId: string | null;
  favorites: Set<string>;
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 520 });
  const range = virtualChannelRange(items.length, viewport.scrollTop, viewport.height);

  const measure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const element = scrollRef.current;
      if (!element) return;
      setViewport((current) => current.scrollTop === element.scrollTop && current.height === element.clientHeight
        ? current : { scrollTop: element.scrollTop, height: element.clientHeight });
    });
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setViewport({ scrollTop: 0, height: element.clientHeight });
    if (items.length && document.activeElement === document.body) element.querySelector<HTMLElement>(".live-channel-pick")?.focus();
  }, [items]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [measure]);

  return <div ref={scrollRef} className="live-channel-scroll" onScroll={measure}>
    <div role="list" aria-label="Lista de canais" style={{ paddingTop: range.top, paddingBottom: range.bottom }}>
      {items.slice(range.start, range.end).map((item, index) => {
        const position = range.start + index;
        const favorite = favorites.has(item.id);
        return <div role="listitem" aria-posinset={position + 1} aria-setsize={items.length} className={`live-channel-row ${selectedId === item.id ? "selected" : ""}`} key={item.id} style={{ height: CHANNEL_ROW_HEIGHT }}>
          <button data-focusable data-autofocus={position === 0 ? "" : undefined} className="live-channel-pick" onClick={() => onSelect(item.id)}>
            <span className="live-channel-number">{position + 1}</span>
            <span className="live-channel-logo"><span>{item.name.slice(0, 2).toUpperCase()}</span>{item.logo ? <img width="50" height="50" src={item.logo} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>
            <span className="live-channel-label"><strong>{item.name}</strong><small>{item.now?.title ?? cleanGroupLabel(item.group)}</small></span>
          </button>
          <button data-focusable className={`live-favorite ${favorite ? "is-favorite" : ""}`} onClick={() => onFavorite(item.id)} aria-label={`${favorite ? "Remover" : "Adicionar"} ${item.name} ${favorite ? "dos" : "aos"} favoritos`}><Heart fill={favorite ? "currentColor" : "none"} /></button>
        </div>;
      })}
    </div>
    {children}
  </div>;
});


function countGroups(labels: string[]) {
  const counts = new Map<string, number>([["Todos", labels.length]]);
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
}

function CatalogSidebar({ groups, counts, group, query, placeholder, onQuery, onGroup }: {
  groups: string[];
  counts: Map<string, number>;
  group: string;
  query: string;
  placeholder: string;
  onQuery: (value: string) => void;
  onGroup: (value: string) => void;
}) {
  const parental = useParentalControl();
  return (
    <aside className="vod-sidebar">
      <SearchField className="catalog-search" value={query} onChange={onQuery} placeholder={placeholder} />
      <nav className="vod-categories" aria-label="Categorias">
        {groups.map((name) => (
          <button key={name} data-focusable data-autofocus={name === group ? "" : undefined} className={name === group ? "active" : ""} onClick={() => onGroup(name)} title={name}>
            <span>{isAdultGroup(name) && !parental.unlocked ? <LockKeyhole size={18} /> : null}{name}</span><small>{formatCount(counts.get(name) ?? 0)}</small>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function CatalogScreen({
  kind,
  catalog,
  loading,
  error,
  group,
  onGroup,
  onBack,
  onPlay,
  onRefresh,
}: {
  kind: "LIVE" | "MOVIE";
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  group: string;
  onGroup: (group: string) => void;
  onBack: () => void;
  onPlay: (item: CatalogItem) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"GRID" | "GUIDE">("GRID");
  const parental = useParentalControl();
  const allItems = useMemo(() => orderByGroup(catalog?.items.filter((item) => item.kind === kind) ?? [], kind, (item) => item.group), [catalog, kind]);
  const groups = useMemo(() => buildGroups(allItems, kind), [allItems, kind]);
  const normalizedQuery = normalizeText(query);
  const filtered = allItems.filter((item) => {
    const inGroup = group === "Todos" || cleanGroupLabel(item.group) === group;
    const matchesQuery = !normalizedQuery || normalizeText(`${item.name} ${item.now?.title ?? ""}`).includes(normalizedQuery);
    return inGroup && matchesQuery && (parental.unlocked || !isAdultGroup(item.group));
  });
  const posters = useMemo(() => filtered.map((item) => ({ ...item, title: item.name })), [filtered]);
  const labels = {
    LIVE: { title: "TV ao vivo", subtitle: "Canais e programação" },
    MOVIE: { title: "Filmes", subtitle: "Escolha uma categoria" },
  } as const;

  return (
    <section className="catalog-screen vod-screen">
      <PlayerHeader sourceName={catalog?.source.name ?? "LC PLAY"} onBack={onBack} />
      <div className="vod-workspace">
        <CatalogSidebar
          groups={groups}
          counts={countGroups(allItems.map((item) => cleanGroupLabel(item.group)))}
          group={group}
          query={query}
          placeholder={kind === "LIVE" ? "Buscar canal" : "Buscar filme"}
          onQuery={setQuery}
          onGroup={onGroup}
        />
        <div className="vod-content">
      <div className="catalog-heading">
        <div><h1>{group === "Todos" ? labels[kind].title : group}</h1><p>{labels[kind].subtitle}</p></div>
        <span>{formatCount(filtered.length)} {kind === "MOVIE" ? "filmes" : "canais"}</span>
      </div>
          {kind === "LIVE" ? (
            <div className="layout-switch" aria-label="Visualização">
              <button data-focusable className={layout === "GRID" ? "active" : ""} onClick={() => setLayout("GRID")}><LayoutGrid />Canais</button>
              <button data-focusable className={layout === "GUIDE" ? "active" : ""} onClick={() => setLayout("GUIDE")}><ListVideo />Grade EPG</button>
            </div>
          ) : null}

      {loading && !catalog ? <CatalogMessage icon={<LoaderCircle className="spin" />} title="Carregando conteúdo" /> : null}
      {!loading && error && !catalog ? (
        <CatalogMessage
          icon={<RefreshCw />}
          title={error}
          action={<button data-focusable className="tv-primary" onClick={() => void onRefresh()}>Tentar novamente</button>}
        />
      ) : null}
      {!loading && catalog && !filtered.length ? <CatalogMessage icon={<Layers3 />} title="Nenhum item nesta categoria" /> : null}
      {filtered.length && (kind !== "LIVE" || layout === "GRID") ? (
        <VirtualPosterGrid key={`${catalog?.source.id}:${group}:${query}`} items={posters} onSelect={onPlay} />
      ) : null}
      {filtered.length && kind === "LIVE" && layout === "GUIDE" ? <LiveGuide items={filtered} onPlay={onPlay} /> : null}
        </div>
      </div>
    </section>
  );
}

function LiveGuide({ items, onPlay }: { items: CatalogItem[]; onPlay: (item: CatalogItem) => void }) {
  return (
    <div className="epg-guide">
      <div className="epg-guide-head"><span>Canal</span><span>Agora</span><span>A seguir</span></div>
      {items.map((item, index) => (
        <button key={item.id} data-focusable data-autofocus={index === 0 ? "" : undefined} onClick={() => onPlay(item)}>
          <span className="guide-channel">
            <span className="guide-logo">
              <span>{item.name.slice(0, 2).toUpperCase()}</span>
              {item.logo ? <img width="58" height="58" src={item.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            </span>
            <strong>{item.name}</strong>
          </span>
          <span className="guide-program">
            <small>{item.now ? `${formatTime(item.now.startsAt)} - ${formatTime(item.now.endsAt)}` : "Agora"}</small>
            <strong>{item.now?.title ?? "Programação não informada"}</strong>
            <span className="guide-progress"><span style={{ width: `${programmeProgress(item.now)}%` }} /></span>
          </span>
          <span className="guide-program">
            <small>{item.next ? formatTime(item.next.startsAt) : "A seguir"}</small>
            <strong>{item.next?.title ?? "Sem informação"}</strong>
          </span>
          <Play fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function SeriesScreen({
  catalog,
  loading,
  error,
  group,
  onGroup,
  onBack,
  onSelect,
  onRefresh,
}: {
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  group: string;
  onGroup: (group: string) => void;
  onBack: () => void;
  onSelect: (series: SeriesCollection) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const parental = useParentalControl();
  const collections = useMemo(() => catalog?.seriesCollections
    ? orderByGroup(catalog.seriesCollections.map((series) => ({ ...series, group: cleanGroupLabel(series.group), episodes: [] })), "SERIES", (series) => series.group)
    : buildSeriesCollections(catalog?.items ?? []), [catalog]);
  const groups = useMemo(
    () => ["Todos", ...orderGroups("SERIES", collections.map((series) => series.group))],
    [collections],
  );
  const normalizedQuery = normalizeText(query);
  const filtered = collections.filter((series) => (
    (parental.unlocked || !isAdultGroup(series.group)) &&
    (group === "Todos" || series.group === group) &&
    (!normalizedQuery || normalizeText(series.title).includes(normalizedQuery))
  ));

  return (
    <section className="catalog-screen vod-screen">
      <PlayerHeader sourceName={catalog?.source.name ?? "LC PLAY"} onBack={onBack} />
      <div className="vod-workspace">
        <CatalogSidebar
          groups={groups}
          counts={countGroups(collections.map((series) => series.group))}
          group={group}
          query={query}
          placeholder={"Buscar série"}
          onQuery={setQuery}
          onGroup={onGroup}
        />
        <div className="vod-content">
      <div className="catalog-heading">
        <div><h1>{group === "Todos" ? "Séries" : group}</h1></div>
        <span>{formatCount(filtered.length)} séries</span>
      </div>

      {loading && !catalog ? <CatalogMessage icon={<LoaderCircle className="spin" />} title="Carregando conteúdo" /> : null}
      {!loading && error && !catalog ? (
        <CatalogMessage icon={<RefreshCw />} title={error} action={<button data-focusable className="tv-primary" onClick={() => void onRefresh()}>Tentar novamente</button>} />
      ) : null}
      {!loading && catalog && !filtered.length ? <CatalogMessage icon={<Layers3 />} title="Nenhuma série nesta categoria" /> : null}
      {filtered.length ? <VirtualPosterGrid key={`${catalog?.source.id}:${group}:${query}`} items={filtered} onSelect={onSelect} /> : null}
        </div>
      </div>
    </section>
  );
}

function SeriesDetails({
  series,
  catalog,
  onAuthenticationFailure,
  onBack,
  onPlay,
}: {
  series: SeriesCollection;
  catalog: DeviceCatalog | null;
  onAuthenticationFailure: () => void;
  onBack: () => void;
  onPlay: (item: CatalogItem) => void;
}) {
  const [allEpisodes, setAllEpisodes] = useState(series.episodes);
  const [loading, setLoading] = useState(!series.episodes.length);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [episodeProgress, setEpisodeProgress] = useState<Progress>({ stage: "episodes", completed: 0, total: series.episodeCount });
  const [season, setSeason] = useState(series.episodes[0]?.series?.season ?? 0);
  useEffect(() => {
    if (series.episodes.length) return;
    const controller = new AbortController();
    const token = localStorage.getItem(TOKEN_KEY) ?? "";
    const operation = catalog?.nativeCatalogId && catalog.nativeRevision
      ? loadNativeEpisodes(catalog.nativeCatalogId, catalog.nativeRevision, catalog.source.id, series.id, token, controller.signal, setEpisodeProgress, series.episodeCount)
      : request<CatalogItem[]>(`v1/device/catalog/series/${encodeURIComponent(series.id)}`, { signal: controller.signal }, token, undefined, 115_000);
    void operation
      .then((items) => { if (!controller.signal.aborted) { setAllEpisodes(items); setSeason(items[0]?.series?.season ?? 0); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) { if (isAuthenticationFailure(caught)) onAuthenticationFailure(); else setError(caught instanceof Error ? caught.message : "Não foi possível carregar os episódios."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [series, attempt, catalog, onAuthenticationFailure]);
  const seasons = useMemo(
    () => Array.from(new Set(allEpisodes.map((item) => item.series?.season ?? 0))).sort((a, b) => a - b),
    [allEpisodes],
  );
  useEffect(() => {
    if (loading) return;
    const target = document.querySelector<HTMLElement>(".series-details [data-autofocus]") ?? document.querySelector<HTMLElement>(".series-details [data-focusable]");
    target?.focus();
  }, [loading, error]);
  const episodes = allEpisodes
    .filter((item) => (item.series?.season ?? 0) === season)
    .sort((a, b) => (a.series?.episode ?? 0) - (b.series?.episode ?? 0) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <section className="catalog-screen series-details">
      <PlayerHeader sourceName="Séries" onBack={onBack} />
      <div className="series-summary">
        <span className="series-poster">
          <span>{series.title.slice(0, 2).toUpperCase()}</span>
          {series.logo ? <img width="400" height="600" src={series.logo} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        </span>
        <div>
          <span>{series.group}</span>
          <h1>{series.title}</h1>
          <p>{formatCount(series.episodeCount)} episódios{seasons.length ? ` · ${seasons.length} ${seasons.length === 1 ? "temporada" : "temporadas"}` : ""}</p>
        </div>
      </div>
      {loading ? <CatalogProgress progress={episodeProgress} /> : null}
      {!loading && error ? <CatalogMessage icon={<RefreshCw />} title={error} action={<button data-focusable className="tv-primary" onClick={() => { setLoading(true); setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button>} /> : null}
      {!loading && !error && !allEpisodes.length ? <CatalogMessage icon={<Layers3 />} title="Nenhum episódio disponível" /> : null}
      <nav className="group-tabs season-tabs" aria-label="Temporadas">
        {seasons.map((seasonNumber, index) => (
          <button
            key={seasonNumber}
            data-focusable
            data-autofocus={index === 0 ? "" : undefined}
            className={seasonNumber === season ? "active" : ""}
            onClick={() => setSeason(seasonNumber)}
          >
            {seasonNumber ? `Temporada ${seasonNumber}` : "Episódios"}
          </button>
        ))}
      </nav>
      <div className="episode-grid">
        {episodes.map((item, index) => (
          <button key={item.id} data-focusable data-autofocus={index === 0 ? "" : undefined} onClick={() => onPlay(item)}>
            <span className="episode-play"><Play fill="currentColor" /></span>
            <span>
              <small>{item.series ? `T${item.series.season} · E${item.series.episode}` : "Episódio"}</small>
              <strong>{item.series ? `Episódio ${item.series.episode}` : item.name}</strong>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>
    </section>
  );
}

function buildSeriesCollections(items: CatalogItem[]): SeriesCollection[] {
  const collections = new Map<string, SeriesCollection>();
  for (const item of items) {
    if (item.kind !== "SERIES") continue;
    const title = item.series?.title ?? item.name;
    const group = cleanGroupLabel(item.group);
    const key = normalizeText(`${group}:${title}`);
    const current = collections.get(key);
    if (current) {
      current.episodes.push(item);
      current.episodeCount += 1;
      if (!current.logo && item.logo) current.logo = item.logo;
    } else {
      collections.set(key, { id: item.id, title, group, logo: item.logo, episodes: [item], episodeCount: 1 });
    }
  }
  return orderByGroup(Array.from(collections.values()), "SERIES", (series) => series.group);
}

function buildGroups(items: CatalogItem[], kind: CatalogKind) {
  return ["Todos", ...orderGroups(kind, items.map((item) => item.group))];
}

function SettingsScreen({
  configuration,
  catalog,
  loading,
  error,
  demo,
  onBack,
  onRefresh,
  onDisconnect,
}: {
  configuration: Configuration | null;
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  demo: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const [section, setSection] = useState<"ACCOUNT" | "DEVICE" | "PARENTAL" | "SUPPORT">("ACCOUNT");
  const parental = useParentalControl();
  return (
    <section className="settings-screen">
      <PlayerHeader sourceName={configuration?.playlist?.name ?? "LC PLAY"} onBack={onBack} />
      <div className="settings-heading"><h1>Configurações</h1></div>
      <div className="settings-workspace">
        <nav className="settings-nav" aria-label="Configurações">
          <button data-focusable data-autofocus className={section === "ACCOUNT" ? "active" : ""} onClick={() => setSection("ACCOUNT")}><Radio />Conta e conteúdo</button>
          <button data-focusable className={section === "DEVICE" ? "active" : ""} onClick={() => setSection("DEVICE")}><MonitorPlay />Dispositivo</button>
          <button data-focusable className={section === "PARENTAL" ? "active" : ""} onClick={() => setSection("PARENTAL")}><LockKeyhole />Controle parental</button>
          <button data-focusable className={section === "SUPPORT" ? "active" : ""} onClick={() => setSection("SUPPORT")}><LifeBuoy />Suporte e documentos</button>
          <button data-focusable onClick={() => void onRefresh()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <RefreshCw />}Atualizar conteúdo</button>
          {!demo ? <button data-focusable className="danger-button" onClick={onDisconnect}><LogOut />Desconectar aparelho</button> : null}
        </nav>
        <div className="settings-information">
          <h2>{section === "SUPPORT" ? "Suporte LC PLAY" : section === "PARENTAL" ? "Controle parental" : section === "ACCOUNT" ? "Informações da conta" : "Informações do dispositivo"}</h2>
          {section === "SUPPORT" ? <SupportDocuments /> : section === "PARENTAL" ? <div className="parental-settings">
            <p>Conteúdo adulto: {parental.unlocked ? "liberado nesta sessão" : "bloqueado"}</p>
            <button data-focusable className="tv-primary" onClick={parental.changePin}><KeyRound />Alterar PIN</button>
            <button data-focusable className="tv-ghost" disabled={!parental.unlocked} onClick={parental.lock}><LockKeyhole />Bloquear agora</button>
          </div> : <>
          <dl>
            {section === "ACCOUNT" ? <>
              <div><dt>Status</dt><dd>{demo ? "Demonstração" : configuration?.device.status === "ACTIVE" ? "Ativo" : "Inativo"}</dd></div>
              <div><dt>Fonte</dt><dd>{configuration?.playlist?.name ?? catalog?.source.name ?? "Não vinculada"}</dd></div>
              <div><dt><CalendarDays />Validade</dt><dd>{formatDate(configuration?.device.expiresAt ?? null)}</dd></div>
              <div><dt>Conteúdos</dt><dd>{formatCount(catalog?.summary.total ?? 0)}</dd></div>
              <div><dt><Clock3 />EPG</dt><dd>{catalog?.epg.mode === "CHANNEL" ? "Consulta por canal" : catalog?.epg.status === "AVAILABLE" ? `${formatCount(catalog.epg.programmes)} programas` : "Indisponível"}</dd></div>
            </> : <>
              <div><dt>Dispositivo</dt><dd>{configuration?.device.label ?? "Modo demonstração"}</dd></div>
              <div><dt>ID do dispositivo</dt><dd>{configuration?.device.id ?? "Prévia local"}</dd></div>
              <div><dt>Aplicativo</dt><dd>LC PLAY</dd></div>
              <div><dt>Versão</dt><dd>{APP_VERSION}</dd></div>
            </>}
          </dl>
          </>}
          {error ? <p className="settings-error" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function CatalogMessage({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return <div className="catalog-message"><span>{icon}</span><h2>{title}</h2>{action}</div>;
}

function StreamVideo({ item, controls = false }: { item: CatalogItem; controls?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Carregando transmissão...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let destroyHls: (() => void) | undefined;
    let stopLoading: (() => void) | undefined;
    let recoverNetwork: (() => void) | undefined;
    let recoverMedia: (() => void) | undefined;
    let retryTimer: number | undefined;
    let retries = 0;
    let mediaRetries = 0;
    let lastTime = 0;
    let lastProgress = Date.now();
    let receivedVideo = false;
    let started = false;
    let terminal = false;
    setFailed(false);
    setStatus("Carregando transmissão...");

    const fail = (message: string) => {
      if (disposed || terminal) return;
      terminal = true;
      stopLoading?.();
      video.pause();
      setFailed(true);
      setStatus(message);
    };
    const reconnect = () => {
      if (disposed || terminal || retryTimer !== undefined) return;
      if (retries >= 2) return fail("A transmissão continua sem responder. Tente novamente ou escolha outra versão do canal.");
      retries += 1;
      setStatus("Reconectando transmissão...");
      lastProgress = Date.now();
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (disposed || terminal) return;
        if (recoverNetwork) recoverNetwork();
        else { video.load(); void video.play().catch(() => undefined); }
      }, 1000);
    };
    const handleVideoError = () => {
      if (video.error?.code === 4) fail("Formato de vídeo não suportado neste aparelho. Tente a versão HD ou SD.");
      else if (video.error?.code === 3 && recoverMedia && mediaRetries < 1) {
        mediaRetries += 1;
        lastProgress = Date.now();
        setStatus("Recuperando reprodução...");
        recoverMedia();
      } else if (video.error?.code === 2) reconnect();
      else fail("Não foi possível decodificar este vídeo. Tente a versão HD ou SD.");
    };
    const handleProgress = () => {
      if (terminal) return;
      if (video.currentTime > lastTime + 0.05) {
        started = true;
        lastTime = video.currentTime;
        lastProgress = Date.now();
        if (video.videoWidth > 0) {
          receivedVideo = true;
          setStatus("");
        }
      }
    };
    const handleWaiting = () => { if (!terminal) setStatus("Aguardando dados da transmissão..."); };
    video.addEventListener("error", handleVideoError);
    video.addEventListener("timeupdate", handleProgress);
    video.addEventListener("waiting", handleWaiting);
    // Event-driven updates avoid rendering the channel list on every video tick.
    const watchdog = window.setInterval(() => {
      if (disposed || terminal || document.hidden || video.ended) return;
      if (!receivedVideo && video.readyState >= 2 && video.currentTime > 6 && video.videoWidth === 0 && !/r[aá]dio/i.test(item.name)) {
        fail("A fonte enviou áudio, mas o vídeo não é compatível neste aparelho. Tente a versão HD ou SD.");
      } else if ((!video.paused || !started) && Date.now() - lastProgress > 25_000) reconnect();
    }, 2000);

    async function start() {
      if (!video) return;
      const isHls = /\.m3u8(?:\?|$)/i.test(item.streamUrl);
      if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = item.streamUrl;
        await video.play().catch(() => undefined);
        return;
      }
      const { default: Hls } = await import("hls.js");
      if (disposed) return;
      if (!Hls.isSupported()) {
        fail("Este formato de transmissão não é compatível com o aparelho.");
        return;
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        maxBufferSize: 12 * 1024 * 1024,
        backBufferLength: 0,
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
      });
      destroyHls = () => hls.destroy();
      stopLoading = () => hls.stopLoad();
      recoverNetwork = () => { hls.startLoad(-1); void video.play().catch(() => undefined); };
      recoverMedia = () => hls.recoverMediaError();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (import.meta.env.DEV) console.warn("[LC PLAY] reprodução", { type: data.type, details: data.details, fatal: data.fatal, status: data.response?.code });
        if (!data.fatal || disposed || terminal) return;
        if (data.response?.code === 401 || data.response?.code === 403) {
          fail("A fonte recusou o acesso ao canal. Confira a conta e o limite de conexões da lista.");
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) reconnect();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
          mediaRetries += 1;
          lastProgress = Date.now();
          setStatus("Recuperando reprodução...");
          hls.recoverMediaError();
        } else fail("Não foi possível decodificar este vídeo. Tente a versão HD ou SD.");
      });
      hls.loadSource(item.streamUrl);
      hls.attachMedia(video);
      await video.play().catch(() => undefined);
    }

    void start().catch(() => fail("Não foi possível iniciar a transmissão. Tente novamente."));
    return () => {
      disposed = true;
      video.removeEventListener("error", handleVideoError);
      video.removeEventListener("timeupdate", handleProgress);
      video.removeEventListener("waiting", handleWaiting);
      window.clearInterval(watchdog);
      window.clearTimeout(retryTimer);
      destroyHls?.();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [item.streamUrl, item.name, attempt]);

  return <>
    <video ref={videoRef} autoPlay controls={controls} muted={false} playsInline />
    {status ? <div className={`stream-status ${failed ? "is-error" : ""}`} role="status"><p>{status}</p>{failed ? <button data-focusable onClick={() => setAttempt((current) => current + 1)}>Tentar novamente</button> : null}</div> : null}
  </>;
}

function StreamPlayer({ item }: { item: CatalogItem }) {
  return (
    <section className="stream-player" role="dialog" aria-modal="true" aria-label={item.name} tabIndex={-1}>
      {item.streamUrl ? <StreamVideo item={item} controls={item.kind !== "LIVE"} /> : <div className="stream-demo"><Brand /><p>Prévia visual da demonstração</p></div>}
    </section>
  );
}

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return clockFormatter.format(time);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sem validade";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function formatTime(value: string) {
  return clockFormatter.format(new Date(value));
}

function programmeProgress(programme: CatalogItem["now"]) {
  if (!programme) return 0;
  const start = new Date(programme.startsAt).getTime();
  const end = new Date(programme.endsAt).getTime();
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

function createDemoCatalog(): DeviceCatalog {
  const entries: Array<[string, CatalogKind, string, string]> = [
    ["Arena Sports", "LIVE", "Esportes", "Esporte ao vivo"],
    ["Jornal LC", "LIVE", "Notícias", "Notícias desta hora"],
    ["Cidade News", "LIVE", "Notícias", "Cidade em pauta"],
    ["Campo & Jogo", "LIVE", "Esportes", "Resumo da rodada"],
    ["Cinema LC", "LIVE", "Filmes", "Sessão da tarde"],
    ["Mundo Kids", "LIVE", "Infantil", "A turma do quintal"],
    ["Vida Natural", "LIVE", "Documentários", "Planeta vivo"],
    ["Som Brasil", "LIVE", "Música", "Palco brasileiro"],
    ["Cozinha+", "LIVE", "Variedades", "Sabores de casa"],
    ["Viagem 360", "LIVE", "Documentários", "Lugares do mundo"],
    ["Cinema Brasil", "MOVIE", "Filmes", ""],
    ["Aventura+", "MOVIE", "Filmes", ""],
    ["Horizonte", "SERIES", "Séries", ""],
    ["Cidade 24h", "SERIES", "Séries", ""],
  ];
  const items: CatalogItem[] = entries.map(([name, kind, group, programme]) => ({
    id: `demo-${normalizeText(name).replace(/[^a-z0-9]+/g, "-")}`,
    name,
    kind: kind as CatalogKind,
    group,
    logo: null,
    streamUrl: "",
    tvgId: null,
    series: kind === "SERIES" ? { title: name, season: 1, episode: 1 } : null,
    now: kind === "LIVE" ? {
      title: programme,
      description: "Programação ilustrativa para conferir o layout do LC PLAY.",
      category: group,
      startsAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 40 * 60_000).toISOString(),
    } : null,
    next: kind === "LIVE" ? {
      title: "Próxima atração",
      description: null,
      category: group,
      startsAt: new Date(Date.now() + 40 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 100 * 60_000).toISOString(),
    } : null,
  }));
  return {
    source: { id: "demo", name: "Demonstração LC PLAY", type: "M3U" },
    summary: { total: items.length, live: 10, movies: 2, series: 2 },
    groups: Array.from(new Set(entries.map((entry) => entry[2]))).map((name) => ({ name, count: entries.filter((entry) => entry[2] === name).length })),
    items,
    truncated: false,
    refreshedAt: new Date().toISOString(),
    epg: { status: "AVAILABLE", programmes: 20 },
  };
}

export default App;
