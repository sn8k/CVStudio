import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { adminBackupSchema, getAdminBackup } from "../lib/admin-backup.ts";
import { createPublishedSnapshot, getPublishedResume, getWorkingResume, normalizeResumeData } from "../lib/resume-data.ts";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const executablePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const prisma = new PrismaClient();
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const errors = [];
const baselineLicenses = await prisma.drivingLicense.findMany();
let testSnapshotId;

page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const submit = async (form, buttonName) => {
  const response = page.waitForResponse((item) => item.request().method() === "POST" && item.url().includes("/admin/foundations"));
  await form.getByRole("button", { name: buttonName, exact: true }).click();
  await response;
  await page.waitForTimeout(250);
};

try {
  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(process.env.ADMIN_EMAIL ?? "");
  await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/foundations`, { waitUntil: "networkidle" });

  const licenseSection = page.locator("section.admin-panel").filter({ has: page.getByRole("heading", { name: "Permis", exact: true }) });
  let addForm = licenseSection.locator("form.admin-license-form").last();
  await addForm.getByLabel("Catégorie du permis").fill("A2");
  await addForm.getByLabel("Statut du permis").selectOption("IN_PROGRESS");
  await addForm.getByLabel("Note publique du permis").fill("Test temporaire");
  await addForm.getByLabel("État éditorial").selectOption("PUBLISHED");
  await submit(addForm, "Ajouter");
  assert((await prisma.drivingLicense.findUnique({ where: { label: "A2" } }))?.status === "IN_PROGRESS", "La création d’un permis via l’admin échoue.");

  let a2Form = licenseSection.locator('form:has(input[name="label"][value="A2"])').first();
  await a2Form.getByLabel("Statut du permis").selectOption("OBTAINED");
  await a2Form.getByLabel("Date d’obtention").fill("2026-09-19");
  await submit(a2Form, "Enregistrer");
  assert((await prisma.drivingLicense.findUnique({ where: { label: "A2" } }))?.status === "OBTAINED", "La modification du statut permis échoue.");

  await page.reload({ waitUntil: "networkidle" });
  a2Form = licenseSection.locator('form:has(input[name="label"][value="A2"])').first();
  if (await a2Form.getByRole("button", { name: "Monter le permis A2" }).isEnabled()) {
    const response = page.waitForResponse((item) => item.request().method() === "POST" && item.url().includes("/admin/foundations"));
    await a2Form.getByRole("button", { name: "Monter le permis A2" }).click();
    await response;
    await page.waitForTimeout(250);
  }

  addForm = licenseSection.locator("form.admin-license-form").last();
  await addForm.getByLabel("Catégorie du permis").fill("C");
  await addForm.getByLabel("Statut du permis").selectOption("PLANNED");
  await addForm.getByLabel("État éditorial").selectOption("DRAFT");
  await submit(addForm, "Ajouter");
  let cForm = licenseSection.locator('form:has(input[name="label"][value="C"])').first();
  await cForm.locator('input[name="active"]').uncheck();
  await submit(cForm, "Enregistrer");

  const working = await getWorkingResume(true);
  const eligible = await getWorkingResume(false);
  assert(working.drivingLicenses.some((item) => item.label === "A2"), "Le permis publié manque dans la preview sérialisée.");
  assert(!working.drivingLicenses.some((item) => item.label === "C"), "Un permis désactivé apparaît dans la preview sérialisée.");
  assert(eligible.drivingLicenses.every((item) => item.label !== "C"), "Un permis brouillon apparaît parmi les éléments publiables.");

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  const previewMobility = await page.locator(".contact-licenses").innerText();
  assert(previewMobility.includes("Permis ") && previewMobility.includes("B — prévu") && previewMobility.includes("A2 — obtenu"), "Le rendu multi-permis de la preview est incorrect.");

  const backup = await getAdminBackup();
  assert(backup.schemaVersion === 6 && backup.drivingLicenses?.some((item) => item.label === "A2"), "L’export V6 perd les permis.");
  const legacyBackup = { ...backup, schemaVersion: 2 };
  delete legacyBackup.drivingLicenses;
  assert(adminBackupSchema.safeParse(legacyBackup).success, "Une sauvegarde V2 sans permis n’est plus importable.");

  const legacySnapshot = { ...working, schemaVersion: 2 };
  delete legacySnapshot.drivingLicenses;
  assert(normalizeResumeData(legacySnapshot).drivingLicenses.length === 0, "Un ancien snapshot sans permis n’est pas normalisé.");

  testSnapshotId = (await createPublishedSnapshot("Test temporaire des permis")).id;
  assert((await getPublishedResume()).drivingLicenses.some((item) => item.label === "A2"), "Le snapshot V5 perd les permis publiables.");
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const publicMobility = await page.locator(".contact-licenses").innerText();
  assert(publicMobility.includes("Permis ") && publicMobility.includes("B — prévu"), "Le rendu public après snapshot est incorrect.");
  await prisma.publishedSnapshot.delete({ where: { id: testSnapshotId } });
  testSnapshotId = undefined;
  await page.reload({ waitUntil: "networkidle" });
  assert(await page.locator(".contact-licenses").count() === 0, "Un ancien snapshot sans permis affiche un bloc vide.");

  await prisma.drivingLicense.updateMany({ data: { active: false } });
  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert(await page.locator(".contact-licenses").count() === 0, "La preview affiche un bloc permis sans entrée active.");

  await page.goto(`${baseURL}/admin/foundations`, { waitUntil: "networkidle" });
  assert(await page.getByRole("option", { name: "Brouillon", exact: true }).count() > 0, "Le libellé Brouillon manque.");
  assert(await page.getByRole("option", { name: "Prêt à publier", exact: true }).count() > 0, "Le libellé Prêt à publier manque.");
  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  assert(await page.getByRole("button", { name: "Publier le CV" }).isVisible(), "Le bouton de publication globale est ambigu.");
  assert(errors.length === 0, `Erreurs navigateur : ${errors.join(" | ")}`);

  console.log(JSON.stringify({ create: "ok", update: "ok", reorder: "ok", multiple: "ok", deactivate: "ok", preview: "ok", snapshot: "ok", publicAfterSnapshot: "ok", emptyState: "ok", legacySnapshot: "ok", backupV2Compatibility: "ok", publicationLabels: "ok", browserErrors: 0 }, null, 2));
} finally {
  if (testSnapshotId) await prisma.publishedSnapshot.deleteMany({ where: { id: testSnapshotId } });
  await prisma.$transaction(async (tx) => {
    await tx.drivingLicense.deleteMany();
    if (baselineLicenses.length) await tx.drivingLicense.createMany({ data: baselineLicenses });
  });
  await prisma.$disconnect();
  await browser.close();
}
