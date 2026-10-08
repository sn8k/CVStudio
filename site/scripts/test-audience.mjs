import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { deployMigrationsOnCopy } from "./test-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
const databasePath = fileURLToPath(new URL("../.test-artifacts/audience.db", import.meta.url));
const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const baseURL = "http://localhost:3106";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");

await mkdir(artifacts, { recursive: true });
await copyFile(sourceDatabase, databasePath);

const historicalDate = "2024-01-15";
const sqlite = new DatabaseSync(databasePath);
sqlite.prepare('INSERT OR REPLACE INTO "DailyPageView" ("date", "views", "updatedAt") VALUES (?, ?, ?)').run(historicalDate, 37, Date.now());
sqlite.close();
deployMigrationsOnCopy(root, databasePath);

Object.assign(process.env, {
  DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
  BETTER_AUTH_URL: baseURL,
  PUBLIC_SITE_URL: baseURL,
  AUDIENCE_MEASUREMENT_ENABLED: "true",
});

const { prisma } = await import("../lib/prisma.ts");
const {
  getAudienceRetentionCutoff,
  getNextParisDayBoundary,
  parisDateKey,
  purgeExpiredAudienceStats,
  recordPublicPageView,
  resetAudienceRetentionGuardForTests,
} = await import("../lib/visit-stats.ts");
const { handleAudienceRequest } = await import("../app/api/audience/route.ts");
const { handleAudiencePreference } = await import("../app/api/audience/preference/route.ts");
const { isAudienceMeasurementEnabled } = await import("../lib/audience-cookies.ts");

assert.equal(await isAudienceMeasurementEnabled(), true, "L’ENV seule n’active pas la mesure d’audience.");
await prisma.systemSettings.upsert({ where: { id: "main" }, update: { audienceMeasurementEnabled: false }, create: { id: "main", audienceMeasurementEnabled: false } });
assert.equal(await isAudienceMeasurementEnabled(), false, "DB false n’écrase pas AUDIENCE_MEASUREMENT_ENABLED=true.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { audienceMeasurementEnabled: null } });
assert.equal(await isAudienceMeasurementEnabled(), true, "DB null ne rend pas la main à l’ENV audience.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { audienceMeasurementEnabled: true } });
assert.equal(await isAudienceMeasurementEnabled(), true, "DB true n’active pas la mesure d’audience.");
await prisma.systemSettings.update({ where: { id: "main" }, data: { audienceMeasurementEnabled: null } });

const migratedHistory = await prisma.dailyPageView.findUnique({ where: { date: historicalDate } });
assert.equal(migratedHistory?.views, 37, "La migration n’a pas conservé les pages vues historiques.");
assert.equal(migratedHistory?.uniqueVisitors, 0, "La migration n’initialise pas l’historique à zéro.");

await prisma.dailyPageView.deleteMany();
resetAudienceRetentionGuardForTests();

const humanAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const robotAgent = "Googlebot/2.1 (+http://www.google.com/bot.html)";
const firstDay = new Date("2026-09-20T10:00:00.000Z");
const firstDate = parisDateKey(firstDay);

assert.equal(await recordPublicPageView(humanAgent, firstDay), true);
assert.equal(await recordPublicPageView(robotAgent, firstDay), false);
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: firstDate } })).views, 1, "Le robot a augmenté les pages vues.");

function audienceRequest(now, cookie = "", userAgent = humanAgent, origin = baseURL) {
  return new Request(`${baseURL}/api/audience`, {
    method: "POST",
    headers: { Origin: origin, "User-Agent": userAgent, ...(cookie ? { Cookie: cookie } : {}) },
  });
}

const firstUniqueResponse = await handleAudienceRequest(audienceRequest(firstDay), firstDay);
assert.equal(firstUniqueResponse.status, 204);
assert.equal(await firstUniqueResponse.text(), "", "L’API audience renvoie un contenu public.");
const dayCookie = firstUniqueResponse.headers.get("set-cookie") ?? "";
assert.match(dayCookie, /cv_audience_day=1/);
assert.match(dayCookie, /HttpOnly/i);
assert.match(dayCookie, /SameSite=Lax/i);
assert.match(dayCookie, /Path=\//i);
assert.doesNotMatch(dayCookie, /Domain=/i);
assert.equal(new Date(dayCookie.match(/Expires=([^;]+)/i)?.[1] ?? 0).toISOString(), getNextParisDayBoundary(firstDay).toISOString());
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: firstDate } })).uniqueVisitors, 1);

await handleAudienceRequest(audienceRequest(firstDay, "cv_audience_day=1"), firstDay);
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: firstDate } })).uniqueVisitors, 1, "Le second hit du jour est recompté.");

const nextDay = new Date("2026-09-21T10:00:00.000Z");
await handleAudienceRequest(audienceRequest(nextDay), nextDay);
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: parisDateKey(nextDay) } })).uniqueVisitors, 1, "Le navigateur n’est pas recompté un nouveau jour.");

const botResponse = await handleAudienceRequest(audienceRequest(nextDay, "", robotAgent), nextDay);
assert.equal(botResponse.headers.get("set-cookie"), null, "Un robot reçoit le cookie d’audience.");
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: parisDateKey(nextDay) } })).uniqueVisitors, 1);

function preferenceRequest(choice) {
  return new Request(`${baseURL}/api/audience/preference`, {
    method: "POST",
    headers: { Origin: baseURL, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ audience: choice }),
  });
}

const disabledResponse = await handleAudiencePreference(preferenceRequest("disable"), firstDay);
const disabledCookies = disabledResponse.headers.get("set-cookie") ?? "";
assert.equal(disabledResponse.status, 303);
assert.match(disabledCookies, /cv_audience_optout=1/);
assert.match(disabledCookies, /cv_audience_day=/);
assert.match(disabledCookies, /HttpOnly/i);
assert.doesNotMatch(disabledCookies, /Domain=/i);

const optedOutDay = new Date("2026-09-22T10:00:00.000Z");
const optedOutResponse = await handleAudienceRequest(audienceRequest(optedOutDay, "cv_audience_optout=1; cv_audience_day=1"), optedOutDay);
assert.match(optedOutResponse.headers.get("set-cookie") ?? "", /cv_audience_day=/);
assert.equal(await prisma.dailyPageView.findUnique({ where: { date: parisDateKey(optedOutDay) } }), null, "L’opposition n’empêche pas le comptage.");

const enabledResponse = await handleAudiencePreference(preferenceRequest("enable"), optedOutDay);
assert.match(enabledResponse.headers.get("set-cookie") ?? "", /cv_audience_optout=/);
await handleAudienceRequest(audienceRequest(optedOutDay), optedOutDay);
assert.equal((await prisma.dailyPageView.findUniqueOrThrow({ where: { date: parisDateKey(optedOutDay) } })).uniqueVisitors, 1, "La réactivation ne rétablit pas le comptage.");

const foreignResponse = await handleAudienceRequest(audienceRequest(optedOutDay, "", humanAgent, "https://foreign.example"), optedOutDay);
assert.equal(foreignResponse.status, 403, "Une origine étrangère n’est pas refusée.");

const retentionNow = new Date("2026-09-20T10:00:00.000Z");
const retentionCutoff = getAudienceRetentionCutoff(retentionNow);
await prisma.dailyPageView.create({ data: { date: "2024-08-19", views: 3, uniqueVisitors: 2 } });
await prisma.dailyPageView.create({ data: { date: retentionCutoff, views: 4, uniqueVisitors: 3 } });
resetAudienceRetentionGuardForTests();
await purgeExpiredAudienceStats(retentionNow);
assert.equal(await prisma.dailyPageView.findUnique({ where: { date: "2024-08-19" } }), null, "La rétention de 25 mois n’est pas appliquée.");
assert(await prisma.dailyPageView.findUnique({ where: { date: retentionCutoff } }), "La date limite de rétention a été supprimée trop tôt.");

const implementationSource = await Promise.all([
  readFile(new URL("../app/api/audience/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/audience-tracker.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/audience-cookies.ts", import.meta.url), "utf8"),
]);
assert.doesNotMatch(implementationSource.join("\n"), /randomUUID|localStorage|sessionStorage|x-forwarded-for|cf-connecting-ip|fingerprint/i, "Un identifiant ou signal individuel a été introduit.");

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le serveur de test Audience n’a pas démarré.");
}

const logHandle = await open(new URL("../.test-artifacts/audience-server.log", import.meta.url), "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3106"], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", logHandle.fd, logHandle.fd],
});

const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const browserErrors = [];

try {
  await waitForServer();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: humanAgent });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

  const firstAudienceResponse = page.waitForResponse((response) =>
    response.url() === `${baseURL}/api/audience` && response.request().method() === "POST",
  );
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal((await firstAudienceResponse).status(), 204, "L’enregistrement navigateur n’aboutit pas.");
  assert.equal(await page.getByRole("link", { name: "Confidentialité" }).count(), 1, "Le lien de confidentialité manque dans le footer.");
  assert.equal((await page.locator(".footer-credit").innerText()).trim(), "CVStudio");
  assert((await context.cookies()).some((cookie) => cookie.name === "cv_audience_day" && cookie.value === "1"), "Le cookie journalier n’est pas posé sur le site public.");

  await page.goto(`${baseURL}/confidentialite`, { waitUntil: "domcontentloaded" });
  assert(await page.getByRole("heading", { name: "Mesure d’audience locale" }).isVisible());
  assert((await page.locator("body").innerText()).includes("ne sont pas suivis ni dédupliqués d’un jour à l’autre"));
  assert.equal(await page.locator(".admin-traffic-metrics").count(), 0, "Des statistiques sont exposées publiquement.");
  await page.screenshot({ path: ".test-artifacts/audience-privacy-desktop.png", fullPage: true, caret: "initial" });

  const control = page.getByRole("button", { name: "Désactiver la mesure d’audience" });
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert(await control.evaluate((element) => element === document.activeElement), "Le contrôle d’opposition n’est pas joignable au clavier.");
  const focusStyle = await control.evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
  assert(focusStyle.style !== "none" && focusStyle.width !== "0px", `Le focus du contrôle n’est pas visible : ${JSON.stringify(focusStyle)}`);
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await page.screenshot({ path: ".test-artifacts/audience-optout-focus.png", caret: "initial" });

  await control.click();
  await page.waitForURL(/audience=disabled/);
  const disabledBrowserCookies = await context.cookies();
  assert(disabledBrowserCookies.some((cookie) => cookie.name === "cv_audience_optout" && cookie.value === "1"));
  assert(!disabledBrowserCookies.some((cookie) => cookie.name === "cv_audience_day"), "Le cookie journalier subsiste après opposition.");
  const today = parisDateKey();
  const viewsBeforeOptout = (await prisma.dailyPageView.findUnique({ where: { date: today } }))?.views ?? 0;
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const viewsAfterOptout = (await prisma.dailyPageView.findUnique({ where: { date: today } }))?.views ?? 0;
  assert.equal(viewsAfterOptout, viewsBeforeOptout, "L’opposition n’empêche pas les pages vues.");

  await page.goto(`${baseURL}/confidentialite`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Réactiver la mesure d’audience" }).click();
  await page.waitForURL(/audience=enabled/);
  assert(!(await context.cookies()).some((cookie) => cookie.name === "cv_audience_optout"), "La réactivation ne supprime pas l’opposition.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/confidentialite`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "La page Confidentialité déborde à 390 px.");
  await page.screenshot({ path: ".test-artifacts/audience-privacy-mobile-390.png", fullPage: true, caret: "initial" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  assert(await page.getByText("Navigateurs · aujourd’hui").isVisible());
  assert.equal(await page.locator(".admin-traffic-bar-views").count(), 14);
  assert.equal(await page.locator(".admin-traffic-bar-unique").count(), 14);
  await page.screenshot({ path: ".test-artifacts/audience-dashboard-desktop.png", fullPage: true, caret: "initial" });
  await page.locator(".admin-traffic-figure").screenshot({ path: ".test-artifacts/audience-dashboard-graph.png", caret: "initial" });

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, userAgent: humanAgent });
  const noJsPage = await noJsContext.newPage();
  const uniqueBeforeNoJs = (await prisma.dailyPageView.findUnique({ where: { date: today } }))?.uniqueVisitors ?? 0;
  await noJsPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal((await noJsContext.cookies()).some((cookie) => cookie.name === "cv_audience_day"), false, "Un navigateur sans JavaScript reçoit le cookie journalier.");
  const uniqueAfterNoJs = (await prisma.dailyPageView.findUnique({ where: { date: today } }))?.uniqueVisitors ?? 0;
  assert.equal(uniqueAfterNoJs, uniqueBeforeNoJs, "Un navigateur sans JavaScript est compté comme unique.");
  assert.equal(await noJsPage.getByRole("link", { name: "Confidentialité" }).count(), 1);
  await noJsPage.goto(`${baseURL}/confidentialite`, { waitUntil: "domcontentloaded" });
  await noJsPage.getByRole("button", { name: "Désactiver la mesure d’audience" }).click();
  await noJsPage.waitForURL(/audience=disabled/);
  assert((await noJsContext.cookies()).some((cookie) => cookie.name === "cv_audience_optout"), "Le contrôle d’opposition no-JS ne fonctionne pas.");
  await noJsContext.close();
  await context.close();

  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
  console.log(JSON.stringify({ migration: "historical views preserved, uniques default zero", pageViews: "humans counted, robots excluded", dailyUnique: "boolean day cookie, once per Paris day", identifiers: "none", optout: "disable and re-enable", retention: "25 months", privacy: "desktop mobile keyboard no-JS", dashboard: "14-day views and daily uniques", screenshots: 5 }));
} finally {
  if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
  await browser.close();
  await logHandle.close();
  await prisma.$disconnect();
  await rm(databasePath, { force: true });
}
