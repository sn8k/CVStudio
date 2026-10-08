import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const executablePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const marker = "[test interface V2]";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  await mkdir(".test-artifacts", { recursive: true });
  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);

  await page.goto(`${baseURL}/admin/experiences`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Modifier" }).first().click();
  await page.waitForLoadState("networkidle");

  const sections = page.locator(".admin-editor-section");
  const stagesSection = sections.nth(0);
  await stagesSection.getByRole("button", { name: "Ajouter une fonction" }).click();
  let stageCards = stagesSection.locator(".admin-nested-card");
  await stageCards.last().getByText("Intitulé").locator("..").locator("input").fill(`${marker} fonction`);
  await stageCards.last().getByRole("button", { name: "Monter" }).click();
  await stagesSection.getByRole("button", { name: "Ajouter une fonction" }).click();
  stageCards = stagesSection.locator(".admin-nested-card");
  await stageCards.last().getByText("Intitulé").locator("..").locator("input").fill(`${marker} à supprimer`);
  await stageCards.last().getByRole("button", { name: "Supprimer" }).click();

  const blocksSection = sections.nth(1);
  await blocksSection.getByRole("button", { name: "Ajouter un bloc" }).click();
  let blockCards = blocksSection.locator(".admin-nested-card");
  const newBlock = blockCards.last();
  await newBlock.getByText("Titre affiché").locator("..").locator("input").fill(`${marker} réalisation`);
  await newBlock.getByRole("button", { name: "Ajouter un élément" }).click();
  await newBlock.getByText("Contenu").locator("..").locator("textarea").fill(`${marker} détail`);
  await newBlock.locator(".admin-capability-picker").first().getByRole("checkbox", { name: /Diagnostic/ }).check();
  await newBlock.getByRole("button", { name: "Monter" }).first().click();
  await blocksSection.getByRole("button", { name: "Ajouter un bloc" }).click();
  blockCards = blocksSection.locator(".admin-nested-card");
  await blockCards.last().getByText("Titre affiché").locator("..").locator("input").fill(`${marker} bloc à supprimer`);
  await blockCards.last().getByRole("button", { name: "Supprimer" }).click();

  await page.screenshot({ path: ".test-artifacts/admin-experience-editor.png", fullPage: true });
  await page.getByRole("button", { name: "Enregistrer l’expérience" }).click();
  await page.waitForURL(`${baseURL}/admin/experiences`);
  await page.getByRole("link", { name: "Modifier" }).first().click();
  await page.waitForLoadState("networkidle");
  const persistedValues = await page.locator("input, textarea").evaluateAll((elements) => elements.map((element) => element.value).join("\n"));
  assert(persistedValues.includes(`${marker} réalisation`), "Le bloc ajouté via l’interface ne persiste pas.");
  assert(!persistedValues.includes("bloc à supprimer"), "Le bloc supprimé via l’interface persiste.");

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(marker), "L’aperçu privé ne contient pas les nouveaux contenus.");
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert(!(await page.locator("body").innerText()).includes(marker), "Le site public contient une modification non publiée.");

  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Publier le CV" }).click();
  await page.waitForTimeout(350);
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(marker), "La publication n’expose pas les nouveaux contenus.");

  const exported = await context.request.get(`${baseURL}/api/admin/export`);
  const backup = await exported.json();
  assert(exported.ok() && backup.schemaVersion === 6, "L’export administratif V6 échoue.");
  assert(JSON.stringify(backup).includes(`${marker} détail`), "L’export perd le contenu détaillé.");

  await page.goto(`${baseURL}/admin/data`, { waitUntil: "networkidle" });
  await page.getByLabel("Fichier JSON").setInputFiles({ name: "backup-v2-test.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByLabel("Confirmation").fill("IMPORTER");
  await page.getByRole("button", { name: "Importer dans la version de travail" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes(marker), "L’import via l’administration perd le contenu V2.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/admin/experiences`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Modifier" }).first().click();
  await page.waitForLoadState("networkidle");
  const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(metrics.width === metrics.scrollWidth, `Débordement horizontal admin mobile : ${JSON.stringify(metrics)}`);
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement?.tagName !== "BODY"), "La navigation clavier ne déplace pas le focus.");
  await page.screenshot({ path: ".test-artifacts/admin-experience-mobile.png", fullPage: true });

  assert(errors.length === 0, `Erreurs navigateur : ${errors.join(" | ")}`);
  console.log(JSON.stringify({ stageAddDeleteReorder: "ok", blockAddDeleteReorder: "ok", fineRelation: "ok", previewIsolation: "ok", publication: "ok", exportImportV2: "ok", adminMobile: metrics, browserErrors: 0 }, null, 2));
} finally {
  await browser.close();
}
