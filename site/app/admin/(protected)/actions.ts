"use server";

import { CapabilityKind, ContentBlockType, ContentStatus, DrivingLicenseStatus, LinkPlacement, Prisma, ProjectDisplayMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { createPublishedSnapshot } from "@/lib/resume-data";
import { restoreAdminBackup } from "@/lib/admin-backup";
import { publicHttpUrlSchema } from "@/lib/public-url";
import { PROJECT_COVER_KIND, projectCoverInputSchema } from "@/lib/project-cover";
import { INTEREST_IMAGE_KIND, interestImageInputSchema } from "@/lib/interest-image";

const requiredText = z.string().trim().min(1);

export type ProjectSaveState = {
  status: "idle" | "success" | "error";
  message: string;
  projectId?: string;
};

export type PublishActionState = {
  status: "idle" | "success" | "error";
  message: string;
  publishedAt?: string;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueExperienceSlug(value: string, currentId?: string) {
  const base = slugify(value) || "experience";
  let candidate = base;
  let suffix = 2;
  while (await prisma.experience.findFirst({ where: { slug: candidate, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function uniqueSkillSlug(value: string, currentId?: string) {
  const base = slugify(value) || "capacite";
  let candidate = base;
  let suffix = 2;
  while (await prisma.skill.findFirst({ where: { slug: candidate, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function uniqueProjectSlug(value: string, currentId?: string) {
  const base = slugify(value) || "projet";
  let candidate = base;
  let suffix = 2;
  while (await prisma.project.findFirst({ where: { slug: candidate, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function uniqueExtraSectionSlug(value: string, currentId?: string) {
  const base = slugify(value) || "section";
  let candidate = base;
  let suffix = 2;
  while (await prisma.extraSection.findFirst({ where: { slug: candidate, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

const experienceContentSchema = z.object({
  stages: z.array(z.object({
    id: z.string(), title: z.string().trim().min(1), startDateLabel: z.string(), endDateLabel: z.string(),
    description: z.string(), active: z.boolean(), privateNotes: z.string(), skillIds: z.array(z.string()),
  })).min(1),
  blocks: z.array(z.object({
    id: z.string(), type: z.nativeEnum(ContentBlockType), title: z.string().trim().min(1), body: z.string(),
    active: z.boolean(), privateNotes: z.string(), skillIds: z.array(z.string()),
    items: z.array(z.object({ id: z.string(), content: z.string().trim().min(1), active: z.boolean(), privateNotes: z.string(), skillIds: z.array(z.string()) })),
  })),
});

function persistedId(id: string) {
  return id.startsWith("new-") ? undefined : id;
}

function derivedRole(titles: string[]) {
  if (titles.length === 1) return titles[0];
  return `${titles.slice(0, -1).join(", ")}, puis ${titles.at(-1)}`;
}

export async function publishAction(_previousState: PublishActionState, formData: FormData): Promise<PublishActionState> {
  await requireAdmin();
  try {
    const snapshot = await createPublishedSnapshot(text(formData, "note") || "Publication depuis l’administration");
    revalidatePath("/");
    revalidatePath("/admin");
    return { status: "success", message: "CV publié avec succès.", publishedAt: snapshot.createdAt.toISOString() };
  } catch (error) {
    console.error("Échec de la publication du CV.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
    return { status: "error", message: "La publication a échoué. Réessayez ou consultez les journaux serveur." };
  }
}

export async function updateProfileAction(formData: FormData) {
  await requireAdmin();
  const values = {
    name: requiredText.parse(text(formData, "name")),
    professionalTitle: requiredText.parse(text(formData, "professionalTitle")),
    intro: requiredText.parse(text(formData, "intro")),
    profileHeading: requiredText.parse(text(formData, "profileHeading")),
    profileLead: requiredText.parse(text(formData, "profileLead")),
    contactHeading: requiredText.parse(text(formData, "contactHeading")),
    contactIntro: requiredText.parse(text(formData, "contactIntro")),
    email: z.string().email().parse(text(formData, "email")),
    phoneDisplay: requiredText.parse(text(formData, "phoneDisplay")),
    phoneHref: requiredText.parse(text(formData, "phoneHref")),
    location: requiredText.parse(text(formData, "location")),
    privateNotes: text(formData, "privateNotes") || null,
  };
  await prisma.profile.update({ where: { id: "main" }, data: values });
  revalidatePath("/admin/profile");
  revalidatePath("/preview");
}

export async function saveExperienceAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const company = requiredText.parse(text(formData, "company"));
  const slug = await uniqueExperienceSlug(text(formData, "slug") || company, id || undefined);
  const endYearText = text(formData, "endYear");
  const status = text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT;
  const skillIds = formData.getAll("skillIds").map(String);
  const content = experienceContentSchema.parse(JSON.parse(text(formData, "contentModel")));

  const values = {
    slug,
    period: requiredText.parse(text(formData, "period")),
    startYear: numberValue(formData, "startYear"),
    endYear: endYearText ? Number(endYearText) : null,
    company,
    place: requiredText.parse(text(formData, "place")),
    role: derivedRole(content.stages.map((stage) => stage.title)),
    summary: requiredText.parse(text(formData, "summary")),
    accent: text(formData, "accent") || "#9fe7c3",
    active: formData.get("active") === "on",
    status,
    sortOrder: numberValue(formData, "sortOrder"),
    privateNotes: text(formData, "privateNotes") || null,
  };

  const stages = content.stages.map((stage, sortOrder) => ({
    id: persistedId(stage.id), title: stage.title, startDateLabel: stage.startDateLabel || null,
    endDateLabel: stage.endDateLabel || null, description: stage.description || null, active: stage.active,
    privateNotes: stage.privateNotes || null, sortOrder,
    skills: { create: [...new Set(stage.skillIds)].map((skillId) => ({ skillId })) },
  }));
  const contentBlocks = content.blocks.map((block, sortOrder) => ({
    id: persistedId(block.id), type: block.type, title: block.title, body: block.body || null, active: block.active,
    privateNotes: block.privateNotes || null, sortOrder,
    skills: { create: [...new Set(block.skillIds)].map((skillId) => ({ skillId })) },
    items: { create: block.items.map((item, itemOrder) => ({
      id: persistedId(item.id), content: item.content, active: item.active, privateNotes: item.privateNotes || null,
      sortOrder: itemOrder, skills: { create: [...new Set(item.skillIds)].map((skillId) => ({ skillId })) },
    })) },
  }));

  if (id) {
    await prisma.$transaction(async (tx) => {
      await tx.experienceSkill.deleteMany({ where: { experienceId: id } });
      await tx.experienceStage.deleteMany({ where: { experienceId: id } });
      await tx.contentBlock.deleteMany({ where: { experienceId: id } });
      await tx.experience.update({
        where: { id },
        data: {
          ...values,
          skills: { create: skillIds.map((skillId) => ({ skillId })) },
          stages: { create: stages },
          contentBlocks: { create: contentBlocks },
        },
      });
    });
  } else {
    await prisma.experience.create({
      data: {
        ...values,
        skills: { create: skillIds.map((skillId) => ({ skillId })) },
        stages: { create: stages },
        contentBlocks: { create: contentBlocks },
      },
    });
  }
  revalidatePath("/admin/experiences");
  if (id) revalidatePath(`/admin/experiences/${id}`);
  revalidatePath("/preview");
  redirect("/admin/experiences");
}

export async function moveExperienceAction(formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const ordered = await prisma.experience.findMany({ orderBy: [{ sortOrder: "asc" }, { startYear: "desc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id);
  const target = ordered[index + direction];
  if (index >= 0 && target) {
    await prisma.$transaction([
      prisma.experience.update({ where: { id }, data: { sortOrder: target.sortOrder } }),
      prisma.experience.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } }),
    ]);
  }
  revalidatePath("/admin/experiences");
  revalidatePath("/preview");
}

export async function deactivateExperienceAction(formData: FormData) {
  await requireAdmin();
  await prisma.experience.update({ where: { id: requiredText.parse(text(formData, "id")) }, data: { active: false } });
  revalidatePath("/admin/experiences");
  revalidatePath("/preview");
}

export async function saveSkillAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const label = requiredText.parse(text(formData, "label"));
  const currentOrder = id
    ? (await prisma.skill.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0
    : ((await prisma.skill.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const values = {
    slug: await uniqueSkillSlug(text(formData, "slug") || label, id || undefined),
    label,
    family: requiredText.parse(text(formData, "family")),
    description: requiredText.parse(text(formData, "description")),
    kind: text(formData, "kind") === "TECHNOLOGY" ? CapabilityKind.TECHNOLOGY : CapabilityKind.DOMAIN,
    privateNotes: text(formData, "privateNotes") || null,
    sortOrder: currentOrder,
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
  };
  if (id) await prisma.skill.update({ where: { id }, data: values });
  else await prisma.skill.create({ data: values });
  revalidatePath("/admin/skills");
  revalidatePath("/preview");
}

export async function moveSkillAction(formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const ordered = await prisma.skill.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id);
  const target = ordered[index + direction];
  if (index >= 0 && target) {
    await prisma.$transaction([
      prisma.skill.update({ where: { id }, data: { sortOrder: target.sortOrder } }),
      prisma.skill.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } }),
    ]);
  }
  revalidatePath("/admin/skills");
  revalidatePath("/preview");
}

export type SkillDeleteState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function deleteSkillAction(_previousState: SkillDeleteState, formData: FormData): Promise<SkillDeleteState> {
  await requireAdmin();
  try {
    const id = requiredText.parse(text(formData, "id"));
    if (text(formData, "confirmation") !== "DELETE") {
      return { status: "error", message: "La suppression n’a pas été confirmée." };
    }
    const skill = await prisma.skill.findUnique({
      where: { id },
      select: {
        label: true,
        _count: { select: { experiences: true, stages: true, contentBlocks: true, contentItems: true, projects: true } },
      },
    });
    if (!skill) return { status: "error", message: "Cette compétence n’existe plus. Rechargez la page." };
    await prisma.$transaction((tx) => tx.skill.delete({ where: { id } }));
    revalidatePath("/admin/skills");
    revalidatePath("/admin/editorial");
    revalidatePath("/admin/experiences");
    revalidatePath("/preview");
    return { status: "success", message: `${skill.label} a été supprimée de la version de travail.` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { status: "error", message: "Cette compétence n’existe plus. Rechargez la page." };
    }
    console.error("Échec de la suppression de la compétence", error);
    return { status: "error", message: "La suppression a échoué. Aucune autre compétence n’a été modifiée." };
  }
}

const projectSchema = z.object({
  title: z.string().trim().min(1, "Le titre du projet est obligatoire."),
  summary: z.string().trim().min(1, "L’angle ou le résumé court est obligatoire."),
});

const projectLinksSchema = z.array(z.object({
  label: z.string().trim().min(1, "Chaque lien doit avoir un libellé."),
  url: publicHttpUrlSchema,
  kind: z.string().trim().min(1, "Chaque lien doit avoir un type."),
  active: z.boolean(),
}));

function parseProjectLinks(formData: FormData) {
  const raw = text(formData, "projectLinks");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new z.ZodError([{
      code: "custom",
      path: ["projectLinks"],
      message: "Les liens du projet n’ont pas pu être lus. Rechargez la page puis réessayez.",
    }]);
  }
  if (!Array.isArray(parsed)) return projectLinksSchema.parse(parsed);
  return projectLinksSchema.parse(parsed.filter((link) => (
    typeof link !== "object" || link === null || String((link as { url?: unknown }).url ?? "").trim()
  )));
}

function projectSaveError(error: unknown): ProjectSaveState {
  if (error instanceof z.ZodError) {
    return { status: "error", message: error.issues[0]?.message ?? "Vérifiez les champs du projet." };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { status: "error", message: "Ce slug est déjà utilisé. Modifiez-le puis réessayez." };
    if (error.code === "P2025") return { status: "error", message: "Ce projet n’existe plus. Rechargez la page avant de réessayer." };
  }
  console.error("Échec de l’enregistrement du projet", error);
  return { status: "error", message: "L’enregistrement a échoué. Les champs saisis sont conservés ; vous pouvez réessayer." };
}

export async function saveProjectAction(_previousState: ProjectSaveState, formData: FormData): Promise<ProjectSaveState> {
  await requireAdmin();
  try {
    const id = text(formData, "id");
    const input = projectSchema.parse({ title: text(formData, "title"), summary: text(formData, "summary") });
    const sortOrder = id ? (await prisma.project.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.project.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
    const skillIds = [...new Set(formData.getAll("skillIds").map(String))];
    const projectLinks = parseProjectLinks(formData).map((link, linkIndex) => ({ ...link, sortOrder: linkIndex }));
    const cover = projectCoverInputSchema.parse({
      url: text(formData, "coverUrl"),
      alt: text(formData, "coverAlt"),
      caption: text(formData, "coverCaption"),
    });
    const coverCreate = cover ? { create: { kind: PROJECT_COVER_KIND, ...cover, sortOrder: 0 } } : undefined;
    const values = {
      slug: await uniqueProjectSlug(text(formData, "slug") || input.title, id || undefined),
      title: input.title,
      summary: input.summary,
      description: text(formData, "description") || null,
      active: formData.get("active") === "on",
      status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
      displayMode: z.nativeEnum(ProjectDisplayMode).catch(ProjectDisplayMode.ROTATING).parse(text(formData, "displayMode")),
      sortOrder,
      privateNotes: text(formData, "privateNotes") || null,
    };
    let projectId = id;
    if (id) {
      await prisma.$transaction(async (tx) => {
        await tx.projectSkill.deleteMany({ where: { projectId: id } });
        await tx.projectLink.deleteMany({ where: { projectId: id } });
        await tx.media.deleteMany({ where: { projectId: id, kind: PROJECT_COVER_KIND } });
        await tx.project.update({ where: { id }, data: {
          ...values,
          skills: { create: skillIds.map((skillId) => ({ skillId })) },
          links: { create: projectLinks },
          ...(coverCreate ? { media: coverCreate } : {}),
        } });
      });
    } else {
      const project = await prisma.project.create({ data: {
        ...values,
        skills: { create: skillIds.map((skillId) => ({ skillId })) },
        links: { create: projectLinks },
        ...(coverCreate ? { media: coverCreate } : {}),
      }, select: { id: true } });
      projectId = project.id;
    }
    revalidatePath("/admin/editorial");
    revalidatePath("/preview");
    return { status: "success", message: id ? "Projet enregistré." : "Projet ajouté en brouillon de travail.", projectId };
  } catch (error) {
    return projectSaveError(error);
  }
}

export async function moveProjectAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.project.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.project.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.project.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/editorial"); revalidatePath("/preview");
}

export async function saveExtraSectionAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const title = requiredText.parse(text(formData, "title"));
  const sortOrder = id ? (await prisma.extraSection.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.extraSection.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const values = {
    slug: await uniqueExtraSectionSlug(text(formData, "slug") || title, id || undefined),
    eyebrow: text(formData, "eyebrow") || null,
    title,
    content: requiredText.parse(text(formData, "content")),
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    sortOrder,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) await prisma.extraSection.update({ where: { id }, data: values });
  else await prisma.extraSection.create({ data: values });
  revalidatePath("/admin/editorial"); revalidatePath("/preview");
}

export async function moveExtraSectionAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.extraSection.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.extraSection.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.extraSection.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/editorial"); revalidatePath("/preview");
}

export async function saveLinkAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const sortOrder = id ? (await prisma.link.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.link.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const values = {
    label: requiredText.parse(text(formData, "label")),
    url: publicHttpUrlSchema.parse(text(formData, "url")),
    kind: requiredText.parse(text(formData, "kind")),
    placement: z.nativeEnum(LinkPlacement).catch(LinkPlacement.CONTACT).parse(text(formData, "placement")),
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    sortOrder,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) await prisma.link.update({ where: { id }, data: values });
  else await prisma.link.create({ data: values });
  revalidatePath("/admin/profile"); revalidatePath("/preview");
}

export async function deleteLinkAction(formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  await prisma.link.delete({ where: { id } });
  revalidatePath("/admin/profile");
  revalidatePath("/preview");
}

export async function moveLinkAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.link.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.link.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.link.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/profile"); revalidatePath("/preview");
}

export async function saveEducationAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const sortOrder = id ? (await prisma.education.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.education.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const values = {
    period: requiredText.parse(text(formData, "period")),
    school: requiredText.parse(text(formData, "school")),
    degree: requiredText.parse(text(formData, "degree")),
    sortOrder,
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) await prisma.education.update({ where: { id }, data: values });
  else await prisma.education.create({ data: values });
  revalidatePath("/admin/foundations");
  revalidatePath("/preview");
}

export async function saveLanguageAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const sortOrder = id ? (await prisma.language.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.language.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const values = {
    name: requiredText.parse(text(formData, "name")),
    level: requiredText.parse(text(formData, "level")),
    sortOrder,
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) await prisma.language.update({ where: { id }, data: values });
  else await prisma.language.create({ data: values });
  revalidatePath("/admin/foundations");
  revalidatePath("/preview");
}

export async function saveInterestAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const sortOrder = id ? (await prisma.interest.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0 : ((await prisma.interest.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const image = interestImageInputSchema.parse({
    url: text(formData, "imageUrl"),
    alt: text(formData, "imageAlt"),
    caption: text(formData, "imageCaption"),
  });
  const imageCreate = image ? { create: { kind: INTEREST_IMAGE_KIND, ...image, sortOrder: 0 } } : undefined;
  const values = {
    label: requiredText.parse(text(formData, "label")),
    description: z.string().max(280, "La description doit rester courte (280 caractères maximum).").parse(text(formData, "description")) || null,
    sortOrder,
    active: formData.get("active") === "on",
    status: text(formData, "status") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) {
    await prisma.$transaction(async (tx) => {
      await tx.media.deleteMany({ where: { interestId: id, kind: INTEREST_IMAGE_KIND } });
      await tx.interest.update({ where: { id }, data: { ...values, ...(imageCreate ? { media: imageCreate } : {}) } });
    });
  } else {
    await prisma.interest.create({ data: { ...values, ...(imageCreate ? { media: imageCreate } : {}) } });
  }
  revalidatePath("/admin/foundations");
  revalidatePath("/preview");
}

export async function saveDrivingLicenseAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const obtainedAtValue = text(formData, "obtainedAt");
  const sortOrder = id
    ? (await prisma.drivingLicense.findUnique({ where: { id }, select: { sortOrder: true } }))?.sortOrder ?? 0
    : ((await prisma.drivingLicense.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }))?.sortOrder ?? -1) + 1;
  const requestedStatus = text(formData, "licenseStatus");
  const status = Object.values(DrivingLicenseStatus).includes(requestedStatus as DrivingLicenseStatus)
    ? requestedStatus as DrivingLicenseStatus
    : DrivingLicenseStatus.NOT_HELD;
  const values = {
    label: requiredText.parse(text(formData, "label")),
    status,
    note: text(formData, "note") || null,
    obtainedAt: obtainedAtValue ? new Date(`${obtainedAtValue}T00:00:00.000Z`) : null,
    active: formData.get("active") === "on",
    publicationStatus: text(formData, "publicationStatus") === "PUBLISHED" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    sortOrder,
    privateNotes: text(formData, "privateNotes") || null,
  };
  if (id) await prisma.drivingLicense.update({ where: { id }, data: values });
  else await prisma.drivingLicense.create({ data: values });
  revalidatePath("/admin/foundations");
  revalidatePath("/preview");
}

export async function moveEducationAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.education.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.education.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.education.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/foundations"); revalidatePath("/preview");
}

export async function moveLanguageAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.language.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.language.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.language.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/foundations"); revalidatePath("/preview");
}

export async function moveInterestAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.interest.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id); const target = ordered[index + direction];
  if (index >= 0 && target) await prisma.$transaction([prisma.interest.update({ where: { id }, data: { sortOrder: target.sortOrder } }), prisma.interest.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } })]);
  revalidatePath("/admin/foundations"); revalidatePath("/preview");
}

export async function moveDrivingLicenseAction(requestedDirection: "up" | "down", formData: FormData) {
  await requireAdmin();
  const id = requiredText.parse(text(formData, "id"));
  const direction = requestedDirection === "up" ? -1 : 1;
  const ordered = await prisma.drivingLicense.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id);
  const target = ordered[index + direction];
  if (index >= 0 && target) {
    await prisma.$transaction([
      prisma.drivingLicense.update({ where: { id }, data: { sortOrder: target.sortOrder } }),
      prisma.drivingLicense.update({ where: { id: target.id }, data: { sortOrder: ordered[index].sortOrder } }),
    ]);
  }
  revalidatePath("/admin/foundations");
  revalidatePath("/preview");
}

export async function importDataAction(formData: FormData) {
  await requireAdmin();
  if (text(formData, "confirmation") !== "IMPORTER") throw new Error("Confirmation d’import manquante.");
  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) throw new Error("Fichier de sauvegarde manquant.");
  const imported = JSON.parse(await file.text()) as unknown;
  await restoreAdminBackup(imported);

  revalidatePath("/admin");
  revalidatePath("/preview");
  redirect("/admin");
}
