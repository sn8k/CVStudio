import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [experiences, stages, blocks, items, skillKinds, snapshotVersions, example] = await Promise.all([
    prisma.experience.count(),
    prisma.experienceStage.count(),
    prisma.contentBlock.count(),
    prisma.contentItem.count(),
    prisma.skill.groupBy({ by: ["kind"], _count: true }),
    prisma.publishedSnapshot.groupBy({ by: ["schemaVersion"], _count: true }),
    prisma.experience.findFirst({
      where: { active: true },
      include: {
        stages: { orderBy: { sortOrder: "asc" } },
        contentBlocks: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
  ]);

  console.log(JSON.stringify({ experiences, stages, blocks, items, skillKinds, snapshotVersions, example }, null, 2));
} finally {
  await prisma.$disconnect();
}
