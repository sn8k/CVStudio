import { z } from "zod";
import { projectCoverUrlSchema } from "@/lib/project-cover";

export const INTEREST_IMAGE_KIND = "interest-image";

export const interestImageInputSchema = z.object({
  url: z.string().trim(),
  alt: z.string().trim().max(240),
  caption: z.string().trim().max(240),
}).superRefine((image, context) => {
  if (!image.url) return;
  const result = projectCoverUrlSchema.safeParse(image.url);
  if (!result.success) {
    context.addIssue({ code: "custom", path: ["url"], message: result.error.issues[0]?.message ?? "Le chemin de l’image est invalide." });
  }
  if (!image.alt) {
    context.addIssue({ code: "custom", path: ["alt"], message: "Le texte alternatif est obligatoire lorsqu’une image est configurée." });
  }
}).transform((image) => (
  image.url
    ? { url: image.url, alt: image.alt, caption: image.caption || null }
    : null
));
