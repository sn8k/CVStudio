import { CapabilityKind, ContentBlockType, ContentStatus, DrivingLicenseStatus, LinkPlacement, ProjectDisplayMode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicHttpUrlSchema } from "@/lib/public-url";
import { PROJECT_COVER_KIND, projectCoverUrlSchema } from "@/lib/project-cover";
import { INTEREST_IMAGE_KIND } from "@/lib/interest-image";

const optionalNote = z.string().nullable();
const common = { active: z.boolean(), status: z.nativeEnum(ContentStatus), sortOrder: z.number().int(), privateNotes: optionalNote };
const linked = { skillSlugs: z.array(z.string()) };
const projectLinkSchema = z.object({
  label: z.string(),
  url: publicHttpUrlSchema,
  kind: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
}).strict();

export const adminBackupSchema = z.object({
  format: z.union([z.literal("cvstudio-backup"), z.string().regex(/^[a-z]+-[a-z]+-cv-backup$/)]),
  schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  exportedAt: z.string(),
  profile: z.object({
    name: z.string(), professionalTitle: z.string(), intro: z.string(), profileHeading: z.string(), profileLead: z.string(),
    contactHeading: z.string(), contactIntro: z.string(), email: z.string(), phoneDisplay: z.string(), phoneHref: z.string(),
    location: z.string(), privateNotes: optionalNote,
  }).strict(),
  skills: z.array(z.object({ slug: z.string(), label: z.string(), family: z.string(), description: z.string(), kind: z.nativeEnum(CapabilityKind), ...common }).strict()),
  experiences: z.array(z.object({
    slug: z.string(), period: z.string(), startYear: z.number().int(), endYear: z.number().int().nullable(), company: z.string(), place: z.string(),
    role: z.string(), summary: z.string(), accent: z.string(), ...common, ...linked,
    stages: z.array(z.object({ title: z.string(), startDateLabel: z.string().nullable(), endDateLabel: z.string().nullable(), description: z.string().nullable(), active: z.boolean(), sortOrder: z.number().int(), privateNotes: optionalNote, ...linked }).strict()),
    blocks: z.array(z.object({
      type: z.nativeEnum(ContentBlockType), title: z.string(), body: z.string().nullable(), active: z.boolean(), sortOrder: z.number().int(), privateNotes: optionalNote, ...linked,
      items: z.array(z.object({ content: z.string(), active: z.boolean(), sortOrder: z.number().int(), privateNotes: optionalNote, ...linked }).strict()),
    }).strict()),
    legacySections: z.array(z.object({ title: z.string(), sortOrder: z.number().int(), missions: z.array(z.object({ text: z.string(), sortOrder: z.number().int() }).strict()) }).strict()),
  }).strict()),
  education: z.array(z.object({ period: z.string(), school: z.string(), degree: z.string(), ...common }).strict()),
  languages: z.array(z.object({ name: z.string(), level: z.string(), ...common }).strict()),
  interests: z.array(z.object({ label: z.string(), description: optionalNote.optional(), ...common }).strict()),
  drivingLicenses: z.array(z.object({
    label: z.string(), status: z.nativeEnum(DrivingLicenseStatus), note: optionalNote, obtainedAt: z.string().nullable(),
    active: z.boolean(), publicationStatus: z.nativeEnum(ContentStatus), sortOrder: z.number().int(), privateNotes: optionalNote,
  }).strict()).optional(),
  projects: z.array(z.object({
    slug: z.string(), title: z.string(), summary: z.string(), description: z.string().nullable(),
    ...common, ...linked, displayMode: z.nativeEnum(ProjectDisplayMode).optional(), links: z.array(projectLinkSchema).optional(),
  }).strict()),
  links: z.array(z.object({ label: z.string(), url: publicHttpUrlSchema, kind: z.string(), placement: z.nativeEnum(LinkPlacement).optional(), ...common }).strict()),
  extraSections: z.array(z.object({ slug: z.string(), eyebrow: z.string().nullable(), title: z.string(), content: z.string(), ...common }).strict()),
  media: z.array(z.object({
    kind: z.string(), url: z.string(), alt: z.string(), caption: z.string().nullable(), sortOrder: z.number().int(), experienceSlug: z.string().nullable(), projectSlug: z.string().nullable(), interestLabel: z.string().nullable().optional(),
  }).strict().superRefine((media, context) => {
    if (media.kind === PROJECT_COVER_KIND || media.kind === INTEREST_IMAGE_KIND) {
      if (!projectCoverUrlSchema.safeParse(media.url).success) {
        context.addIssue({ code: "custom", path: ["url"], message: "Le chemin du visuel est invalide." });
      }
      if (!media.alt.trim()) {
        context.addIssue({ code: "custom", path: ["alt"], message: "Le texte alternatif du visuel est obligatoire." });
      }
    }
  })),
}).strict();

export type AdminBackup = z.infer<typeof adminBackupSchema>;

export async function getAdminBackup(): Promise<AdminBackup> {
  const [profile, skills, experiences, education, languages, interests, drivingLicenses, projects, links, extraSections, media] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: "main" } }),
    prisma.skill.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.experience.findMany({ orderBy: { sortOrder: "asc" }, include: {
      skills: { include: { skill: { select: { slug: true } } } },
      stages: { orderBy: { sortOrder: "asc" }, include: { skills: { include: { skill: { select: { slug: true } } } } } },
      contentBlocks: { orderBy: { sortOrder: "asc" }, include: { skills: { include: { skill: { select: { slug: true } } } }, items: { orderBy: { sortOrder: "asc" }, include: { skills: { include: { skill: { select: { slug: true } } } } } } } },
      sections: { orderBy: { sortOrder: "asc" }, include: { missions: { orderBy: { sortOrder: "asc" } } } },
    } }),
    prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.language.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.interest.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.drivingLicense.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.project.findMany({ orderBy: { sortOrder: "asc" }, include: {
      skills: { include: { skill: { select: { slug: true } } } },
      links: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    } }),
    prisma.link.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.extraSection.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.media.findMany({ orderBy: { sortOrder: "asc" }, include: { experience: { select: { slug: true } }, project: { select: { slug: true } }, interest: { select: { label: true } } } }),
  ]);
  const relationSlugs = (relations: { skill: { slug: string } }[]) => relations.map(({ skill }) => skill.slug);
  return {
    format: "cvstudio-backup", schemaVersion: 6, exportedAt: new Date().toISOString(),
    profile: { name: profile.name, professionalTitle: profile.professionalTitle, intro: profile.intro, profileHeading: profile.profileHeading, profileLead: profile.profileLead, contactHeading: profile.contactHeading, contactIntro: profile.contactIntro, email: profile.email, phoneDisplay: profile.phoneDisplay, phoneHref: profile.phoneHref, location: profile.location, privateNotes: profile.privateNotes },
    skills: skills.map(({ slug, label, family, description, kind, active, status, sortOrder, privateNotes }) => ({ slug, label, family, description, kind, active, status, sortOrder, privateNotes })),
    experiences: experiences.map((experience) => ({
      slug: experience.slug, period: experience.period, startYear: experience.startYear, endYear: experience.endYear, company: experience.company, place: experience.place, role: experience.role, summary: experience.summary, accent: experience.accent, active: experience.active, status: experience.status, sortOrder: experience.sortOrder, privateNotes: experience.privateNotes, skillSlugs: relationSlugs(experience.skills),
      stages: experience.stages.map((stage) => ({ title: stage.title, startDateLabel: stage.startDateLabel, endDateLabel: stage.endDateLabel, description: stage.description, active: stage.active, sortOrder: stage.sortOrder, privateNotes: stage.privateNotes, skillSlugs: relationSlugs(stage.skills) })),
      blocks: experience.contentBlocks.map((block) => ({ type: block.type, title: block.title, body: block.body, active: block.active, sortOrder: block.sortOrder, privateNotes: block.privateNotes, skillSlugs: relationSlugs(block.skills), items: block.items.map((item) => ({ content: item.content, active: item.active, sortOrder: item.sortOrder, privateNotes: item.privateNotes, skillSlugs: relationSlugs(item.skills) })) })),
      legacySections: experience.sections.map((section) => ({ title: section.title, sortOrder: section.sortOrder, missions: section.missions.map(({ text, sortOrder }) => ({ text, sortOrder })) })),
    })),
    education: education.map(({ period, school, degree, active, status, sortOrder, privateNotes }) => ({ period, school, degree, active, status, sortOrder, privateNotes })),
    languages: languages.map(({ name, level, active, status, sortOrder, privateNotes }) => ({ name, level, active, status, sortOrder, privateNotes })),
    interests: interests.map(({ label, description, active, status, sortOrder, privateNotes }) => ({ label, description, active, status, sortOrder, privateNotes })),
    drivingLicenses: drivingLicenses.map(({ label, status, note, obtainedAt, active, publicationStatus, sortOrder, privateNotes }) => ({
      label, status, note, obtainedAt: obtainedAt?.toISOString() ?? null, active, publicationStatus, sortOrder, privateNotes,
    })),
    projects: projects.map((project) => ({
      slug: project.slug, title: project.title, summary: project.summary, description: project.description,
      active: project.active, status: project.status, displayMode: project.displayMode, sortOrder: project.sortOrder, privateNotes: project.privateNotes,
      skillSlugs: relationSlugs(project.skills),
      links: project.links.map(({ label, url, kind, active, sortOrder }) => ({ label, url, kind, active, sortOrder })),
    })),
    links: links.map(({ label, url, kind, placement, active, status, sortOrder, privateNotes }) => ({ label, url, kind, placement, active, status, sortOrder, privateNotes })),
    extraSections: extraSections.map(({ slug, eyebrow, title, content, active, status, sortOrder, privateNotes }) => ({ slug, eyebrow, title, content, active, status, sortOrder, privateNotes })),
    media: media.map((item) => ({ kind: item.kind, url: item.url, alt: item.alt, caption: item.caption, sortOrder: item.sortOrder, experienceSlug: item.experience?.slug ?? null, projectSlug: item.project?.slug ?? null, interestLabel: item.interest?.label ?? null })),
  };
}

export async function restoreAdminBackup(input: unknown) {
  const backup = adminBackupSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    await tx.media.deleteMany();
    await tx.experience.deleteMany();
    await tx.project.deleteMany();
    await tx.skill.deleteMany();
    await tx.education.deleteMany();
    await tx.language.deleteMany();
    await tx.interest.deleteMany();
    await tx.drivingLicense.deleteMany();
    await tx.link.deleteMany();
    await tx.extraSection.deleteMany();
    await tx.profile.upsert({ where: { id: "main" }, create: { id: "main", ...backup.profile }, update: backup.profile });
    const skillIds = new Map<string, string>();
    for (const skill of backup.skills) { const created = await tx.skill.create({ data: skill }); skillIds.set(skill.slug, created.id); }
    const relationData = (slugs: string[]) => ({ create: slugs.map((slug) => ({ skillId: skillIds.get(slug)! })) });
    const experienceIds = new Map<string, string>();
    for (const experience of backup.experiences) {
      const { stages, blocks, legacySections, skillSlugs, ...data } = experience;
      const created = await tx.experience.create({ data: {
        ...data, skills: relationData(skillSlugs),
        stages: { create: stages.map(({ skillSlugs: stageSkills, ...stage }) => ({ ...stage, skills: relationData(stageSkills) })) },
        contentBlocks: { create: blocks.map(({ skillSlugs: blockSkills, items, ...block }) => ({ ...block, skills: relationData(blockSkills), items: { create: items.map(({ skillSlugs: itemSkills, ...item }) => ({ ...item, skills: relationData(itemSkills) })) } })) },
        sections: { create: legacySections.map(({ missions, ...section }) => ({ ...section, missions: { create: missions } })) },
      } });
      experienceIds.set(experience.slug, created.id);
    }
    const projectIds = new Map<string, string>();
    for (const project of backup.projects) {
      const { skillSlugs, links: projectLinks = [], displayMode = ProjectDisplayMode.ROTATING, ...data } = project;
      const created = await tx.project.create({ data: {
        ...data, displayMode,
        skills: relationData(skillSlugs),
        links: { create: projectLinks },
      } });
      projectIds.set(project.slug, created.id);
    }
    await tx.education.createMany({ data: backup.education });
    await tx.language.createMany({ data: backup.languages });
    const interestIds = new Map<string, string>();
    for (const interest of backup.interests) {
      const created = await tx.interest.create({ data: { ...interest, description: interest.description ?? null } });
      interestIds.set(interest.label, created.id);
    }
    await tx.drivingLicense.createMany({ data: (backup.drivingLicenses ?? []).map((license) => ({
      ...license,
      obtainedAt: license.obtainedAt ? new Date(license.obtainedAt) : null,
    })) });
    await tx.link.createMany({ data: backup.links.map((link) => ({
      ...link,
      placement: link.placement ?? LinkPlacement.CONTACT,
    })) });
    await tx.extraSection.createMany({ data: backup.extraSections });
    await tx.media.createMany({ data: backup.media.map(({ experienceSlug, projectSlug, interestLabel, ...item }) => ({
      ...item,
      experienceId: experienceSlug ? experienceIds.get(experienceSlug) : null,
      projectId: projectSlug ? projectIds.get(projectSlug) : null,
      interestId: interestLabel ? interestIds.get(interestLabel) : null,
    })) });
  });
}
