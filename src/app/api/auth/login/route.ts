import { NextRequest, NextResponse } from "next/server";
import {
  validateSameOrigin,
  buildSessionCookieHeader,
  setPrivateCacheHeaders,
} from "@/lib/security";
import { authenticateSii, fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import {
  decodeJwtPayload,
  calculateSessionExpiration,
  encryptSession,
} from "@/lib/crypto";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import { toSafeErrorResponse } from "@/lib/errors";
import { getSessionSecretBytes } from "@/config/env";
import { readBoundedText } from "@/lib/bounded-json";
import { AppError } from "@/lib/errors";
import { SiiRawStudent } from "@/types/sii";

export async function POST(req: NextRequest) {
  try {
    // 1. Exigir validación estricta de Origin (mismo origen requerido)
    validateSameOrigin(req);

    getSessionSecretBytes();

    // 2. Extraer y validar el cuerpo de la petición
    let body: { email?: unknown; password?: unknown };
    try {
      const parsed = JSON.parse(await readBoundedText(req, 16384));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
      body = parsed;
    } catch {
      throw new AppError(400,
        "INVALID_REQUEST_BODY",
        "El cuerpo de la petición debe ser un JSON válido"
      );
    }

    const { email, password } = body;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password.length || email.length > 254 || password.length > 4096
    ) {
      throw new AppError(400,
        "MISSING_CREDENTIALS",
        "Correo institucional y contraseña son requeridos"
      );
    }

    // 3. Autenticar upstream contra SII (ruta real message.login.token)
    const { token } = await authenticateSii(email.trim(), password);

    // 4. Probar perfil upstream para verificar identidad
    const rawStudent = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      token
    );
    const normalizedProfile = normalizeStudentProfile(rawStudent);

    // 5. Decodificar payload para leer exp de diagnóstico
    const decoded = decodeJwtPayload(token);
    const tokenExp = typeof decoded?.exp === "number" ? decoded.exp : undefined;
    const sessionExp = calculateSessionExpiration(tokenExp);

    // 6. Cifrar la sesión completa con AES-GCM (nunca enviar token plano al cliente)
    const sessionPayload = {
      token,
      numero_control: normalizedProfile.numero_control,
      email: normalizedProfile.email || email.trim(),
      exp: sessionExp,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const encryptedCookie = await encryptSession(sessionPayload);

    // 7. Preparar respuesta con cookie HttpOnly y sin caché
    const maxAgeSeconds = sessionExp - Math.floor(Date.now() / 1000);
    const isHttps = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
    const cookieHeader = buildSessionCookieHeader(
      encryptedCookie,
      maxAgeSeconds,
      isHttps
    );

    if (cookieHeader.length > 3800) throw new AppError(502,"SESSION_TOO_LARGE","Sesión institucional no compatible");
    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
