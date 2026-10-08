import { NextResponse } from "next/server";
import {
  AUDIENCE_DAY_COOKIE,
  AUDIENCE_OPTOUT_COOKIE,
  audienceCookieBaseOptions,
  hasAllowedAudienceOrigin,
} from "@/lib/audience-cookies";

export const dynamic = "force-dynamic";

function redirectToPrivacy(request: Request, status: "disabled" | "enabled") {
  const location = new URL("/confidentialite", request.url);
  location.searchParams.set("audience", status);
  location.hash = "audience-control";
  return NextResponse.redirect(location, { status: 303, headers: { "Cache-Control": "no-store" } });
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", { ...audienceCookieBaseOptions, expires: new Date(0), maxAge: 0 });
}

export async function handleAudiencePreference(request: Request, now = new Date()) {
  if (!hasAllowedAudienceOrigin(request)) return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

  const form = await request.formData();
  const choice = form.get("audience");
  if (choice !== "disable" && choice !== "enable") return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });

  const response = redirectToPrivacy(request, choice === "disable" ? "disabled" : "enabled");
  clearCookie(response, AUDIENCE_DAY_COOKIE);
  if (choice === "disable") {
    const expires = new Date(now);
    expires.setUTCMonth(expires.getUTCMonth() + 13);
    response.cookies.set(AUDIENCE_OPTOUT_COOKIE, "1", { ...audienceCookieBaseOptions, expires });
  } else {
    clearCookie(response, AUDIENCE_OPTOUT_COOKIE);
  }
  return response;
}

export async function POST(request: Request) {
  return handleAudiencePreference(request);
}
