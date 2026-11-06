"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiClientError } from "@/lib/api-client";
import styles from "./login.module.css";

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
    <main className={styles.loginPage}>
      <figure className={styles.banner} aria-hidden="true">
        <Image
          src="/assets/pixel-mosaic-login.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.bannerImage}
        />
        <div className={styles.bannerFade} />
      </figure>

      <div className={styles.loginLayout}>
        <section className={styles.loginCard} aria-labelledby="login-heading">
          <header className={styles.loginHeader}>
            <p className={styles.eyebrow}>PORTAL ACADÉMICO · SII</p>
            <h1 id="login-heading">Inicia sesión</h1>
            <p>Accede con tu correo institucional y contraseña.</p>
          </header>

          {status === "loading" && (
            <p role="status" className={styles.notice}>
              <progress aria-label="Verificando sesión" /> Verificando sesión…
            </p>
          )}
          {status === "error" && (
            <div role="alert" className={styles.error}>
              <p>
                {sessionMessage || "No se pudo verificar la sesión existente."}
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  void refresh();
                }}
              >
                Reintentar verificación
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <fieldset disabled={isSubmitting} className={styles.fieldset}>
              <legend className="sr-only">Credenciales de acceso</legend>

              {generalError && (
                <div role="alert" className={styles.error}>
                  <p>{generalError}</p>
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor="email">Correo institucional</label>
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
                  placeholder="nombre@institucion.edu.mx"
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className={styles.fieldError}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Contraseña</label>
                <div className={styles.passwordField}>
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
                    placeholder="Tu contraseña del SII"
                  />
                  <button
                    type="button"
                    className={styles.showPasswordButton}
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" role="alert" className={styles.fieldError}>
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={styles.submitButton}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Iniciando sesión…" : "Iniciar sesión"}
              </button>
            </fieldset>
          </form>
          <p className={styles.securityNote}>
            El acceso se verifica de forma segura con el SII.
          </p>
        </section>

        <figure className={styles.mascot}>
          <div
            className={styles.mascotSprite}
            role="img"
            aria-label="Juanito, el lince pixelado, escribe en su computadora."
          />
          <figcaption>Juanito te acompaña</figcaption>
        </figure>
      </div>
    </main>
  );
}
