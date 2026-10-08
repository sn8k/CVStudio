import { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROJECT_COVER_KIND } from "@/lib/project-cover";
import { INTEREST_IMAGE_KIND } from "@/lib/interest-image";
import type { CapabilityKind, LinkPlacement, ProjectDisplayMode, ResumeData, ResumeSkill, ResumeSkillUsage } from "@/lib/resume-types";

const profileSelect = {
  name: true,
  professionalTitle: true,
  intro: true,
  profileHeading: true,
  profileLead: true,
  contactHeading: true,
  contactIntro: true,
  email: true,
  phoneDisplay: true,
  phoneHref: true,
  location: true,
} satisfies Prisma.ProfileSelect;

type SerializedSkillBase = Omit<ResumeSkill, "count" | "usages">;

export async function getWorkingResume(includeDrafts = true): Promise<ResumeData> {
  const statusWhere = includeDrafts ? {} : { status: ContentStatus.PUBLISHED };
  const [profile, experiences, skills, education, languages, interests, drivingLicenses, projects, links, extraSections] =
    await Promise.all([
      prisma.profile.findUnique({ where: { id: "main" }, select: profileSelect }),
      prisma.experience.findMany({
        where: { active: true, ...statusWhere },
        orderBy: [{ sortOrder: "asc" }, { startYear: "desc" }],
        include: {
          stages: {
            where: { active: true },
            orderBy: { sortOrder: "asc" },
            include: { skills: true },
          },
          contentBlocks: {
            where: { active: true },
            orderBy: { sortOrder: "asc" },
            include: {
              skills: true,
              items: {
                where: { active: true },
                orderBy: { sortOrder: "asc" },
                include: { skills: true },
              },
            },
          },
          skills: true,
        },
      }),
      prisma.skill.findMany({
        where: { active: true, ...statusWhere },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
      prisma.education.findMany({ where: { active: true, ...statusWhere }, orderBy: { sortOrder: "asc" } }),
      prisma.language.findMany({ where: { active: true, ...statusWhere }, orderBy: { sortOrder: "asc" } }),
      prisma.interest.findMany({
        where: { active: true, ...statusWhere },
        orderBy: { sortOrder: "asc" },
        include: { media: { where: { kind: INTEREST_IMAGE_KIND }, orderBy: { sortOrder: "asc" }, take: 1 } },
      }),
      prisma.drivingLicense.findMany({ where: { active: true, ...(includeDrafts ? {} : { publicationStatus: ContentStatus.PUBLISHED }) }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
      prisma.project.findMany({
        where: { active: true, ...statusWhere },
        orderBy: { sortOrder: "asc" },
        include: {
          skills: true,
          links: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
          media: { where: { kind: PROJECT_COVER_KIND }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
      }),
      prisma.link.findMany({ where: { active: true, ...statusWhere }, orderBy: { sortOrder: "asc" } }),
      prisma.extraSection.findMany({ where: { active: true, ...statusWhere }, orderBy: { sortOrder: "asc" } }),
    ]);

  if (!profile) throw new Error("Le profil principal n’a pas été initialisé.");

  const skillBases = new Map<string, SerializedSkillBase>(
    skills.map((skill) => [
      skill.id,
      {
        id: skill.id,
        slug: skill.slug,
        label: skill.label,
        family: skill.family,
        description: skill.description,
        kind: skill.kind,
      },
    ]),
  );
  const usages = new Map<string, ResumeSkillUsage[]>();
  const addUsage = (skillId: string, usage: ResumeSkillUsage) => {
    if (!skillBases.has(skillId)) return;
    const existing = usages.get(skillId) ?? [];
    const key = JSON.stringify(usage);
    if (!existing.some((item) => JSON.stringify(item) === key)) existing.push(usage);
    usages.set(skillId, existing);
  };

  for (const experience of experiences) {
    const baseUsage = { experienceId: experience.id, experienceSlug: experience.slug, company: experience.company };
    experience.skills.forEach(({ skillId }) => addUsage(skillId, baseUsage));
    experience.stages.forEach((stage) =>
      stage.skills.forEach(({ skillId }) => addUsage(skillId, { ...baseUsage, stageTitle: stage.title })),
    );
    experience.contentBlocks.forEach((block) => {
      block.skills.forEach(({ skillId }) => addUsage(skillId, { ...baseUsage, blockTitle: block.title }));
      block.items.forEach((item) =>
        item.skills.forEach(({ skillId }) =>
          addUsage(skillId, { ...baseUsage, blockTitle: block.title, itemContent: item.content }),
        ),
      );
    });
  }

  for (const project of projects) {
    project.skills.forEach(({ skillId }) => addUsage(skillId, {
      projectId: project.id,
      projectSlug: project.slug,
      projectTitle: project.title,
    }));
  }

  const serializedSkills = skills.map((skill) => {
    const skillUsages = usages.get(skill.id) ?? [];
    return {
      ...skillBases.get(skill.id)!,
      count: new Set(skillUsages.map((usage) => usage.experienceId ?? usage.projectId).filter(Boolean)).size,
      usages: skillUsages,
    };
  });
  const skillLookup = new Map(serializedSkills.map((skill) => [skill.id, skill]));
  const linkedSkills = (relations: { skillId: string }[]) =>
    relations.map(({ skillId }) => skillLookup.get(skillId)).filter((skill): skill is ResumeSkill => Boolean(skill));

  return {
    schemaVersion: 6,
    profile,
    experiences: experiences.map((experience) => ({
      id: experience.id,
      slug: experience.slug,
      period: experience.period,
      startYear: experience.startYear,
      endYear: experience.endYear,
      company: experience.company,
      place: experience.place,
      role: experience.role,
      summary: experience.summary,
      accent: experience.accent,
      status: experience.status,
      stages: experience.stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        startDateLabel: stage.startDateLabel,
        endDateLabel: stage.endDateLabel,
        description: stage.description,
        skills: linkedSkills(stage.skills),
      })),
      blocks: experience.contentBlocks.map((block) => ({
        id: block.id,
        type: block.type,
        title: block.title,
        body: block.body,
        skills: linkedSkills(block.skills),
        items: block.items.map((item) => ({
          id: item.id,
          content: item.content,
          skills: linkedSkills(item.skills),
        })),
      })),
      skills: linkedSkills(experience.skills),
    })),
    skills: serializedSkills,
    education: education.map(({ id, period, school, degree }) => ({ id, period, school, degree })),
    languages: languages.map(({ id, name, level }) => ({ id, name, level })),
    interests: interests.map(({ id, label, description, media }) => ({
      id,
      label,
      description,
      image: media[0] ? { url: media[0].url, alt: media[0].alt, caption: media[0].caption } : null,
    })),
    drivingLicenses: drivingLicenses.map(({ id, label, status, note, obtainedAt }) => ({
      id,
      label,
      status,
      note,
      obtainedAt: obtainedAt?.toISOString() ?? null,
    })),
    projects: projects.map(({ id, slug, title, summary, description, displayMode, skills: relations, links: projectLinks, media }) => ({
      id,
      slug,
      title,
      summary,
      description,
      displayMode,
      cover: media[0] ? { url: media[0].url, alt: media[0].alt, caption: media[0].caption } : null,
      skills: linkedSkills(relations),
      links: projectLinks.map(({ id: linkId, label, url, kind }) => ({ id: linkId, label, url, kind })),
    })),
    links: links.map(({ id, label, url, kind, placement }) => ({ id, label, url, kind, placement })),
    extraSections: extraSections.map(({ id, slug, eyebrow, title, content }) => ({ id, slug, eyebrow, title, content })),
    generatedAt: new Date().toISOString(),
  };
}

export async function createPublishedSnapshot(note?: string) {
  const data = await getWorkingResume(false);
  return prisma.publishedSnapshot.create({
    data: { schemaVersion: 6, data: JSON.stringify(data), note: note?.trim() || null },
  });
}

type LegacyResume = Omit<ResumeData, "schemaVersion" | "experiences" | "skills" | "projects" | "links" | "drivingLicenses" | "interests"> & {
  schemaVersion?: number;
  drivingLicenses?: ResumeData["drivingLicenses"];
  interests?: (Omit<ResumeData["interests"][number], "description" | "image"> & {
    description?: string | null;
    image?: ResumeData["interests"][number]["image"];
  })[];
  skills: (Omit<ResumeSkill, "kind" | "usages"> & { kind?: CapabilityKind; usages?: ResumeSkillUsage[] })[];
  experiences: (Omit<ResumeData["experiences"][number], "stages" | "blocks" | "skills"> & {
    stages?: ResumeData["experiences"][number]["stages"];
    blocks?: ResumeData["experiences"][number]["blocks"];
    sections?: { id: string; title: string; missions: string[] }[];
    skills: LegacyResume["skills"];
  })[];
  projects: (Omit<ResumeData["projects"][number], "skills" | "links" | "displayMode" | "cover"> & {
    skills?: ResumeSkill[];
    links?: ResumeData["projects"][number]["links"];
    displayMode?: ProjectDisplayMode;
    cover?: ResumeData["projects"][number]["cover"];
  })[];
  links: (Omit<ResumeData["links"][number], "placement"> & { placement?: LinkPlacement })[];
};

export function normalizeResumeData(raw: unknown): ResumeData {
  const data = raw as LegacyResume;
  const normalizeProjects = () => data.projects.map((project) => ({
    ...project,
    displayMode: project.displayMode ?? "ROTATING",
    cover: project.cover ?? null,
    skills: project.skills ?? [],
    links: project.links ?? [],
  }));
  const normalizeLinks = () => (data.links ?? []).map((link) => ({
    ...link,
    placement: link.placement ?? "CONTACT",
  }));
  const normalizeInterests = () => (data.interests ?? []).map((interest) => ({
    ...interest,
    description: interest.description ?? null,
    image: interest.image ?? null,
  }));
  if (data.schemaVersion === 6 || data.schemaVersion === 5 || data.schemaVersion === 4) return {
    ...data,
    schemaVersion: 6,
    drivingLicenses: data.drivingLicenses ?? [],
    interests: normalizeInterests(),
    projects: normalizeProjects(),
    links: normalizeLinks(),
  } as ResumeData;
  if (data.schemaVersion === 3 || data.schemaVersion === 2) return {
    ...data,
    schemaVersion: 6,
    drivingLicenses: data.drivingLicenses ?? [],
    interests: normalizeInterests(),
    projects: normalizeProjects(),
    links: normalizeLinks(),
  } as ResumeData;
  const technologySlugs = new Set(["windows", "mac", "linux"]);
  const skills = data.skills.map((skill) => ({
    ...skill,
    kind: skill.kind ?? (technologySlugs.has(skill.slug) ? "TECHNOLOGY" : "DOMAIN"),
    usages: skill.usages ?? [],
  })) as ResumeSkill[];
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return {
    ...data,
    schemaVersion: 6,
    drivingLicenses: data.drivingLicenses ?? [],
    interests: normalizeInterests(),
    skills,
    experiences: data.experiences.map((experience) => ({
      ...experience,
      skills: experience.skills.map((skill) => byId.get(skill.id) ?? ({ ...skill, kind: "DOMAIN", usages: [] } as ResumeSkill)),
      stages: experience.stages ?? [{
        id: `v1-stage-${experience.id}`,
        title: experience.role,
        startDateLabel: null,
        endDateLabel: null,
        description: null,
        skills: [],
      }],
      blocks: experience.blocks ?? (experience.sections ?? []).map((section) => ({
        id: section.id,
        type: "LEGACY" as const,
        title: section.title,
        body: null,
        skills: [],
        items: section.missions.map((content, index) => ({ id: `${section.id}-${index}`, content, skills: [] })),
      })),
    })),
    projects: normalizeProjects(),
    links: normalizeLinks(),
  } as ResumeData;
}

export async function getPublishedResumeWithMetadata(): Promise<{ data: ResumeData; lastPublishedAt: string | null }> {
  const snapshot = await prisma.publishedSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  if (snapshot) return { data: normalizeResumeData(JSON.parse(snapshot.data)), lastPublishedAt: snapshot.createdAt.toISOString() };
  return { data: await getWorkingResume(false), lastPublishedAt: null };
}

export async function getLastPublishedAt(): Promise<string | null> {
  const snapshot = await prisma.publishedSnapshot.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return snapshot?.createdAt.toISOString() ?? null;
}

export async function getPublishedResume(): Promise<ResumeData> {
  return (await getPublishedResumeWithMetadata()).data;
}
