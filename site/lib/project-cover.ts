import { z } from "zod";

export const PROJECT_COVER_KIND = "project-cover";

export const projectCoverUrlSchema = z.string().trim().refine((value) => {
  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.includes("\\")) return false;
    return !value.split(/[?#]/, 1)[0].split("/").some((segment) => segment === "..");
  }

  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}, "Utilisez une URL HTTP(S) ou un chemin public commençant par /.");

export const projectCoverInputSchema = z.object({
  url: z.string().trim(),
  alt: z.string().trim(),
  caption: z.string().trim(),
}).superRefine((cover, context) => {
  if (!cover.url) return;
  const result = projectCoverUrlSchema.safeParse(cover.url);
  if (!result.success) {
    context.addIssue({ code: "custom", path: ["url"], message: result.error.issues[0]?.message ?? "Le chemin du visuel est invalide." });
  }
  if (!cover.alt) {
    context.addIssue({ code: "custom", path: ["alt"], message: "Le texte alternatif est obligatoire lorsqu’un visuel est configuré." });
  }
}).transform((cover) => (
  cover.url
    ? { url: cover.url, alt: cover.alt, caption: cover.caption || null }
    : null
));
