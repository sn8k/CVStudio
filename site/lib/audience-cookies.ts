export const AUDIENCE_DAY_COOKIE = "cv_audience_day";
export const AUDIENCE_OPTOUT_COOKIE = "cv_audience_optout";

export const audienceCookieBaseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function isAudienceMeasurementEnabled() {
  return (await getEffectiveSystemSettings()).audienceMeasurementEnabled;
}

export function getRequestCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return undefined;
}

export function hasAllowedAudienceOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const configuredOrigin = process.env.PUBLIC_SITE_URL;
  try {
    const expected = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
    if (process.env.NODE_ENV === "production" && !configuredOrigin) return false;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
import { getEffectiveSystemSettings } from "@/lib/system-settings";
