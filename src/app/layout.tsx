import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const pixelBodyFont = localFont({
  src: "../../public/assets/fonts/VT323-Regular.ttf",
  variable: "--font-pixel-body",
  display: "swap",
});

const pixelDisplayFont = localFont({
  src: "../../public/assets/fonts/PressStart2P-Regular.ttf",
  variable: "--font-pixel-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portal académico",
  description: "Portal académico institucional",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${pixelBodyFont.variable} ${pixelDisplayFont.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
