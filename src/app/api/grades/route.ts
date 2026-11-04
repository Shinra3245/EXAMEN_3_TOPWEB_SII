import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeGrades } from "@/lib/normalizers/grades";
import { setPrivateCacheHeaders } from "@/lib/security";
import { toSafeErrorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.GRADES,
      session.token
    );

    const grades = normalizeGrades(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
