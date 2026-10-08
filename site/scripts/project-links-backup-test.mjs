import "dotenv/config";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
const temporaryDatabase = fileURLToPath(new URL("../.test-artifacts/project-links-backup.db", import.meta.url));
await mkdir(fileURLToPath(new URL("../.test-artifacts/", import.meta.url)), { recursive: true });
await copyFile(sourceDatabase, temporaryDatabase);
process.env.DATABASE_URL = `file:${temporaryDatabase.replaceAll("\\", "/")}`;

const [{ prisma }, { adminBackupSchema, getAdminBackup, restoreAdminBackup }] = await Promise.all([
  import("../lib/prisma.ts"),
  import("../lib/admin-backup.ts"),
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const project = await prisma.project.findFirst({ orderBy: { sortOrder: "asc" } });
  assert(project, "Aucun projet n’est disponible pour le test de sauvegarde.");
  await prisma.projectLink.create({ data: {
    projectId: project.id,
    label: "Lien de sauvegarde temporaire",
    url: "https://example.com/backup-test",
    kind: "docs",
    active: true,
    sortOrder: 97,
  } });
  const backup = await getAdminBackup();
  assert(backup.projects.find((item) => item.slug === project.slug)?.links?.some((link) => link.url.endsWith("backup-test")), "L’export perd le lien de test.");

  await prisma.projectLink.deleteMany();
  await restoreAdminBackup(backup);
  const restored = await prisma.project.findUnique({ where: { slug: project.slug }, include: { links: true } });
  assert(restored?.links.some((link) => link.url.endsWith("backup-test")), "L’import ne restaure pas le lien de projet.");

  const legacyBackup = {
    ...backup,
    schemaVersion: 3,
    projects: backup.projects.map((item) => {
      const legacy = { ...item };
      delete legacy.links;
      return legacy;
    }),
  };
  assert(adminBackupSchema.safeParse(legacyBackup).success, "Une sauvegarde V3 sans liens n’est plus acceptée.");
  console.log(JSON.stringify({ exportWithLinks: "ok", importWithLinks: "ok", legacyBackupV3: "ok", liveDatabaseUntouched: true }, null, 2));
} finally {
  await prisma.$disconnect();
  await rm(temporaryDatabase, { force: true });
}
