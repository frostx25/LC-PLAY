import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, FileText, LifeBuoy, ShieldCheck } from "lucide-react";
import content from "../lib/legal-content.json";
import notices from "../../public/THIRD-PARTY-NOTICES.txt?raw";
import "./SupportDocuments.css";

type DocumentId = keyof typeof content.documents | "licenses";
const documents: Array<{ id: DocumentId; icon: typeof LifeBuoy; label: string }> = [
  { id: "support", icon: LifeBuoy, label: "Suporte" },
  { id: "privacy", icon: ShieldCheck, label: "Privacidade" },
  { id: "terms", icon: FileText, label: "Termos" },
  { id: "licenses", icon: FileText, label: "Licenças" },
];

export function SupportDocuments({ compact = false }: { compact?: boolean }) {
  const [documentId, setDocumentId] = useState<DocumentId | null>(null);
  const closeDocument = useCallback(() => setDocumentId(null), []);
  return (
    <div className={compact ? "support-documents compact" : "support-documents"}>
      {!compact ? <><p>{content.email}</p><p>{content.operator} · São Paulo, Brasil</p><p>Aplicativo e ativação gratuitos nesta versão.</p></> : null}
      <div className="support-document-actions">
        {documents.map(({ id, icon: Icon, label }) => <button key={id} data-focusable type="button" onClick={() => setDocumentId(id)}><Icon />{label}</button>)}
      </div>
      {documentId ? <DocumentReader id={documentId} onClose={closeDocument} /> : null}
    </div>
  );
}

function DocumentReader({ id, onClose }: { id: DocumentId; onClose: () => void }) {
  const articleRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const document = id === "licenses" ? {
    title: "Licenças de terceiros",
    summary: "Avisos das bibliotecas distribuídas com o LC PLAY.",
    sections: [{ title: "Third-Party Notices", paragraphs: [notices] }],
  } : content.documents[id];

  useEffect(() => {
    const previousFocus = window.document.activeElement;
    backRef.current?.focus();
    const handleBack = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const candidates = Array.from(backRef.current?.closest(".support-reader")?.querySelectorAll<HTMLElement>("[data-focusable]") ?? []);
        const index = candidates.indexOf(window.document.activeElement as HTMLElement);
        event.preventDefault();
        event.stopImmediatePropagation();
        candidates[(index + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length]?.focus();
      } else if (event.key === "Escape" || event.key === "Backspace" || event.keyCode === 461) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleBack, true);
    return () => {
      window.removeEventListener("keydown", handleBack, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  function scroll(direction: number) {
    const article = articleRef.current;
    if (article) article.scrollTop += direction * Math.max(180, article.clientHeight * 0.65);
  }

  return (
    <section className="support-reader" role="dialog" aria-modal="true" aria-labelledby="support-document-title">
      <header className="support-reader-header">
        <button ref={backRef} data-focusable type="button" onClick={onClose} aria-label="Voltar" title="Voltar"><ArrowLeft /></button>
        <div><h2 id="support-document-title">{document.title}</h2><p>LC PLAY · Revisão {content.revision.split("-").reverse().join("/")}</p></div>
        <button data-focusable type="button" onClick={() => scroll(-1)} aria-label="Rolar para cima" title="Rolar para cima"><ArrowUp /></button>
        <button data-focusable type="button" onClick={() => scroll(1)} aria-label="Rolar para baixo" title="Rolar para baixo"><ArrowDown /></button>
      </header>
      <article ref={articleRef} tabIndex={0} data-focusable className={`support-reader-content${id === "licenses" ? " license-content" : ""}`} aria-label={document.title}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            scroll(event.key === "ArrowUp" ? -1 : 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            event.stopPropagation();
            backRef.current?.focus();
          }
        }}>
        <p className="support-reader-summary">{document.summary}</p>
        {document.sections.map((section) => <section key={section.title}><h3>{section.title}</h3>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        <p>{content.email}</p>
      </article>
    </section>
  );
}
