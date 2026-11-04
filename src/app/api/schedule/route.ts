import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeSchedule } from "@/lib/normalizers/schedule";
import { setPrivateCacheHeaders } from "@/lib/security";
import { toSafeErrorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const rawData = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.SCHEDULE,
      session.token
    );

    const schedule = normalizeSchedule(rawData);

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return NextResponse.json(
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
