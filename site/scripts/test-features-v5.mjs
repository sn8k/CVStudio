import "dotenv/config";
import assert from "node:assert/strict";
import { copyFile, mkdir, open, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { deployMigrationsOnCopy } from "./test-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
const databasePath = fileURLToPath(new URL("../.test-artifacts/features-v5.db", import.meta.url));
const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const publicTestDirectory = fileURLToPath(new URL("../public/projects/test/", import.meta.url));
const publicTestCover = fileURLToPath(new URL("../public/projects/test/cover.png", import.meta.url));
const baseURL = "http://localhost:3104";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");

await mkdir(artifacts, { recursive: true });
await mkdir(publicTestDirectory, { recursive: true });
await writeFile(publicTestCover, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAu5c4ioAAAAASUVORK5CYII=", "base64"));
await copyFile(sourceDatabase, databasePath);
process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.BETTER_AUTH_URL = baseURL;
process.env.PUBLIC_SITE_URL = baseURL;
deployMigrationsOnCopy(root, databasePath);

const { ContentStatus, LinkPlacement, ProjectDisplayMode } = await import("@prisma/client");
const { prisma } = await import("../lib/prisma.ts");
const { createPublishedSnapshot, getPublishedResumeWithMetadata } = await import("../lib/resume-data.ts");

const marker = "[test-v5]";
const testLinks = [
  { label: "Accueil V5", kind: "website", placement: LinkPlacement.HOME, active: true, status: ContentStatus.PUBLISHED },
  { label: "Contact V5", kind: "linkedin", placement: LinkPlacement.CONTACT, active: true, status: ContentStatus.PUBLISHED },
  { label: "Partout V5", kind: "github", placement: LinkPlacement.BOTH, active: true, status: ContentStatus.PUBLISHED },
  { label: "Réseau futur V5", kind: "future-network", placement: LinkPlacement.CONTACT, active: true, status: ContentStatus.PUBLISHED },
  { label: "Inactif V5", kind: "website", placement: LinkPlacement.BOTH, active: false, status: ContentStatus.PUBLISHED },
  { label: "Brouillon V5", kind: "website", placement: LinkPlacement.BOTH, active: true, status: ContentStatus.DRAFT },
  { label: "À supprimer V5", kind: "website", placement: LinkPlacement.CONTACT, active: true, status: ContentStatus.PUBLISHED },
];

await prisma.link.deleteMany({ where: { privateNotes: marker } });
for (const [sortOrder, link] of testLinks.entries()) {
  await prisma.link.create({ data: { ...link, url: `https://example.test/v5-${sortOrder}`, sortOrder: 900 + sortOrder, privateNotes: marker } });
}
const projects = await prisma.project.findMany({
  where: { active: true, status: ContentStatus.PUBLISHED },
  orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  include: { skills: true, links: { where: { active: true } } },
});
assert(projects.length >= 5, "Au moins cinq projets publiables sont nécessaires au test.");
for (const [index, project] of projects.entries()) {
  const displayMode = index === 0 ? ProjectDisplayMode.PINNED : index === 3 ? ProjectDisplayMode.HIDDEN : ProjectDisplayMode.ROTATING;
  await prisma.project.update({ where: { id: project.id }, data: { displayMode } });
}
const pinned = projects[0];
const hidden = projects[3];
const dialogProjectBase = projects.find((project) => project.id !== hidden.id && project.skills.length > 0);
assert(dialogProjectBase, "Un projet public avec compétences est nécessaire au test du dialog.");
await prisma.project.update({ where: { id: dialogProjectBase.id }, data: { description: "Description complète du projet pour le test du dialog." } });
await prisma.projectLink.create({ data: { projectId: dialogProjectBase.id, label: "Documentation du projet", url: "https://example.test/project-dialog", kind: "docs", active: true, sortOrder: 999 } });
const dialogProject = await prisma.project.findUniqueOrThrow({ where: { id: dialogProjectBase.id }, include: { skills: true, links: { where: { active: true } } } });
const httpsCoverProject = projects[1];
await prisma.media.deleteMany({ where: { projectId: httpsCoverProject.id, kind: "project-cover" } });
await prisma.media.create({ data: {
  projectId: httpsCoverProject.id,
  kind: "project-cover",
  url: "https://images.example.test/cover.png",
  alt: "Interface de test du projet",
  caption: "Visuel HTTPS de test",
  sortOrder: 0,
} });
await prisma.publishedSnapshot.deleteMany();
assert.equal((await getPublishedResumeWithMetadata()).lastPublishedAt, null, "L'absence de publication n'est pas représentée par null.");
const initialSnapshot = await createPublishedSnapshot("Test isolé des fonctionnalités V5");
await prisma.publishedSnapshot.update({ where: { id: initialSnapshot.id }, data: { createdAt: new Date("2020-01-14T12:00:00.000Z") } });

const logHandle = await open(new URL("../.test-artifacts/features-v5-server.log", import.meta.url), "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3104"], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", logHandle.fd, logHandle.fd],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le serveur de test V5 n’a pas démarré.");
}

const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
await page.route("https://images.example.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAu5c4ioAAAAASUVORK5CYII=", "base64") }));
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  await waitForServer();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const hero = await page.locator(".hero-social-links").innerText();
  const contact = await page.locator("#contact").innerText();
  assert(hero.includes("Accueil V5") && hero.includes("Partout V5"));
  assert(!hero.includes("Contact V5") && !hero.includes("Inactif V5") && !hero.includes("Brouillon V5"));
  assert(contact.includes("Contact V5") && contact.includes("Partout V5") && contact.includes("Réseau futur V5"));
  assert(!contact.includes("Accueil V5") && !contact.includes("Inactif V5") && !contact.includes("Brouillon V5"));
  const pdfContact = page.locator(".contact-link").filter({ hasText: "Télécharger le CV PDF" });
  assert((await pdfContact.innerText()).startsWith("CV\n"), "Le téléchargement PDF n'utilise pas le libellé CV.");
  assert(!(await pdfContact.innerText()).includes("Document"), "L'ancien libellé Document reste affiché.");
  assert((await page.locator(".footer-updated").innerText()).includes("14 janvier 2020"), "Le footer n'utilise pas la date du PublishedSnapshot.");
  const linkedInContact = page.getByRole("link", { name: "LinkedIn — Contact V5 (nouvel onglet)" });
  const githubHome = page.locator('.hero-social-links a[href="https://example.test/v5-2"]');
  const githubContact = page.getByRole("link", { name: "GitHub — Partout V5 (nouvel onglet)" });
  const unknownContact = page.locator('.contact-public-link[href="https://example.test/v5-3"]');
  assert.equal(await linkedInContact.locator(".social-icon").count(), 1, "LinkedIn CONTACT n’est pas rendu comme icône.");
  assert((await githubHome.innerText()).includes("Partout V5"), "GitHub BOTH perd son libellé dans HOME.");
  assert.equal(await githubContact.locator(".social-icon").count(), 1, "GitHub BOTH n’est pas rendu comme icône dans CONTACT.");
  assert((await unknownContact.innerText()).includes("Réseau futur V5"), "Le kind inconnu n’a pas de fallback textuel.");
  assert.deepEqual(await page.locator('.contact-socials a[href*="example.test/v5-"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))), ["https://example.test/v5-1", "https://example.test/v5-2"], "L’ordre social ne suit pas sortOrder.");
  for (const socialLink of [linkedInContact, githubContact]) {
    assert.equal(await socialLink.getAttribute("target"), "_blank");
    assert.equal(await socialLink.getAttribute("rel"), "noopener noreferrer");
  }
  const contactSection = page.locator("#contact");
  await contactSection.scrollIntoViewIfNeeded();
  await contactSection.screenshot({ path: ".test-artifacts/contact-social-desktop.png" });
  const mailContact = page.locator('#contact a[href^="mailto:"]');
  const phoneContact = page.locator('#contact a[href^="tel:"]');
  await mailContact.focus();
  await page.keyboard.press("Tab");
  assert(await phoneContact.evaluate((element) => element === document.activeElement), "Tab ne passe pas du courriel au téléphone.");
  await page.keyboard.press("Tab");
  assert(await pdfContact.evaluate((element) => element === document.activeElement), "Tab ne passe pas du téléphone au CV.");
  await page.keyboard.press("Tab");
  const textContactLinks = page.locator(".contact-public-link");
  for (let index = 0; index < await textContactLinks.count(); index += 1) {
    assert(await textContactLinks.nth(index).evaluate((element) => element === document.activeElement), "Tab ne traverse pas les fallbacks textuels dans leur ordre.");
    await page.keyboard.press("Tab");
  }
  const socialContactLinks = page.locator(".contact-socials a");
  const socialContactCount = await socialContactLinks.count();
  assert(socialContactCount >= 2, "La rangée sociale ne contient pas les liens attendus.");
  assert(await socialContactLinks.first().evaluate((element) => element === document.activeElement), "Tab n’atteint pas le premier réseau social.");
  const focusStyle = await socialContactLinks.first().evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
  assert(focusStyle.style !== "none" && focusStyle.width !== "0px", `Le focus social n’est pas visible : ${JSON.stringify(focusStyle)}`);
  await socialContactLinks.first().screenshot({ path: ".test-artifacts/contact-social-focus.png" });
  for (let index = 1; index < socialContactCount; index += 1) {
    await page.keyboard.press("Tab");
    assert(await socialContactLinks.nth(index).evaluate((element) => element === document.activeElement), "Tab ne respecte pas l’ordre des réseaux sociaux.");
  }
  await page.keyboard.press("Shift+Tab");
  assert(await socialContactLinks.nth(socialContactCount - 2).evaluate((element) => element === document.activeElement), "Shift+Tab ne revient pas au réseau social précédent.");
  assert((await page.locator(`#project-${hidden.slug}`).count()) === 0, "Le projet HIDDEN est rendu.");
  assert((await page.locator(`a[href="#project-${hidden.slug}"]`).count()) === 0, "Une preuve pointe vers le projet HIDDEN.");
  assert((await page.locator(".project-visual-image img").count()) >= 1, "Le visuel HTTPS publié n'est pas rendu.");
  assert((await page.locator(".project-visual-fallback").count()) >= 1, "Le fallback sans image n'est pas rendu.");
  const desktopRibbon = await page.locator(".project-list").evaluate((element) => ({
    visible: element.clientWidth,
    card: element.querySelector(".project-entry")?.getBoundingClientRect().width ?? 0,
  }));
  assert(desktopRibbon.visible / desktopRibbon.card >= 2.7, `Trop peu de cards visibles sur desktop : ${JSON.stringify(desktopRibbon)}`);
  const cardHeights = await page.locator(".project-entry").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  assert(Math.max(...cardHeights) - Math.min(...cardHeights) < 2, `Les cards n'ont pas une hauteur uniforme : ${JSON.stringify(cardHeights)}`);
  await page.locator("#projets").scrollIntoViewIfNeeded();
  await page.locator("#projets").screenshot({ path: ".test-artifacts/features-v5-public-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Débordement horizontal mobile.");
  const mobileSocialButtons = page.locator(".contact-socials a");
  assert((await mobileSocialButtons.count()) >= 2, "Les réseaux sociaux disparaissent sur mobile.");
  const mobileButtonSizes = await mobileSocialButtons.evaluateAll((links) => links.map((link) => ({ width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height })));
  assert(mobileButtonSizes.every(({ width, height }) => width >= 42 && height >= 42), `Cibles tactiles trop petites : ${JSON.stringify(mobileButtonSizes)}`);
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.locator("#contact").screenshot({ path: ".test-artifacts/contact-social-mobile-390.png" });
  const mobileRibbon = await page.locator(".project-list").evaluate((element) => ({
    visible: element.clientWidth,
    card: element.querySelector(".project-entry")?.getBoundingClientRect().width ?? 0,
  }));
  assert(mobileRibbon.visible / mobileRibbon.card >= 1.05 && mobileRibbon.visible / mobileRibbon.card <= 1.22, `Largeur mobile incorrecte : ${JSON.stringify(mobileRibbon)}`);
  await page.locator("#projets").scrollIntoViewIfNeeded();
  await page.locator("#projets").screenshot({ path: ".test-artifacts/features-v5-public-mobile.png" });
  await page.locator(".project-entry summary").first().click();
  const mobileDialog = page.locator(".project-dialog");
  await page.waitForFunction(() => document.querySelector(".project-dialog")?.open === true);
  assert(await mobileDialog.evaluate((dialog) => dialog.open), "Le dialog projet ne s'ouvre pas sur mobile.");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Le dialog provoque un débordement horizontal mobile.");
  await mobileDialog.screenshot({ path: ".test-artifacts/features-v5-dialog-mobile.png" });
  await mobileDialog.getByRole("button", { name: /Fermer le projet/ }).click();
  await page.setViewportSize({ width: 1280, height: 900 });

  const orders = [];
  for (let reload = 0; reload < 6; reload += 1) {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const order = await page.locator(".project-entry").evaluateAll((items) => items.map((item) => item.id));
    assert.equal(order[0], `project-${pinned.slug}`, "Le projet épinglé a changé de position.");
    orders.push(order.join("|"));
  }
  assert(new Set(orders).size > 1, "Les projets ROTATING ne changent jamais d’ordre.");
  const carousel = page.locator(".project-list");
  await carousel.hover();
  const loopDistance = await carousel.evaluate((element) => {
    const card = element.querySelector(".project-entry");
    return (card?.getBoundingClientRect().width ?? 0) + (Number.parseFloat(getComputedStyle(element).columnGap) || 0);
  });
  await carousel.evaluate((element, distance) => {
    element.style.scrollBehavior = "auto";
    element.style.scrollSnapType = "none";
    element.scrollLeft = distance - 3;
  }, loopDistance);
  await page.waitForTimeout(50);
  const loopSecond = carousel.locator(".project-entry").nth(1);
  const loopSecondId = await loopSecond.getAttribute("id");
  const loopSecondLeft = (await loopSecond.boundingBox())?.x ?? 0;
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.querySelector(".project-ribbon")?.getAttribute("data-autoplay") === "running");
  await page.waitForFunction((expectedId) => document.querySelector(".project-entry")?.id === expectedId, loopSecondId);
  const loopFirst = carousel.locator(".project-entry").first();
  assert.equal(await loopFirst.getAttribute("id"), loopSecondId, "Le cycle ne rÃ©organise pas les cards Ã  la limite.");
  const loopFirstLeft = (await loopFirst.boundingBox())?.x ?? 0;
  assert(Math.abs(loopFirstLeft - loopSecondLeft) < 12, `Un saut visuel majeur apparaÃ®t au bouclage : ${JSON.stringify({ loopSecondLeft, loopFirstLeft })}`);
  await carousel.evaluate((element) => {
    element.style.removeProperty("scroll-behavior");
    element.style.removeProperty("scroll-snap-type");
  });

  await carousel.hover();
  await page.waitForTimeout(120);
  const hoverStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(500);
  const hoverEnd = await carousel.evaluate((element) => element.scrollLeft);
  assert(Math.abs(hoverEnd - hoverStart) < 2, "Le survol ne met pas l'autoplay en pause.");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);
  const hoverResume = {
    left: await carousel.evaluate((element) => element.scrollLeft),
    state: await page.locator(".project-ribbon").getAttribute("data-autoplay"),
    active: await page.evaluate(() => document.activeElement?.className ?? document.activeElement?.tagName),
  };
  assert(hoverResume.left > hoverEnd + 5, `L'autoplay ne reprend pas après le survol : ${JSON.stringify({ hoverEnd, hoverResume })}`);

  await carousel.focus();
  await page.waitForTimeout(100);
  const focusStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(500);
  assert(Math.abs((await carousel.evaluate((element) => element.scrollLeft)) - focusStart) < 2, "Le focus clavier ne met pas l'autoplay en pause.");

  const pauseButton = page.locator(".project-autoplay-toggle");
  await pauseButton.click();
  assert.equal(await pauseButton.getAttribute("aria-pressed"), "true");
  const pausedStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(500);
  assert(Math.abs((await carousel.evaluate((element) => element.scrollLeft)) - pausedStart) < 2, "Le bouton Pause n'arrête pas le ruban.");
  await page.getByRole("button", { name: "Reprendre le défilement automatique" }).click();
  await page.waitForTimeout(500);
  assert((await carousel.evaluate((element) => element.scrollLeft)) > pausedStart + 5, "Le bouton Reprendre ne relance pas le ruban.");
  await page.evaluate(() => {
    globalThis.__carouselTestVisible = false;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => globalThis.__carouselTestVisible ? "visible" : "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  const hiddenStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(500);
  assert(Math.abs((await carousel.evaluate((element) => element.scrollLeft)) - hiddenStart) < 2, "Un onglet masqué laisse tourner l'autoplay.");
  await page.evaluate(() => {
    globalThis.__carouselTestVisible = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  assert((await carousel.evaluate((element) => element.scrollLeft)) > hiddenStart + 5, "L'autoplay ne reprend pas au retour de l'onglet.");
  const carouselBefore = await carousel.evaluate((element) => ({ left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  const firstProjectBefore = await carousel.locator(".project-entry").first().getAttribute("id");
  await page.getByRole("button", { name: "Projet suivant" }).click();
  await page.waitForTimeout(800);
  const carouselAfter = await carousel.evaluate((element) => ({ left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  const firstProjectAfter = await carousel.locator(".project-entry").first().getAttribute("id");
  assert(carouselAfter.left > carouselBefore.left || firstProjectAfter !== firstProjectBefore, `Le contrôle Suivant ne déplace pas le carrousel : ${JSON.stringify({ carouselBefore, carouselAfter, firstProjectBefore, firstProjectAfter })}`);

  await carousel.scrollIntoViewIfNeeded();
  const carouselBox = await carousel.boundingBox();
  assert(carouselBox, "Le ruban n'est pas mesurable pour le test de drag.");
  const dragStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.mouse.move(carouselBox.x + carouselBox.width * 0.72, carouselBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(carouselBox.x + carouselBox.width * 0.72 - 90, carouselBox.y + 140, { steps: 6 });
  assert.equal(await page.locator(".project-ribbon").getAttribute("data-autoplay"), "paused", "L'autoplay ne se suspend pas pendant le drag.");
  const dragEnd = await carousel.evaluate((element) => element.scrollLeft);
  assert(Math.abs(dragEnd - dragStart) > 30, `Le drag souris ne déplace pas le ruban : ${JSON.stringify({ dragStart, dragEnd })}`);
  await page.mouse.up();
  assert(!(await page.locator(".project-dialog").evaluate((dialog) => dialog.open)), "Un projet s'ouvre après un drag souris.");

  const projectSummary = page.locator(`#project-${dialogProject.slug} summary`);
  await projectSummary.click();
  const projectDialog = page.locator(".project-dialog");
  await page.waitForFunction(() => document.querySelector(".project-dialog")?.open === true);
  assert(await projectDialog.evaluate((dialog) => dialog.open), "Un clic normal n'ouvre pas le dialog projet.");
  assert.equal(await projectDialog.getByRole("heading").innerText(), dialogProject.title, "Le dialog affiche un titre incorrect.");
  assert((await projectDialog.locator(".project-detail").innerText()).includes(dialogProject.description), "Le dialog n'affiche pas la description complète.");
  assert((await projectDialog.locator(".project-tags span").count()) === dialogProject.skills.length, "Le dialog n'affiche pas toutes les compétences.");
  assert((await projectDialog.locator(".project-links a").count()) === dialogProject.links.length, "Le dialog n'affiche pas tous les liens.");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".project-ribbon").getAttribute("data-autoplay"), "paused", "Le dialog ne place pas le ruban en pause.");
  const dialogPauseStart = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(500);
  assert(Math.abs((await carousel.evaluate((element) => element.scrollLeft)) - dialogPauseStart) < 2, "Un dialog ouvert ne met pas l'autoplay en pause.");
  await projectDialog.screenshot({ path: ".test-artifacts/features-v5-dialog-desktop.png" });
  await projectDialog.getByRole("button", { name: `Fermer le projet ${dialogProject.title}` }).click();
  await page.waitForFunction(() => document.querySelector(".project-dialog")?.open === false);
  assert(await projectSummary.evaluate((element) => element === document.activeElement), "Le focus n'est pas rendu au déclencheur après fermeture.");
  await projectSummary.press("Enter");
  await page.waitForFunction(() => document.querySelector(".project-dialog")?.open === true);
  assert(await projectDialog.evaluate((dialog) => dialog.open), "Le clavier n'ouvre pas le dialog projet.");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".project-dialog")?.open === false);
  assert(!(await projectDialog.evaluate((dialog) => dialog.open)), "Échap ne ferme pas le dialog projet.");
  assert(await projectSummary.evaluate((element) => element === document.activeElement), "Le focus n'est pas restauré après Échap.");

  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  await page.goto(`${baseURL}/admin/foundations`, { waitUntil: "networkidle" });
  const electronicsForm = page.locator(".admin-interest-form").filter({ has: page.locator('input[name="label"][value="Électronique"]') });
  await electronicsForm.locator('textarea[name="description"]').fill("Microcontrôleurs, capteurs et intégrations domestiques.");
  await electronicsForm.locator('input[name="imageUrl"]').fill("/projects/test/cover.png");
  await electronicsForm.locator('input[name="imageAlt"]').fill("Montage électronique de test");
  const interestSaveResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/foundations"));
  await electronicsForm.getByRole("button", { name: "Enregistrer" }).click();
  await interestSaveResponse;
  await page.reload({ waitUntil: "networkidle" });
  const savedInterest = await prisma.interest.findFirstOrThrow({ where: { label: "Électronique" }, include: { media: true } });
  assert.equal(savedInterest.description, "Microcontrôleurs, capteurs et intégrations domestiques.", "La description du centre d’intérêt ne persiste pas.");
  assert.equal(savedInterest.media[0]?.alt, "Montage électronique de test", "L’image du centre d’intérêt ne persiste pas via Media.");

  const newInterestForm = page.locator(".admin-interest-form").last();
  await newInterestForm.locator('input[name="label"]').fill("Intérêt facultatif de test");
  await newInterestForm.locator('textarea[name="description"]').fill("Sans image, inactif et conservé en brouillon.");
  await newInterestForm.locator('select[name="status"]').selectOption("DRAFT");
  await newInterestForm.locator('input[name="active"]').uncheck();
  const interestCreateResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/foundations"));
  await newInterestForm.getByRole("button", { name: "Ajouter" }).click();
  await interestCreateResponse;
  assert(await prisma.interest.findFirst({ where: { label: "Intérêt facultatif de test", active: false, status: ContentStatus.DRAFT } }), "Le CRUD Interest ne conserve pas actif / publication.");

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("heading", { name: "Liens publics" }).count(), 0, "Les liens publics sont encore administrés dans Projets & éditorial.");
  await page.goto(`${baseURL}/admin/profile`, { waitUntil: "networkidle" });

  const linksSection = page.locator("section.admin-panel").filter({ has: page.getByRole("heading", { name: "Liens publics" }) });
  assert.equal(await linksSection.count(), 1, "La gestion des liens publics n’apparaît pas une seule fois dans Identité.");
  await linksSection.getByRole("button", { name: "+ Ajouter un lien" }).click();
  const newLinkForm = page.getByRole("dialog", { name: "Ajouter un lien public" });
  await newLinkForm.locator('input[name="label"]').fill("Preview V5");
  await newLinkForm.locator('input[name="kind"]').fill("hellowork");
  await newLinkForm.locator('input[name="url"]').fill("https://example.test/preview-v5");
  await newLinkForm.locator('select[name="placement"]').selectOption("BOTH");
  await newLinkForm.locator('select[name="status"]').selectOption("PUBLISHED");
  await newLinkForm.locator('button[type="submit"]').click();
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: "networkidle" });

  let createdRow = linksSection.locator("tbody tr").filter({ hasText: "Preview V5" });
  assert.equal(await createdRow.count(), 1, "Le lien créé dans l’admin n’a pas persisté.");
  await createdRow.getByRole("button", { name: "Éditer" }).click();
  const createdForm = page.getByRole("dialog", { name: "Modifier Preview V5" });
  await createdForm.locator('input[name="label"]').fill("Preview V5 modifié");
  await createdForm.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: "networkidle" });
  createdRow = linksSection.locator("tbody tr").filter({ hasText: "Preview V5 modifié" });
  assert.equal(await createdRow.count(), 1, "La modification du lien n’a pas persisté.");
  const orderBeforeMove = (await prisma.link.findFirstOrThrow({ where: { label: "Preview V5 modifié" }, select: { sortOrder: true } })).sortOrder;
  await createdRow.getByRole("button", { name: "Monter Preview V5 modifié" }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  const orderAfterMove = (await prisma.link.findFirstOrThrow({ where: { label: "Preview V5 modifié" }, select: { sortOrder: true } })).sortOrder;
  assert.notEqual(orderAfterMove, orderBeforeMove, "Le réordonnancement du lien a échoué.");

  const deleteRow = linksSection.getByText("À supprimer V5", { exact: true }).locator("..").locator("..");
  await deleteRow.locator("button.admin-button-danger").click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await linksSection.locator("tbody tr").filter({ hasText: "À supprimer V5" }).count(), 0, "La suppression du lien a échoué.");

  await page.goto(`${baseURL}/admin/editorial`, { waitUntil: "networkidle" });
  const projectRow = page.locator(".admin-project-table tbody tr").filter({ hasText: pinned.title });
  await projectRow.getByRole("button", { name: "Éditer" }).click();
  const projectForm = page.getByRole("dialog", { name: `Modifier ${pinned.title}` });
  await projectForm.locator('select[name="displayMode"]').selectOption("ROTATING");
  await projectForm.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(350);
  await projectForm.locator('select[name="displayMode"]').selectOption("PINNED");
  await projectForm.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(350);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: pinned.id }, select: { displayMode: true } })).displayMode, "PINNED");

  const coverUrl = projectForm.locator('input[name="coverUrl"]');
  const coverAlt = projectForm.locator('input[name="coverAlt"]');
  await coverUrl.fill("javascript:alert(1)");
  await coverAlt.fill("Visuel invalide");
  await projectForm.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(250);
  assert((await projectForm.locator(".admin-error").innerText()).includes("HTTP(S)"), "Une URL javascript: n'est pas refusée.");
  await coverUrl.fill("/projects/test/cover.png");
  await coverAlt.fill("");
  assert(!(await coverAlt.evaluate((input) => input.checkValidity())), "Un alt manquant n'est pas refusé par le formulaire.");
  await coverAlt.fill("Aperçu local du projet de test");
  await projectForm.locator('input[name="coverCaption"]').fill("Capture locale de test");
  await projectForm.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(350);
  assert.equal((await prisma.media.findFirstOrThrow({ where: { projectId: pinned.id, kind: "project-cover" } })).url, "/projects/test/cover.png", "Le visuel local n'a pas persisté.");

  await page.goto(`${baseURL}/preview`, { waitUntil: "networkidle" });
  assert((await page.locator("body").innerText()).includes("Preview V5 modifié"), "La preview ne reflète pas le lien de travail.");
  assert((await page.locator(".footer-updated").innerText()).includes("14 janvier 2020"), "La preview confond le brouillon avec une nouvelle publication.");
  assert.equal(await page.locator(`#project-${pinned.slug} img[src="/projects/test/cover.png"]`).count(), 1, "La preview ne reflète pas le visuel de travail.");
  const interestCarousel = page.locator(".interest-carousel-track");
  assert.equal(await page.locator('.interest-card img[alt="Montage électronique de test"]').count(), 1, "Le visuel Interest n’est pas rendu.");
  assert((await page.locator(".interest-card").filter({ hasText: "Électronique" }).innerText()).includes("Microcontrôleurs, capteurs"), "La description Interest n’est pas rendue.");
  assert.equal(await page.locator(".interest-card").filter({ hasText: "Guitare" }).locator(".interest-card-fallback").count(), 1, "Le fallback sans image manque.");
  assert.equal(await interestCarousel.evaluate((element) => getComputedStyle(element).touchAction), "pan-x", "Le swipe tactile natif n’est pas préservé.");
  const interestStart = await interestCarousel.evaluate((element) => element.scrollLeft);
  await page.getByRole("button", { name: "Centre d’intérêt suivant" }).click();
  await page.waitForTimeout(350);
  assert((await interestCarousel.evaluate((element) => element.scrollLeft)) > interestStart, "Le bouton suivant des intérêts ne défile pas.");
  await interestCarousel.focus();
  const interestKeyboardStart = await interestCarousel.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  assert((await interestCarousel.evaluate((element) => element.scrollLeft)) > interestKeyboardStart, "Le clavier ne défile pas les intérêts.");
  await interestCarousel.scrollIntoViewIfNeeded();
  const interestBox = await interestCarousel.boundingBox();
  assert(interestBox, "Le carousel d’intérêts n’a pas de géométrie testable.");
  await interestCarousel.evaluate((element) => element.scrollTo({ left: 0, behavior: "auto" }));
  await page.waitForTimeout(100);
  const interestDragStart = await interestCarousel.evaluate((element) => element.scrollLeft);
  await page.mouse.move(interestBox.x + interestBox.width * 0.75, interestBox.y + interestBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(interestBox.x + interestBox.width * 0.25, interestBox.y + interestBox.height * 0.5, { steps: 8 });
  const interestDragEnd = await interestCarousel.evaluate((element) => ({ left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth, dragging: element.getAttribute("data-dragging") }));
  assert(interestDragEnd.left > interestDragStart, `Le drag souris des intérêts ne défile pas : ${JSON.stringify({ interestDragStart, interestDragEnd, interestBox })}`);
  await page.mouse.up();
  const interestDialog = page.locator(".interest-dialog");
  assert(!(await interestDialog.evaluate((dialog) => dialog.open)), "Un centre d’intérêt s’ouvre après un drag souris.");

  const interestSummary = page.locator(".interest-card").filter({ hasText: "Électronique" }).locator("summary");
  await interestSummary.click();
  await page.waitForFunction(() => document.querySelector(".interest-dialog")?.open === true);
  assert(await interestDialog.evaluate((dialog) => dialog.open), "Un clic normal n’ouvre pas le dialog Interest.");
  assert.equal(await interestDialog.getByRole("heading").innerText(), "Électronique", "Le dialog Interest affiche un titre incorrect.");
  assert((await interestDialog.innerText()).includes("Microcontrôleurs, capteurs"), "Le dialog Interest n’affiche pas la description existante.");
  assert.equal(await interestDialog.locator('img[alt="Montage électronique de test"]').count(), 1, "Le dialog Interest n’affiche pas l’image existante.");
  await interestDialog.screenshot({ path: ".test-artifacts/features-v5-interest-dialog-desktop.png" });
  await interestDialog.getByRole("button", { name: "Fermer le centre d’intérêt Électronique" }).click();
  await page.waitForFunction(() => document.querySelector(".interest-dialog")?.open === false);
  assert(await interestSummary.evaluate((element) => element === document.activeElement), "Le focus n’est pas rendu à la carte Interest après fermeture.");
  await interestSummary.press("Enter");
  await page.waitForFunction(() => document.querySelector(".interest-dialog")?.open === true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".interest-dialog")?.open === false);
  assert(await interestSummary.evaluate((element) => element === document.activeElement), "Le focus Interest n’est pas restauré après Échap.");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Le ruban Interest provoque un débordement horizontal mobile.");
  await interestSummary.click();
  await page.waitForFunction(() => document.querySelector(".interest-dialog")?.open === true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Le dialog Interest provoque un débordement horizontal mobile.");
  await interestDialog.screenshot({ path: ".test-artifacts/features-v5-interest-dialog-mobile.png" });
  await interestDialog.getByRole("button", { name: "Fermer le centre d’intérêt Électronique" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  assert(!(await (await context.request.get(baseURL)).text()).includes("Preview V5 modifié"), "Le lien de travail fuit avant publication.");
  assert(!(await (await context.request.get(baseURL)).text()).includes("/projects/test/cover.png"), "Le visuel de travail fuit avant publication.");
  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  await page.route(`${baseURL}/admin`, async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  const publishClick = page.getByRole("button", { name: "Publier le CV" }).click();
  const pendingPublishButton = page.getByRole("button", { name: "Publication…" });
  await pendingPublishButton.waitFor();
  assert(await pendingPublishButton.isDisabled(), "Le bouton Publier reste actif pendant la publication.");
  await publishClick;
  await page.getByText("CV publié avec succès.").waitFor();
  assert((await page.locator(".admin-publish-form").innerText()).includes("Dernière publication"), "La date de publication n’est pas affichée.");
  await page.unroute(`${baseURL}/admin`);
  assert((await (await context.request.get(baseURL)).text()).includes("Preview V5 modifié"), "La publication globale n’inclut pas le lien V5.");
  assert((await (await context.request.get(baseURL)).text()).includes("/projects/test/cover.png"), "La publication globale n'inclut pas le visuel projet.");
  assert((await (await context.request.get(baseURL)).text()).includes("Microcontrôleurs, capteurs"), "La publication globale n’inclut pas l’intérêt enrichi.");

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await noJsPage.locator('.contact-socials a[href="https://example.test/v5-1"]').count(), 1, "Le lien social CONTACT disparaît sans JavaScript.");
  assert.equal(await noJsPage.locator('.contact-socials a[href="https://example.test/v5-2"]').count(), 1, "Le lien social BOTH disparaît sans JavaScript.");
  assert.equal(await noJsPage.locator('.contact-public-link[href="https://example.test/v5-3"]').count(), 1, "Le fallback inconnu disparaît sans JavaScript.");
  assert((await noJsPage.locator(".project-entry").count()) === projects.length - 1, "Les projets ne restent pas accessibles sans JavaScript.");
  assert((await noJsPage.locator(`#project-${hidden.slug}`).count()) === 0);
  const noJsDetails = noJsPage.locator(".project-entry details").first();
  await noJsDetails.locator("summary").click();
  assert(await noJsDetails.evaluate((element) => element.open), "Le fallback details ne s'ouvre pas sans JavaScript.");
  assert(await noJsDetails.locator(".project-detail").isVisible(), "Le détail complet n'est pas lisible sans JavaScript.");
  await noJsContext.close();

  const reducedContext = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.route("https://images.example.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAu5c4ioAAAAASUVORK5CYII=", "base64") }));
  await reducedPage.goto(baseURL, { waitUntil: "networkidle" });
  const reducedCarousel = reducedPage.locator(".project-list");
  const reducedStart = await reducedCarousel.evaluate((element) => element.scrollLeft);
  await reducedPage.waitForTimeout(600);
  assert(Math.abs((await reducedCarousel.evaluate((element) => element.scrollLeft)) - reducedStart) < 2, "reduced-motion laisse tourner l'autoplay.");
  const reducedFirstBefore = await reducedCarousel.locator(".project-entry").first().getAttribute("id");
  await reducedPage.getByRole("button", { name: "Projet suivant" }).click();
  await reducedPage.waitForTimeout(100);
  const reducedFirstAfter = await reducedCarousel.locator(".project-entry").first().getAttribute("id");
  assert((await reducedCarousel.evaluate((element) => element.scrollLeft)) > reducedStart || reducedFirstAfter !== reducedFirstBefore, "La navigation manuelle ne fonctionne pas en reduced-motion.");
  await reducedContext.close();

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  const printProjectIds = await page.locator(".project-entry").evaluateAll((items) => items.map((item) => item.id));
  assert.equal(new Set(printProjectIds).size, printProjectIds.length, "L'impression contient des copies de projets.");
  assert.equal(await page.locator(".interest-card-media").first().evaluate((element) => getComputedStyle(element).display), "none", "L’impression conserve les grandes images des intérêts.");
  assert.equal(await page.locator(".interest-carousel-track").evaluate((element) => getComputedStyle(element).overflowX), "visible", "L’impression conserve un ruban d’intérêts tronqué.");
  await page.emulateMedia({ media: "screen" });

  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
  console.log(JSON.stringify({ socialPlacements: "home text, contact icons, unknown fallback", socialAccessibility: "labels target rel keyboard focus", socialResponsive: "390px no overflow 44px targets", adminCrud: "projects links interests", previewIsolationPublication: "ok", publishFeedback: "pending success timestamp", interests: "optional image fallback keyboard mouse touch print", publishedAt: "snapshot metadata", pinned: "stable", rotating: "varied", hidden: "excluded", infiniteRibbon: "ok", mouseDrag: "ok", projectDialog: "mouse keyboard focus escape", uniformCards: "ok", autoplayPauses: "ok", reducedMotion: "ok", screenshots: "ok", print: "single cycle", noJavaScript: "social links and details fallback" }));
} finally {
  await browser.close();
  await prisma.$disconnect();
  if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
  await logHandle.close();
  await rm(publicTestDirectory, { recursive: true, force: true });
}
