import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { ExperienceForm } from "@/components/experience-form";
import { prisma } from "@/lib/prisma";

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [experience, skills] = await Promise.all([
    prisma.experience.findUnique({
      where: { id },
      include: {
        skills: true,
        stages: { orderBy: { sortOrder: "asc" }, include: { skills: true } },
        contentBlocks: { orderBy: { sortOrder: "asc" }, include: { skills: true, items: { orderBy: { sortOrder: "asc" }, include: { skills: true } } } },
      },
    }),
    prisma.skill.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, label: true, family: true, kind: true } }),
  ]);
  if (!experience) notFound();
  return <><AdminHeader kicker="Parcours" title={experience.company} description="Modifiez la version de travail. Le public conserve le dernier instantané publié." /><section className="admin-panel"><ExperienceForm skills={skills} experience={experience} /></section></>;
}
