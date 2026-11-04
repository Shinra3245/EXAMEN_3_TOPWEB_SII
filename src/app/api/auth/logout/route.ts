import { NextRequest, NextResponse } from "next/server";
import {
  validateSameOrigin,
  buildClearCookieHeader,
  setPrivateCacheHeaders,
} from "@/lib/security";
import { toSafeErrorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    // 1. Exigir validación estricta de Origin (mismo origen requerido)
    validateSameOrigin(req);

    // 2. Limpiar cookie de sesión en el cliente
    const isHttps = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
    const clearCookieHeader = buildClearCookieHeader(isHttps);

    const headers = new Headers();
    headers.append("Set-Cookie", clearCookieHeader);
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
