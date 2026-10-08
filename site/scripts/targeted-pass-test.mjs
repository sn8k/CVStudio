import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3200";
const prisma = new PrismaClient();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const request = (path, userAgent, redirect = "follow") => fetch(`${baseURL}${path}`, { headers: { "user-agent": userAgent }, redirect });

try {
  await prisma.dailyPageView.deleteMany();

  const human = await request("/", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36");
  assert(human.status === 200, "Un navigateur humain est bloqué.");
  assert((await prisma.dailyPageView.aggregate({ _sum: { views: true } }))._sum.views === 1, "La première vue humaine n’est pas comptée une seule fois.");

  assert((await request("/api/health", "Docker-Healthcheck/1.0")).status === 200, "Le healthcheck échoue.");
  await request("/admin", "Mozilla/5.0 Chrome/140 Safari/537.36");
  await request("/preview", "Mozilla/5.0 Chrome/140 Safari/537.36");
  assert((await prisma.dailyPageView.aggregate({ _sum: { views: true } }))._sum.views === 1, "Une route privée ou technique augmente le compteur.");

  const robots = await request("/robots.txt", "Mozilla/5.0 Chrome/140 Safari/537.36");
  const robotsText = await robots.text();
  for (const crawler of ["GPTBot", "ChatGPT-User", "ClaudeBot", "Google-Extended", "CCBot", "PerplexityBot", "Bytespider", "Amazonbot", "Applebot-Extended", "Meta-ExternalAgent"]) {
    assert(robotsText.includes(`User-Agent: ${crawler}`) && robotsText.includes("Disallow: /"), `robots.txt ne couvre pas ${crawler}.`);
  }

  const aiCrawler = await request("/", "Mozilla/5.0 compatible; GPTBot/1.2");
  assert(aiCrawler.status === 403, "GPTBot n’est pas bloqué côté serveur.");
  const searchCrawler = await request("/", "Mozilla/5.0 compatible; Googlebot/2.1; +http://www.google.com/bot.html");
  assert(searchCrawler.status === 200, "Googlebot classique est bloqué.");
  assert((await prisma.dailyPageView.aggregate({ _sum: { views: true } }))._sum.views === 1, "Un robot connu a augmenté le compteur.");

  await request("/", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18 Safari/605.1.15");
  assert((await prisma.dailyPageView.aggregate({ _sum: { views: true } }))._sum.views === 2, "La seconde vue humaine n’est pas comptée.");

  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(`${baseURL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Adresse e-mail").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${baseURL}/admin`);
  const metrics = await page.locator(".admin-traffic-metrics strong").allTextContents();
  assert(metrics.join(",") === "2,2,2,2", `Les métriques du dashboard sont incorrectes : ${metrics.join(",")}`);

  await page.goto(`${baseURL}/admin/skills`, { waitUntil: "networkidle" });
  let entries = page.locator(".admin-skill-group .admin-skill-entry");
  const firstLabel = await entries.nth(0).locator('input[name="label"]').inputValue();
  const secondLabel = await entries.nth(1).locator('input[name="label"]').inputValue();
  await entries.nth(0).getByRole("button", { name: `Descendre ${firstLabel}` }).click();
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: "networkidle" });
  entries = page.locator(".admin-skill-group .admin-skill-entry");
  assert((await entries.nth(0).locator('input[name="label"]').inputValue()) === secondLabel, "Le bouton descendre ne réordonne pas les capacités.");
  await entries.nth(1).getByRole("button", { name: `Monter ${firstLabel}` }).click();
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: "networkidle" });
  entries = page.locator(".admin-skill-group .admin-skill-entry");
  assert((await entries.nth(0).locator('input[name="label"]').inputValue()) === firstLabel, "Le réordre des capacités n’a pas été restauré.");

  assert(browserErrors.length === 0, `Erreurs navigateur : ${browserErrors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ humanViews: 2, excludedRoutes: ["/admin", "/preview", "/api/health"], aiCrawler403: true, googlebotAllowed: true, dashboard: "ok", skillReorder: "ok", browserErrors: 0 }, null, 2));
} finally {
  await prisma.$disconnect();
}
