import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3106";
const executablePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const marker = `Test admin ${Date.now()}`;
const editedMarker = `${marker} édité`;

if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis pour le test.");

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function submitAndReload(button, path) {
  const response = page.waitForResponse((item) => item.request().method() === "POST" && item.url().includes(path));
  await button.click();
  await response;
  await page.waitForLoadState("networkidle");
  await page.reload({ waitUntil: "networkidle" });
}

try {
  await mkdir(".test-artifacts", { recursive: true });
  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);

  await page.goto(`${baseURL}/admin/skills`, { waitUntil: "networkidle" });
  assert((await page.locator(".admin-skill-table tbody tr").count()) > 0, "Le référentiel Skill compact est vide.");
  assert(await page.locator(".admin-table-toolbar").isVisible(), "Les filtres du référentiel Skill sont absents.");
  assert(await page.locator("dialog[open]").count() === 0, "Un formulaire Skill est ouvert au chargement.");
  await page.screenshot({ path: ".test-artifacts/admin-skills-desktop.png", fullPage: true });

  const addTrigger = page.getByRole("button", { name: "+ Ajouter une compétence / un outil" });
  await addTrigger.click();
  let dialog = page.getByRole("dialog", { name: "Ajouter une compétence ou un outil" });
  assert(await dialog.isVisible(), "Le dialogue de création Skill ne s’ouvre pas.");
  await dialog.getByLabel("Nom").fill(marker);
  await dialog.getByLabel("Nature").selectOption("TECHNOLOGY");
  await dialog.getByLabel("Famille éditoriale").fill("Tests d’administration");
  await dialog.getByLabel("Description contextuelle").fill("Skill temporaire pour valider le CRUD administratif.");
  await submitAndReload(dialog.getByRole("button", { name: "Ajouter", exact: true }), "/admin/skills");

  await page.getByLabel("Rechercher").fill(marker);
  let skillRow = page.locator(".admin-skill-table tbody tr").filter({ hasText: marker });
  assert(await skillRow.count() === 1, "Le Skill créé n’apparaît pas dans la recherche.");
  await skillRow.getByRole("button", { name: "Éditer" }).click();
  dialog = page.getByRole("dialog", { name: new RegExp(`Modifier ${marker}`) });
  await dialog.getByLabel("Nom").fill(editedMarker);
  await page.screenshot({ path: ".test-artifacts/admin-skill-dialog-desktop.png" });
  await submitAndReload(dialog.getByRole("button", { name: "Enregistrer" }), "/admin/skills");

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  assert(await page.locator(".admin-data-table").count() === 2, "Les deux inventaires éditoriaux compacts ne sont pas rendus.");
  assert(await page.locator("dialog[open]").count() === 0, "Un formulaire éditorial est ouvert au chargement.");
  await page.screenshot({ path: ".test-artifacts/admin-editorial-desktop.png", fullPage: true });

  const projectRow = page.locator(".admin-project-table tbody tr").filter({ hasText: "Actif" }).first();
  const projectTitle = (await projectRow.locator("th[scope=row] strong").innerText()).trim();
  await projectRow.getByRole("button", { name: "Éditer" }).click();
  let projectDialog = page.getByRole("dialog", { name: `Modifier ${projectTitle}` });
  const summaryField = projectDialog.getByLabel(/Angle \/ résumé court/);
  const originalSummary = await summaryField.inputValue();
  await summaryField.fill(`${originalSummary} ${marker}`);
  await projectDialog.getByLabel("Rechercher une compétence").fill(editedMarker);
  await projectDialog.getByRole("checkbox", { name: new RegExp(editedMarker) }).check();
  await page.screenshot({ path: ".test-artifacts/admin-project-picker-desktop.png" });
  await submitAndReload(projectDialog.getByRole("button", { name: "Enregistrer" }), "/admin/editorial");

  await page.goto(`${baseURL}/admin/skills`, { waitUntil: "networkidle" });
  await page.getByLabel("Rechercher").fill(editedMarker);
  skillRow = page.locator(".admin-skill-table tbody tr").filter({ hasText: editedMarker });
  assert((await skillRow.innerText()).includes("1 projet"), "Le compteur d’usage projet du Skill n’est pas exact.");
  await skillRow.getByRole("button", { name: "Éditer" }).click();
  dialog = page.getByRole("dialog", { name: `Modifier ${editedMarker}` });
  await dialog.getByLabel("Actif").uncheck();
  await submitAndReload(dialog.getByRole("button", { name: "Enregistrer" }), "/admin/skills");

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  const persistedProjectRow = page.locator(".admin-project-table tbody tr").filter({ hasText: projectTitle });
  await persistedProjectRow.getByRole("button", { name: "Éditer" }).click();
  projectDialog = page.getByRole("dialog", { name: `Modifier ${projectTitle}` });
  assert(await projectDialog.getByRole("button", { name: `Retirer ${editedMarker}` }).isVisible(), "Le Skill inactif associé n’est pas conservé dans le picker.");
  await submitAndReload(projectDialog.getByRole("button", { name: "Enregistrer" }), "/admin/editorial");

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(marker), "La preview ne reflète pas la modification projet de travail.");
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert(!(await page.locator("body").innerText()).includes(marker), "Le site public expose une modification de travail non publiée.");

  await page.goto(`${baseURL}/admin/skills`, { waitUntil: "networkidle" });
  await page.getByLabel("Rechercher").fill(editedMarker);
  skillRow = page.locator(".admin-skill-table tbody tr").filter({ hasText: editedMarker });
  const editTrigger = skillRow.getByRole("button", { name: "Éditer" });
  await editTrigger.click();
  await page.keyboard.press("Escape");
  assert(await editTrigger.evaluate((element) => element === document.activeElement), "La fermeture Escape ne restaure pas le focus.");
  await skillRow.getByRole("button", { name: "Supprimer" }).click();
  const deleteDialog = page.getByRole("dialog", { name: `Supprimer ${editedMarker}` });
  assert((await deleteDialog.innerText()).includes("utilisée dans 1 relation"), "La suppression n’avertit pas de l’usage existant.");
  await submitAndReload(deleteDialog.getByRole("button", { name: /Supprimer malgré/ }), "/admin/skills");
  await page.getByLabel("Rechercher").fill(editedMarker);
  assert(await page.locator(".admin-skill-table tbody tr").filter({ hasText: editedMarker }).count() === 0, "Le Skill supprimé est encore présent.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/admin/skills`, { waitUntil: "networkidle" });
  let metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(metrics.width === metrics.scrollWidth, `Débordement horizontal Skills mobile : ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: ".test-artifacts/admin-skills-mobile.png", fullPage: true });

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  await page.locator(".admin-project-table tbody tr").first().getByRole("button", { name: "Éditer" }).click();
  projectDialog = page.getByRole("dialog");
  metrics = await projectDialog.evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: innerWidth, scrollWidth: element.scrollWidth }));
  assert(metrics.width <= metrics.viewport && metrics.scrollWidth <= metrics.width + 1, `Débordement du dialogue projet mobile : ${JSON.stringify(metrics)}`);
  await projectDialog.getByLabel("Rechercher une compétence").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".test-artifacts/admin-project-picker-mobile.png" });

  assert(errors.length === 0, `Erreurs navigateur : ${errors.join(" | ")}`);
  console.log(JSON.stringify({ skillCrud: "ok", safeDelete: "ok", pickerPersistence: "ok", compactEditorial: "ok", previewIsolation: "ok", mobile: metrics, browserErrors: 0 }, null, 2));
} finally {
  await browser.close();
}
