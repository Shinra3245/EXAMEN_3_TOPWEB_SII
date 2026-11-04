import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import { setPrivateCacheHeaders } from "@/lib/security";
import { AuthenticationError, toSafeErrorResponse } from "@/lib/errors";
import { SiiRawStudent } from "@/types/sii";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<SiiRawStudent>(
      SII_ENDPOINTS.STUDENT,
      session.token
    );

    const student = normalizeStudentProfile(rawData);
    if (student.numero_control !== session.numero_control) {
      throw new AuthenticationError("SESSION_IDENTITY_MISMATCH", "La identidad institucional no coincide con la sesión");
    }

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
