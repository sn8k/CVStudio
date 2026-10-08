import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUCCESSFUL_MESSAGES = 3;
const MAX_CLIENTS = 5000;

type RateLimitStore = Map<string, number[]>;
const globalRateLimit = globalThis as typeof globalThis & { contactRateLimitStore?: RateLimitStore };
const store = globalRateLimit.contactRateLimitStore ?? new Map<string, number[]>();
globalRateLimit.contactRateLimitStore = store;

function cleanup(now: number) {
  for (const [key, timestamps] of store) {
    const active = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (active.length === 0) store.delete(key);
    else if (active.length !== timestamps.length) store.set(key, active);
  }
  while (store.size > MAX_CLIENTS) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

export function getContactClientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = (forwarded || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 200);
  return createHash("sha256").update(`contact:${address}`).digest("hex");
}

export function checkContactRateLimit(clientKey: string, now = Date.now()) {
  cleanup(now);
  const timestamps = store.get(clientKey) ?? [];
  if (timestamps.length < MAX_SUCCESSFUL_MESSAGES) return { allowed: true, retryAfterSeconds: 0 };
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - timestamps[0])) / 1000));
  return { allowed: false, retryAfterSeconds };
}

export function recordSuccessfulContact(clientKey: string, now = Date.now()) {
  cleanup(now);
  store.set(clientKey, [...(store.get(clientKey) ?? []), now]);
}

export function resetContactRateLimitForTests() {
  store.clear();
}

