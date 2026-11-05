import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Modo Cloudflare Workers Free: servir imágenes sin optimizador de pago
    unoptimized: true,
  },
};

export default nextConfig;
