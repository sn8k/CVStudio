import { AdminHeader } from "@/components/admin-header";
import { SkillManager } from "@/components/skill-manager";
import { prisma } from "@/lib/prisma";

export default async function AdminSkillsPage() {
  const skills = await prisma.skill.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { experiences: true, stages: true, contentBlocks: true, contentItems: true, projects: true } } },
  });
  return <><AdminHeader kicker="Référentiel" title="Compétences & outils" description="Distinguez les savoir-faire des environnements techniques, puis reliez-les au contexte exact où ils ont été mobilisés." /><SkillManager skills={skills} /></>;
}
