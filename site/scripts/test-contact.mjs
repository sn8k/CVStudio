import "dotenv/config";
import assert from "node:assert/strict";
import { copyFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { parse } from "dotenv";
import { deployMigrationsOnCopy } from "./test-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
const databasePath = fileURLToPath(new URL("../.test-artifacts/contact.db", import.meta.url));
const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const baseURL = "http://localhost:3000";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");

await mkdir(artifacts, { recursive: true });
await copyFile(sourceDatabase, databasePath);
const exampleEnvironment = parse(await readFile(new URL("../.env.example", import.meta.url)));
for (const [key, value] of Object.entries(exampleEnvironment)) {
  if (key.startsWith("CONTACT_") || key.startsWith("TURNSTILE_") || key === "SETTINGS_ENCRYPTION_KEY") process.env[key] = value;
}
delete process.env.CONTACT_SMTP_USER;
delete process.env.CONTACT_SMTP_PASSWORD;
Object.assign(process.env, {
  DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
  BETTER_AUTH_URL: baseURL,
  PUBLIC_SITE_URL: baseURL,
});
deployMigrationsOnCopy(root, databasePath);

const { handleContactRequest } = await import("../app/api/contact/route.ts");
const { getContactTestDeliveries, resetContactTestDeliveries } = await import("../lib/contact-mailer.ts");
const { resetContactRateLimitForTests } = await import("../lib/contact-rate-limit.ts");
const { getTurnstileConfig } = await import("../lib/contact-config.ts");
const { verifyTurnstileToken } = await import("../lib/turnstile.ts");
const { prisma } = await import("../lib/prisma.ts");
const { encryptSettingsSecret } = await import("../lib/settings-crypto.ts");
const { safeSmtpErrorDetails } = await import("../lib/smtp-error.ts");

function contactRequest(data, { ip = "198.51.100.10", origin = baseURL, accept = "application/json" } = {}) {
  return new Request(`${baseURL}/api/contact`, {
    method: "POST",
    headers: {
      Accept: accept,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: origin,
      "X-Forwarded-For": ip,
    },
    body: new URLSearchParams(data),
  });
}

const validMessage = { name: "Camille Martin", email: "camille@example.test", message: "Bonjour, je souhaite échanger au sujet d’un poste.", companyWebsite: "", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" };
const smtpSecret = "smtp-secret-never-log";
const smtpFailure = Object.assign(new Error(`Authentication failed for ${smtpSecret} while sending ${validMessage.message}`), {
  code: "EAUTH",
  command: "AUTH PLAIN",
  responseCode: 535,
  response: `535 invalid ${validMessage["cf-turnstile-response"]}`,
});
const safeFailure = safeSmtpErrorDetails(smtpFailure, [smtpSecret, validMessage.message, validMessage["cf-turnstile-response"]]);
assert.equal(safeFailure.code, "EAUTH");
assert.equal(safeFailure.command, "AUTH PLAIN");
assert.equal(safeFailure.responseCode, 535);
assert(!JSON.stringify(safeFailure).includes(smtpSecret), "Le diagnostic SMTP contient le mot de passe.");
assert(!JSON.stringify(safeFailure).includes(validMessage.message), "Le diagnostic SMTP contient le message du visiteur.");
assert(!JSON.stringify(safeFailure).includes(validMessage["cf-turnstile-response"]), "Le diagnostic SMTP contient le token Turnstile.");
const validVerification = async () => ({ ok: true });

function contactPost(request, verifyTurnstile = validVerification) {
  return handleContactRequest(request, { verifyTurnstile });
}

async function assertValidation(data, field) {
  const response = await contactPost(contactRequest({ ...validMessage, ...data }, { ip: `198.51.100.${20 + field.length}` }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "VALIDATION_ERROR");
  assert(body.errors[field], `Erreur de validation absente pour ${field}.`);
}

await assertValidation({ name: "" }, "name");
await assertValidation({ email: "adresse-invalide" }, "email");
await assertValidation({ message: "Court" }, "message");
await assertValidation({ message: "x".repeat(5001) }, "message");

const hugeResponse = await contactPost(contactRequest({ ...validMessage, message: "x".repeat(70 * 1024) }, { ip: "198.51.100.30" }));
assert.equal(hugeResponse.status, 413, "La limite de corps à 64 KiB n’est pas appliquée.");

resetContactTestDeliveries();
let verificationCalls = 0;
const countedVerification = async () => { verificationCalls += 1; return { ok: true }; };
const missingToken = { ...validMessage };
delete missingToken["cf-turnstile-response"];
const missingTokenResponse = await contactPost(contactRequest(missingToken, { ip: "198.51.100.30" }), countedVerification);
assert.equal(missingTokenResponse.status, 400);
assert.equal((await missingTokenResponse.json()).code, "TURNSTILE_REQUIRED");
assert.equal(verificationCalls, 0, "Siteverify est appelé sans token.");
assert.equal(getContactTestDeliveries().length, 0, "Un e-mail est envoyé sans token.");

const turnstileConfig = await getTurnstileConfig();
assert(turnstileConfig?.officialTestKeys, ".env.example n’utilise pas les clés Turnstile officielles de test.");
const originalNodeEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
assert.equal(await getTurnstileConfig(), null, "Les clés officielles de test Turnstile sont acceptées en production.");
if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = originalNodeEnvironment;

await prisma.systemSettings.upsert({
  where: { id: "main" },
  update: { smtpHost: "smtp.database.test", smtpUser: "database-user", smtpPasswordEncrypted: encryptSettingsSecret("database-password") },
  create: { id: "main", smtpHost: "smtp.database.test", smtpUser: "database-user", smtpPasswordEncrypted: encryptSettingsSecret("database-password") },
});
const { getContactConfig } = await import("../lib/contact-config.ts");
const databaseContactConfig = await getContactConfig();
assert.equal(databaseContactConfig?.host, "smtp.database.test", "La configuration Contact DB ne surcharge pas l’ENV.");
assert.equal(databaseContactConfig?.password, "database-password", "Le secret SMTP DB n’est pas déchiffré.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { smtpHost: null, smtpUser: null, smtpPasswordEncrypted: null, contactFormEnabled: false } });
assert.equal(await (await import("../lib/contact-config.ts")).getContactFormConfig(), null, "DB false n’écrase pas CONTACT_FORM_ENABLED=true.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { contactFormEnabled: null } });
assert((await (await import("../lib/contact-config.ts")).getContactFormConfig()), "Le reset DB vers null ne restaure pas le fallback ENV.");
const failedSiteverify = (config, token) => verifyTurnstileToken({ ...config, secretKey: "2x0000000000000000000000000000000AA", officialTestKeys: true }, token);
const invalidTokenResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.31" }), failedSiteverify);
assert.equal(invalidTokenResponse.status, 400);
assert.equal((await invalidTokenResponse.json()).code, "TURNSTILE_FAILED");
assert.equal(getContactTestDeliveries().length, 0, "Un e-mail est envoyé avec un token invalide.");

const duplicateSiteverify = (config, token) => verifyTurnstileToken({ ...config, secretKey: "3x0000000000000000000000000000000AA", officialTestKeys: true }, token);
const duplicateTokenResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.32" }), duplicateSiteverify);
assert.equal(duplicateTokenResponse.status, 400);
assert.equal((await duplicateTokenResponse.json()).code, "TURNSTILE_FAILED");
assert.equal(getContactTestDeliveries().length, 0, "Un e-mail est envoyé avec un token réutilisé.");

const productionLikeConfig = {
  ...turnstileConfig,
  officialTestKeys: false,
  expectedHostname: "localhost",
};
let siteverifyBody;
const fakeSiteverify = (payload) => async (_url, init) => {
  siteverifyBody = String(init.body);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
assert.deepEqual(
  await verifyTurnstileToken(productionLikeConfig, "valid-token", {
    fetchImpl: fakeSiteverify({ success: true, hostname: "localhost", action: "contact" }),
  }),
  { ok: true },
  "Une réponse Siteverify valide est refusée.",
);
assert(!new URLSearchParams(siteverifyBody).has("remoteip"), "L’adresse IP du visiteur est envoyée à Siteverify.");
assert.deepEqual(
  await verifyTurnstileToken(productionLikeConfig, "valid-token", {
    fetchImpl: fakeSiteverify({ success: true, hostname: "foreign.example", action: "contact" }),
  }),
  { ok: false, kind: "failed" },
  "Un hostname Siteverify inattendu est accepté.",
);
assert.deepEqual(
  await verifyTurnstileToken(productionLikeConfig, "valid-token", {
    fetchImpl: fakeSiteverify({ success: true, hostname: "localhost", action: "other" }),
  }),
  { ok: false, kind: "failed" },
  "Une action Siteverify inattendue est acceptée.",
);

const networkVerification = (config, token) => verifyTurnstileToken(config, token, {
  fetchImpl: async () => { throw new Error("simulated network failure"); },
});
const networkResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.33" }), networkVerification);
assert.equal(networkResponse.status, 503);
assert.equal((await networkResponse.json()).code, "TURNSTILE_UNAVAILABLE");
assert.equal(getContactTestDeliveries().length, 0, "Un e-mail est envoyé après une panne Siteverify.");

const timeoutVerification = (config, token) => verifyTurnstileToken(config, token, {
  timeoutMs: 15,
  fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }),
});
const timeoutResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.34" }), timeoutVerification);
assert.equal(timeoutResponse.status, 503);
assert.equal((await timeoutResponse.json()).code, "TURNSTILE_UNAVAILABLE");
assert.equal(getContactTestDeliveries().length, 0, "Un e-mail est envoyé après un timeout Siteverify.");

verificationCalls = 0;
const honeypotResponse = await contactPost(contactRequest({ ...validMessage, companyWebsite: "https://spam.example" }, { ip: "198.51.100.35" }), countedVerification);
assert.equal(honeypotResponse.status, 200);
assert.equal((await honeypotResponse.json()).code, "SENT");
assert.equal(getContactTestDeliveries().length, 0, "Le honeypot a déclenché un envoi.");
assert.equal(verificationCalls, 0, "Le honeypot a déclenché Siteverify.");

await prisma.systemSettings.update({
  where: { id: "main" },
  data: { smtpUser: "smtp-log-user", smtpPasswordEncrypted: encryptSettingsSecret(smtpSecret) },
});
const smtpLogs = [];
const originalConsoleError = console.error;
console.error = (...values) => smtpLogs.push(values);
let smtpFailureResponse;
try {
  smtpFailureResponse = await handleContactRequest(contactRequest(validMessage, { ip: "198.51.100.38" }), {
    verifyTurnstile: validVerification,
    sendMessage: async () => { throw smtpFailure; },
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(smtpFailureResponse.status, 502);
const smtpFailureBody = await smtpFailureResponse.json();
assert.equal(smtpFailureBody.code, "DELIVERY_FAILED");
assert(!JSON.stringify(smtpFailureBody).includes("EAUTH"), "Le visiteur reçoit le diagnostic SMTP interne.");
const serializedSmtpLogs = JSON.stringify(smtpLogs);
assert(serializedSmtpLogs.includes("EAUTH") && serializedSmtpLogs.includes("535"), "Le journal serveur perd le code SMTP exploitable.");
assert(!serializedSmtpLogs.includes(smtpSecret), "Le journal SMTP contient le mot de passe.");
assert(!serializedSmtpLogs.includes(validMessage.message), "Le journal SMTP contient le message du visiteur.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { smtpUser: null, smtpPasswordEncrypted: null } });

const successResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.36" }));
assert.equal(successResponse.status, 200);
const [delivery] = getContactTestDeliveries();
assert(delivery, "Le transport de test n’a pas été appelé.");
assert.equal(delivery.from, "cv@example.test");
assert.equal(delivery.replyTo, validMessage.email);
assert.equal(delivery.to, "recipient@example.test");
assert(delivery.text.includes(validMessage.message));

const foreignOriginResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.37", origin: "https://foreign.example" }));
assert.equal(foreignOriginResponse.status, 403, "Une origine étrangère n’est pas refusée.");
assert(!JSON.stringify(await foreignOriginResponse.json()).includes(process.env.TURNSTILE_SECRET_KEY));

resetContactRateLimitForTests();
resetContactTestDeliveries();
for (let attempt = 0; attempt < 3; attempt += 1) {
  const response = await contactPost(contactRequest(validMessage, { ip: "198.51.100.40" }));
  assert.equal(response.status, 200, `Le message autorisé ${attempt + 1} a été refusé.`);
}
verificationCalls = 0;
const limitedResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.40" }), countedVerification);
assert.equal(limitedResponse.status, 429);
assert(Number(limitedResponse.headers.get("retry-after")) > 0);
assert.equal(getContactTestDeliveries().length, 3, "Un e-mail supplémentaire a été envoyé après le seuil.");
assert.equal(verificationCalls, 0, "Le rate limit dépassé a appelé Siteverify.");

const configuredSmtpHost = process.env.CONTACT_SMTP_HOST;
delete process.env.CONTACT_SMTP_HOST;
const disabledApiResponse = await contactPost(contactRequest(validMessage, { ip: "198.51.100.41" }));
assert.equal(disabledApiResponse.status, 503);
const disabledApiBody = JSON.stringify(await disabledApiResponse.json());
assert(!disabledApiBody.includes(process.env.TURNSTILE_SECRET_KEY) && !disabledApiBody.includes("smtp.example.test"));
process.env.CONTACT_SMTP_HOST = configuredSmtpHost;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le serveur de test Contact n’a pas démarré.");
}

async function startServer(enabled, suffix, extraEnvironment = {}) {
  const logHandle = await open(new URL(`../.test-artifacts/contact-server-${suffix}.log`, import.meta.url), "w");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3000"], {
    cwd: root,
    env: { ...process.env, CONTACT_FORM_ENABLED: enabled ? "true" : "false", NEXT_TELEMETRY_DISABLED: "1", ...extraEnvironment },
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (server.exitCode !== null) {
    await logHandle.close();
    throw new Error(`Le serveur Contact s’est arrêté avant son démarrage (journal : contact-server-${suffix}.log).`);
  }
  await waitForServer();
  return async () => {
    if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
    for (let attempt = 0; attempt < 30 && server.exitCode === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await logHandle.close();
  };
}

const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
let stopServer = null;
const browserErrors = [];

try {
  stopServer = await startServer(true, "disabled", { CONTACT_SMTP_HOST: "" });
  const disabledPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  disabledPage.on("pageerror", (error) => browserErrors.push(error.message));
  await disabledPage.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(await disabledPage.locator(".contact-form-panel").count(), 0, "Le formulaire est rendu sans configuration active.");
  assert.equal(await disabledPage.locator('#contact a[href^="mailto:"]').count(), 1, "Le mailto disparaît quand le formulaire est désactivé.");
  assert.equal(await disabledPage.locator('script[src*="challenges.cloudflare.com"]').count(), 0, "Turnstile est chargé sans formulaire.");
  await disabledPage.close();
  await stopServer();
  stopServer = null;

  stopServer = await startServer(true, "enabled");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 400")) browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const panel = page.locator(".contact-form-panel");
  await panel.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("#contact .reveal")?.classList.contains("is-visible"));
  assert(await panel.isVisible(), "Le formulaire configuré n’est pas visible.");
  const submitButton = page.locator(".contact-form-submit");
  await page.locator('.contact-turnstile-widget input[name="cf-turnstile-response"]').waitFor({ state: "attached", timeout: 20_000 });
  await page.locator(".contact-turnstile-status.is-ready").waitFor({ state: "visible", timeout: 20_000 });
  assert(await page.locator(".contact-turnstile-block").isVisible(), "Le bloc Turnstile n’est pas visible.");
  assert.equal(await page.locator('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]').count(), 1, "Le script Turnstile n’est pas chargé exactement une fois.");
  assert(!(await submitButton.isDisabled()), "Le bouton reste désactivé après la vérification Turnstile.");
  await panel.screenshot({ path: ".test-artifacts/contact-form-rest.png" });

  await page.getByLabel("Nom").fill("Camille Martin");
  await page.getByLabel("Adresse e-mail").fill("camille@example.test");
  await page.getByLabel("Message", { exact: true }).fill("Bonjour, je souhaite échanger au sujet d’un poste.");
  let releaseRequest;
  const requestGate = new Promise((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/contact", async (route) => {
    await requestGate;
    await route.continue();
  });
  assert.equal(await submitButton.innerText(), "Envoyer le message");
  const successNetwork = page.waitForResponse((response) => response.url().endsWith("/api/contact") && response.request().method() === "POST");
  const click = submitButton.click();
  await page.waitForFunction(() => document.querySelector(".contact-form-submit")?.textContent === "Envoi…");
  assert(await submitButton.isDisabled(), "Le bouton n’est pas désactivé pendant l’envoi.");
  assert.equal(await submitButton.innerText(), "Envoi…");
  releaseRequest();
  await click;
  assert.equal((await successNetwork).status(), 200);
  await page.unroute("**/api/contact");
  const feedback = page.locator(".contact-form-feedback");
  await feedback.waitFor({ state: "visible" });
  assert((await feedback.innerText()).includes("Message envoyé"));
  assert.equal(await page.getByLabel("Nom").inputValue(), "");
  assert.equal(await page.getByLabel("Adresse e-mail").inputValue(), "");
  assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "");
  await page.locator(".contact-turnstile-status.is-ready").waitFor({ state: "visible", timeout: 20_000 });
  await panel.screenshot({ path: ".test-artifacts/contact-form-success.png" });

  await page.getByLabel("Nom").fill("Camille Martin");
  await page.getByLabel("Adresse e-mail").fill("camille@example.test");
  await page.getByLabel("Message", { exact: true }).fill("Bonjour, ceci simule un refus de la vérification anti-spam.");
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "TURNSTILE_FAILED", message: "La vérification anti-spam n’a pas pu être validée. Réessayez ou utilisez l’adresse e-mail ci-dessus." }),
    });
  });
  await submitButton.click();
  await page.waitForFunction(() => document.querySelector(".contact-form-feedback")?.textContent?.includes("vérification anti-spam"));
  assert((await feedback.innerText()).includes("vérification anti-spam"));
  await panel.screenshot({ path: ".test-artifacts/contact-form-turnstile-error.png" });
  await page.unroute("**/api/contact");
  await page.locator(".contact-turnstile-status.is-ready").waitFor({ state: "visible", timeout: 20_000 });

  await page.getByLabel("Nom").fill("A");
  await page.getByLabel("Adresse e-mail").fill("invalide");
  await page.getByLabel("Message", { exact: true }).fill("Court");
  const validationNetwork = page.waitForResponse((response) => response.url().endsWith("/api/contact") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  assert.equal((await validationNetwork).status(), 400);
  await page.locator("#contact-name-error").waitFor({ state: "visible" });
  assert.equal(await page.getByLabel("Nom").getAttribute("aria-invalid"), "true");
  await page.waitForFunction(() => document.activeElement?.id === "contact-name");
  assert(await page.getByLabel("Nom").evaluate((element) => element === document.activeElement), "Le premier champ invalide ne reçoit pas le focus.");
  assert.equal(await feedback.getAttribute("aria-live"), "polite");

  await page.getByLabel("Nom").focus();
  await page.keyboard.press("Tab");
  const emailField = page.getByLabel("Adresse e-mail");
  assert(await emailField.evaluate((element) => element === document.activeElement), "Tab ne suit pas l’ordre Nom → E-mail.");
  await page.keyboard.press("Tab");
  assert(await page.getByLabel("Message", { exact: true }).evaluate((element) => element === document.activeElement), "Tab ne suit pas l’ordre E-mail → Message.");
  await page.keyboard.press("Tab");
  assert(await page.locator(".contact-turnstile-block").evaluate((element) => element === document.activeElement), "Le widget Turnstile n’est pas dans l’ordre clavier.");
  for (let attempt = 0; attempt < 6 && !(await submitButton.evaluate((element) => element === document.activeElement)); attempt += 1) await page.keyboard.press("Tab");
  assert(await submitButton.evaluate((element) => element === document.activeElement), "Le bouton n’est pas joignable après le widget Turnstile.");
  const focusStyle = await submitButton.evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
  assert(focusStyle.style !== "none" && focusStyle.width !== "0px", `Le focus clavier n’est pas visible : ${JSON.stringify(focusStyle)}`);
  await panel.screenshot({ path: ".test-artifacts/contact-form-focus.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator(".contact-turnstile-status.is-ready").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Le formulaire provoque un débordement à 390 px.");
  await page.locator(".contact-form-panel").scrollIntoViewIfNeeded();
  const mobileTextarea = page.getByLabel("Message", { exact: true });
  assert((await mobileTextarea.boundingBox())?.width >= 280, "Le textarea mobile n’utilise pas la largeur disponible.");
  const widgetBox = await page.locator(".contact-turnstile-widget").boundingBox();
  assert(widgetBox && widgetBox.x >= 0 && widgetBox.x + widgetBox.width <= 390, "Le widget Turnstile déborde à 390 px.");
  await page.locator(".contact-form-panel").screenshot({ path: ".test-artifacts/contact-form-mobile-390.png" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  const previewTurnstileRequests = [];
  page.on("request", (request) => { if (request.url().includes("challenges.cloudflare.com/turnstile")) previewTurnstileRequests.push(request.url()); });
  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert(await page.locator(".contact-form-panel").isVisible(), "Le formulaire n’est pas visible dans l’aperçu.");
  assert(await page.locator(".contact-form fieldset").evaluate((element) => element.hasAttribute("disabled")), "Le formulaire d’aperçu peut encore être soumis.");
  assert((await page.locator(".contact-form-preview-note").innerText()).includes("Envoi désactivé"));
  assert(await page.locator(".contact-turnstile-preview").isVisible(), "Le placeholder Turnstile manque dans l’aperçu.");
  assert.equal(await page.locator(".contact-turnstile-widget").count(), 0, "Le widget Turnstile est rendu dans l’aperçu.");
  assert.equal(previewTurnstileRequests.length, 0, "L’aperçu charge Turnstile.");
  await page.locator(".contact-form-panel").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("#contact .reveal")?.classList.contains("is-visible"));
  await page.locator(".contact-form-panel").screenshot({ path: ".test-artifacts/contact-form-preview-disabled.png" });

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert(await noJsPage.locator(".contact-form-panel").isVisible(), "Le formulaire est masqué sans JavaScript.");
  await noJsPage.getByLabel("Nom").fill("Alex Dupont");
  await noJsPage.getByLabel("Adresse e-mail").fill("alex@example.test");
  await noJsPage.getByLabel("Message", { exact: true }).fill("Bonjour, ceci est un envoi sans JavaScript.");
  const noJsForm = noJsPage.locator(".contact-form");
  assert.equal(await noJsForm.getAttribute("method"), "post");
  assert.equal(await noJsForm.getAttribute("action"), "/api/contact");
  assert(await noJsPage.locator(".contact-turnstile-noscript").isVisible(), "L’explication no-JS de Turnstile est absente.");
  assert((await noJsPage.locator(".contact-turnstile-noscript").innerText()).includes("nécessite JavaScript"));
  assert(await noJsPage.getByRole("button", { name: "Envoyer le message" }).isDisabled(), "Le formulaire no-JS permet un envoi sans Turnstile.");
  assert.equal(await noJsPage.locator('#contact a[href^="mailto:"]').count(), 1, "Le mailto n’est pas disponible sans JavaScript.");
  await noJsContext.close();
  await context.close();

  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
  console.log(JSON.stringify({ validation: "name email message limits", bodyLimit: "64 KiB", honeypot: "neutral without Siteverify or delivery", turnstile: "required invalid duplicate network timeout valid", officialTestKeys: "always-pass always-fail duplicate", smtpTestTransport: "json from reply-to content", rateLimit: "3 successful messages per 15 minutes", origin: "checked", disabledConfiguration: "hidden and 503", ui: "managed widget success reset error", preview: "visible disabled without Turnstile request", noJavaScript: "blocked with mailto fallback", responsive: "390px no overflow", keyboard: "fields widget button focus", screenshots: 6 }));
} finally {
  if (stopServer) await stopServer();
  await browser.close();
  await prisma.$disconnect();
  await rm(databasePath, { force: true });
}
