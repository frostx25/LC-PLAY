import { Play } from "lucide-react";

export function Brand({ variant = "default" }: { variant?: "default" | "large" }) {
  return (
    <div className={`brand brand-${variant}`}>
      <span className="brand-mark" aria-hidden="true">
        <span>LC</span>
        <Play size={variant === "large" ? 20 : 14} fill="currentColor" strokeWidth={2.5} />
      </span>
      <span className="brand-name">
        LC <strong>PLAY</strong>
      </span>
    </div>
  );
}

