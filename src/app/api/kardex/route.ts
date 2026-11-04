import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeKardex } from "@/lib/normalizers/kardex";
import { setPrivateCacheHeaders } from "@/lib/security";
import { toSafeErrorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.KARDEX,
      session.token
    );

    const kardex = normalizeKardex(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
