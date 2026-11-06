import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que la insignia de desarrollo cubra controles en la vista local.
  devIndicators: false,
  images: {
    // Modo Cloudflare Workers Free: servir imágenes sin optimizador de pago
    unoptimized: true,
  },
};

export default nextConfig;
