import { LoaderCircle } from "lucide-react";
import { describeCatalogProgress, type CatalogProgress as Progress } from "../lib/catalog-progress";

export function CatalogProgress({ progress }: { progress: Progress }) {
  const { title, detail, percent, timing } = describeCatalogProgress(progress);
  return (
    <section className="catalog-progress" aria-label="Atualização do catálogo">
      <div className="catalog-progress-copy"><LoaderCircle className="spin" /><strong role="status">{title}</strong><span className="catalog-progress-details">{detail}{timing ? <small>{timing}</small> : null}</span><b>{percent === null ? "" : `${percent}%`}</b></div>
      <div className={`catalog-progress-track${percent === null ? " is-indeterminate" : ""}`} role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={`${detail}${percent === null ? "" : `, ${percent}%`}`}>
        <div style={{ width: percent === null ? "24%" : `${percent}%` }} />
      </div>
    </section>
  );
}
