export type ResumeProfile = {
  name: string;
  professionalTitle: string;
  intro: string;
  profileHeading: string;
  profileLead: string;
  contactHeading: string;
  contactIntro: string;
  email: string;
  phoneDisplay: string;
  phoneHref: string;
  location: string;
};

export type CapabilityKind = "DOMAIN" | "TECHNOLOGY";
export type DrivingLicenseStatus = "NOT_HELD" | "PLANNED" | "IN_PROGRESS" | "OBTAINED";
export type LinkPlacement = "HOME" | "CONTACT" | "BOTH";
export type ProjectDisplayMode = "PINNED" | "ROTATING" | "HIDDEN";

export type ResumeSkillUsage = {
  experienceId?: string;
  experienceSlug?: string;
  company?: string;
  projectId?: string;
  projectSlug?: string;
  projectTitle?: string;
  stageTitle?: string;
  blockTitle?: string;
  itemContent?: string;
};

export type ResumeSkill = {
  id: string;
  slug: string;
  label: string;
  family: string;
  description: string;
  kind: CapabilityKind;
  count: number;
  usages: ResumeSkillUsage[];
};

export type ResumeStage = {
  id: string;
  title: string;
  startDateLabel: string | null;
  endDateLabel: string | null;
  description: string | null;
  skills: ResumeSkill[];
};

export type ResumeContentItem = {
  id: string;
  content: string;
  skills: ResumeSkill[];
};

export type ResumeContentBlock = {
  id: string;
  type: "MISSIONS" | "ACHIEVEMENTS" | "CONTEXT" | "PROBLEMS" | "TOOLS" | "FREEFORM" | "LEGACY";
  title: string;
  body: string | null;
  items: ResumeContentItem[];
  skills: ResumeSkill[];
};

export type ResumeExperience = {
  id: string;
  slug: string;
  period: string;
  startYear: number;
  endYear: number | null;
  company: string;
  place: string;
  role: string;
  summary: string;
  accent: string;
  status?: "DRAFT" | "PUBLISHED";
  stages: ResumeStage[];
  blocks: ResumeContentBlock[];
  /** Kept for reading immutable V1 snapshots. */
  sections?: { id: string; title: string; missions: string[] }[];
  skills: ResumeSkill[];
};

export type ResumeData = {
  schemaVersion: 6;
  profile: ResumeProfile;
  experiences: ResumeExperience[];
  skills: ResumeSkill[];
  education: { id: string; period: string; school: string; degree: string }[];
  languages: { id: string; name: string; level: string }[];
  interests: {
    id: string;
    label: string;
    description: string | null;
    image: {
      url: string;
      alt: string;
      caption: string | null;
    } | null;
  }[];
  drivingLicenses: {
    id: string;
    label: string;
    status: DrivingLicenseStatus;
    note: string | null;
    obtainedAt: string | null;
  }[];
  projects: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    description: string | null;
    displayMode: ProjectDisplayMode;
    cover: {
      url: string;
      alt: string;
      caption: string | null;
    } | null;
    skills: ResumeSkill[];
    links: {
      id: string;
      label: string;
      url: string;
      kind: string;
    }[];
  }[];
  links: { id: string; label: string; url: string; kind: string; placement: LinkPlacement }[];
  extraSections: { id: string; slug: string; eyebrow: string | null; title: string; content: string }[];
  generatedAt: string;
};
