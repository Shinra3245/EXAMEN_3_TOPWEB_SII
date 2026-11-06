import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export default function AcademicLayout({ children }: { children: ReactNode }) {
  // Agrupa las páginas académicas bajo la navegación y estructura común.
  // El layout raíz mantiene disponible el contexto de sesión para estas rutas.
  return <AppShell>{children}</AppShell>;
}
