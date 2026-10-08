import { getContactFormConfig } from "@/lib/contact-config";
import { sendContactMessage } from "@/lib/contact-mailer";
import { checkContactRateLimit, getContactClientKey, recordSuccessfulContact } from "@/lib/contact-rate-limit";
import { CONTACT_MAX_BODY_BYTES, contactFormSchema, getContactFieldErrors } from "@/lib/contact-schema";
import { contactFeedback, type ContactStatus } from "@/lib/contact-types";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { safeSmtpErrorDetails } from "@/lib/smtp-error";

export const dynamic = "force-dynamic";

type ContactApiBody = {
  ok: boolean;
  code: string;
  message: string;
  errors?: Record<string, string>;
};

class BodyTooLargeError extends Error {}

function expectsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function contactResponse(request: Request, body: ContactApiBody, status: number, redirectStatus: ContactStatus, extraHeaders?: HeadersInit) {
  const headers = { "Cache-Control": "no-store", ...extraHeaders };
  if (expectsJson(request)) return Response.json(body, { status, headers });
  const location = new URL("/", request.url);
  location.searchParams.set("contact", redirectStatus);
  location.hash = "contact";
  return new Response(null, { status: 303, headers: { ...headers, Location: location.toString() } });
}

function hasAllowedOrigin(request: Request) {
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

async function readBodyText(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CONTACT_MAX_BODY_BYTES) throw new BodyTooLargeError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CONTACT_MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const body = await readBodyText(request);
  if (contentType === "application/json") return JSON.parse(body) as unknown;
  if (contentType === "application/x-www-form-urlencoded") {
    const values = new URLSearchParams(body);
    return {
      name: values.get("name") ?? "",
      email: values.get("email") ?? "",
      message: values.get("message") ?? "",
      companyWebsite: values.get("companyWebsite") ?? "",
      "cf-turnstile-response": values.get("cf-turnstile-response") ?? "",
    };
  }
  throw new TypeError("Unsupported content type");
}

function splitContactPayload(payload: unknown) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  return {
    contact: {
      name: value.name,
      email: value.email,
      message: value.message,
      companyWebsite: value.companyWebsite,
    },
    turnstileToken: typeof value["cf-turnstile-response"] === "string" ? value["cf-turnstile-response"] : "",
  };
}

type ContactDependencies = {
  verifyTurnstile?: typeof verifyTurnstileToken;
  sendMessage?: typeof sendContactMessage;
};

export async function handleContactRequest(request: Request, dependencies: ContactDependencies = {}) {
  if (!hasAllowedOrigin(request)) {
    return contactResponse(request, { ok: false, code: "ORIGIN_REJECTED", message: contactFeedback.error }, 403, "error");
  }

  const config = await getContactFormConfig();
  if (!config) {
    return contactResponse(request, { ok: false, code: "NOT_CONFIGURED", message: contactFeedback.unavailable }, 503, "unavailable");
  }

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch (error) {
    const status = error instanceof BodyTooLargeError ? 413 : 400;
    return contactResponse(request, { ok: false, code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY", message: contactFeedback.invalid }, status, "invalid");
  }

  const { contact, turnstileToken } = splitContactPayload(payload);
  if (String(contact.companyWebsite ?? "").trim()) {
    return contactResponse(request, { ok: true, code: "SENT", message: contactFeedback.sent }, 200, "sent");
  }

  const parsed = contactFormSchema.safeParse(contact);
  if (!parsed.success) {
    return contactResponse(request, { ok: false, code: "VALIDATION_ERROR", message: contactFeedback.invalid, errors: getContactFieldErrors(parsed.error) }, 400, "invalid");
  }

  const clientKey = getContactClientKey(request.headers);
  const rateLimit = checkContactRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return contactResponse(request, { ok: false, code: "RATE_LIMITED", message: contactFeedback["rate-limited"] }, 429, "rate-limited", { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  if (!turnstileToken) {
    return contactResponse(request, { ok: false, code: "TURNSTILE_REQUIRED", message: contactFeedback.verification }, 400, "verification");
  }

  const verification = await (dependencies.verifyTurnstile ?? verifyTurnstileToken)(config.turnstile, turnstileToken);
  if (!verification.ok) {
    const unavailable = verification.kind === "unavailable";
    return contactResponse(request, {
      ok: false,
      code: unavailable ? "TURNSTILE_UNAVAILABLE" : "TURNSTILE_FAILED",
      message: contactFeedback.verification,
    }, unavailable ? 503 : 400, "verification");
  }

  try {
    await (dependencies.sendMessage ?? sendContactMessage)(config.contact, parsed.data);
    recordSuccessfulContact(clientKey);
    return contactResponse(request, { ok: true, code: "SENT", message: contactFeedback.sent }, 200, "sent");
  } catch (error) {
    console.error("Échec SMTP du formulaire de contact.", safeSmtpErrorDetails(error, [
      config.contact.password,
      config.contact.user,
      config.turnstile.secretKey,
      process.env.SETTINGS_ENCRYPTION_KEY,
      turnstileToken,
      parsed.data.name,
      parsed.data.email,
      parsed.data.message,
    ]));
    return contactResponse(request, { ok: false, code: "DELIVERY_FAILED", message: contactFeedback.error }, 502, "error");
  }
}

export async function POST(request: Request) {
  return handleContactRequest(request);
}
