"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

interface AppShellProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calificaciones", label: "Calificaciones" },
  { href: "/kardex", label: "Kardex" },
  { href: "/horario", label: "Horario" },
];

export function AppShell({ children }: AppShellProps) {
  const { student, esAdmin, status, message, refresh, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const navLinks = [
    ...NAV_LINKS,
    { href: "/reportes", label: "Reportes" },
    ...(esAdmin
      ? [
          { href: "/admin/reportes", label: "Admin: Reportes" },
          { href: "/admin/tipos", label: "Admin: Tipos" },
        ]
      : []),
  ];

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

  // 1. Estado Loading: no renderizar hijos privados
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <header className="border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold">Portal académico</h1>
        </header>
        <main className="controls p-8" aria-busy="true" aria-live="polite">
          <p>Cargando información del portal...</p>
        </main>
      </div>
    );
  }

  // 2. Estado Error: no renderizar hijos privados, permitir reintento
  if (status === "error") {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <header className="border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold">Portal académico</h1>
        </header>
        <main className="controls p-8" role="alert">
          <div className="error">
            <p>{message || "Error al verificar la sesión académica."}</p>
            <button type="button" onClick={() => refresh()} className="mt-2">
              Reintentar
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 3. Estado Unauthenticated: no renderizar hijos privados
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <header className="border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold">Portal académico</h1>
        </header>
        <main className="controls p-8" aria-live="polite">
          <p>Redirigiendo al inicio de sesión...</p>
        </main>
      </div>
    );
  }

  // 4. Estado Authenticated: renderizar AppShell con navegación y children
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <a href="#main-content" className="sr-only">
        Saltar al contenido principal
      </a>

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xl font-bold">Portal académico</span>
              {student && (
                <div className="text-sm text-gray-600">
                  <span>{student.persona || student.numero_control}</span>
                  {student.numero_control && (
                    <span className="ml-2">({student.numero_control})</span>
                  )}
                </div>
              )}
            </div>

            {/* Botón de menú móvil */}
            <div className="sm:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-controls="academic-nav-menu"
                aria-label="Alternar menú de navegación"
              >
                {mobileMenuOpen ? "Cerrar menú" : "Menú"}
              </button>
            </div>

            {/* Navegación en escritorio */}
            <nav
              className="hidden sm:flex sm:items-center sm:gap-4"
              aria-label="Navegación principal"
            >
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? "font-semibold underline"
                        : "text-gray-700 hover:underline"
                    }
                  >
                    {link.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label="Cerrar sesión"
              >
                {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
              </button>
            </nav>
          </div>

          {/* Menú móvil desplegable */}
          {mobileMenuOpen && (
            <nav
              id="academic-nav-menu"
              className="mt-3 border-t border-gray-200 pt-3 sm:hidden"
              aria-label="Navegación móvil"
            >
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={isActive ? "page" : undefined}
                        className={
                          isActive
                            ? "block font-semibold underline py-1"
                            : "block text-gray-700 hover:underline py-1"
                        }
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
                <li className="pt-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full text-left"
                  >
                    {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      {logoutError && (
        <aside
          role="alert"
          aria-live="assertive"
          className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8"
        >
          <div className="error">
            <p>{logoutError}</p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="mt-2"
            >
              Reintentar cierre de sesión
            </button>
          </div>
        </aside>
      )}

      <main
        key={student?.numero_control ?? "anonymous"}
        id="main-content"
        className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"
      >
        {children}
      </main>
    </div>
  );
}
