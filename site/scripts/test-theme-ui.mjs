import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, open, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { deployMigrationsOnCopy } from "./test-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
const databasePath = fileURLToPath(new URL("../.test-artifacts/themes-ui.db", import.meta.url));
const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const baseURL = "http://localhost:3108";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");

await mkdir(artifacts, { recursive: true });
await copyFile(sourceDatabase, databasePath);
deployMigrationsOnCopy(root, databasePath);
const environment = {
  ...process.env,
  DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
  BETTER_AUTH_URL: baseURL,
  PUBLIC_SITE_URL: baseURL,
  NEXT_TELEMETRY_DISABLED: "1",
};

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Le serveur de test Thèmes n’a pas démarré.");
}

async function revealWholePage(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 800;
  for (let position = 0; position < height; position += Math.max(300, Math.floor(viewport * 0.7))) {
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), position);
    await page.waitForTimeout(35);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

const logHandle = await open(new URL("../.test-artifacts/themes-server.log", import.meta.url), "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3108"], { cwd: root, env: environment, stdio: ["ignore", logHandle.fd, logHandle.fd] });
const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const browserErrors = [];

try {
  await waitForServer();
  const initialHtml = await (await fetch(baseURL)).text();
  assert.match(initialHtml, /data-visual-theme="default"/, "Le HTML initial n’utilise pas le fallback historique.");

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("401")) browserErrors.push(message.text()); });
  await page.goto(`${baseURL}/preview?theme=daylight`, { waitUntil: "networkidle" });
  assert.equal(page.url(), `${baseURL}/admin/login`, "Le preview de thème est accessible sans authentification.");
  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  assert(await page.getByRole("heading", { name: "Thèmes visuels" }).isVisible(), "La section Apparence est absente de Settings.");
  assert.equal(await page.locator(".theme-swatch").count(), 2, "Les deux thèmes intégrés ne sont pas affichés.");

  await page.getByRole("button", { name: "+ Créer un thème" }).click();
  const createThemeDialog = page.getByRole("dialog", { name: "Créer un thème" });
  await createThemeDialog.getByLabel("Identifiant interne").fill("aube-test");
  await createThemeDialog.getByLabel("Nom visible").fill("Aube test");
  await createThemeDialog.getByRole("button", { name: "Créer le thème" }).click();
  await createThemeDialog.getByText("Thème créé.").waitFor();
  await createThemeDialog.getByRole("button", { name: /Fermer Créer un thème/ }).click();
  await page.reload({ waitUntil: "networkidle" });
  const customThemeRow = page.locator(".theme-table tbody tr").filter({ hasText: "aube-test" });
  assert.equal(await customThemeRow.count(), 1, "Le thème créé ne persiste pas.");
  assert.equal(await customThemeRow.getByRole("link", { name: "Tester" }).getAttribute("href"), "/preview?theme=aube-test", "Le lien de test du thème est incorrect.");

  await customThemeRow.getByRole("button", { name: "Éditer" }).click();
  const editThemeDialog = page.getByRole("dialog", { name: "Modifier Aube test" });
  await editThemeDialog.getByLabel("Nom visible").fill("Aube test modifiée");
  await editThemeDialog.getByRole("button", { name: "Enregistrer le thème" }).click();
  await editThemeDialog.getByText("Thème mis à jour.").waitFor();
  await editThemeDialog.getByRole("button", { name: /Fermer Modifier/ }).click();

  await page.getByLabel("Manuel").check();
  await page.getByLabel("Thème forcé").selectOption("daylight");
  await page.getByRole("button", { name: "Enregistrer le mode" }).click();
  await page.getByText("Thème manuel activé.").waitFor();
  await page.getByLabel("Thème forcé").selectOption("aube-test");
  await page.getByRole("button", { name: "Enregistrer le mode" }).click();
  await page.getByText("Thème manuel activé.").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert(await page.getByLabel("Manuel").isChecked(), "Le mode MANUAL n’est pas reflété après refresh.");
  assert.equal(await page.getByLabel("Thème forcé").inputValue(), "aube-test", "Le thème manuel saute après sauvegarde sans nouveau clic sur Manuel.");
  await page.getByLabel("Thème forcé").selectOption("daylight");
  await page.getByRole("button", { name: "Enregistrer le mode" }).click();
  await page.getByText("Thème manuel activé.").waitFor();
  const manualHtml = await (await fetch(baseURL)).text();
  assert.match(manualHtml, /data-visual-theme="daylight"/, "Le thème manuel n’est pas résolu dans le HTML SSR.");
  assert.match(manualHtml, /--theme-page-background:/, "Les variables du thème ne sont pas sérialisées dans le HTML initial.");

  const publicPage = await context.newPage();
  await publicPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  await publicPage.locator('.public-theme[data-visual-theme="daylight"]').waitFor();
  assert.equal(await publicPage.locator(".public-theme").getAttribute("data-visual-theme"), "daylight");
  assert((await publicPage.locator(".public-theme").evaluate((element) => getComputedStyle(element).backgroundImage)).includes("linear-gradient"), "Le dégradé configuré n’est pas rendu.");
  await revealWholePage(publicPage);
  await publicPage.screenshot({ path: ".test-artifacts/theme-daylight-desktop.png", fullPage: true });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.reload({ waitUntil: "domcontentloaded" });
  await publicPage.locator('.public-theme[data-visual-theme="daylight"]').waitFor();
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth), 390, "Le thème clair provoque un débordement mobile.");
  await revealWholePage(publicPage);
  await publicPage.screenshot({ path: ".test-artifacts/theme-daylight-mobile.png", fullPage: true });
  await publicPage.emulateMedia({ media: "print" });
  assert.equal(await publicPage.locator(".public-theme").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)", "L’impression conserve un fond thémé.");
  await publicPage.close();

  const preview = await context.newPage();
  await preview.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert.equal(await preview.locator(".public-theme").getAttribute("data-visual-theme"), "daylight", "L’aperçu ne partage pas la résolution SSR.");
  await preview.goto(`${baseURL}/preview?theme=aube-test`, { waitUntil: "networkidle" });
  assert.equal(await preview.locator(".public-theme").getAttribute("data-visual-theme"), "aube-test", "L’override temporaire de thème n’est pas appliqué.");
  assert((await preview.locator(".preview-banner").innerText()).includes("thème testé : Aube test modifiée"), "Le preview n’identifie pas le thème testé.");
  assert.match(await (await fetch(baseURL)).text(), /data-visual-theme="daylight"/, "Tester un thème modifie le site public.");
  await preview.goto(`${baseURL}/preview?theme=theme-inexistant`, { waitUntil: "networkidle" });
  assert.equal(await preview.locator(".public-theme").getAttribute("data-visual-theme"), "daylight", "Un thème invalide ne retombe pas sur le thème configuré.");
  await preview.close();

  await page.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "+ Créer une règle" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Créer une règle" });
  await scheduleDialog.getByLabel("Nom").fill("Journée test");
  await scheduleDialog.getByLabel("Thème").selectOption("aube-test");
  await scheduleDialog.getByLabel("Début").fill("07:00");
  await scheduleDialog.getByLabel("Fin").fill("19:00");
  await scheduleDialog.locator('input[name="priority"]').fill("20");
  await scheduleDialog.getByRole("button", { name: "Créer la règle" }).click();
  await scheduleDialog.getByText("Règle créée.").waitFor();
  await scheduleDialog.getByRole("button", { name: /Fermer Créer une règle/ }).click();
  await page.reload({ waitUntil: "networkidle" });
  const scheduleRow = page.locator(".theme-table tbody tr").filter({ hasText: "Journée test" });
  assert.equal(await scheduleRow.count(), 1, "La règle horaire ne persiste pas.");
  await scheduleRow.getByRole("button", { name: "Supprimer" }).click();
  await scheduleRow.waitFor({ state: "detached" });

  await page.getByLabel("Automatique").check();
  await page.getByLabel("Thème forcé").selectOption("default");
  await page.getByRole("button", { name: "Enregistrer le mode" }).click();
  await page.getByText("Sélection automatique activée.").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert(await page.getByLabel("Automatique").isChecked(), "Le mode AUTO n’est pas reflété après refresh.");
  const deletedThemeRow = page.locator(".theme-table tbody tr").filter({ hasText: "aube-test" });
  await deletedThemeRow.getByRole("button", { name: "Supprimer" }).click();
  await deletedThemeRow.waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "La section Apparence déborde à 390 px.");
  await page.screenshot({ path: ".test-artifacts/theme-settings-mobile.png", fullPage: true });
  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
  await context.close();
  console.log(JSON.stringify({ admin: "theme and rule CRUD", persistence: "ok", ssr: "homepage preview no flash markup", responsive: "desktop mobile", print: "white", browserErrors: 0 }));
} finally {
  if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
  await browser.close();
  await logHandle.close();
  await rm(databasePath, { force: true });
}
