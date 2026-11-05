"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiClientError } from "@/lib/api-client";

export default function LoginPage() {
  const { login, status, message: sessionMessage, refresh } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = "El correo institucional es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Formato de correo institucional no válido.";
    }

    if (!password) {
      errors.password = "La contraseña es obligatoria.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Prevención de doble submit
    if (isSubmitting) {
      return;
    }

    setGeneralError(null);
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    const submittedPassword = password;
    // Limpiar contraseña inmediatamente después del intento
    setPassword("");

    try {
      await login(email.trim(), submittedPassword);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setGeneralError(
            "Correo institucional o contraseña incorrectos. Verifique sus datos.",
          );
        } else if (err.status === 503) {
          setGeneralError(
            "El servicio institucional no está disponible temporalmente. Intente más tarde.",
          );
        } else {
          setGeneralError(
            err.message || "Error al iniciar sesión. Inténtelo nuevamente.",
          );
        }
      } else {
        setGeneralError(
          "Error de comunicación. Verifique su conexión e intente nuevamente.",
        );
      }
    } finally {
      setIsSubmitting(false);
      // Garantizar que la contraseña siempre se limpie
      setPassword("");
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <main className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Portal académico</h1>
          <p className="mt-1 text-sm text-gray-600">
            Accede con el correo y la contraseña del SII
          </p>
        </header>

        <section aria-labelledby="login-heading" className="bg-white">
          <h2 id="login-heading" className="sr-only">
            Formulario de inicio de sesión
          </h2>

          {status === "loading" && <p role="status"><progress aria-label="Verificando sesión" /> Verificando sesión…</p>}
          {status === "error" && <div role="alert" className="error"><p>{sessionMessage || "No se pudo verificar la sesión existente."}</p><button type="button" onClick={() => { void refresh(); }}>Reintentar verificación de sesión</button></div>}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <fieldset disabled={isSubmitting} className="space-y-4">
              <legend className="sr-only">Credenciales de acceso</legend>

              {generalError && (
                <div role="alert" className="error">
                  <p>{generalError}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Correo institucional
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={
                    fieldErrors.email ? "email-error" : undefined
                  }
                  className="w-full"
                  placeholder="Correo registrado en el SII"
                />
                {fieldErrors.email && (
                  <p
                    id="email-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Contraseña
                </label>
                <div className="controls flex gap-2">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          password: undefined,
                        }));
                      }
                    }}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={
                      fieldErrors.password ? "password-error" : undefined
                    }
                    className="flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p
                    id="password-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      </main>
    </div>
  );
}
