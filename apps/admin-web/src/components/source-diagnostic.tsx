"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, LoaderCircle } from "lucide-react";
import type { SourceDiagnostic } from "@lc-play/contracts";
import type { Playlist } from "./admin-view";
import { OperationDialog } from "./operation-dialog";
import { api, SessionExpiredError } from "./admin-api";

export function SourceDiagnosticDialog({ playlist, onClose, onChanged }: {
  playlist: Playlist; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<SourceDiagnostic | null>(null);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<SourceDiagnostic | null>(`admin/playlists/${playlist.id}/diagnostic`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((caught) => { if (!controller.signal.aborted) {
        if (caught instanceof SessionExpiredError) router.replace("/login");
        else setError(caught instanceof Error ? caught.message : "Falha ao carregar diagnóstico.");
      } })
      .finally(() => { if (!controller.signal.aborted) setInitialLoading(false); });
    return () => controller.abort();
  }, [playlist.id, router]);
  async function test() {
    setBusy(true); setError("");
    try {
      setResult(await api<SourceDiagnostic>(`admin/playlists/${playlist.id}/diagnostic`, { method: "POST", body: "{}" }));
      await onChanged();
    } catch (caught) {
      if (caught instanceof SessionExpiredError) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Falha no diagnóstico.");
    } finally { setBusy(false); }
  }
  const labels = { OK: "Funcionando", ERROR: "Falha", UNAVAILABLE: "Não configurado", UNSUPPORTED: "Não suportado" };
  return <OperationDialog title={`Diagnóstico: ${playlist.name}`} onClose={onClose} busy={busy}>
    {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
    {initialLoading ? <p role="status">Carregando último diagnóstico...</p> : null}
    {busy ? <p className="diagnostic-progress" role="status"><LoaderCircle className="spin" size={18} />Testando lista e programação...</p> : null}
    {result ? <><p className="muted">{new Date(result.checkedAt).toLocaleString("pt-BR")} · total {(result.durationMs / 1000).toFixed(2)} s</p><dl className="diagnostic-results">{(["m3u", "epg"] as const).map((kind) => <div key={kind}><dt>{kind.toUpperCase()}<span className={`diagnostic-status diagnostic-${result[kind].status.toLowerCase()}`}>{labels[result[kind].status]}</span></dt><dd><strong>{(result[kind].durationMs / 1000).toFixed(2)} s</strong><p>{result[kind].message}</p>{result[kind].count !== undefined ? <span>{result[kind].count.toLocaleString("pt-BR")} {kind === "m3u" ? "itens válidos" : "canais com programação"}</span> : null}</dd></div>)}</dl></> : !initialLoading && !busy ? <p className="muted">Nenhum diagnóstico registrado.</p> : null}
    <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Fechar</button><button className="primary-button" disabled={busy || initialLoading} onClick={() => void test()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Activity size={17} />}Testar M3U e EPG</button></div>
  </OperationDialog>;
}
