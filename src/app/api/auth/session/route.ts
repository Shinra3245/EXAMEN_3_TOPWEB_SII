import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import { setPrivateCacheHeaders } from "@/lib/security";
import { AuthenticationError, toSafeErrorResponse } from "@/lib/errors";
import { SiiRawStudent } from "@/types/sii";

export async function GET(req: NextRequest) {
  try {
    // 1. Validar cookie de sesión cifrada
    const session = await requireSession(req);

    // 2. Comprobar contra el servidor upstream que el token sigue siendo válido
    const rawStudent = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      session.token
    );
    const student = normalizeStudentProfile(rawStudent);
    if (student.numero_control !== session.numero_control) {
      throw new AuthenticationError("SESSION_IDENTITY_MISMATCH", "La identidad institucional no coincide con la sesión");
    }

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
