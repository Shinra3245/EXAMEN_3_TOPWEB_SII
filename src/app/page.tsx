"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { status } = useAuth();
  const router = useRouter();

  // Reemplaza la portada en el historial al enviar al usuario a su destino.
  useEffect(() => {
    // La portada solo decide el destino según el estado de autenticación.
    if (status === "authenticated") {
      router.replace("/dashboard");
    } else if (status === "unauthenticated" || status === "error") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <main className="p-8 font-sans">
      <h1 className="text-xl font-bold">Portal académico</h1>
      {/* Mantiene un mensaje accesible mientras se consulta o cambia de ruta. */}
      <p aria-live="polite" className="mt-2 text-gray-600">
        {status === "loading" ? "Verificando sesión..." : "Redirigiendo..."}
      </p>
    </main>
  );
}
