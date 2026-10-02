"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function OperationDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={ref} className="modal operation-dialog" aria-labelledby="operation-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="operation-title">{title}</h2><button className="icon-button" title="Fechar" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="dialog-form">{children}</div>
  </dialog>;
}
