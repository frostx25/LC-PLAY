"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Bell, Check, RefreshCw } from "lucide-react";
import type { Device, Playlist } from "./admin-view";

export function AlertsView({ devices, playlists, onRefresh, onDiagnostic }: {
  devices: Device[]; playlists: Playlist[]; onRefresh: () => Promise<void>; onDiagnostic: (playlist: Playlist) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const expiring = devices.filter((device) => device.expiresAt && new Date(device.expiresAt).getTime() > now && new Date(device.expiresAt).getTime() <= now + 7 * 86_400_000);
  const expired = devices.filter((device) => device.status === "EXPIRED" || device.expiresAt && new Date(device.expiresAt).getTime() <= now);
  const failed = playlists.filter((playlist) => playlist.status === "ERROR" || playlist.lastError);
  const total = expiring.length + expired.length + failed.length;
  async function refresh() { setBusy(true); try { await onRefresh(); } finally { setBusy(false); } }
  return <section className="alerts-section">
    <div className="section-heading"><div><h2>{total} alerta(s)</h2><p>Vencimentos nos próximos 7 dias e falhas de fontes</p></div><button className="icon-button" title="Atualizar alertas" aria-label="Atualizar alertas" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} className={busy ? "spin" : ""} /></button></div>
    {!total ? <div className="empty-state"><Check size={28} /><h3>Nenhum alerta no momento</h3></div> : null}
    {failed.length ? <div className="alert-group"><h3><Activity size={18} />Fontes com falhas · {failed.length}</h3>{failed.map((playlist) => <div className="operation-alert-row" key={playlist.id}><div><strong>{playlist.name}</strong><p>{playlist.lastError || "Falha no carregamento da lista."}</p></div><button className="secondary-button small-button" onClick={() => onDiagnostic(playlist)}><Activity size={16} />Diagnóstico</button></div>)}</div> : null}
    {[{ title: "Dispositivos expirados", items: expired }, { title: "Vencendo em até 7 dias", items: expiring }].filter((group) => group.items.length).map((group) => <div className="alert-group" key={group.title}><h3><Bell size={18} />{group.title} · {group.items.length}</h3>{group.items.map((device) => <div className="operation-alert-row" key={device.id}><div><strong>{device.label}</strong><p>{device.customer.name} · {device.expiresAt ? new Date(device.expiresAt).toLocaleString("pt-BR") : "Validade expirada"}</p></div><Link className="text-link" href="/devices">Dispositivos</Link></div>)}</div>)}
  </section>;
}
