import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const slug = "test-enregistrement-projet";
const prisma = new PrismaClient();
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const serverActions = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("response", (response) => {
  if (response.request().method() === "POST") serverActions.push({ status: response.status(), url: response.url() });
});

try {
  await prisma.project.deleteMany({ where: { slug } });
  const snapshotCount = await prisma.publishedSnapshot.count();
  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });

  const form = page.locator(".admin-editorial-list").first().locator("form").last();
  await form.getByLabel("Titre").fill("Test enregistrement projet");
  await form.getByLabel(/Slug/).fill(slug);
  await form.getByLabel("Angle / résumé court").fill("Création test");
  await form.getByRole("button", { name: "Ajouter" }).click();
  await form.getByRole("status").waitFor();

  const created = await prisma.project.findUnique({ where: { slug } });
  assert(created?.summary === "Création test", "La création du projet n’est pas persistée.");
  assert(created.active && created.status === "DRAFT", "Le projet de test n’est pas un brouillon actif.");
  const editForm = page.locator(`form:has(input[name="slug"][value="${slug}"])`);
  const renderedAfterCreate = await editForm.count();
  assert(renderedAfterCreate === 1, "Le projet créé n’apparaît pas dans l’administration.");
  await editForm.getByLabel("Angle / résumé court").fill("Modification test");
  await editForm.getByRole("button", { name: "Enregistrer" }).click();
  await editForm.getByRole("status").waitFor();
  const edited = await prisma.project.findUnique({ where: { slug } });
  assert(edited?.summary === "Modification test", "La modification du projet n’est pas persistée.");

  await page.reload({ waitUntil: "networkidle" });
  const reloadedForm = page.locator(`form:has(input[name="slug"][value="${slug}"])`);
  assert(await reloadedForm.getByLabel("Angle / résumé court").inputValue() === "Modification test", "Le rechargement de l’admin perd la modification.");

  await reloadedForm.getByLabel("Titre").evaluate((input) => input.removeAttribute("required"));
  await reloadedForm.getByLabel("Titre").fill("");
  await reloadedForm.getByRole("button", { name: "Enregistrer" }).click();
  await reloadedForm.getByRole("alert").waitFor();
  assert((await reloadedForm.getByRole("alert").innerText()).includes("obligatoire"), "L’erreur de validation n’est pas compréhensible.");
  const afterInvalid = await prisma.project.findUnique({ where: { slug } });
  assert(afterInvalid?.title === "Test enregistrement projet", "Une soumission invalide a modifié la base.");
  assert(afterInvalid.active && afterInvalid.status === "DRAFT", `Le projet n’est plus un brouillon actif : ${JSON.stringify(afterInvalid)}`);

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  const previewText = await page.locator("body").textContent();
  assert(previewText.includes("Test enregistrement projet"), `Le brouillon n’apparaît pas dans la preview (${page.url()}) : ${previewText.slice(0, 180)}`);
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert(!(await page.locator("body").textContent()).includes("Test enregistrement projet"), "Le brouillon apparaît sur le site public.");
  assert(await prisma.publishedSnapshot.count() === snapshotCount, "Le test a publié un snapshot automatiquement.");
  assert(browserErrors.length === 0, `Erreurs navigateur : ${browserErrors.join(" | ")}`);

  console.log(JSON.stringify({ creation: "ok", edition: "ok", adminReload: "ok", validationFeedback: "ok", previewDraft: "ok", publicIsolation: "ok", snapshotUnchanged: "ok", serverActions: serverActions.length, browserErrors: 0 }, null, 2));
} finally {
  await prisma.project.deleteMany({ where: { slug } });
  await prisma.$disconnect();
  await browser.close();
}
