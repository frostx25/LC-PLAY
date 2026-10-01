"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Ban,
  Check,
  CirclePlus,
  Clipboard,
  Clock3,
  KeyRound,
  Link2,
  Link2Off,
  LoaderCircle,
  MonitorPlay,
  Pencil,
  RadioTower,
  RefreshCw,
  Smartphone,
  Trash2,
  Tv,
  UserPlus,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

type Section = "dashboard" | "devices" | "playlists" | "customers" | "logs";
type Dialog = "device" | "device-source" | "playlist" | "playlist-edit" | "customer" | "activation" | null;

type Summary = {
  activeDevices: number;
  pendingDevices: number;
  suspendedDevices: number;
  playlists: number;
  customers: number;
  onlineNow: number;
};

type Device = {
  id: string;
  label: string;
  platform: "LG_WEBOS" | "ROKU";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "EXPIRED";
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  lastSeenAt: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  playlist: { id: string; name: string; type: string; status: string } | null;
  activationCodes: Array<{ codeHint: string; expiresAt: string }>;
};

type Playlist = {
  id: string;
  name: string;
  type: "M3U" | "XTREAM";
  status: "ACTIVE" | "PAUSED" | "ERROR";
  itemCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  _count: { devices: number };
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  _count: { devices: number };
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Activation = { code: string; expiresAt: string; deviceLabel: string };

const emptySummary: Summary = {
  activeDevices: 0,
  pendingDevices: 0,
  suspendedDevices: 0,
  playlists: 0,
  customers: 0,
  onlineNow: 0,
};

const actionLabels: Record<string, string> = {
  "device.created": "Dispositivo criado",
  "device.updated": "Dispositivo atualizado",
  "device.deleted": "Dispositivo excluído",
  "device.activation_issued": "Chave de ativação emitida",
  "device.activated": "TV ativada",
  "device.unlinked": "TV desvinculada",
  "playlist.created": "Fonte cadastrada",
  "playlist.updated": "Fonte atualizada",
  "playlist.deleted": "Fonte excluída",
  "customer.created": "Cliente cadastrado",
};

class SessionExpiredError extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) {
    throw new SessionExpiredError("Sessão expirada.");
  }
  const data = await response.json();
  if (!response.ok) {
    const issue = Array.isArray(data.issues) ? data.issues[0]?.message : null;
    throw new Error(issue ?? data.message ?? "Não foi possível concluir a operação.");
  }
  return data as T;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

function isOnline(lastSeenAt: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 5 * 60_000);
}

export function AdminView({ section }: { section: Section }) {
  const router = useRouter();
  const [summary, setSummary] = useState(emptySummary);
  const [devices, setDevices] = useState<Device[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [summaryData, deviceData, playlistData, customerData, logData] = await Promise.all([
        api<Summary>("admin/dashboard"),
        api<Device[]>("admin/devices"),
        api<Playlist[]>("admin/playlists"),
        api<Customer[]>("admin/customers"),
        api<AuditLog[]>("admin/audit-logs"),
      ]);
      setSummary(summaryData);
      setDevices(deviceData);
      setPlaylists(playlistData);
      setCustomers(customerData);
      setLogs(logData);
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        router.replace("/login");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Falha ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<void>, success: string) {
    setSaving(true);
    setError("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        router.replace("/login");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api("admin/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          notes: form.get("notes"),
        }),
      });
      setDialog(null);
    }, "Cliente cadastrado.");
  }

  async function submitPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api("admin/playlists", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          type: form.get("type"),
          sourceUrl: form.get("sourceUrl"),
          epgUrl: form.get("epgUrl"),
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      setDialog(null);
    }, "Fonte cadastrada com segurança.");
  }

  function editPlaylist(playlist: Playlist) {
    setSelectedPlaylist(playlist);
    setDialog("playlist-edit");
  }

  async function submitPlaylistEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlaylist) return;
    const form = new FormData(event.currentTarget);
    const replacements = ["sourceUrl", "epgUrl", "username", "password"].reduce<Record<string, string>>(
      (fields, name) => {
        const value = form.get(name)?.toString().trim();
        if (value) fields[name] = value;
        return fields;
      },
      {},
    );
    await run(async () => {
      await api(`admin/playlists/${selectedPlaylist.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          type: form.get("type"),
          ...replacements,
        }),
      });
      setDialog(null);
      setSelectedPlaylist(null);
    }, "Fonte atualizada com segurança.");
  }

  async function submitDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const expiration = form.get("expiresAt")?.toString();
      const device = await api<Device>("admin/devices", {
        method: "POST",
        body: JSON.stringify({
          label: form.get("label"),
          platform: form.get("platform"),
          customerId: form.get("customerId"),
          playlistId: form.get("playlistId") || null,
          expiresAt: expiration ? new Date(expiration).toISOString() : null,
          parentalPin: form.get("parentalPin") || null,
        }),
      });
      const key = await api<Activation>(`admin/devices/${device.id}/activation-code`, {
        method: "POST",
        body: JSON.stringify({ ttlMinutes: 30 }),
      });
      setActivation(key);
      setDialog("activation");
    }, "Dispositivo criado e chave emitida.");
  }

  async function issueKey(device: Device) {
    await run(async () => {
      const key = await api<Activation>(`admin/devices/${device.id}/activation-code`, {
        method: "POST",
        body: JSON.stringify({ ttlMinutes: 30 }),
      });
      setActivation(key);
      setDialog("activation");
    }, "Nova chave emitida.");
  }

  function manageDeviceSource(device: Device) {
    setSelectedDevice(device);
    setDialog("device-source");
  }

  async function submitDeviceSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice) return;
    const form = new FormData(event.currentTarget);
    const playlistId = form.get("playlistId")?.toString() || null;
    await run(async () => {
      await api(`admin/devices/${selectedDevice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ playlistId }),
      });
      setDialog(null);
      setSelectedDevice(null);
    }, playlistId ? "Fonte vinculada ao dispositivo." : "Fonte removida do dispositivo.");
  }

  async function toggleDevice(device: Device) {
    const status = device.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    await run(
      () => api(`admin/devices/${device.id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(() => undefined),
      status === "ACTIVE" ? "Dispositivo reativado." : "Dispositivo suspenso.",
    );
  }

  async function unlinkDevice(device: Device) {
    if (!window.confirm(`Desvincular a TV de “${device.label}”?`)) return;
    await run(
      () => api(`admin/devices/${device.id}/unlink`, { method: "POST", body: "{}" }).then(() => undefined),
      "TV desvinculada.",
    );
  }

  async function deleteDevice(device: Device) {
    if (!window.confirm(`Excluir o dispositivo “${device.label}”?`)) return;
    await run(
      () => api(`admin/devices/${device.id}`, { method: "DELETE" }).then(() => undefined),
      "Dispositivo excluído.",
    );
  }

  async function togglePlaylist(playlist: Playlist) {
    const status = playlist.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    await run(
      () => api(`admin/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(() => undefined),
      status === "ACTIVE" ? "Fonte reativada." : "Fonte pausada.",
    );
  }

  async function deletePlaylist(playlist: Playlist) {
    if (!window.confirm(`Excluir a fonte “${playlist.name}”?`)) return;
    await run(
      () => api(`admin/playlists/${playlist.id}`, { method: "DELETE" }).then(() => undefined),
      "Fonte excluída.",
    );
  }

  const recentDevices = useMemo(() => devices.slice(0, 6), [devices]);

  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError("")} aria-label="Fechar aviso"><X size={17} /></button>
        </div>
      ) : null}
      {notice ? (
        <div className="toast" role="status"><Check size={17} />{notice}</div>
      ) : null}

      {loading ? <LoadingState /> : null}
      {!loading && section === "dashboard" ? (
        <Dashboard
          summary={summary}
          devices={recentDevices}
          logs={logs.slice(0, 6)}
          onNewDevice={() => setDialog("device")}
          onNewPlaylist={() => setDialog("playlist")}
          onIssueKey={issueKey}
          onManageSource={manageDeviceSource}
        />
      ) : null}
      {!loading && section === "devices" ? (
        <Devices
          devices={devices}
          onCreate={() => setDialog("device")}
          onIssueKey={issueKey}
          onManageSource={manageDeviceSource}
          onToggle={toggleDevice}
          onUnlink={unlinkDevice}
          onDelete={deleteDevice}
        />
      ) : null}
      {!loading && section === "playlists" ? (
        <Playlists playlists={playlists} onCreate={() => setDialog("playlist")} onEdit={editPlaylist} onToggle={togglePlaylist} onDelete={deletePlaylist} />
      ) : null}
      {!loading && section === "customers" ? (
        <Customers customers={customers} onCreate={() => setDialog("customer")} />
      ) : null}
      {!loading && section === "logs" ? <Logs logs={logs} /> : null}

      {dialog === "customer" ? (
        <Modal title="Novo cliente" icon={<UserPlus size={20} />} onClose={() => setDialog(null)}>
          <form className="dialog-form" onSubmit={submitCustomer}>
            <Field label="Nome" name="name" required autoFocus />
            <div className="form-grid">
              <Field label="E-mail" name="email" type="email" />
              <Field label="Telefone" name="phone" type="tel" />
            </div>
            <Field label="Observações" name="notes" as="textarea" />
            <DialogActions saving={saving} onCancel={() => setDialog(null)} label="Cadastrar cliente" />
          </form>
        </Modal>
      ) : null}

      {dialog === "playlist" ? (
        <Modal title="Nova fonte" icon={<RadioTower size={20} />} onClose={() => setDialog(null)}>
          <form className="dialog-form" onSubmit={submitPlaylist}>
            <div className="form-grid">
              <Field label="Nome da fonte" name="name" required autoFocus />
              <label className="field"><span>Tipo</span><select name="type" defaultValue="M3U"><option value="M3U">M3U</option><option value="XTREAM">Xtream</option></select></label>
            </div>
            <Field label="URL da fonte" name="sourceUrl" type="url" placeholder="https://" required />
            <Field label="URL do EPG" name="epgUrl" type="url" placeholder="https://" />
            <div className="form-grid">
              <Field label="Usuário Xtream" name="username" autoComplete="off" />
              <Field label="Senha Xtream" name="password" type="password" autoComplete="new-password" />
            </div>
            <DialogActions saving={saving} onCancel={() => setDialog(null)} label="Salvar fonte" />
          </form>
        </Modal>
      ) : null}

      {dialog === "playlist-edit" && selectedPlaylist ? (
        <Modal
          title="Editar fonte"
          icon={<Pencil size={20} />}
          onClose={() => { setDialog(null); setSelectedPlaylist(null); }}
        >
          <form className="dialog-form" onSubmit={submitPlaylistEdit}>
            <div className="form-grid">
              <Field label="Nome da fonte" name="name" defaultValue={selectedPlaylist.name} required autoFocus />
              <label className="field"><span>Tipo</span><select name="type" defaultValue={selectedPlaylist.type}><option value="M3U">M3U</option><option value="XTREAM">Xtream</option></select></label>
            </div>
            <Field label="Nova URL da fonte" name="sourceUrl" type="url" placeholder="Manter URL atual" />
            <Field label="Nova URL do EPG" name="epgUrl" type="url" placeholder="Manter EPG atual" />
            <div className="form-grid">
              <Field label="Novo usuário Xtream" name="username" autoComplete="off" placeholder="Manter usuário atual" />
              <Field label="Nova senha Xtream" name="password" type="password" autoComplete="new-password" placeholder="Manter senha atual" />
            </div>
            <DialogActions saving={saving} onCancel={() => { setDialog(null); setSelectedPlaylist(null); }} label="Salvar alterações" />
          </form>
        </Modal>
      ) : null}

      {dialog === "device" ? (
        <Modal title="Novo dispositivo" icon={<MonitorPlay size={20} />} onClose={() => setDialog(null)}>
          <form className="dialog-form" onSubmit={submitDevice}>
            <div className="form-grid">
              <Field label="Identificação" name="label" placeholder="Sala, cliente ou unidade" required autoFocus />
              <label className="field"><span>Plataforma</span><select name="platform" defaultValue="LG_WEBOS"><option value="LG_WEBOS">LG webOS</option><option value="ROKU">Roku</option></select></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Cliente</span><select name="customerId" required defaultValue=""><option value="" disabled>Selecione</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="field"><span>Fonte vinculada</span><select name="playlistId" defaultValue=""><option value="">Sem fonte</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <Field label="Validade" name="expiresAt" type="datetime-local" />
              <Field label="PIN parental" name="parentalPin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4 dígitos" />
            </div>
            <DialogActions saving={saving} onCancel={() => setDialog(null)} label="Criar e gerar chave" />
          </form>
        </Modal>
      ) : null}

      {dialog === "device-source" && selectedDevice ? (
        <Modal title="Fonte do dispositivo" icon={<Link2 size={20} />} onClose={() => { setDialog(null); setSelectedDevice(null); }} compact>
          <form className="dialog-form" onSubmit={submitDeviceSource}>
            <p className="activation-device">{selectedDevice.label}</p>
            <label className="field">
              <span>Fonte vinculada</span>
              <select name="playlistId" defaultValue={selectedDevice.playlist?.id ?? ""} autoFocus>
                <option value="">Sem fonte vinculada</option>
                {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </label>
            <DialogActions saving={saving} onCancel={() => { setDialog(null); setSelectedDevice(null); }} label="Salvar vínculo" />
          </form>
        </Modal>
      ) : null}

      {dialog === "activation" && activation ? (
        <Modal title="Chave de ativação" icon={<KeyRound size={20} />} onClose={() => setDialog(null)} compact>
          <div className="activation-dialog">
            <p className="activation-device">{activation.deviceLabel}</p>
            <div className="activation-code">{activation.code}</div>
            <div className="activation-meta"><Clock3 size={16} />Válida até {formatDate(activation.expiresAt, true)}</div>
            <button
              type="button"
              className="primary-button"
              onClick={async () => {
                await navigator.clipboard.writeText(activation.code);
                setNotice("Chave copiada.");
              }}
            >
              <Clipboard size={18} />Copiar chave
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Dashboard({
  summary,
  devices,
  logs,
  onNewDevice,
  onNewPlaylist,
  onIssueKey,
  onManageSource,
}: {
  summary: Summary;
  devices: Device[];
  logs: AuditLog[];
  onNewDevice: () => void;
  onNewPlaylist: () => void;
  onIssueKey: (device: Device) => void;
  onManageSource: (device: Device) => void;
}) {
  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date()).toUpperCase();
  const stats = [
    { label: "Ativos", value: summary.activeDevices, icon: MonitorPlay, tone: "blue" },
    { label: "Online agora", value: summary.onlineNow, icon: Wifi, tone: "green" },
    { label: "Aguardando", value: summary.pendingDevices, icon: Clock3, tone: "coral" },
    { label: "Fontes", value: summary.playlists, icon: RadioTower, tone: "violet" },
  ];
  return (
    <div className="view-stack">
      <section className="welcome-band">
        <div><p className="eyebrow">{today}</p><h2>Boa operação, Leonardo.</h2><p>{summary.onlineNow} {summary.onlineNow === 1 ? "dispositivo conectado" : "dispositivos conectados"} nos últimos 5 minutos.</p></div>
        <div className="welcome-actions"><button className="secondary-button" onClick={onNewPlaylist}><RadioTower size={18} />Nova fonte</button><button className="primary-button" onClick={onNewDevice}><CirclePlus size={18} />Novo dispositivo</button></div>
      </section>
      <section className="stats-grid" aria-label="Resumo">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className="stat-card" key={label}><span className={`stat-icon tone-${tone}`}><Icon size={20} /></span><div><strong>{value.toString().padStart(2, "0")}</strong><span>{label}</span></div></article>)}
      </section>
      <div className="dashboard-grid">
        <section className="content-section dashboard-main">
          <SectionHeading title="Dispositivos recentes" action={<Link href="/devices" className="text-link">Ver todos</Link>} />
          <DeviceTable devices={devices} onIssueKey={onIssueKey} onManageSource={onManageSource} compact />
        </section>
        <section className="content-section activity-section">
          <SectionHeading title="Atividade" action={<Link href="/logs" className="text-link">Histórico</Link>} />
          <ActivityList logs={logs} />
        </section>
      </div>
    </div>
  );
}

function Devices({ devices, onCreate, onIssueKey, onManageSource, onToggle, onUnlink, onDelete }: { devices: Device[]; onCreate: () => void; onIssueKey: (device: Device) => void; onManageSource: (device: Device) => void; onToggle: (device: Device) => void; onUnlink: (device: Device) => void; onDelete: (device: Device) => void }) {
  return <section className="content-section full-section"><SectionHeading title={`${devices.length} ${devices.length === 1 ? "dispositivo" : "dispositivos"}`} subtitle="LG webOS e Roku" action={<button className="primary-button" onClick={onCreate}><CirclePlus size={18} />Novo dispositivo</button>} /><DeviceTable devices={devices} onIssueKey={onIssueKey} onManageSource={onManageSource} onToggle={onToggle} onUnlink={onUnlink} onDelete={onDelete} /></section>;
}

function Playlists({ playlists, onCreate, onEdit, onToggle, onDelete }: { playlists: Playlist[]; onCreate: () => void; onEdit: (playlist: Playlist) => void; onToggle: (playlist: Playlist) => void; onDelete: (playlist: Playlist) => void }) {
  const title = `${playlists.length} ${playlists.length === 1 ? "fonte" : "fontes"}`;
  return <section className="content-section full-section"><SectionHeading title={title} subtitle="Credenciais protegidas por criptografia" action={<button className="primary-button" onClick={onCreate}><CirclePlus size={18} />Nova fonte</button>} />{playlists.length ? <div className="source-grid">{playlists.map((playlist) => <article className="source-card" key={playlist.id}><div className="source-card-top"><span className="source-icon"><RadioTower size={20} /></span><StatusBadge status={playlist.status} /></div><div><h3>{playlist.name}</h3><p>{playlist.type} · {playlist._count.devices} {playlist._count.devices === 1 ? "dispositivo" : "dispositivos"}</p></div><div className="source-metrics"><span><strong>{playlist.itemCount}</strong> itens</span><span><strong>{formatDate(playlist.lastSyncAt)}</strong> sincronização</span></div><div className="row-actions"><button className="secondary-button small-button" onClick={() => onToggle(playlist)}>{playlist.status === "PAUSED" ? <Check size={16} /> : <Ban size={16} />}{playlist.status === "PAUSED" ? "Ativar" : "Pausar"}</button><IconAction label="Editar fonte" onClick={() => onEdit(playlist)}><Pencil size={17} /></IconAction><IconAction label="Excluir fonte" onClick={() => onDelete(playlist)} danger><Trash2 size={17} /></IconAction></div></article>)}</div> : <EmptyState icon={<RadioTower size={26} />} title="Nenhuma fonte cadastrada" actionLabel="Cadastrar fonte" onAction={onCreate} />}</section>;
}

function Customers({ customers, onCreate }: { customers: Customer[]; onCreate: () => void }) {
  return <section className="content-section full-section"><SectionHeading title={`${customers.length} ${customers.length === 1 ? "cliente" : "clientes"}`} subtitle="Responsáveis pelos dispositivos" action={<button className="primary-button" onClick={onCreate}><UserPlus size={18} />Novo cliente</button>} />{customers.length ? <div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Dispositivos</th><th>Cadastro</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><div className="identity-cell"><span className="customer-avatar">{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.notes || "Sem observações"}</small></div></div></td><td><strong className="table-secondary">{customer.email || customer.phone || "—"}</strong></td><td>{customer._count.devices}</td><td>{formatDate(customer.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<UsersRound size={26} />} title="Nenhum cliente cadastrado" actionLabel="Cadastrar cliente" onAction={onCreate} />}</section>;
}

function Logs({ logs }: { logs: AuditLog[] }) {
  return <section className="content-section full-section"><SectionHeading title="Histórico de atividade" subtitle={`${logs.length} eventos mais recentes`} action={<button className="secondary-button" onClick={() => window.location.reload()}><RefreshCw size={17} />Atualizar</button>} /><div className="logs-list">{logs.map((log) => <div className="log-row" key={log.id}><span className="log-icon"><Activity size={17} /></span><div><strong>{actionLabels[log.action] ?? log.action}</strong><span>{log.actorType === "ADMIN" ? "Painel administrativo" : log.actorType === "DEVICE" ? "Dispositivo" : "Sistema"}</span></div><time>{formatDate(log.createdAt, true)}</time></div>)}</div></section>;
}

function DeviceTable({ devices, onIssueKey, onManageSource, onToggle, onUnlink, onDelete, compact = false }: { devices: Device[]; onIssueKey: (device: Device) => void; onManageSource?: (device: Device) => void; onToggle?: (device: Device) => void; onUnlink?: (device: Device) => void; onDelete?: (device: Device) => void; compact?: boolean }) {
  if (!devices.length) return <EmptyState icon={<Tv size={26} />} title="Nenhum dispositivo cadastrado" />;
  return <div className="table-scroll"><table className={compact ? "compact-table" : ""}><thead><tr><th>Dispositivo</th><th>Cliente</th><th>Fonte</th><th>Status</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><div className="identity-cell"><span className="device-avatar">{device.platform === "LG_WEBOS" ? <Tv size={19} /> : <Smartphone size={19} />}</span><div><strong>{device.label}</strong><small>{device.platform === "LG_WEBOS" ? "LG webOS" : "Roku"}{device.model ? ` · ${device.model}` : ""}</small></div></div></td><td><strong className="table-secondary">{device.customer.name}</strong></td><td>{device.playlist?.name ?? <span className="muted">Não vinculada</span>}</td><td><StatusBadge status={isOnline(device.lastSeenAt) && device.status === "ACTIVE" ? "ONLINE" : device.status} /></td><td>{formatDate(device.lastSeenAt, true)}</td><td><div className="row-actions">{onManageSource ? <IconAction label={device.playlist ? "Alterar fonte" : "Vincular fonte"} onClick={() => onManageSource(device)}><Link2 size={17} /></IconAction> : null}<IconAction label="Gerar chave" onClick={() => onIssueKey(device)}><KeyRound size={17} /></IconAction>{onToggle ? <IconAction label={device.status === "SUSPENDED" ? "Reativar" : "Suspender"} onClick={() => onToggle(device)}>{device.status === "SUSPENDED" ? <Check size={17} /> : <Ban size={17} />}</IconAction> : null}{onUnlink ? <IconAction label="Desvincular TV" onClick={() => onUnlink(device)}><Link2Off size={17} /></IconAction> : null}{onDelete ? <IconAction label="Excluir dispositivo" onClick={() => onDelete(device)} danger><Trash2 size={17} /></IconAction> : null}</div></td></tr>)}</tbody></table></div>;
}

function ActivityList({ logs }: { logs: AuditLog[] }) {
  if (!logs.length) return <p className="empty-inline">Nenhuma atividade registrada.</p>;
  return <div className="activity-list">{logs.map((log) => <div className="activity-item" key={log.id}><span><Activity size={16} /></span><div><strong>{actionLabels[log.action] ?? log.action}</strong><time>{formatDate(log.createdAt, true)}</time></div></div>)}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { ACTIVE: "Ativo", ONLINE: "Online", PENDING: "Aguardando", SUSPENDED: "Suspenso", EXPIRED: "Expirado", PAUSED: "Pausada", ERROR: "Erro" };
  return <span className={`status-badge status-${status.toLowerCase()}`}><span />{labels[status] ?? status}</span>;
}

function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</div>;
}

function IconAction({ label, children, onClick, danger = false }: { label: string; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return <button type="button" className={`icon-button table-action ${danger ? "danger-action" : ""}`} onClick={onClick} aria-label={label} title={label}>{children}</button>;
}

function EmptyState({ icon, title, actionLabel, onAction }: { icon: ReactNode; title: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3>{actionLabel && onAction ? <button className="secondary-button" onClick={onAction}><CirclePlus size={17} />{actionLabel}</button> : null}</div>;
}

function Modal({ title, icon, children, onClose, compact = false }: { title: string; icon: ReactNode; children: ReactNode; onClose: () => void; compact?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal ${compact ? "modal-compact" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span>{icon}</span><h2 id="modal-title">{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>{children}</section></div>;
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; as?: "input" | "textarea" };
function Field({ label, name, as = "input", ...props }: FieldProps) {
  return <label className="field"><span>{label}</span>{as === "textarea" ? <textarea name={name} rows={3} /> : <input name={name} {...props} />}</label>;
}

function DialogActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{label}</button></div>;
}

function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" size={26} /><span>Carregando operação</span></div>;
}
