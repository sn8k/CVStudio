import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUCCESSFUL_MESSAGES = 3;
const MAX_ATTEMPTS_PER_CLIENT = 10;
const MAX_ATTEMPTS_GLOBAL = 120;
const MAX_CLIENTS = 5000;

type RateLimitStore = Map<string, number[]>;
type ContactRateLimitState = { successful: RateLimitStore; attempts: RateLimitStore; totalAttempts: number[] };
const globalRateLimit = globalThis as typeof globalThis & { contactRateLimitState?: ContactRateLimitState };
const state: ContactRateLimitState = globalRateLimit.contactRateLimitState ?? { successful: new Map(), attempts: new Map(), totalAttempts: [] };
globalRateLimit.contactRateLimitState = state;

function cleanupStore(store: RateLimitStore, now: number) {
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

function cleanup(now: number) {
  cleanupStore(state.successful, now);
  cleanupStore(state.attempts, now);
  state.totalAttempts = state.totalAttempts.filter((timestamp) => now - timestamp < WINDOW_MS);
}

export function getContactClientKey(headers: Headers) {
  // X-Real-IP must be replaced by the trusted reverse proxy, never forwarded from the client.
  const address = (headers.get("x-real-ip")?.trim() || "unknown").slice(0, 200);
  return createHash("sha256").update(`contact:${address}`).digest("hex");
}

function limitResult(timestamps: number[], limit: number, now: number) {
  if (timestamps.length < limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - timestamps[0])) / 1000)) };
}

export function consumeContactAttempt(clientKey: string, now = Date.now()) {
  cleanup(now);
  const clientAttempts = state.attempts.get(clientKey) ?? [];
  const globalLimit = limitResult(state.totalAttempts, MAX_ATTEMPTS_GLOBAL, now);
  const clientLimit = limitResult(clientAttempts, MAX_ATTEMPTS_PER_CLIENT, now);
  if (!globalLimit.allowed) return globalLimit;
  if (!clientLimit.allowed) return clientLimit;
  state.attempts.set(clientKey, [...clientAttempts, now]);
  state.totalAttempts.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkContactRateLimit(clientKey: string, now = Date.now()) {
  cleanup(now);
  return limitResult(state.successful.get(clientKey) ?? [], MAX_SUCCESSFUL_MESSAGES, now);
}

export function recordSuccessfulContact(clientKey: string, now = Date.now()) {
  cleanup(now);
  state.successful.set(clientKey, [...(state.successful.get(clientKey) ?? []), now]);
}

export function resetContactRateLimitForTests() {
  state.successful.clear();
  state.attempts.clear();
  state.totalAttempts = [];
}
