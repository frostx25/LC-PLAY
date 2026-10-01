"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  RadioTower,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";

const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/devices", label: "Dispositivos", icon: MonitorPlay },
  { href: "/playlists", label: "Fontes", icon: RadioTower },
  { href: "/customers", label: "Clientes", icon: UsersRound },
  { href: "/logs", label: "Atividade", icon: Activity },
];

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Visão geral", subtitle: "Operação LC PLAY em tempo real" },
  "/devices": { title: "Dispositivos", subtitle: "Ativações, vínculos e validade" },
  "/playlists": { title: "Fontes", subtitle: "Listas autorizadas e sincronização" },
  "/customers": { title: "Clientes", subtitle: "Responsáveis e pontos de acesso" },
  "/logs": { title: "Atividade", subtitle: "Histórico administrativo e eventos" },
};

export function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const heading = pageTitles[pathname] ?? pageTitles["/"];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="panel-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Brand />
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <p className="nav-label">OPERAÇÃO</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link nav-link-active" : "nav-link"}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Sistemas operacionais</strong>
            <span>API e banco conectados</span>
          </div>
        </div>
      </aside>

      {menuOpen ? <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" /> : null}

      <div className="panel-body">
        <header className="topbar">
          <div className="topbar-heading">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={21} />
            </button>
            <div>
              <h1>{heading.title}</h1>
              <p>{heading.subtitle}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="profile-button">
              <span className="profile-avatar">LC</span>
              <span className="profile-copy">
                <strong>Leonardo Cali</strong>
                <small>Proprietário</small>
              </span>
            </div>
            <button className="icon-button logout-button" type="button" onClick={logout} aria-label="Sair" title="Sair">
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="panel-content">{children}</main>
        <nav className="mobile-navigation" aria-label="Navegação móvel">
          {navigation.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={pathname === item.href ? "mobile-nav-active" : ""}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)}>
            <CircleUserRound size={20} />
            <span>Mais</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
