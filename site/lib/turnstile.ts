import { z } from "zod";
import type { TurnstileConfig } from "@/lib/contact-config";

export const TURNSTILE_ACTION = "contact";
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TIMEOUT_MS = 5_000;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export type TurnstileVerification =
  | { ok: true }
  | { ok: false; kind: "failed" | "unavailable" };

type TurnstileVerificationOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function isExpectedHostname(config: TurnstileConfig, hostname: string | undefined) {
  return hostname === config.expectedHostname;
}

function isExpectedAction(action: string | undefined) {
  return action === TURNSTILE_ACTION;
}

export async function verifyTurnstileToken(
  config: TurnstileConfig,
  token: string,
  options: TurnstileVerificationOptions = {},
): Promise<TurnstileVerification> {
  if (!token || token.length > 2048) return { ok: false, kind: "failed" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TURNSTILE_TIMEOUT_MS);
  const body = new URLSearchParams({ secret: config.secretKey, response: token });

  try {
    const response = await (options.fetchImpl ?? globalThis.fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, kind: "unavailable" };

    const parsed = siteverifyResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, kind: "unavailable" };
    if (!parsed.data.success) return { ok: false, kind: "failed" };
    if (config.officialTestKeys) return { ok: true };
    if (!isExpectedHostname(config, parsed.data.hostname) || !isExpectedAction(parsed.data.action)) {
      return { ok: false, kind: "failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error(error instanceof DOMException && error.name === "AbortError"
      ? "Délai dépassé pendant la vérification Turnstile."
      : "Échec réseau pendant la vérification Turnstile.");
    return { ok: false, kind: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
