import "dotenv/config";
import { getAdminBackup, restoreAdminBackup } from "../lib/admin-backup";
import { prisma } from "../lib/prisma";
import { createPublishedSnapshot, getPublishedResume, getWorkingResume } from "../lib/resume-data";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const marker = "[test modèle V2]";

async function main() {
try {
  const baseline = await getAdminBackup();
  const publicBefore = await getPublishedResume();
  const example = await prisma.experience.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
  const diagnostic = await prisma.skill.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });

  const stageA = await prisma.experienceStage.create({ data: {
    title: `${marker} fonction A`, sortOrder: 90, privateNotes: "Note privée de test", experienceId: example.id,
    skills: { create: { skillId: diagnostic.id } },
  } });
  const stageB = await prisma.experienceStage.create({ data: { title: `${marker} fonction B`, sortOrder: 91, experienceId: example.id } });
  await prisma.$transaction([
    prisma.experienceStage.update({ where: { id: stageA.id }, data: { sortOrder: 91 } }),
    prisma.experienceStage.update({ where: { id: stageB.id }, data: { sortOrder: 90 } }),
  ]);
  await prisma.experienceStage.delete({ where: { id: stageA.id } });

  await prisma.contentBlock.create({ data: {
    type: "ACHIEVEMENTS", title: `${marker} réalisation`, sortOrder: 90, privateNotes: "Provenance test",
    experienceId: example.id, skills: { create: { skillId: diagnostic.id } },
    items: { create: { content: `${marker} élément`, sortOrder: 0, skills: { create: { skillId: diagnostic.id } } } },
  } });

  const preview = await getWorkingResume(true);
  assert(JSON.stringify(preview).includes(marker), "Les nouveaux contenus n’apparaissent pas dans l’aperçu de travail.");
  assert(!JSON.stringify(await getPublishedResume()).includes(marker), "Le brouillon a contaminé le snapshot public.");

  const modifiedBackup = await getAdminBackup();
  assert(modifiedBackup.schemaVersion === 6, "Le format d’export n’est pas en V6.");
  assert(JSON.stringify(modifiedBackup).includes("Note privée de test") === false, "Une fonction supprimée est encore exportée.");
  assert(JSON.stringify(modifiedBackup).includes("Provenance test"), "Les notes privées ne sont pas exportées.");
  assert(JSON.stringify(modifiedBackup).includes('"diagnostic"'), "Les relations par slug ne sont pas exportées.");

  await restoreAdminBackup(baseline);
  assert(!JSON.stringify(await getWorkingResume(true)).includes(marker), "La restauration de référence est incomplète.");
  assert(JSON.stringify(await getPublishedResume()) === JSON.stringify(publicBefore), "L’import a modifié la version publique.");

  await restoreAdminBackup(modifiedBackup);
  const restored = await getWorkingResume(true);
  assert(JSON.stringify(restored).includes(`${marker} réalisation`), "Le bloc V2 n’a pas été restauré.");
  const restoredUsage = restored.skills.find((skill) => skill.slug === "diagnostic")?.usages.some((usage) => usage.itemContent?.includes(marker));
  assert(restoredUsage, "La relation fine capacité → élément n’a pas été restaurée.");
  assert(!JSON.stringify(await getPublishedResume()).includes(marker), "La restauration a publié le brouillon.");

  await createPublishedSnapshot("Test automatisé du modèle V2");
  assert(JSON.stringify(await getPublishedResume()).includes(marker), "La publication n’inclut pas le nouveau modèle.");

  await restoreAdminBackup(baseline);
  console.log(JSON.stringify({
    migration: "ok", stageAddDeleteReorder: "ok", blockRelations: "ok", previewIsolation: "ok",
    publication: "ok", exportImportV6: "ok", baselineExperiences: baseline.experiences.length,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
