import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { adminBackupSchema, getAdminBackup } from "../lib/admin-backup.ts";
import { createPublishedSnapshot, getWorkingResume, normalizeResumeData } from "../lib/resume-data.ts";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const executablePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const slug = "test-liens-projet";
const prisma = new PrismaClient();
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const errors = [];
let testSnapshotId;

page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const withoutLinks = (project) => {
  const legacyProject = { ...project };
  delete legacyProject.links;
  return legacyProject;
};
const submit = async (form, buttonName) => {
  const response = page.waitForResponse((item) => item.request().method() === "POST" && item.url().includes("/admin/editorial"));
  await form.getByRole("button", { name: buttonName, exact: true }).click();
  await response;
  await page.waitForTimeout(300);
};

try {
  await prisma.project.deleteMany({ where: { slug } });
  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(process.env.ADMIN_EMAIL ?? "");
  await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });

  const projectSection = page.locator("section.admin-panel").filter({ has: page.getByRole("heading", { name: "Projets", exact: true }) });
  const addForm = projectSection.locator("form.admin-editorial-form").last();
  await addForm.getByLabel("Titre").fill("Test liens projet");
  await addForm.getByLabel(/Slug/).fill(slug);
  await addForm.getByLabel(/Angle/).fill("Vérifier les liens associés");
  await addForm.getByLabel("État").selectOption("PUBLISHED");
  await submit(addForm, "Ajouter");

  let project = await prisma.project.findUnique({ where: { slug }, include: { links: true } });
  assert(project?.links.length === 0, "Un projet sans lien ne reste pas vide.");
  let form = projectSection.locator(`form:has(input[name="slug"][value="${slug}"])`);
  await form.getByRole("button", { name: "+ Ajouter un lien" }).click();
  await form.getByRole("button", { name: "+ Ajouter un lien" }).click();
  let rows = form.locator(".admin-project-link-row");
  await rows.nth(0).getByLabel("Libellé").fill("GitHub");
  await rows.nth(0).getByLabel("Type").fill("github");
  await rows.nth(0).getByLabel("URL").fill("https://example.com/test-repository");
  await rows.nth(1).getByLabel("Libellé").fill("Site");
  await rows.nth(1).getByLabel("Type").fill("website");
  await rows.nth(1).getByLabel("URL").fill("https://example.com/test-site");
  await rows.nth(1).getByRole("button", { name: "Monter le lien Site" }).click();
  rows = form.locator(".admin-project-link-row");
  await rows.nth(1).getByLabel("Actif").uncheck();
  await submit(form, "Enregistrer");

  project = await prisma.project.findUnique({ where: { slug }, include: { links: { orderBy: { sortOrder: "asc" } } } });
  assert(project?.links.length === 2, "Les deux liens ne sont pas persistés.");
  assert(project.links[0].label === "Site" && project.links[0].sortOrder === 0, "L’ordre des liens n’est pas persisté.");
  assert(project.links[1].label === "GitHub" && !project.links[1].active, "La désactivation d’un lien n’est pas persistée.");

  await page.reload({ waitUntil: "networkidle" });
  form = projectSection.locator(`form:has(input[name="slug"][value="${slug}"])`);
  rows = form.locator(".admin-project-link-row");
  assert(await rows.count() === 2 && await rows.nth(0).getByLabel("Libellé").inputValue() === "Site", "Le rechargement de l’admin perd les liens ou leur ordre.");
  const unsafeUrl = rows.nth(0).getByLabel("URL");
  await unsafeUrl.evaluate((input) => input.setAttribute("type", "text"));
  await unsafeUrl.fill("javascript:alert(1)");
  await submit(form, "Enregistrer");
  assert((await form.getByRole("alert").innerText()).includes("HTTP"), "Une URL de protocole dangereux n’est pas rejetée clairement.");
  assert((await prisma.projectLink.findFirst({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }))?.url === "https://example.com/test-site", "Une URL dangereuse a été persistée.");

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  let previewProject = page.locator(`#project-${slug}`);
  await previewProject.locator("summary").click();
  assert(await previewProject.locator(".project-links a").count() === 1, "La preview doit masquer le lien désactivé.");
  assert((await previewProject.locator(".project-links a").first().innerText()).replace(/\s/g, "") === "Site↗", "Le cartouche du lien actif est incorrect.");

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  form = projectSection.locator(`form:has(input[name="slug"][value="${slug}"])`);
  rows = form.locator(".admin-project-link-row");
  await rows.nth(1).getByLabel("Actif").check();
  await rows.nth(1).getByLabel("URL").fill("https://example.com/test-repository-updated");
  await submit(form, "Enregistrer");
  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  previewProject = page.locator(`#project-${slug}`);
  await previewProject.locator("summary").click();
  assert(await previewProject.locator(".project-links a").count() === 2, "La preview n’affiche pas plusieurs liens actifs.");
  assert(await previewProject.locator('a[href="https://example.com/test-repository-updated"]').count() === 1, "La modification d’URL n’est pas reflétée.");
  assert(await previewProject.locator(".project-links a").first().getAttribute("target") === "_blank", "Le lien externe ne s’ouvre pas dans un nouvel onglet.");
  assert((await previewProject.locator(".project-links a").first().getAttribute("rel"))?.includes("noopener"), "Le lien externe n’est pas sécurisé.");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(mobileMetrics.width === mobileMetrics.scrollWidth, "Les cartouches provoquent un débordement mobile.");
  await previewProject.locator(".project-links a").first().focus();
  assert(await previewProject.locator(".project-links a").first().evaluate((element) => element === document.activeElement), "Le cartouche n’est pas accessible au clavier.");

  const working = await getWorkingResume(true);
  const serializedProject = working.projects.find((item) => item.slug === slug);
  assert(serializedProject?.links.length === 2, "La sérialisation de preview perd les liens.");
  const legacySnapshot = { ...working, schemaVersion: 3, projects: working.projects.map(withoutLinks) };
  assert(normalizeResumeData(legacySnapshot).projects.every((item) => item.links.length === 0), "Un ancien snapshot sans liens n’est pas normalisé.");

  const backup = await getAdminBackup();
  assert(backup.schemaVersion === 6 && backup.projects.find((item) => item.slug === slug)?.links?.length === 2, "L’export V6 perd les liens de projets.");
  const legacyBackup = { ...backup, schemaVersion: 3, projects: backup.projects.map(withoutLinks) };
  assert(adminBackupSchema.safeParse(legacyBackup).success, "Une sauvegarde V3 sans liens de projets n’est plus importable.");

  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert(await page.locator(`#project-${slug}`).count() === 0, "Le projet apparaît avant la publication globale.");
  testSnapshotId = (await createPublishedSnapshot("Test temporaire des liens de projets")).id;
  await page.reload({ waitUntil: "networkidle" });
  const publicProject = page.locator(`#project-${slug}`);
  await publicProject.locator("summary").click();
  assert(await publicProject.locator(".project-links a").count() === 2, "Le snapshot public perd les liens de projets.");
  await prisma.publishedSnapshot.delete({ where: { id: testSnapshotId } });
  testSnapshotId = undefined;

  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  form = projectSection.locator(`form:has(input[name="slug"][value="${slug}"])`);
  rows = form.locator(".admin-project-link-row");
  await rows.nth(1).getByRole("button", { name: "Supprimer" }).click();
  await submit(form, "Enregistrer");
  project = await prisma.project.findUnique({ where: { slug }, include: { links: true } });
  assert(project?.links.length === 1, "La suppression d’un lien n’est pas persistée.");
  form = projectSection.locator(`form:has(input[name="slug"][value="${slug}"])`);
  await form.locator(".admin-project-link-row").getByLabel("Actif").uncheck();
  await submit(form, "Enregistrer");
  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  previewProject = page.locator(`#project-${slug}`);
  await previewProject.locator("summary").click();
  assert(await previewProject.locator(".project-links").count() === 0, "Une zone vide reste visible quand tous les liens sont désactivés.");

  assert(errors.length === 0, `Erreurs navigateur : ${errors.join(" | ")}`);
  console.log(JSON.stringify({ zero: "ok", addMultiple: "ok", update: "ok", reorder: "ok", deactivate: "ok", remove: "ok", reload: "ok", preview: "ok", snapshot: "ok", publicIsolation: "ok", legacySnapshot: "ok", backupV3Compatibility: "ok", mobile: mobileMetrics, keyboard: "ok", browserErrors: 0 }, null, 2));
} finally {
  if (testSnapshotId) await prisma.publishedSnapshot.deleteMany({ where: { id: testSnapshotId } });
  await prisma.project.deleteMany({ where: { slug } });
  await prisma.$disconnect();
  await browser.close();
}
