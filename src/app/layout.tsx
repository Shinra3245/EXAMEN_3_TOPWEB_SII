import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SII Service Baseline",
  description: "Baseline funcional Next.js + Cloudflare Workers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
