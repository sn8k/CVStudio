import assert from "node:assert/strict";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes(".test-artifacts") || !databaseUrl.endsWith("backup-v5-test.db")) {
  throw new Error("Ce test destructif doit cibler exclusivement .test-artifacts/backup-v5-test.db.");
}

async function main() {
  const { getAdminBackup, restoreAdminBackup } = await import("../lib/admin-backup");
  const { prisma } = await import("../lib/prisma");
  try {
  const source = await getAdminBackup();
  const coverProject = source.projects[0];
  assert(coverProject, "Un projet est requis pour tester le backup du visuel.");
  source.media.push({
    kind: "project-cover",
    url: "/projects/test/cover.webp",
    alt: "Visuel de test du projet",
    caption: null,
    sortOrder: 0,
    experienceSlug: null,
    projectSlug: coverProject.slug,
    interestLabel: null,
  });
  const imageInterest = source.interests[0];
  assert(imageInterest, "Un centre d’intérêt est requis pour tester son média.");
  imageInterest.description = "Description de test";
  source.media.push({
    kind: "interest-image",
    url: "/interests/test/image.webp",
    alt: "Image de test du centre d’intérêt",
    caption: null,
    sortOrder: 0,
    experienceSlug: null,
    projectSlug: null,
    interestLabel: imageInterest.label,
  });
  for (const schemaVersion of [2, 3, 4, 5] as const) {
    const legacy = structuredClone(source) as Record<string, unknown>;
    legacy.schemaVersion = schemaVersion;
    const links = legacy.links as Record<string, unknown>[];
    const projects = legacy.projects as Record<string, unknown>[];
    links.forEach((link) => delete link.placement);
    projects.forEach((project) => delete project.displayMode);
    if (schemaVersion < 4) {
      delete legacy.drivingLicenses;
      projects.forEach((project) => delete project.links);
    }
    const interests = legacy.interests as Record<string, unknown>[];
    const media = legacy.media as Record<string, unknown>[];
    interests.forEach((interest) => delete interest.description);
    media.forEach((item) => delete item.interestLabel);
    await restoreAdminBackup(legacy);
    const restoredLinks = await prisma.link.findMany({ select: { placement: true } });
    const restoredProjects = await prisma.project.findMany({ select: { displayMode: true } });
    const restoredCover = await prisma.media.findFirst({ where: { kind: "project-cover", project: { slug: coverProject.slug } } });
    assert(restoredLinks.every((link) => link.placement === "CONTACT"));
    assert(restoredProjects.every((project) => project.displayMode === "ROTATING"));
    assert.equal(restoredCover?.url, "/projects/test/cover.webp");
  }

  await restoreAdminBackup(source);
  const exported = await getAdminBackup();
  assert.equal(exported.schemaVersion, 6);
  assert(exported.links.every((link) => typeof link.placement === "string"));
  assert(exported.projects.every((project) => typeof project.displayMode === "string"));
  assert(exported.media.some((media) => media.kind === "project-cover" && media.projectSlug === coverProject.slug));
  assert.equal(exported.interests.find((interest) => interest.label === imageInterest.label)?.description, "Description de test");
  assert(exported.media.some((media) => media.kind === "interest-image" && media.interestLabel === imageInterest.label));
  console.log(JSON.stringify({ imports: [2, 3, 4, 5], export: 6, defaults: "ok", interests: "description and media preserved" }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
