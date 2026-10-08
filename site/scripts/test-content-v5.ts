import assert from "node:assert/strict";
import { CapabilityKind, ContentStatus } from "@prisma/client";
import { adminBackupSchema } from "../lib/admin-backup";
import { prepareResumeForPresentation } from "../lib/project-presentation";
import { publicHttpUrlSchema } from "../lib/public-url";
import { projectCoverInputSchema, projectCoverUrlSchema } from "../lib/project-cover";
import { normalizeResumeData } from "../lib/resume-data";

const profile = {
  name: "Test", professionalTitle: "Technicien", intro: "Intro", profileHeading: "Profil",
  profileLead: "Lead", contactHeading: "Contact", contactIntro: "Intro contact", email: "test@example.test",
  phoneDisplay: "00", phoneHref: "+330", location: "France",
};
const skill = {
  id: "skill", slug: "diagnostic", label: "Diagnostic", family: "Résoudre", description: "Test",
  kind: "DOMAIN" as const, count: 2,
  usages: [
    { projectId: "rotating-1", projectSlug: "rotating-1", projectTitle: "Rotation 1" },
    { projectId: "hidden", projectSlug: "hidden", projectTitle: "Masqué" },
  ],
};
const project = (id: string, displayMode: "PINNED" | "ROTATING" | "HIDDEN" = "ROTATING") => ({
  id, slug: id, title: id, summary: id, description: null, displayMode, cover: null, skills: [skill], links: [],
});
const legacyProject = {
  id: "legacy", slug: "legacy", title: "legacy", summary: "legacy", description: null, skills: [skill], links: [],
};
const legacyV4 = {
  schemaVersion: 4,
  profile,
  experiences: [],
  skills: [skill],
  education: [], languages: [], interests: [{ id: "interest", label: "Guitare" }], drivingLicenses: [],
  projects: [legacyProject],
  links: [{ id: "link", label: "Profil", url: "https://example.test", kind: "unknown-network" }],
  extraSections: [], generatedAt: new Date(0).toISOString(),
};

const normalized = normalizeResumeData(legacyV4);
assert.equal(normalized.schemaVersion, 6);
assert.deepEqual(normalized.interests, [{ id: "interest", label: "Guitare", description: null, image: null }]);
assert.equal(normalized.links[0].placement, "CONTACT");
assert.equal(normalized.projects[0].displayMode, "ROTATING");
assert.equal(normalized.projects[0].cover, null);
for (const schemaVersion of [2, 3] as const) {
  const legacy = structuredClone(legacyV4);
  legacy.schemaVersion = schemaVersion;
  const normalizedLegacy = normalizeResumeData(legacy);
  assert.equal(normalizedLegacy.schemaVersion, 6);
  assert.equal(normalizedLegacy.links[0].placement, "CONTACT");
  assert.equal(normalizedLegacy.projects[0].displayMode, "ROTATING");
}

const v5 = {
  ...normalized,
  projects: [
    project("pinned-1", "PINNED"),
    project("rotating-1", "ROTATING"),
    project("pinned-2", "PINNED"),
    project("rotating-2", "ROTATING"),
    project("hidden", "HIDDEN"),
  ],
};
const firstOrder = prepareResumeForPresentation(v5, () => 0);
const secondOrder = prepareResumeForPresentation(v5, () => 0.999);
assert.deepEqual(firstOrder.projects.filter((item) => item.displayMode === "PINNED").map((item) => item.id), ["pinned-1", "pinned-2"]);
assert.equal(firstOrder.projects[0].id, "pinned-1");
assert.equal(firstOrder.projects[2].id, "pinned-2");
assert.equal(secondOrder.projects[0].id, "pinned-1");
assert.equal(secondOrder.projects[2].id, "pinned-2");
assert.notDeepEqual(firstOrder.projects.map((item) => item.id), secondOrder.projects.map((item) => item.id));
assert(!firstOrder.projects.some((item) => item.id === "hidden"));
assert(!firstOrder.skills[0].usages.some((usage) => usage.projectId === "hidden"));
assert.equal(firstOrder.skills[0].count, 1);

const common = { active: true, status: ContentStatus.PUBLISHED, sortOrder: 0, privateNotes: null };
const backupV4 = {
  format: "cvstudio-backup",
  schemaVersion: 4,
  exportedAt: new Date(0).toISOString(),
  profile: { ...profile, privateNotes: null },
  skills: [{ slug: "diagnostic", label: "Diagnostic", family: "Résoudre", description: "Test", kind: CapabilityKind.DOMAIN, ...common }],
  experiences: [], education: [], languages: [], interests: [], drivingLicenses: [],
  projects: [{ slug: "legacy", title: "Legacy", summary: "Test", description: null, ...common, skillSlugs: [], links: [] }],
  links: [{ label: "Profil", url: "https://example.test", kind: "future-network", ...common }],
  extraSections: [], media: [],
};
const parsedBackup = adminBackupSchema.parse(backupV4);
assert.equal(parsedBackup.schemaVersion, 4);
assert.equal(parsedBackup.links[0].placement, undefined);
assert.equal(parsedBackup.projects[0].displayMode, undefined);
assert(publicHttpUrlSchema.safeParse("https://example.test/profile").success);
assert(publicHttpUrlSchema.safeParse("http://localhost:3000/demo").success);
assert(!publicHttpUrlSchema.safeParse("javascript:alert(1)").success);
assert(!adminBackupSchema.safeParse({ ...backupV4, links: [{ ...backupV4.links[0], url: "data:text/html,test" }] }).success);
assert(adminBackupSchema.safeParse({ ...backupV4, media: [{ kind: "project-cover", url: "/projects/test/cover.webp", alt: "Interface du projet", caption: null, sortOrder: 0, experienceSlug: null, projectSlug: "legacy" }] }).success);
assert(!adminBackupSchema.safeParse({ ...backupV4, media: [{ kind: "project-cover", url: "data:image/png;base64,test", alt: "Interface du projet", caption: null, sortOrder: 0, experienceSlug: null, projectSlug: "legacy" }] }).success);
assert(projectCoverUrlSchema.safeParse("https://example.test/cover.webp").success);
assert(projectCoverUrlSchema.safeParse("http://localhost:3000/projects/cover.webp").success);
assert(projectCoverUrlSchema.safeParse("/projects/test/cover.webp").success);
assert(!projectCoverUrlSchema.safeParse("javascript:alert(1)").success);
assert(!projectCoverUrlSchema.safeParse("data:image/png;base64,test").success);
assert(!projectCoverUrlSchema.safeParse("file:///tmp/cover.webp").success);
assert(!projectCoverUrlSchema.safeParse("../../cover.webp").success);
assert(!projectCoverInputSchema.safeParse({ url: "/projects/test/cover.webp", alt: "", caption: "" }).success);
assert(projectCoverInputSchema.safeParse({ url: "", alt: "", caption: "" }).success);

console.log(JSON.stringify({ normalization: "V2/V3/V4/V5→V6 ok", backupCompatibility: "V4 ok", urls: "HTTP/S only", projectCovers: "validated", projectModes: "ok" }));
