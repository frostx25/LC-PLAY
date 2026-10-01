import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="LC PLAY">
        <Brand variant="large" />
        <div className="login-statement">
          <p className="eyebrow">OPERAÇÃO CENTRAL</p>
          <h1>Conteúdo autorizado, organizado em cada tela.</h1>
          <p>Gerencie dispositivos LG e Roku em um único painel.</p>
        </div>
        <p className="login-footnote">LC PLAY · Seu conteúdo. Sua tela.</p>
      </section>
      <section className="login-form-side">
        <LoginForm />
      </section>
    </main>
  );
}

