import { AdminHeader } from "@/components/admin-header";
import { ExperienceForm } from "@/components/experience-form";
import { prisma } from "@/lib/prisma";

export default async function NewExperiencePage() {
  const [skills, last] = await Promise.all([
    prisma.skill.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, label: true, family: true, kind: true } }),
    prisma.experience.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }),
  ]);
  return <><AdminHeader kicker="Parcours" title="Nouvelle expérience" description="Elle est créée en brouillon et reste invisible sur le site public jusqu’à publication." /><section className="admin-panel"><ExperienceForm skills={skills} experience={{ sortOrder: (last?.sortOrder ?? -1) + 1 }} /></section></>;
}
