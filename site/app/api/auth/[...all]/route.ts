import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export function POST(request: Request) {
  // The seed uses auth.api.signUpEmail internally; registration is never public.
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname).toLowerCase();
  } catch {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }
  if (pathname === "/api/auth/sign-up" || pathname.startsWith("/api/auth/sign-up/")) {
    return Response.json({ error: "Registration is disabled" }, { status: 403 });
  }
  return handlers.POST(request);
}
