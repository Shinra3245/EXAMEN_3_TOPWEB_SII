"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    } else if (status === "unauthenticated" || status === "error") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <main className="p-8 font-sans">
      <h1 className="text-xl font-bold">Portal académico</h1>
      <p aria-live="polite" className="mt-2 text-gray-600">
        {status === "loading" ? "Verificando sesión..." : "Redirigiendo..."}
      </p>
    </main>
  );
}
