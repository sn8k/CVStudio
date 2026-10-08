import "dotenv/config";
import { ContentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";
import { createPublishedSnapshot } from "../lib/resume-data";

// Example content only. Replace it from /admin before publishing a real site.
async function seedContent() {
  await prisma.profile.create({ data: {
    id: "main", name: "Camille Martin", professionalTitle: "Consultante numérique",
    intro: "Un exemple de présentation à personnaliser depuis l’administration.",
    profileHeading: "À propos", profileLead: "Décrivez ici votre parcours, votre approche et ce que vous souhaitez partager.",
    contactHeading: "Prenons contact", contactIntro: "Remplacez ces coordonnées avant de mettre le site en ligne.",
    email: "camille@example.com", phoneDisplay: "", phoneHref: "", location: "France",
  } });
  await prisma.experience.create({ data: {
    slug: "experience-exemple", period: "2022 — aujourd’hui", startYear: 2022,
    company: "Entreprise exemple", place: "À distance", role: "Consultante",
    summary: "Présentez ici une expérience représentative.", status: ContentStatus.PUBLISHED,
    stages: { create: [{ title: "Consultante", sortOrder: 0 }] },
    contentBlocks: { create: [{ title: "Réalisations", sortOrder: 0, items: { create: [{ content: "Décrivez un résultat concret.", sortOrder: 0 }] } }] },
  } });
  await prisma.skill.create({ data: { slug: "competence-exemple", label: "Compétence exemple", family: "Savoir-faire", description: "Décrivez une compétence vérifiable.", sortOrder: 0 } });
  await createPublishedSnapshot("Contenu de démonstration");
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL ou ADMIN_PASSWORD absent : aucun compte administrateur créé.");
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) await auth.api.signUpEmail({ body: { email, password, name: "Administrateur CVStudio" } });
}

async function main() {
  const shouldReset = process.argv.includes("--reset-content");
  const profile = await prisma.profile.findUnique({ where: { id: "main" } });
  if (shouldReset && profile) throw new Error("La réinitialisation automatique du contenu est désactivée pour protéger les données existantes. Utilisez l’éditeur ou l’import administratif.");
  if (!profile) await seedContent();
  await seedAdmin();
  console.log("Base initialisée : exemple de CV et compte administrateur local.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
