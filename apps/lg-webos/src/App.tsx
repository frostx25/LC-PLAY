import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  KeyRound,
  Layers3,
  LayoutGrid,
  ListVideo,
  LoaderCircle,
  LogOut,
  MonitorPlay,
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
const PAGE_SIZE = 40;

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

  useSpatialNavigation(mode !== "loading");

  const loadCatalog = useCallback(async () => {
    if (demo) {
      setCatalog(createDemoCatalog());
      setCatalogLoading(false);
      setCatalogError("");
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      setCatalog(await request<DeviceCatalog>("v1/device/catalog", undefined, token));
    } catch (caught) {
      setCatalogError(caught instanceof Error ? caught.message : "Não foi possível carregar o catálogo.");
    } finally {
      setCatalogLoading(false);
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
        setCatalog(await request<DeviceCatalog>("v1/device/catalog", undefined, token));
      } else {
        setCatalog(null);
        setCatalogError("Nenhuma fonte está vinculada a este dispositivo.");
      }
    } catch (caught) {
      setCatalogError(caught instanceof Error ? caught.message : "Não foi possível atualizar o conteúdo.");
    } finally {
      setCatalogLoading(false);
    }
  }, [demo, loadCatalog]);

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
    const catalogTimer = window.setInterval(() => void loadCatalog(), 5 * 60_000);
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
      onDisconnect={() => {
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
  onDisconnect,
}: {
  configuration: Configuration | null;
  catalog: DeviceCatalog | null;
  loading: boolean;
  error: string;
  demo: boolean;
  onRefresh: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const [view, setView] = useState<View>("HOME");
  const [group, setGroup] = useState("Todos");
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<CatalogItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesCollection | null>(null);

  const openView = (nextView: View) => {
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
      document.querySelector<HTMLElement>("[data-autofocus][data-focusable]")?.focus();
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
      {view === "LIVE" || view === "MOVIE" ? (
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

function StreamPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let destroyHls: (() => void) | undefined;
    const handleVideoError = () => setError("Não foi possível reproduzir este conteúdo.");
    video.addEventListener("error", handleVideoError);

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
        setError("Este formato de transmissão não é compatível com o aparelho.");
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      destroyHls = () => hls.destroy();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError("A transmissão não respondeu. Tente outro canal.");
      });
      hls.loadSource(item.streamUrl);
      hls.attachMedia(video);
      await video.play().catch(() => undefined);
    }

    void start();
    return () => {
      disposed = true;
      video.removeEventListener("error", handleVideoError);
      destroyHls?.();
      video.removeAttribute("src");
      video.load();
    };
  }, [item.streamUrl]);

  const progress = programmeProgress(item.now);
  return (
    <section className="stream-player" role="dialog" aria-modal="true" aria-label={item.name}>
      <video ref={videoRef} autoPlay controls playsInline />
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
        {error ? <p className="player-error">{error}</p> : null}
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
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(time);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sem validade";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function programmeProgress(programme: CatalogItem["now"]) {
  if (!programme) return 0;
  const start = new Date(programme.startsAt).getTime();
  const end = new Date(programme.endsAt).getTime();
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

function createDemoCatalog(): DeviceCatalog {
  const items: CatalogItem[] = [
    ["Jornal LC", "LIVE", "Notícias"],
    ["Arena Sports", "LIVE", "Esportes"],
    ["Cinema Brasil", "MOVIE", "Filmes"],
    ["Aventura+", "MOVIE", "Filmes"],
    ["Horizonte", "SERIES", "Séries"],
    ["Cidade 24h", "SERIES", "Séries"],
  ].map(([name, kind, group], index) => ({
    id: `demo-${index}`,
    name,
    kind: kind as CatalogKind,
    group,
    logo: null,
    streamUrl: "",
    tvgId: null,
    series: kind === "SERIES" ? { title: name, season: 1, episode: 1 } : null,
    now: kind === "LIVE" ? {
      title: "Programação de demonstração",
      description: "Prévia visual do LC PLAY.",
      category: group,
      startsAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 40 * 60_000).toISOString(),
    } : null,
    next: null,
  }));
  return {
    source: { id: "demo", name: "Demonstração LC PLAY", type: "M3U" },
    summary: { total: items.length, live: 2, movies: 2, series: 2 },
    groups: [
      { name: "Notícias", count: 1 },
      { name: "Esportes", count: 1 },
      { name: "Filmes", count: 2 },
      { name: "Séries", count: 2 },
    ],
    items,
    truncated: false,
    refreshedAt: new Date().toISOString(),
    epg: { status: "AVAILABLE", programmes: 2 },
  };
}

export default App;
