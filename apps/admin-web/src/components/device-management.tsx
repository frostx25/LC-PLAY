"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CirclePlus, Clock3, Eye, KeyRound, Link2, Link2Off, LoaderCircle, Pencil, Search, Trash2, Tv, X } from "lucide-react";
import type { AuditLog, Customer, Device, Playlist } from "./admin-view";
import { api, SessionExpiredError } from "./admin-api";
import { OperationDialog } from "./operation-dialog";
import { effectiveStatus, emptyDeviceFilters, matchesDevice, type DeviceFilters } from "../lib/device-filters";

type Batch = { action: "RENEW" | "SUSPEND" | "SOURCE"; deviceIds: string[] };
type Props = {
  devices: Device[]; customers: Customer[]; playlists: Playlist[]; onChanged: () => Promise<void>;
  onCreate: () => void; onIssueKey: (device: Device) => void; onManageSource: (device: Device) => void;
  onToggle: (device: Device) => void; onUnlink: (device: Device) => void; onDelete: (device: Device) => void;
};
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Não informado";
const statusLabels: Record<string, string> = { ACTIVE: "Ativo", PENDING: "Aguardando", SUSPENDED: "Suspenso", EXPIRED: "Expirado" };
const historyLabels: Record<string, string> = {
  "device.created": "Dispositivo criado", "device.updated": "Dispositivo editado", "device.renewed": "Validade renovada",
  "device.suspended": "Dispositivo suspenso", "device.source_changed": "Fonte alterada", "device.activated": "TV ativada",
  "device.activation_issued": "Chave emitida", "device.unlinked": "TV desvinculada", "customer.created": "Cliente cadastrado", "customer.updated": "Contato atualizado",
};
function localDateTime(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function Action({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return <button className="icon-button table-action" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

export function DeviceManagement(props: Props) {
  const { devices, customers, playlists } = props;
  const router = useRouter();
  const [filters, setFilters] = useState<DeviceFilters>(emptyDeviceFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Device | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ device: Device; history: AuditLog[] } | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(() => devices.filter((device) => matchesDevice(device, filters, now)), [devices, filters, now]);
  const selectedIds = selected.filter((id) => devices.some((device) => device.id === id));
  const allSelected = filtered.length > 0 && filtered.every((device) => selectedIds.includes(device.id));

  function fail(caught: unknown) {
    if (caught instanceof SessionExpiredError) router.replace("/login");
    else setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
  }
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    api<{ device: Device; history: AuditLog[] }>(`admin/devices/${detailId}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDetail(result); })
      .catch((caught) => { if (!controller.signal.aborted) {
        if (caught instanceof SessionExpiredError) router.replace("/login");
        else setError(caught instanceof Error ? caught.message : "Falha ao carregar detalhes.");
      } });
    return () => controller.abort();
  }, [detailId, router]);

  async function run(task: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); await props.onChanged(); setNotice(message); }
    catch (caught) { fail(caught); }
    finally { setBusy(false); }
  }
  function filter(name: keyof DeviceFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value })); setSelected([]);
  }
  function showDetails(device: Device) { setError(""); setDetail(null); setDetailId(device.id); }
  function prepareBatch(action: Batch["action"], ids = selectedIds) {
    if (!ids.length || ids.length > 100) return;
    setError(""); setEdit(null); setBatch({ action, deviceIds: ids });
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return;
    const form = new FormData(event.currentTarget);
    const expiresAt = form.get("expiresAt")?.toString();
    await run(async () => {
      await api(`admin/devices/${edit.id}`, { method: "PATCH", body: JSON.stringify({
        label: form.get("label"), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        contact: { email: form.get("email"), phone: form.get("phone") },
      }) });
      setEdit(null);
    }, "Dispositivo e contato atualizados.");
  }
  async function applyBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!batch) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api("admin/devices/bulk", { method: "POST", body: JSON.stringify({ ...batch,
        ...(batch.action === "RENEW" ? { days: Number(form.get("days")) } : {}),
        ...(batch.action === "SOURCE" ? { playlistId: form.get("playlistId") } : {}),
      }) });
      setBatch(null); setSelected([]);
    }, "Alterações aplicadas e registradas no histórico.");
  }
  const message = error ? <p className="alert alert-error" role="alert">{error}</p> : null;
  const batchNames = batch ? devices.filter((device) => batch.deviceIds.includes(device.id)).map((device) => device.label) : [];
  return <section className="content-section full-section device-manager">
    <div className="section-heading"><div><h2>{filtered.length} de {devices.length} dispositivos</h2></div><button className="primary-button" onClick={props.onCreate}><CirclePlus size={18} />Novo dispositivo</button></div>
    {!edit && !detailId && !batch ? message : null}
    {notice ? <p className="operation-notice" role="status"><Check size={16} />{notice}</p> : null}
    <div className="device-filters">
      <label className="field filter-search"><span><Search size={15} />Buscar</span><input aria-label="Buscar dispositivo ou cliente" value={filters.query} onChange={(event) => filter("query", event.target.value)} placeholder="Dispositivo, cliente ou contato" /></label>
      <label className="field"><span>Cliente</span><select value={filters.customerId} onChange={(event) => filter("customerId", event.target.value)}><option value="">Todos</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="field"><span>Plataforma</span><select value={filters.platform} onChange={(event) => filter("platform", event.target.value)}><option value="">Todas</option><option value="LG_WEBOS">LG webOS</option><option value="ROKU">Roku</option></select></label>
      <label className="field"><span>Status</span><select value={filters.status} onChange={(event) => filter("status", event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Validade</span><select value={filters.validity} onChange={(event) => filter("validity", event.target.value)}><option value="">Todas</option><option value="expired">Expirada</option><option value="7">Vence em até 7 dias</option><option value="30">Vence em até 30 dias</option><option value="unlimited">Sem prazo</option></select></label>
      <button className="icon-button" title="Limpar filtros" aria-label="Limpar filtros" onClick={() => { setFilters(emptyDeviceFilters); setSelected([]); }}><X size={18} /></button>
    </div>
    <div className="batch-toolbar"><span>{selectedIds.length} selecionados</span><button className="secondary-button small-button" disabled={!selectedIds.length || selectedIds.length > 100} onClick={() => prepareBatch("RENEW")}><Clock3 size={16} />Renovar</button><button className="icon-button" title="Suspender selecionados" aria-label="Suspender selecionados" disabled={!selectedIds.length || selectedIds.length > 100} onClick={() => prepareBatch("SUSPEND")}><Ban size={17} /></button><button className="icon-button" title="Trocar fonte dos selecionados" aria-label="Trocar fonte dos selecionados" disabled={!selectedIds.length || selectedIds.length > 100 || !playlists.length} onClick={() => prepareBatch("SOURCE")}><Link2 size={17} /></button></div>
    {filtered.length ? <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Selecionar todos os resultados" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? filtered.slice(0, 100).map((device) => device.id) : [])} /></th><th>Dispositivo / cliente</th><th>Fonte</th><th>Status</th><th>Validade</th><th>Última conexão</th><th>Ações</th></tr></thead><tbody>{filtered.map((device) => {
      const status = effectiveStatus(device, now);
      return <tr key={device.id}><td><input type="checkbox" aria-label={`Selecionar ${device.label}`} checked={selectedIds.includes(device.id)} disabled={!selectedIds.includes(device.id) && selectedIds.length >= 100} onChange={(event) => setSelected((current) => event.target.checked ? [...current, device.id] : current.filter((id) => id !== device.id))} /></td>
        <td><div className="identity-cell"><span className="device-avatar"><Tv size={18} /></span><div><strong>{device.label}</strong><small>{device.customer.name} · {device.platform === "LG_WEBOS" ? "LG webOS" : "Roku"}</small></div></div></td><td>{device.playlist?.name ?? "Não vinculada"}</td><td><span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span></td><td>{device.expiresAt ? new Date(device.expiresAt).toLocaleDateString("pt-BR") : "Sem prazo"}</td><td>{date(device.lastSeenAt)}</td>
        <td><div className="row-actions"><Action label={`Detalhes de ${device.label}`} onClick={() => showDetails(device)}><Eye size={17} /></Action><Action label={`Editar ${device.label}`} onClick={() => { setError(""); setEdit(device); }}><Pencil size={17} /></Action><Action label={`Renovar ${device.label}`} onClick={() => prepareBatch("RENEW", [device.id])}><Clock3 size={17} /></Action><Action label="Alterar fonte" onClick={() => props.onManageSource(device)}><Link2 size={17} /></Action><Action label="Gerar chave" onClick={() => props.onIssueKey(device)}><KeyRound size={17} /></Action><Action label={device.status === "SUSPENDED" ? "Reativar" : "Suspender"} onClick={() => props.onToggle(device)}>{device.status === "SUSPENDED" ? <Check size={17} /> : <Ban size={17} />}</Action><Action label="Desvincular TV" onClick={() => props.onUnlink(device)}><Link2Off size={17} /></Action><Action label="Excluir dispositivo" onClick={() => props.onDelete(device)}><Trash2 size={17} /></Action></div></td></tr>;
    })}</tbody></table></div> : <div className="empty-state"><Search size={26} /><h3>Nenhum dispositivo encontrado</h3></div>}
    {edit ? <OperationDialog title={`Editar ${edit.label}`} onClose={() => setEdit(null)} busy={busy}><form className="operation-form" onSubmit={saveEdit}>{message}<label className="field"><span>Nome do dispositivo</span><input name="label" defaultValue={edit.label} minLength={2} maxLength={80} required autoFocus /></label><label className="field"><span>Validade</span><input name="expiresAt" type="datetime-local" defaultValue={localDateTime(edit.expiresAt)} /></label><p className="muted">Cliente: {edit.customer.name} · {devices.filter((device) => device.customer.id === edit.customer.id).length} dispositivo(s). O contato é compartilhado por esse cliente.</p><div className="form-grid"><label className="field"><span>E-mail</span><input name="email" type="email" defaultValue={edit.customer.email ?? ""} /></label><label className="field"><span>Telefone</span><input name="phone" type="tel" maxLength={30} defaultValue={edit.customer.phone ?? ""} /></label></div><div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEdit(null)}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}Salvar alterações</button></div></form></OperationDialog> : null}
    {batch ? <OperationDialog title={batch.action === "RENEW" ? "Confirmar renovação" : batch.action === "SUSPEND" ? "Confirmar suspensão" : "Confirmar troca de fonte"} onClose={() => setBatch(null)} busy={busy}><form className="operation-form" onSubmit={applyBatch}>{message}<p><strong>{batch.deviceIds.length} dispositivo(s)</strong></p><ul className="confirmation-list">{batchNames.map((name, index) => <li key={batch.deviceIds[index]}>{name}</li>)}</ul>{batch.action === "RENEW" ? <><label className="field"><span>Período</span><select name="days" defaultValue="30"><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option></select></label><p className="muted">A partir da validade futura ou de hoje. Dispositivos suspensos permanecem suspensos.</p></> : null}{batch.action === "SOURCE" ? <label className="field"><span>Nova fonte</span><select name="playlistId" required defaultValue=""><option disabled value="">Selecione</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name} · {playlist.status === "PAUSED" ? "Pausada" : playlist.type}</option>)}</select></label> : null}{batch.action === "SUSPEND" ? <p className="source-error">O acesso dos dispositivos selecionados será bloqueado.</p> : null}<div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setBatch(null)}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}Confirmar</button></div></form></OperationDialog> : null}
    {detailId ? <OperationDialog title="Detalhes do aparelho" onClose={() => { setDetailId(null); setDetail(null); }}>{message}{detail ? <><dl className="device-details">{Object.entries({ Nome: detail.device.label, Cliente: detail.device.customer.name, Plataforma: detail.device.platform === "LG_WEBOS" ? "LG webOS" : "Roku", Modelo: detail.device.model ?? "Não informado", "Sistema operacional": detail.device.osVersion ?? "Não informado", "Versão do aplicativo": detail.device.appVersion ?? "Não informado", Status: statusLabels[effectiveStatus(detail.device)], Fonte: detail.device.playlist?.name ?? "Não vinculada", Validade: detail.device.expiresAt ? date(detail.device.expiresAt) : "Sem prazo", "Última conexão": date(detail.device.lastSeenAt), Ativação: date(detail.device.activatedAt), "E-mail": detail.device.customer.email ?? "Não informado", Telefone: detail.device.customer.phone ?? "Não informado", "ID do dispositivo": detail.device.id }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><h3 className="detail-history-title">Histórico recente</h3>{detail.history.length ? <ol className="device-history">{detail.history.map((log) => <li key={log.id}><strong>{historyLabels[log.action] ?? log.action}</strong><time>{date(log.createdAt)} · {log.actorType === "ADMIN" ? "Administrador" : "Dispositivo"}</time>{typeof log.metadata?.days === "number" ? <span>Renovação: {log.metadata.days} dias · validade: {date(String(log.metadata.expiresAt))}</span> : null}</li>)}</ol> : <p className="muted">Nenhum evento registrado.</p>}</> : !error ? <p role="status"><LoaderCircle className="spin" size={18} />Carregando detalhes...</p> : null}</OperationDialog> : null}
  </section>;
}
