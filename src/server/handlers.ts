import "server-only";
import {
  validateSameOrigin,
  buildSessionCookieHeader,
  buildClearCookieHeader,
  setPrivateCacheHeaders,
} from "@/lib/security";
import { authenticateSii, fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import {
  decodeJwtPayload,
  calculateSessionExpiration,
  encryptSession,
} from "@/lib/crypto";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import { normalizeGrades } from "@/lib/normalizers/grades";
import { normalizeKardex } from "@/lib/normalizers/kardex";
import { normalizeSchedule } from "@/lib/normalizers/schedule";
import { requireSession } from "@/lib/session";
import { readBoundedText } from "@/lib/bounded-json";
import { getSessionSecretBytes, getEnvVar } from "@/config/env";
import {
  AppError,
  AuthenticationError,
  toSafeErrorResponse,
} from "@/lib/errors";
import type { SiiRawStudent } from "@/types/sii";

/**
 * GET /api/health
 */
export async function handleHealth(_req?: Request): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "sii-cloudflare-backend",
      version: "0.1.0",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

/**
 * POST /api/auth/login
 */
export async function handleLogin(req: Request): Promise<Response> {
  try {
    // 1. Exigir validación estricta de Origin (mismo origen requerido)
    validateSameOrigin(req);

    // 2. Comprobar existencia y validez de la configuración obligatoria (503 si falta)
    getSessionSecretBytes();

    // 3. Extraer y validar el cuerpo de la petición (máx 16 KB)
    let body: { email?: unknown; password?: unknown };
    try {
      const parsed = JSON.parse(await readBoundedText(req, 16384));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid body");
      }
      body = parsed;
    } catch {
      throw new AppError(
        400,
        "INVALID_REQUEST_BODY",
        "El cuerpo de la petición debe ser un JSON válido"
      );
    }

    const { email, password } = body;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password.length ||
      email.length > 254 ||
      password.length > 4096
    ) {
      throw new AppError(
        400,
        "MISSING_CREDENTIALS",
        "Correo institucional y contraseña son requeridos"
      );
    }

    // 4. Autenticar upstream contra SII (preservando contraseña literal)
    const { token } = await authenticateSii(email.trim(), password);

    // 5. Probar perfil upstream para verificar identidad
    const rawStudent = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      token
    );
    const normalizedProfile = normalizeStudentProfile(rawStudent);

    // 6. Decodificar payload para leer exp de diagnóstico
    const decoded = decodeJwtPayload(token);
    const tokenExp = typeof decoded?.exp === "number" ? decoded.exp : undefined;
    const sessionExp = calculateSessionExpiration(tokenExp);

    // 7. Cifrar la sesión completa con AES-GCM (nunca enviar token plano al cliente)
    const sessionPayload = {
      token,
      numero_control: normalizedProfile.numero_control,
      email: normalizedProfile.email || email.trim(),
      exp: sessionExp,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const encryptedCookie = await encryptSession(sessionPayload);

    // 8. Preparar respuesta con cookie HttpOnly y sin caché
    const maxAgeSeconds = sessionExp - Math.floor(Date.now() / 1000);
    const isHttps =
      new URL(req.url).protocol === "https:" ||
      getEnvVar("NODE_ENV") === "production";
    const cookieHeader = buildSessionCookieHeader(
      encryptedCookie,
      maxAgeSeconds,
      isHttps
    );

    if (cookieHeader.length > 3800) {
      throw new AppError(
        502,
        "SESSION_TOO_LARGE",
        "Sesión institucional no compatible"
      );
    }

    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          user: normalizedProfile,
          expiresAt: sessionExp,
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo durante el inicio de sesión");
  }
}

/**
 * GET /api/auth/session
 */
export async function handleSession(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);

    const rawStudent = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      session.token
    );
    const student = normalizeStudentProfile(rawStudent);
    if (student.numero_control !== session.numero_control) {
      throw new AuthenticationError(
        "SESSION_IDENTITY_MISMATCH",
        "La identidad institucional no coincide con la sesión"
      );
    }

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          authenticated: true,
          student,
          expiresAt: session.exp,
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al consultar la sesión activa");
  }
}

/**
 * POST /api/auth/logout
 */
export async function handleLogout(req: Request): Promise<Response> {
  try {
    validateSameOrigin(req);

    const isHttps =
      new URL(req.url).protocol === "https:" ||
      getEnvVar("NODE_ENV") === "production";
    const clearCookieHeader = buildClearCookieHeader(isHttps);

    const headers = new Headers();
    headers.append("Set-Cookie", clearCookieHeader);
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          message: "Sesión finalizada exitosamente",
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo durante el cierre de sesión");
  }
}

/**
 * GET /api/student
 */
export async function handleStudent(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      session.token
    );

    const student = normalizeStudentProfile(rawData);
    if (student.numero_control !== session.numero_control) {
      throw new AuthenticationError(
        "SESSION_IDENTITY_MISMATCH",
        "La identidad institucional no coincide con la sesión"
      );
    }

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: student,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al obtener perfil del estudiante");
  }
}

/**
 * GET /api/grades
 */
export async function handleGrades(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.GRADES,
      session.token
    );

    const grades = normalizeGrades(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: grades,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al obtener calificaciones");
  }
}

/**
 * GET /api/kardex
 */
export async function handleKardex(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.KARDEX,
      session.token
    );

    const kardex = normalizeKardex(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: kardex,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al obtener historial de kardex");
  }
}

/**
 * GET /api/schedule
 */
export async function handleSchedule(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.SCHEDULE,
      session.token
    );

    const schedule = normalizeSchedule(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: schedule,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al consultar horarios");
  }
}
