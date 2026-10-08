import "dotenv/config";
import { chromium } from "playwright-core";

const baseURL = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  const page = await browser.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  if (!(await page.title()).trim()) throw new Error("Le titre public est vide.");
  if (!(await page.locator(".site-footer").isVisible())) throw new Error("Le pied de page public manque.");
  if (!(await page.locator(".experience").count())) throw new Error("Aucune expérience publiée.");

  await page.goto(`${baseURL}/admin`, { waitUntil: "networkidle" });
  if (!page.url().includes("/admin/login")) throw new Error("L’administration n’est pas protégée.");
  await page.goto(`${baseURL}/confidentialite`, { waitUntil: "networkidle" });
  if (!(await page.getByRole("heading", { name: /données réduites/i }).isVisible())) throw new Error("La page confidentialité manque.");
  console.log("CVStudio smoke test OK");
} finally {
  await browser.close();
}
