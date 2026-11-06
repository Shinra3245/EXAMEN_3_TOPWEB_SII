"use client";
/* eslint-disable @next/next/no-img-element -- decoración estática local, sin datos */

import React, { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  useVisualTheme,
  setVisualTheme,
  appendVisualParams,
  type VisualState,
} from "@/components/visual-theme";
import "@/styles/visual-comparison.css";
import {
  IconHome,
  IconCalificaciones,
  IconLayers,
  IconCalendar,
  IconReportes,
  IconAdminReportes,
  IconAdminTipos,
  IconLogout,
  IconSun,
  IconMoon,
  IconMenu,
  IconClose,
  VisualSparks,
} from "@/components/visual-icons";

interface AppShellProps {
  children: ReactNode;
}

type NavTone = "blue" | "orange" | "pink" | "green" | "violet";

interface NavEntry {
  href: string;
  label: string;
  icon: (props: { size?: number }) => React.JSX.Element;
  tone: NavTone;
}

const NAV_ITEMS: NavEntry[] = [
  { href: "/dashboard", label: "Inicio", icon: IconHome, tone: "blue" },
  { href: "/calificaciones", label: "Calificaciones", icon: IconCalificaciones, tone: "orange" },
  { href: "/kardex", label: "Kardex", icon: IconLayers, tone: "blue" },
  { href: "/horario", label: "Horario", icon: IconCalendar, tone: "pink" },
  { href: "/reportes", label: "Reportes", icon: IconReportes, tone: "green" },
];

const ADMIN_ITEMS: NavEntry[] = [
  { href: "/admin/reportes", label: "Admin: Reportes", icon: IconAdminReportes, tone: "violet" },
  { href: "/admin/tipos", label: "Admin: Tipos", icon: IconAdminTipos, tone: "orange" },
];

/** Capas decorativas de la familia ilustración: no reciben foco ni bloquean datos. */
function IllustrationBackdrop() {
  return (
    <div className="vs-backdrop" aria-hidden="true">
      <span className="vs-blob vs-blob-tl" />
      <span className="vs-blob vs-blob-bl" />
      <span className="vs-blob vs-blob-br" />
      <img
        src="/assets/visual/pink-laptop.png"
        alt=""
        className="vs-deco vs-deco-pink"
        decoding="async"
      />
      <img
        src="/assets/visual/green-buddy.png"
        alt=""
        className="vs-deco vs-deco-green"
        decoding="async"
      />
    </div>
  );
}

function Masthead({
  visual,
  children,
  actions,
}: {
  visual: VisualState;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="vs-masthead">
      {children}
      <div className="vs-brand">
        <p className="vs-portal-title">
          <span>Portal</span> <span>académico</span>
        </p>
        {visual.style === "ilustracion" && (
          <VisualSparks className="vs-title-sparks" size={44} />
        )}
      </div>
      {visual.style === "ilustracion" ? (
        <img
          src="/assets/visual/cloud-blue.png"
          alt=""
          aria-hidden="true"
          className="vs-deco vs-deco-cloud"
          decoding="async"
        />
      ) : (
        <div className="vs-mosaic-band" aria-hidden="true" />
      )}
      {actions}
    </header>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { student, esAdmin, status, message, refresh, logout } = useAuth();
  const visual = useVisualTheme();
  const pathname = usePathname();
  const router = useRouter();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Redirigir a login si el estado es unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Escape cierra el menú móvil y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Fallo al procesar el cierre de sesión";
      setLogoutError(errorMsg);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const shellProps = {
    className: "visual-shell",
    "data-visual-shell": "true",
    "data-visual-style": visual.style,
    "data-visual-theme": visual.theme,
  } as const;

  // 1. Estado Loading: no renderizar hijos privados
  if (status === "loading") {
    return (
      <div {...shellProps}>
        {visual.style === "ilustracion" && <IllustrationBackdrop />}
        <div className="vs-stage vs-stage-bare">
          <Masthead visual={visual} />
          <main
            className="visual-page-content vs-bare-content"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="visual-card text-center p-8">
              <p className="text-lg font-semibold">Cargando información del portal...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // 2. Estado Error: no renderizar hijos privados, permitir reintento
  if (status === "error") {
    return (
      <div {...shellProps}>
        {visual.style === "ilustracion" && <IllustrationBackdrop />}
        <div className="vs-stage vs-stage-bare">
          <Masthead visual={visual} />
          <main className="visual-page-content vs-bare-content" role="alert">
            <div className="visual-card p-6">
              <p className="vs-error-text font-semibold">
                {message || "Error al verificar la sesión académica."}
              </p>
              <button
                type="button"
                onClick={() => refresh()}
                className="btn-primary mt-4"
              >
                Reintentar
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // 3. Estado Unauthenticated: no renderizar hijos privados
  if (status === "unauthenticated") {
    return (
      <div {...shellProps}>
        {visual.style === "ilustracion" && <IllustrationBackdrop />}
        <div className="vs-stage vs-stage-bare">
          <Masthead visual={visual} />
          <main className="visual-page-content vs-bare-content" aria-live="polite">
            <p>Redirigiendo al inicio de sesión...</p>
          </main>
        </div>
      </div>
    );
  }

  const roleLabel = esAdmin ? "Administración" : "Alumno";
  const isIllustration = visual.style === "ilustracion";

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="visual-logout-btn"
    >
      <IconLogout size={20} />
      <span className="visual-logout-label">
        {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
      </span>
    </button>
  );

  const isDark = visual.theme === "oscuro";
  const themeButton = (
    <button
      type="button"
      onClick={() => setVisualTheme(isDark ? "claro" : "oscuro")}
      aria-pressed={isDark}
      className="visual-logout-btn visual-theme-btn"
    >
      {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
      <span className="visual-logout-label">
        {isDark ? "Tema claro" : "Tema oscuro"}
      </span>
    </button>
  );

  const renderNavItem = (item: NavEntry) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={appendVisualParams(item.href, visual)}
          aria-current={isActive ? "page" : undefined}
          data-tone={item.tone}
          className={`visual-nav-item ${isActive ? "is-active" : ""}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="visual-nav-icon">
            <Icon size={26} />
          </span>
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

  const userChip = student ? (
    <div className="vs-user-chip">
      <span className="vs-user-role">{roleLabel}</span>
      <span className="vs-user-name">
        {student.persona || student.numero_control}
      </span>
    </div>
  ) : null;

  // 4. Estado Authenticated: renderizar AppShell con navegación y children
  return (
    <div {...shellProps}>
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>

      {isIllustration && <IllustrationBackdrop />}

      <div className="vs-stage">
        <Masthead
          visual={visual}
          actions={
            isIllustration ? (
              <div className="vs-masthead-actions">
                {userChip}
                {themeButton}
                {logoutButton}
              </div>
            ) : null
          }
        >
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="visual-nav-menu"
            aria-label="Alternar menú de navegación"
            className="visual-mobile-toggle"
          >
            {mobileMenuOpen ? <IconClose size={24} /> : <IconMenu size={24} />}
          </button>
        </Masthead>

        <div
          id="visual-nav-menu"
          className={`visual-sidebar ${mobileMenuOpen ? "is-open" : ""}`}
        >
          <nav aria-label="Menú principal">
            <ul className="visual-nav-list">
              {NAV_ITEMS.map(renderNavItem)}

              {esAdmin && (
                <>
                  <li className="visual-nav-section-title">Administración</li>
                  {ADMIN_ITEMS.map(renderNavItem)}
                </>
              )}
            </ul>
          </nav>

          {!isIllustration && (
            <div className="visual-sidebar-footer">
              {userChip}
              {themeButton}
              {logoutButton}
            </div>
          )}
        </div>

        <div className="visual-main-area">
          {logoutError && (
            <div role="alert" aria-live="assertive" className="vs-logout-error">
              <div className="visual-card p-4">
                <p>{logoutError}</p>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="btn-secondary mt-2 text-sm"
                >
                  Reintentar cierre de sesión
                </button>
              </div>
            </div>
          )}

          <main
            key={student?.numero_control ?? "anonymous"}
            id="main-content"
            className="visual-page-content"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
