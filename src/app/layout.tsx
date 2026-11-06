import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

// Define el título y la descripción comunes del portal.
export const metadata: Metadata = {
  title: "Portal académico",
  description: "Portal académico institucional",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El idioma raíz también define el contexto para las páginas anidadas.
  return (
    <html lang="es">
      <body>
        {/* Comparte el estado de sesión con todas las rutas de la aplicación. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
