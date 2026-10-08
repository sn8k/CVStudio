import { NextResponse } from "next/server";
import { isKnownRobot } from "@/lib/ai-crawlers";
import {
  AUDIENCE_DAY_COOKIE,
  AUDIENCE_OPTOUT_COOKIE,
  audienceCookieBaseOptions,
  getRequestCookie,
  hasAllowedAudienceOrigin,
  isAudienceMeasurementEnabled,
} from "@/lib/audience-cookies";
import { getNextParisDayBoundary, recordDailyUniqueVisit } from "@/lib/visit-stats";

export const dynamic = "force-dynamic";

function emptyResponse(status = 204) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleAudienceRequest(request: Request, now = new Date()) {
  if (!hasAllowedAudienceOrigin(request)) return emptyResponse(403);

  const response = emptyResponse();
  if (!await isAudienceMeasurementEnabled()) return response;

  if (getRequestCookie(request, AUDIENCE_OPTOUT_COOKIE) === "1") {
    response.cookies.set(AUDIENCE_DAY_COOKIE, "", { ...audienceCookieBaseOptions, expires: new Date(0), maxAge: 0 });
    return response;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (isKnownRobot(userAgent) || getRequestCookie(request, AUDIENCE_DAY_COOKIE) === "1") return response;

  if (await recordDailyUniqueVisit(userAgent, now)) {
    response.cookies.set(AUDIENCE_DAY_COOKIE, "1", { ...audienceCookieBaseOptions, expires: getNextParisDayBoundary(now) });
  }
  return response;
}

export async function POST(request: Request) {
  return handleAudienceRequest(request);
}
