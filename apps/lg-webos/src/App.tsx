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
import type { CatalogItem, CatalogKind, DeviceCatalog } from "@lc-play/contracts";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  Heart,
  KeyRound,
  Layers3,
  LayoutGrid,
  ListVideo,
  LoaderCircle,
  LogOut,
  MonitorPlay,
  Maximize2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import { getLgDeviceIdentity } from "./lib/webos";
import { useSpatialNavigation } from "./lib/spatial-navigation";
import { CHANNEL_ROW_HEIGHT, virtualChannelRange } from "./lib/virtual-range";
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
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4100";
const TOKEN_KEY = "lc_play_device_token";
const PAGE_SIZE = 24;
const clockFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}/api/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir a operação.");
  return data as T;
}

function App() {
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");
  const [mode, setMode] = useState<Mode>(() =>
    demo ? "home" : localStorage.getItem(TOKEN_KEY) ? "loading" : "activation",
  );
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [catalog, setCatalog] = useState<DeviceCatalog | null>(() => demo ? createDemoCatalog() : null);
  const [catalogLoading, setCatalogLoading] = useState(!demo);
  const [catalogError, setCatalogError] = useState("");
  const kindRef = useRef<CatalogKind>("LIVE");
  const loadedKindRef = useRef<CatalogKind | null>(null);
  const catalogRequestRef = useRef<AbortController | null>(null);

  useSpatialNavigation(mode !== "loading");

  const loadCatalog = useCallback(async (kind = kindRef.current, background = false) => {
    if (demo) {
      setCatalog(createDemoCatalog());
      setCatalogLoading(false);
      setCatalogError("");
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (background && catalogRequestRef.current) return;
    catalogRequestRef.current?.abort();
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    if (loadedKindRef.current !== kind) {
      setCatalog(null);
      loadedKindRef.current = null;
    }
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const nextCatalog = await request<DeviceCatalog>(`v1/device/catalog?kind=${kind}`, { signal: controller.signal }, token);
      if (!controller.signal.aborted) {
        loadedKindRef.current = kind;
        setCatalog(nextCatalog);
      }
    } catch (caught) {
      if (!controller.signal.aborted) setCatalogError(caught instanceof Error ? caught.message : "Não foi possível carregar o catálogo.");
    } finally {
      if (catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setCatalogLoading(false);
      }
    }
  }, [demo]);

  const refreshAll = useCallback(async () => {
    if (demo) return loadCatalog();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const nextConfiguration = await request<Configuration>("v1/device/configuration", undefined, token);
      setConfiguration(nextConfiguration);
      if (nextConfiguration.playlist) {
        await loadCatalog();
      } else {
        catalogRequestRef.current?.abort();
        loadedKindRef.current = null;
        setCatalog(null);
        setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
      }
    } catch (caught) {
      setCatalogError(caught instanceof Error ? caught.message : "Não foi possível atualizar o conteúdo.");
    } finally {
      if (!catalogRequestRef.current) setCatalogLoading(false);
    }
  }, [demo, loadCatalog]);

  const changeCatalogKind = useCallback((kind: CatalogKind) => {
    kindRef.current = kind;
    if (!demo && loadedKindRef.current !== kind) void loadCatalog(kind);
  }, [demo, loadCatalog]);

  useEffect(() => () => catalogRequestRef.current?.abort(), []);

  useEffect(() => {
    if (demo) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    request<Configuration>("v1/device/configuration", undefined, token)
      .then((data) => {
        setConfiguration(data);
        if (!data.playlist) {
          setCatalogLoading(false);
          setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
        } else {
          void loadCatalog();
        }
        setMode("home");
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setMode("activation");
      });
  }, [demo, loadCatalog]);

  useEffect(() => {
    if (mode !== "home" || demo) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const heartbeat = () => {
      void request(
        "v1/device/heartbeat",
        { method: "POST", body: JSON.stringify({ appVersion: "0.1.0" }) },
        token,
      );
    };
    heartbeat();
    const heartbeatTimer = window.setInterval(heartbeat, 120_000);
    const catalogTimer = window.setInterval(() => {
      if (!document.hidden) void loadCatalog(kindRef.current, true);
    }, 5 * 60_000);
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(catalogTimer);
    };
  }, [demo, loadCatalog, mode]);

  if (mode === "loading") return <BootScreen />;
  if (mode === "activation") {
    return (
      <ActivationScreen
        onActivated={(data, token) => {
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
      error={catalogError}
      demo={demo}
      onRefresh={refreshAll}
      onCatalogKind={changeCatalogKind}
      onDisconnect={() => {
        catalogRequestRef.current?.abort();
        loadedKindRef.current = null;
        kindRef.current = "LIVE";
        localStorage.removeItem(TOKEN_KEY);
        setConfiguration(null);
        setCatalog(null);
        setMode("activation");
      }}
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
          appVersion: "0.1.0",
        }),
      });
      const nextConfiguration = await request<Configuration>(
        "v1/device/configuration",
        undefined,
        response.deviceToken,
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
        <footer>LC PLAY · Seu conteúdo. Sua tela.</footer>
      </section>
      <section className="activation-visual" aria-label="Entretenimento LC PLAY">
        <img src="/assets/lc-play-home.png" alt="Colagem de entretenimento com cidade, esporte, música e natureza" />
        <div className="activation-visual-caption">
          <span><MonitorPlay size={20} />LG webOS</span>
          <strong>Uma tela.<br />Tudo organizado.</strong>
        </div>
      </section>
    </main>
  );
}

function PlayerExperience({
  configuration,
  catalog,
  loading,
  error,
  demo,
  onRefresh,
  onCatalogKind,
  onDisconnect,
}: {
  configuration: Configuration | null;
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  demo: boolean;
  onRefresh: () => Promise<void>;
  onCatalogKind: (kind: CatalogKind) => void;
  onDisconnect: () => void;
}) {
  const [view, setView] = useState<View>("LIVE");
  const [group, setGroup] = useState("Todos");
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<CatalogItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesCollection | null>(null);

  const openView = (nextView: View) => {
    if (nextView === "LIVE" || nextView === "MOVIE" || nextView === "SERIES") onCatalogKind(nextView);
    setGroup("Todos");
    setPage(0);
    setSelectedSeries(null);
    setView(nextView);
  };

  useEffect(() => {
    const onBack = (event: KeyboardEvent) => {
      if (!(event.key === "Escape" || event.key === "Backspace" || event.keyCode === 461)) return;
      if (playing) {
        event.preventDefault();
        setPlaying(null);
      } else if (selectedSeries) {
        event.preventDefault();
        setSelectedSeries(null);
      } else if (view !== "HOME") {
        event.preventDefault();
        setView("HOME");
      }
    };
    window.addEventListener("keydown", onBack);
    return () => window.removeEventListener("keydown", onBack);
  }, [playing, selectedSeries, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(playing ? ".player-close" : "[data-autofocus][data-focusable]")?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [group, page, playing, selectedSeries, view]);

  return (
    <main className="tv-shell">
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
          onPlay={setPlaying}
          onRefresh={onRefresh}
        />
      ) : null}
      {view === "MOVIE" ? (
        <CatalogScreen
          kind={view}
          catalog={catalog}
          loading={loading}
          error={error}
          group={group}
          page={page}
          onGroup={(nextGroup) => { setGroup(nextGroup); setPage(0); }}
          onPage={setPage}
          onBack={() => setView("HOME")}
          onPlay={setPlaying}
          onRefresh={onRefresh}
        />
      ) : null}
      {view === "SERIES" && !selectedSeries ? (
        <SeriesScreen
          catalog={catalog}
          loading={loading}
          error={error}
          group={group}
          page={page}
          onGroup={(nextGroup) => { setGroup(nextGroup); setPage(0); }}
          onPage={setPage}
          onBack={() => setView("HOME")}
          onSelect={setSelectedSeries}
          onRefresh={onRefresh}
        />
      ) : null}
      {view === "SERIES" && selectedSeries ? (
        <SeriesDetails series={selectedSeries} onBack={() => setSelectedSeries(null)} onPlay={setPlaying} />
      ) : null}
      {playing ? <StreamPlayer item={playing} onClose={() => setPlaying(null)} /> : null}
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
    { view: "SERIES", label: "Séries", caption: "Episódios organizados", count: catalog?.summary.series, className: "menu-series", icon: <Tv /> },
  ];

  return (
    <section className="home-screen">
      <PlayerHeader sourceName={sourceName} />
      <div className="home-intro">
        <span>OLÁ, {configuration?.device.label?.toUpperCase() ?? "BEM-VINDO"}</span>
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
          <span className="menu-copy"><strong>Configurações</strong><small>Dispositivo e fonte</small></span>
        </button>
      </div>
      <div className="home-footer">
        <span><Wifi />{catalog?.epg.status === "AVAILABLE" ? "EPG atualizado" : "EPG indisponível"}</span>
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
}: {
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  demo: boolean;
  fullscreenOpen: boolean;
  onOpen: (view: View) => void;
  onPlay: (item: CatalogItem) => void;
  onRefresh: () => Promise<void>;
}) {
  const time = useClock();
  const channels = useMemo(() => catalog?.items.filter((item) => item.kind === "LIVE") ?? [], [catalog]);
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
  const filtered = useMemo(() => channelIndex.filter((entry) =>
    (group === "Todos" || entry.group === group) &&
    (!favoriteFilter || favoriteFilter.has(entry.item.id)) &&
    (!normalizedQuery || entry.search.includes(normalizedQuery)),
  ).map((entry) => entry.item), [channelIndex, group, favoriteFilter, normalizedQuery]);
  const selected = channels.find((item) => item.id === selectedId) ?? null;

  const toggleFavorite = useCallback((id: string) => {
    const next = favoriteSet.has(id) ? favorites.filter((favorite) => favorite !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem("lc_play_favorite_channels", JSON.stringify(next)); } catch { /* Mantém favoritos na sessão quando o armazenamento está cheio. */ }
  }, [favorites, favoriteSet]);

  return (
    <section className="live-screen">
      <aside className="live-rail" aria-label="Menu principal">
        <Brand />
        <nav>
          <button data-focusable onClick={() => onOpen("HOME")} title="Início" aria-label="Início"><LayoutGrid /></button>
          <button data-focusable className="active" title="TV ao vivo" aria-label="TV ao vivo"><Radio /></button>
          <button data-focusable onClick={() => onOpen("MOVIE")} title="Filmes" aria-label="Filmes"><Film /></button>
          <button data-focusable onClick={() => onOpen("SERIES")} title="Séries" aria-label="Séries"><Tv /></button>
        </nav>
        <button data-focusable className="rail-settings" onClick={() => onOpen("SETTINGS")} title="Configurações" aria-label="Configurações"><Settings /></button>
      </aside>

      <div className="live-main">
        <header className="live-topbar">
          <div><span className="live-eyebrow">LC PLAY / TV AO VIVO</span><strong>Agora na TV</strong></div>
          <div className="live-topbar-meta"><span>{catalog?.source.name ?? "Sua fonte"}</span><time>{time}</time></div>
        </header>

        <div className="live-workspace">
          <aside className="live-categories" aria-label="Categorias de canais">
            <div className="live-column-heading"><span>CATEGORIAS</span><small>{groups.length - 1}</small></div>
            <div className="live-category-scroll">
              {groups.map((name) => (
                <button key={name} data-focusable className={group === name ? "active" : ""} onClick={() => setGroup(name)}>
                  <span>{name}</span><small>{name === "Todos" ? channels.length : groupCounts.get(name) ?? 0}</small>
                </button>
              ))}
            </div>
          </aside>

          <section className="live-channel-column" aria-label="Canais">
            <div className="live-channel-tools">
              <label className="live-search"><Search size={19} /><input data-focusable value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar canal" aria-label="Buscar canal" /></label>
              <div className="live-filter-row">
                <button data-focusable className={!favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly(false)}>Todos</button>
                <button data-focusable className={favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly(true)}>Favoritos <span>{favorites.length}</span></button>
              </div>
            </div>
            <VirtualChannelList items={filtered} selectedId={selected?.id ?? null} favorites={favoriteSet} onSelect={setSelectedId} onFavorite={toggleFavorite}>
              {loading && !catalog ? <p className="live-empty">Carregando canais...</p> : null}
              {!loading && !filtered.length ? <div className="live-empty"><p>{error || (favoritesOnly ? "Nenhum canal favorito nesta categoria." : "Nenhum canal encontrado.")}</p>{error ? <button data-focusable onClick={() => void onRefresh()}>Tentar novamente</button> : null}</div> : null}
            </VirtualChannelList>
            <footer className="live-channel-footer">{filtered.length} {filtered.length === 1 ? "canal" : "canais"} nesta seleção</footer>
          </section>

          <section className="live-feature" aria-label="Canal selecionado">
            <div className="live-preview">
              {selected && !demo && selected.streamUrl && !fullscreenOpen ? <StreamVideo key={selected.id} item={selected} /> : <div className="live-preview-art"><span>LC</span><strong>PLAY</strong><p>{selected ? "Selecione para assistir" : "Escolha um canal"}</p></div>}
              <span className="live-badge">AO VIVO</span>
              {selected ? <button data-focusable className="live-fullscreen" onClick={() => onPlay(selected)}><Maximize2 size={18} /> Tela cheia</button> : null}
              <div className="live-preview-shade"><span>{selected ? cleanGroupLabel(selected.group) : "TV ao vivo"}</span><h1>{selected?.name ?? "Sua programação em um só lugar"}</h1></div>
            </div>
            <div className="live-programme">
              <div className="live-programme-title"><span>PROGRAMAÇÃO</span><span>{catalog?.epg.status === "AVAILABLE" ? "EPG disponível" : "Sem EPG"}</span></div>
              {selected ? <>
                <div className="live-now"><span>AGORA</span><div><small>{selected.now ? `${formatTime(selected.now.startsAt)} – ${formatTime(selected.now.endsAt)}` : "Horário não informado"}</small><h2>{selected.now?.title ?? "Programação não informada"}</h2><p>{selected.now?.description ?? "Escolha o canal para assistir à transmissão ao vivo."}</p></div></div>
                <div className="live-progress"><span style={{ width: `${programmeProgress(selected.now)}%` }} /></div>
                <div className="live-next"><span>A SEGUIR</span><strong>{selected.next ? `${formatTime(selected.next.startsAt)} · ${selected.next.title}` : "Sem informação"}</strong></div>
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
            <span className="live-channel-logo"><span>{item.name.slice(0, 2).toUpperCase()}</span>{item.logo ? <img src={item.logo} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>
            <span className="live-channel-label"><strong>{item.name}</strong><small>{item.now?.title ?? cleanGroupLabel(item.group)}</small></span>
          </button>
          <button data-focusable className={`live-favorite ${favorite ? "is-favorite" : ""}`} onClick={() => onFavorite(item.id)} aria-label={`${favorite ? "Remover" : "Adicionar"} ${item.name} ${favorite ? "dos" : "aos"} favoritos`}><Heart fill={favorite ? "currentColor" : "none"} /></button>
        </div>;
      })}
    </div>
    {children}
  </div>;
});

function CatalogScreen({
  kind,
  catalog,
  loading,
  error,
  group,
  page,
  onGroup,
  onPage,
  onBack,
  onPlay,
  onRefresh,
}: {
  kind: "LIVE" | "MOVIE";
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  group: string;
  page: number;
  onGroup: (group: string) => void;
  onPage: (page: number) => void;
  onBack: () => void;
  onPlay: (item: CatalogItem) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"GRID" | "GUIDE">("GRID");
  const allItems = useMemo(() => catalog?.items.filter((item) => item.kind === kind) ?? [], [catalog, kind]);
  const groups = useMemo(() => buildGroups(allItems, kind), [allItems, kind]);
  const normalizedQuery = normalizeText(query);
  const filtered = allItems.filter((item) => {
    const inGroup = group === "Todos" || cleanGroupLabel(item.group) === group;
    const matchesQuery = !normalizedQuery || normalizeText(`${item.name} ${item.now?.title ?? ""}`).includes(normalizedQuery);
    return inGroup && matchesQuery;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const labels = {
    LIVE: { title: "TV ao vivo", subtitle: "Canais e programação" },
    MOVIE: { title: "Filmes", subtitle: "Escolha uma categoria" },
  } as const;

  return (
    <section className="catalog-screen">
      <PlayerHeader sourceName={catalog?.source.name ?? "LC PLAY"} onBack={onBack} />
      <div className="catalog-heading">
        <div><h1>{labels[kind].title}</h1><p>{labels[kind].subtitle}</p></div>
        <span>{formatCount(filtered.length)} itens carregados</span>
      </div>
      <div className="catalog-tools">
        <label className="catalog-search">
          <Search />
          <input
            data-focusable
            value={query}
            onChange={(event) => { setQuery(event.target.value); onPage(0); }}
            placeholder={kind === "LIVE" ? "Buscar canal ou programa" : "Buscar filme"}
            aria-label={kind === "LIVE" ? "Buscar canal ou programa" : "Buscar filme"}
          />
        </label>
        {kind === "LIVE" ? (
          <div className="layout-switch" aria-label="Visualização">
            <button data-focusable className={layout === "GRID" ? "active" : ""} onClick={() => setLayout("GRID")}><LayoutGrid />Canais</button>
            <button data-focusable className={layout === "GUIDE" ? "active" : ""} onClick={() => setLayout("GUIDE")}><ListVideo />Grade EPG</button>
          </div>
        ) : null}
      </div>
      <nav className="group-tabs" aria-label="Categorias">
        {groups.map((groupName, index) => (
          <button
            key={groupName}
            data-focusable
            data-autofocus={index === 0 ? "" : undefined}
            className={groupName === group ? "active" : ""}
            onClick={() => onGroup(groupName)}
          >
            {groupName}
          </button>
        ))}
      </nav>
      {loading && !catalog ? <CatalogMessage icon={<LoaderCircle className="spin" />} title="Carregando conteúdo" /> : null}
      {!loading && error && !catalog ? (
        <CatalogMessage
          icon={<RefreshCw />}
          title={error}
          action={<button data-focusable className="tv-primary" onClick={() => void onRefresh()}>Tentar novamente</button>}
        />
      ) : null}
      {!loading && catalog && !visibleItems.length ? <CatalogMessage icon={<Layers3 />} title="Nenhum item nesta categoria" /> : null}
      {visibleItems.length && (kind !== "LIVE" || layout === "GRID") ? (
        <div className={`catalog-grid catalog-${kind.toLowerCase()}`}>
          {visibleItems.map((item, index) => (
            <button
              key={item.id}
              data-focusable
              data-autofocus={index === 0 ? "" : undefined}
              className="content-card"
              onClick={() => onPlay(item)}
              title={item.name}
            >
              <span className="content-art">
                <span className="content-fallback">{item.name.slice(0, 2).toUpperCase()}</span>
                {item.logo ? <img src={item.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
                <span className="content-play"><Play fill="currentColor" /></span>
              </span>
              <strong>{item.name}</strong>
              <small>{item.now?.title ?? cleanGroupLabel(item.group)}</small>
            </button>
          ))}
        </div>
      ) : null}
      {visibleItems.length && kind === "LIVE" && layout === "GUIDE" ? <LiveGuide items={visibleItems} onPlay={onPlay} /> : null}
      <Pagination page={safePage} pageCount={pageCount} onPage={onPage} />
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
              {item.logo ? <img src={item.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
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
  page,
  onGroup,
  onPage,
  onBack,
  onSelect,
  onRefresh,
}: {
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  group: string;
  page: number;
  onGroup: (group: string) => void;
  onPage: (page: number) => void;
  onBack: () => void;
  onSelect: (series: SeriesCollection) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const collections = useMemo(() => buildSeriesCollections(catalog?.items ?? []), [catalog]);
  const groups = useMemo(
    () => ["Todos", ...Array.from(new Set(collections.map((series) => series.group))).sort((a, b) => sortGroups("SERIES", a, b))],
    [collections],
  );
  const normalizedQuery = normalizeText(query);
  const filtered = collections.filter((series) => (
    (group === "Todos" || series.group === group) &&
    (!normalizedQuery || normalizeText(series.title).includes(normalizedQuery))
  ));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleSeries = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <section className="catalog-screen">
      <PlayerHeader sourceName={catalog?.source.name ?? "LC PLAY"} onBack={onBack} />
      <div className="catalog-heading">
        <div><h1>Séries</h1><p>Escolha uma série para ver temporadas e episódios</p></div>
        <span>{formatCount(filtered.length)} séries organizadas</span>
      </div>
      <div className="catalog-tools">
        <label className="catalog-search">
          <Search />
          <input
            data-focusable
            value={query}
            onChange={(event) => { setQuery(event.target.value); onPage(0); }}
            placeholder="Buscar série"
            aria-label="Buscar série"
          />
        </label>
      </div>
      <nav className="group-tabs" aria-label="Categorias">
        {groups.map((groupName, index) => (
          <button
            key={groupName}
            data-focusable
            data-autofocus={index === 0 ? "" : undefined}
            className={groupName === group ? "active" : ""}
            onClick={() => onGroup(groupName)}
          >
            {groupName}
          </button>
        ))}
      </nav>
      {loading && !catalog ? <CatalogMessage icon={<LoaderCircle className="spin" />} title="Carregando conteúdo" /> : null}
      {!loading && error && !catalog ? (
        <CatalogMessage icon={<RefreshCw />} title={error} action={<button data-focusable className="tv-primary" onClick={() => void onRefresh()}>Tentar novamente</button>} />
      ) : null}
      {!loading && catalog && !visibleSeries.length ? <CatalogMessage icon={<Layers3 />} title="Nenhuma série nesta categoria" /> : null}
      {visibleSeries.length ? (
        <div className="catalog-grid catalog-series">
          {visibleSeries.map((series, index) => (
            <button
              key={series.id}
              data-focusable
              data-autofocus={index === 0 ? "" : undefined}
              className="content-card"
              onClick={() => onSelect(series)}
              title={series.title}
            >
              <span className="content-art">
                <span className="content-fallback">{series.title.slice(0, 2).toUpperCase()}</span>
                {series.logo ? <img src={series.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
                <span className="content-play"><ChevronRight /></span>
              </span>
              <strong>{series.title}</strong>
              <small>{formatCount(series.episodes.length)} episódios carregados</small>
            </button>
          ))}
        </div>
      ) : null}
      <Pagination page={safePage} pageCount={pageCount} onPage={onPage} />
    </section>
  );
}

function SeriesDetails({
  series,
  onBack,
  onPlay,
}: {
  series: SeriesCollection;
  onBack: () => void;
  onPlay: (item: CatalogItem) => void;
}) {
  const seasons = useMemo(
    () => Array.from(new Set(series.episodes.map((item) => item.series?.season ?? 0))).sort((a, b) => a - b),
    [series],
  );
  const [season, setSeason] = useState(seasons[0] ?? 0);
  const episodes = series.episodes
    .filter((item) => (item.series?.season ?? 0) === season)
    .sort((a, b) => (a.series?.episode ?? 0) - (b.series?.episode ?? 0) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <section className="catalog-screen series-details">
      <PlayerHeader sourceName="Séries" onBack={onBack} />
      <div className="series-summary">
        <span className="series-poster">
          <span>{series.title.slice(0, 2).toUpperCase()}</span>
          {series.logo ? <img src={series.logo} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        </span>
        <div>
          <span>{series.group}</span>
          <h1>{series.title}</h1>
          <p>{series.episodes.length} episódios carregados · {seasons.length} {seasons.length === 1 ? "temporada" : "temporadas"}</p>
        </div>
      </div>
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

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="pagination">
      <button data-focusable aria-label="Página anterior" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft /></button>
      <span>{page + 1} / {pageCount}</span>
      <button data-focusable aria-label="Próxima página" disabled={page + 1 >= pageCount} onClick={() => onPage(page + 1)}><ChevronRight /></button>
    </div>
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
      if (!current.logo && item.logo) current.logo = item.logo;
    } else {
      collections.set(key, { id: item.id, title, group, logo: item.logo, episodes: [item] });
    }
  }
  return Array.from(collections.values()).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function buildGroups(items: CatalogItem[], kind: CatalogKind) {
  return [
    "Todos",
    ...Array.from(new Set(items.map((item) => cleanGroupLabel(item.group)))).sort((a, b) => sortGroups(kind, a, b)),
  ];
}

function cleanGroupLabel(value: string) {
  return value
    .replace(/^(canais?|filmes?|movies?|s[eé]ries?)\s*[|/:-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Outros";
}

function sortGroups(kind: CatalogKind, first: string, second: string) {
  const priorities: Record<CatalogKind, string[]> = {
    LIVE: ["abertos", "noticias", "esportes", "infantil", "filmes", "documentarios", "variedades", "religiosos"],
    MOVIE: ["lancamentos 2026", "lancamentos 2025", "nacional", "acao", "comedia", "drama", "animacao", "documentarios"],
    SERIES: ["lancamentos", "netflix", "globoplay", "prime video", "hbo", "disney", "desenhos", "animes"],
  };
  const score = (value: string) => {
    const normalized = normalizeText(value);
    if (normalized.includes("adultos")) return 999;
    const index = priorities[kind].findIndex((priority) => normalized.includes(priority));
    return index === -1 ? 100 : index;
  };
  return score(first) - score(second) || first.localeCompare(second, "pt-BR");
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
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
  return (
    <section className="settings-screen">
      <PlayerHeader sourceName={configuration?.playlist?.name ?? "LC PLAY"} onBack={onBack} />
      <div className="settings-heading"><h1>Configurações</h1><p>Informações deste aparelho</p></div>
      <div className="settings-grid">
        <article><span><MonitorPlay /></span><small>Dispositivo</small><strong>{configuration?.device.label ?? "Modo demonstração"}</strong></article>
        <article><span><Radio /></span><small>Fonte</small><strong>{configuration?.playlist?.name ?? catalog?.source.name ?? "Não vinculada"}</strong></article>
        <article><span><CalendarDays /></span><small>Validade</small><strong>{formatDate(configuration?.device.expiresAt ?? null)}</strong></article>
        <article><span><Clock3 /></span><small>EPG</small><strong>{catalog?.epg.status === "AVAILABLE" ? `${catalog.epg.programmes} programas` : "Indisponível"}</strong></article>
      </div>
      {error ? <p className="settings-error">{error}</p> : null}
      <div className="settings-actions">
        <button data-focusable data-autofocus className="tv-primary" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? <LoaderCircle className="spin" /> : <RefreshCw />}Atualizar conteúdo
        </button>
        {!demo ? <button data-focusable className="tv-secondary danger-button" onClick={onDisconnect}><LogOut />Desconectar aparelho</button> : null}
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
    <video ref={videoRef} autoPlay controls={controls} muted={!controls} playsInline />
    {status ? <div className={`stream-status ${failed ? "is-error" : ""}`} role="status"><p>{status}</p>{failed ? <button data-focusable onClick={() => setAttempt((current) => current + 1)}>Tentar novamente</button> : null}</div> : null}
  </>;
}

function StreamPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const progress = programmeProgress(item.now);
  return (
    <section className="stream-player" role="dialog" aria-modal="true" aria-label={item.name}>
      {item.streamUrl ? <StreamVideo item={item} controls /> : <div className="stream-demo"><Brand /><p>Prévia visual da demonstração</p></div>}
      <button data-focusable data-autofocus className="player-close" onClick={onClose} aria-label="Fechar player"><X /></button>
      <div className="programme-panel">
        <span className="programme-channel"><Radio />{item.name}</span>
        <h1>{item.now?.title ?? "Ao vivo"}</h1>
        {item.now ? (
          <>
            <p>{item.now.description ?? item.now.category ?? "Programação ao vivo"}</p>
            <div className="programme-time"><span>{formatTime(item.now.startsAt)}</span><span>{formatTime(item.now.endsAt)}</span></div>
            <div className="programme-progress"><span style={{ width: `${progress}%` }} /></div>
          </>
        ) : null}
        {item.next ? <div className="programme-next"><strong>A seguir</strong><span>{formatTime(item.next.startsAt)} · {item.next.title}</span></div> : null}
      </div>
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
