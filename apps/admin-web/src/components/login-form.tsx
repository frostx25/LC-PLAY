"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@lcplay.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível entrar.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-panel">
      <div className="login-heading">
        <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
        <h2>Bem-vindo de volta</h2>
        <p>Entre com sua conta para continuar.</p>
      </div>
      <form onSubmit={submit} className="stack-form">
        <label className="field">
          <span>E-mail</span>
          <span className="input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </span>
        </label>
        <label className="field">
          <span>Senha</span>
          <span className="input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
            <button
              className="icon-button input-action"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button login-submit" type="submit" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
          Entrar
        </button>
      </form>
      <p className="secure-note">Acesso restrito aos operadores autorizados.</p>
    </div>
  );
}

