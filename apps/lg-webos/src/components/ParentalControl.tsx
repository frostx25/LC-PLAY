import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Delete, LockKeyhole } from "lucide-react";
import { PARENTAL_PIN_KEY, readParentalPin } from "../lib/parental";
import { ParentalContext } from "../lib/parental-context";

type Prompt = { stage: "UNLOCK" | "CURRENT" | "NEW" | "CONFIRM"; action?: () => void; nextPin?: string };

export function ParentalControlProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const attempts = useRef({ count: 0, until: 0 });
  const dialog = useRef<HTMLDivElement>(null);

  const open = (next: Prompt) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPin(""); setError(""); setPrompt(next);
  };
  const close = () => { setPrompt(null); returnFocus.current?.focus(); };
  const submit = () => {
    if (!prompt || pin.length !== 4) return;
    if (Date.now() < attempts.current.until) { setError("Aguarde 30 segundos para tentar novamente."); setPin(""); return; }
    if (prompt.stage === "NEW") { setPrompt({ ...prompt, stage: "CONFIRM", nextPin: pin }); setPin(""); return; }
    if (prompt.stage === "CONFIRM") {
      if (pin !== prompt.nextPin) { setError("Os PINs não coincidem."); setPin(""); setPrompt({ stage: "NEW" }); return; }
      try { localStorage.setItem(PARENTAL_PIN_KEY, pin); }
      catch { setError("Não foi possível salvar o PIN neste aparelho."); return; }
      setUnlocked(false); close(); return;
    }
    if (pin !== readParentalPin(localStorage)) {
      attempts.current.count += 1;
      if (attempts.current.count >= 5) { attempts.current.until = Date.now() + 30_000; attempts.current.count = 0; }
      setError("PIN incorreto."); setPin(""); return;
    }
    attempts.current = { count: 0, until: 0 };
    if (prompt.stage === "CURRENT") { setPrompt({ stage: "NEW" }); setPin(""); setError(""); return; }
    setUnlocked(true); close(); prompt.action?.();
  };

  useEffect(() => {
    if (!prompt) return;
    dialog.current?.querySelector<HTMLButtonElement>("[data-focusable]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation(); setPin((value) => (value + event.key).slice(0, 4));
      } else if (event.key === "Escape" || event.keyCode === 461) {
        event.preventDefault(); event.stopImmediatePropagation(); setPrompt(null); returnFocus.current?.focus();
      } else if (event.key === "Backspace") {
        event.preventDefault(); event.stopImmediatePropagation(); setPin((value) => value.slice(0, -1));
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [prompt]);

  const title = prompt?.stage === "NEW" ? "Novo PIN" : prompt?.stage === "CONFIRM" ? "Confirme o novo PIN" : prompt?.stage === "CURRENT" ? "PIN atual" : "Conteúdo protegido";
  return <ParentalContext.Provider value={{ unlocked, authorize: (action) => { if (unlocked) action(); else open({ stage: "UNLOCK", action }); }, lock: () => setUnlocked(false), changePin: () => open({ stage: "CURRENT" }) }}>
    <div className="parental-content" aria-hidden={prompt ? true : undefined}>{children}</div>
    {prompt ? <div className="parental-overlay" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} className="parental-dialog" role="dialog" aria-modal="true" aria-labelledby="parental-title">
        <LockKeyhole size={36} /><h2 id="parental-title">{title}</h2>
        <output aria-label={`${pin.length} de 4 dígitos preenchidos`}>{[0, 1, 2, 3].map((index) => <span key={index}>{index < pin.length ? "*" : "_"}</span>)}</output>
        <p className="parental-error" role="alert">{error}</p>
        <div className="parental-keypad">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => <button key={digit} data-focusable onClick={() => setPin((value) => (value + digit).slice(0, 4))}>{digit}</button>)}
          <button data-focusable onClick={close} aria-label="Cancelar"><ArrowLeft /></button>
          <button data-focusable onClick={() => setPin((value) => (value + "0").slice(0, 4))}>0</button>
          <button data-focusable onClick={() => setPin((value) => value.slice(0, -1))} aria-label="Apagar dígito"><Delete /></button>
        </div>
        <button data-focusable className="tv-primary parental-confirm" disabled={pin.length !== 4} onClick={submit}>Confirmar</button>
      </div>
    </div> : null}
  </ParentalContext.Provider>;
}
