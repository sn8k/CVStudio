import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { parse } from "dotenv";
import { deployMigrationsOnCopy } from "./test-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
const databasePath = fileURLToPath(new URL("../.test-artifacts/settings.db", import.meta.url));
const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const baseURL = "http://localhost:3107";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const newPassword = "Settings-Test-Password-2026!";
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");

const packageMetadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.match(packageMetadata.version, /^0\.\d+\.\d+$/, "La version CVStudio doit suivre SemVer 0.x.y.");
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
assert.equal(packageLock.version, packageMetadata.version, "package-lock.json ne reprend pas la version CVStudio.");
assert.equal(packageLock.packages?.[""]?.version, packageMetadata.version, "Le package racine du lockfile a une version différente.");
const changelog = await readFile(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
assert(changelog.includes(`## [${packageMetadata.version}]`), "Le changelog ne documente pas la version CVStudio actuelle.");
const settingsPageSource = await readFile(new URL("../app/admin/(protected)/settings/page.tsx", import.meta.url), "utf8");
assert.match(settingsPageSource, /import packageMetadata from "@\/package\.json";/, "La version Settings ne provient pas de package.json.");
assert.doesNotMatch(settingsPageSource, /value="\d+\.\d+\.\d+"/, "La version Settings est dupliquée en dur.");

await mkdir(artifacts, { recursive: true });
await copyFile(sourceDatabase, databasePath);
const beforeDatabase = new DatabaseSync(databasePath);
const profileCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Profile"').get().count;
const experienceCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Experience"').get().count;
const accountCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Account"').get().count;
const sessionCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Session"').get().count;
const audienceCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "DailyPageView"').get().count;
const snapshotCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "PublishedSnapshot"').get().count;
const interestCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Interest"').get().count;
const mediaCountBefore = beforeDatabase.prepare('SELECT COUNT(*) AS count FROM "Media"').get().count;
// Rebuild the pre-migration state on the disposable copy, never on the source database.
beforeDatabase.exec(`
  BEGIN IMMEDIATE;
  DROP INDEX IF EXISTS "Media_interestId_kind_sortOrder_idx";
  ALTER TABLE "Media" DROP COLUMN "interestId";
  ALTER TABLE "Interest" DROP COLUMN "description";
  DROP TABLE IF EXISTS "ThemeSchedule";
  DROP TABLE IF EXISTS "VisualTheme";
  DROP TABLE IF EXISTS "SystemSettings";
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920223000_visual_themes';
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920210000_system_settings';
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260921113000_enriched_interests';
  COMMIT;
`);
beforeDatabase.close();
deployMigrationsOnCopy(root, databasePath);
const migratedDatabase = new DatabaseSync(databasePath);
assert(migratedDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'SystemSettings'").get(), "La migration ne crée pas SystemSettings.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "SystemSettings"').get().count, 0, "La migration crée un réglage implicite au lieu de conserver le fallback ENV.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "VisualTheme"').get().count, 2, "La migration Settings ne déploie pas les thèmes intégrés.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "ThemeSchedule"').get().count, 0, "La migration Settings active une programmation implicite.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Profile"').get().count, profileCountBefore, "La migration modifie les profils.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Experience"').get().count, experienceCountBefore, "La migration modifie les expériences.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Account"').get().count, accountCountBefore, "La migration modifie les comptes Better Auth.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Session"').get().count, sessionCountBefore, "La migration modifie les sessions Better Auth.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "DailyPageView"').get().count, audienceCountBefore, "La migration modifie les statistiques d’audience.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "PublishedSnapshot"').get().count, snapshotCountBefore, "La migration modifie les snapshots.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Interest"').get().count, interestCountBefore, "La migration modifie le nombre de centres d’intérêt.");
assert.equal(migratedDatabase.prepare('SELECT COUNT(*) AS count FROM "Media"').get().count, mediaCountBefore, "La migration modifie le nombre de médias.");
assert(migratedDatabase.prepare('SELECT description FROM "Interest" LIMIT 1'), "La migration n’ajoute pas la description des centres d’intérêt.");
assert(migratedDatabase.prepare('SELECT interestId FROM "Media" LIMIT 1'), "La migration ne relie pas Media aux centres d’intérêt.");
migratedDatabase.close();

const exampleEnvironment = parse(await readFile(new URL("../.env.example", import.meta.url)));
for (const [key, value] of Object.entries(exampleEnvironment)) {
  if (key.startsWith("CONTACT_") || key.startsWith("TURNSTILE_") || key === "SETTINGS_ENCRYPTION_KEY") process.env[key] = value;
}
Object.assign(process.env, {
  DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
  BETTER_AUTH_URL: baseURL,
  PUBLIC_SITE_URL: baseURL,
  AUDIENCE_MEASUREMENT_ENABLED: "true",
});

const {
  decryptSettingsSecret,
  encryptSettingsSecret,
  SettingsEncryptionUnavailableError,
  SettingsSecretDecryptionError,
} = await import("../lib/settings-crypto.ts");
const firstCiphertext = encryptSettingsSecret("smtp-plaintext-test");
assert.equal(decryptSettingsSecret(firstCiphertext), "smtp-plaintext-test");
assert(!firstCiphertext.includes("smtp-plaintext-test"), "Le ciphertext contient le secret en clair.");
const tamperedParts = firstCiphertext.split(".");
tamperedParts[3] = `${tamperedParts[3][0] === "A" ? "B" : "A"}${tamperedParts[3].slice(1)}`;
const tampered = tamperedParts.join(".");
assert.throws(() => decryptSettingsSecret(tampered), SettingsSecretDecryptionError, "Une altération du ciphertext n’est pas détectée.");
const otherKey = Buffer.alloc(32, 7).toString("base64");
assert.throws(() => decryptSettingsSecret(firstCiphertext, otherKey), SettingsSecretDecryptionError, "Une mauvaise clé déchiffre le secret.");
const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
delete process.env.SETTINGS_ENCRYPTION_KEY;
assert.throws(() => encryptSettingsSecret("never-plaintext"), SettingsEncryptionUnavailableError, "Un secret peut être persisté sans clé maître.");
process.env.SETTINGS_ENCRYPTION_KEY = encryptionKey;

const { prisma } = await import("../lib/prisma.ts");
const { getEffectiveSystemSettings } = await import("../lib/system-settings.ts");
const { sendAdminSmtpTest, getContactTestDeliveries, resetContactTestDeliveries } = await import("../lib/contact-mailer.ts");
assert.equal(await prisma.systemSettings.findUnique({ where: { id: "main" } }), null, "La migration ne conserve pas un singleton absent.");
let effective = await getEffectiveSystemSettings();
assert.equal(effective.sources.smtp, "environment");
assert.equal(effective.contact?.host, "smtp.example.test");
assert.equal(effective.contactFormOperational, true, "Le fallback ENV Contact n’est plus opérationnel.");

await prisma.systemSettings.create({
  data: {
    id: "main",
    contactFormEnabled: false,
    smtpHost: "smtp.database.test",
    smtpPort: 2525,
    smtpSecure: false,
    smtpUser: "database-user",
    smtpPasswordEncrypted: encryptSettingsSecret("database-smtp-secret"),
    contactFromEmail: "from@database.test",
    contactFromName: "CVStudio DB",
    contactToEmail: "to@database.test",
    turnstileSiteKey: exampleEnvironment.TURNSTILE_SITE_KEY,
    turnstileSecretEncrypted: encryptSettingsSecret(exampleEnvironment.TURNSTILE_SECRET_KEY),
    audienceMeasurementEnabled: false,
  },
});
effective = await getEffectiveSystemSettings();
assert.equal(effective.sources.smtp, "database");
assert.equal(effective.contact?.host, "smtp.database.test");
assert.equal(effective.contact?.password, "database-smtp-secret");
assert.equal(effective.contactFormOperational, false, "DB false n’écrase pas CONTACT_FORM_ENABLED=true.");
assert.equal(effective.audienceMeasurementEnabled, false, "DB false n’écrase pas AUDIENCE_MEASUREMENT_ENABLED=true.");
const storedSecrets = await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" }, select: { smtpPasswordEncrypted: true, turnstileSecretEncrypted: true } });
assert(!storedSecrets.smtpPasswordEncrypted.includes("database-smtp-secret"), "Le secret SMTP est stocké en clair.");
assert(!storedSecrets.turnstileSecretEncrypted.includes(exampleEnvironment.TURNSTILE_SECRET_KEY), "Le secret Turnstile est stocké en clair.");
process.env.SETTINGS_ENCRYPTION_KEY = otherKey;
effective = await getEffectiveSystemSettings();
assert.equal(effective.secrets.smtpPassword, "unreadable");
assert.equal(effective.contact, null, "Un secret DB illisible laisse SMTP opérationnel.");
process.env.SETTINGS_ENCRYPTION_KEY = encryptionKey;
await prisma.systemSettings.delete({ where: { id: "main" } });

resetContactTestDeliveries();
effective = await getEffectiveSystemSettings();
await sendAdminSmtpTest(effective.contact);
const [smtpTestDelivery] = getContactTestDeliveries();
assert.equal(smtpTestDelivery.to, exampleEnvironment.CONTACT_TO_EMAIL, "Le test SMTP n’utilise pas le destinataire effectif.");
assert.equal(smtpTestDelivery.subject, "Test SMTP — CVStudio");
assert(!smtpTestDelivery.text.includes("Turnstile"), "Le test SMTP dépend de Turnstile.");

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Le serveur de test Settings n’a pas démarré.");
}

const logHandle = await open(new URL("../.test-artifacts/settings-server.log", import.meta.url), "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3107"], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", logHandle.fd, logHandle.fd],
});
const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const browserErrors = [];

async function login(page, password) {
  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

try {
  await waitForServer();
  const anonymous = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  assert.equal(anonymousPage.url(), `${baseURL}/admin/login`, "Settings est accessible sans session admin.");
  await anonymous.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("401")) browserErrors.push(message.text()); });
  await login(page, adminPassword);
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  assert(await page.getByRole("heading", { name: "Réglages globaux" }).isVisible());
  assert.equal(await page.getByRole("link", { name: /07 Configuration/ }).count(), 1);
  assert(await page.getByText(packageMetadata.version, { exact: true }).isVisible(), "La version de package.json n’est pas affichée dans l’état système.");
  assert.equal(await page.getByLabel("SMTP Host").inputValue(), exampleEnvironment.CONTACT_SMTP_HOST);
  assert.equal(await page.getByLabel("SMTP Password").inputValue(), "", "Le mot de passe SMTP est affiché.");
  assert.equal(await page.getByLabel("Turnstile Secret Key").inputValue(), "", "Le secret Turnstile est affiché.");
  assert.equal(await page.getByLabel("SMTP Password").getAttribute("placeholder"), exampleEnvironment.CONTACT_SMTP_PASSWORD ? "••••••••" : null, "L’indicateur SMTP ne respecte pas la présence réelle du secret.");
  assert.equal(await page.getByLabel("Turnstile Secret Key").getAttribute("placeholder"), exampleEnvironment.TURNSTILE_SECRET_KEY ? "••••••••" : null, "L’indicateur Turnstile ne respecte pas la présence réelle du secret.");
  assert((await page.locator("body").innerText()).includes("Variables d’environnement"));
  const panels = page.locator(".settings-panel");
  await panels.nth(0).screenshot({ path: ".test-artifacts/settings-services-desktop.png" });

  await page.getByLabel("SMTP Host").fill("smtp.admin.test");
  await page.getByLabel("SMTP User").fill("admin-user");
  await page.getByLabel("SMTP Password").fill("admin-smtp-secret");
  await page.getByLabel("Turnstile Secret Key").fill(exampleEnvironment.TURNSTILE_SECRET_KEY);
  await page.getByRole("button", { name: "Enregistrer les services Contact" }).click();
  await page.getByText("Configuration du contact enregistrée.").waitFor();
  const saved = await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } });
  assert.equal(saved.smtpHost, "smtp.admin.test");
  assert(!saved.smtpPasswordEncrypted.includes("admin-smtp-secret"));
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("SMTP Password").inputValue(), "", "Le secret enregistré est renvoyé au navigateur.");
  assert.equal(await page.getByLabel("SMTP Password").getAttribute("placeholder"), "••••••••");
  assert(!(await page.content()).includes("admin-smtp-secret"), "Le secret SMTP fuit dans le HTML.");
  const preservedCiphertext = saved.smtpPasswordEncrypted;
  const preserveResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/settings"));
  await page.getByRole("button", { name: "Enregistrer les services Contact" }).click();
  await preserveResponse;
  await page.waitForTimeout(250);
  assert.equal((await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } })).smtpPasswordEncrypted, preservedCiphertext, "Un champ secret intact ne conserve pas son ciphertext.");
  await page.getByLabel("SMTP Password").fill("admin-smtp-secret-remplace");
  assert.equal(await page.getByLabel("SMTP Password").inputValue(), "admin-smtp-secret-remplace");
  const replaceResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/settings"));
  await page.getByRole("button", { name: "Enregistrer les services Contact" }).click();
  await replaceResponse;
  const replaced = await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } });
  assert.notEqual(replaced.smtpPasswordEncrypted, preservedCiphertext, "Une nouvelle saisie ne remplace pas le secret.");
  assert.equal(decryptSettingsSecret(replaced.smtpPasswordEncrypted), "admin-smtp-secret-remplace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Supprimer le mot de passe SMTP enregistré et reprendre le fallback ENV").check();
  await page.getByLabel("Supprimer le secret Turnstile enregistré et reprendre le fallback ENV").check();
  const removeSecretsResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/settings"));
  await page.getByRole("button", { name: "Enregistrer les services Contact" }).click();
  await removeSecretsResponse;
  const explicitlyRemoved = await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } });
  assert.equal(explicitlyRemoved.smtpPasswordEncrypted, null, "La suppression explicite du secret SMTP échoue.");
  assert.equal(explicitlyRemoved.turnstileSecretEncrypted, null, "La suppression explicite du secret Turnstile échoue.");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("SMTP User").fill("");
  const unauthenticatedSmtpResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/settings"));
  await page.getByRole("button", { name: "Enregistrer les services Contact" }).click();
  await unauthenticatedSmtpResponse;
  await page.waitForTimeout(200);
  await panels.nth(0).screenshot({ path: ".test-artifacts/settings-save-feedback.png" });

  await page.getByRole("button", { name: "Envoyer un e-mail de test" }).click();
  await page.getByText("Test SMTP envoyé.").waitFor();
  await page.locator(".settings-secondary-actions").screenshot({ path: ".test-artifacts/settings-smtp-test.png" });
  await page.getByLabel("Confirmer le retour vers ENV", { exact: true }).first().check();
  await page.getByRole("button", { name: "Réinitialiser Contact vers ENV" }).click();
  await page.getByText("Le contact utilise de nouveau les variables d’environnement.").waitFor();
  const resetContact = await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } });
  assert.equal(resetContact.smtpHost, null);
  assert.equal(resetContact.smtpPasswordEncrypted, null);
  assert.equal((await getEffectiveSystemSettings()).contact?.host, exampleEnvironment.CONTACT_SMTP_HOST, "Le reset Contact ne restaure pas l’ENV.");

  const audienceCheckbox = page.getByLabel("Activer la mesure d’audience");
  if (await audienceCheckbox.isChecked()) await audienceCheckbox.uncheck();
  await page.getByRole("button", { name: "Enregistrer le réglage Audience" }).click();
  await page.getByText("Réglage de la mesure d’audience enregistré.").waitFor();
  assert.equal((await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } })).audienceMeasurementEnabled, false);
  await page.getByLabel("Confirmer le retour vers ENV", { exact: true }).last().check();
  await page.getByRole("button", { name: "Réinitialiser Audience vers ENV" }).click();
  await page.getByText("La mesure d’audience utilise de nouveau la variable d’environnement.").waitFor();
  assert.equal((await prisma.systemSettings.findUniqueOrThrow({ where: { id: "main" } })).audienceMeasurementEnabled, null);

  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const secondPage = await secondContext.newPage();
  await login(secondPage, adminPassword);
  await secondPage.waitForURL(`${baseURL}/admin`);

  await page.getByLabel("Mot de passe actuel").fill(adminPassword);
  await page.getByLabel("Nouveau mot de passe").fill(newPassword);
  await page.getByLabel("Confirmation").fill(`${newPassword}x`);
  await page.getByRole("button", { name: "Modifier le mot de passe" }).click();
  await page.getByText("La confirmation ne correspond pas au nouveau mot de passe.").waitFor();
  await page.getByLabel("Mot de passe actuel").fill("incorrect-current-password");
  await page.getByLabel("Nouveau mot de passe").fill(newPassword);
  await page.getByLabel("Confirmation").fill(newPassword);
  await page.getByRole("button", { name: "Modifier le mot de passe" }).click();
  await page.getByText("Le mot de passe actuel est incorrect ou le changement a échoué.").waitFor();
  await page.getByLabel("Mot de passe actuel").fill(adminPassword);
  await page.getByLabel("Nouveau mot de passe").fill(newPassword);
  await page.getByLabel("Confirmation").fill(newPassword);
  await page.getByRole("button", { name: "Modifier le mot de passe" }).click();
  await page.getByText("Mot de passe modifié et autres sessions déconnectées.").waitFor();
  await panels.nth(2).screenshot({ path: ".test-artifacts/settings-password-success.png" });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(page.url(), `${baseURL}/admin/settings`, "La session courante n’est pas conservée après révocation.");
  await secondPage.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  assert.equal(secondPage.url(), `${baseURL}/admin/login`, "Une autre session n’a pas été révoquée.");
  await secondContext.close();

  await page.locator(".settings-panel").nth(3).screenshot({ path: ".test-artifacts/settings-security-desktop.png" });
  await page.locator(".settings-panel").nth(4).screenshot({ path: ".test-artifacts/settings-system-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/admin/settings`, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Settings déborde à 390 px.");
  await page.screenshot({ path: ".test-artifacts/settings-mobile-390.png", fullPage: true });
  await page.getByLabel("SMTP Host").focus();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, outline: getComputedStyle(document.activeElement).outlineStyle, shadow: getComputedStyle(document.activeElement).boxShadow }));
  assert(focused.tag === "INPUT" && (focused.outline !== "none" || focused.shadow !== "none"), `Le focus clavier Settings n’est pas visible : ${JSON.stringify(focused)}`);

  await page.getByRole("button", { name: "Déconnexion" }).click();
  await page.waitForURL(`${baseURL}/admin/login`);
  await login(page, adminPassword);
  await page.getByText("Identifiants incorrects ou compte indisponible.").waitFor();
  await login(page, newPassword);
  await page.waitForURL(`${baseURL}/admin`);
  await context.close();

  const actionsSource = await readFile(new URL("../app/admin/(protected)/settings/actions.ts", import.meta.url), "utf8");
  assert.equal((actionsSource.match(/await requireAdmin\(\)/g) ?? []).length, 11, "Toutes les actions Settings n’exigent pas requireAdmin().");
  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
  console.log(JSON.stringify({ migration: "additive on copy", encryption: "AES-256-GCM tamper wrong-key missing-key", effectiveConfig: "ENV DB override false reset unreadable", auth: "Better Auth changePassword current password and session revocation", smtpTest: "JSON transport fixed recipient subject", ui: "protected desktop mobile keyboard feedback", screenshots: 7 }));
} finally {
  if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
  await browser.close();
  await logHandle.close();
  await prisma.$disconnect();
  await rm(databasePath, { force: true });
}
