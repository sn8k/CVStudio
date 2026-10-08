import Link from "next/link";
import { AdminHeader } from "@/components/admin-header";
import { prisma } from "@/lib/prisma";
import { deactivateExperienceAction, moveExperienceAction } from "../actions";

export default async function AdminExperiencesPage() {
  const experiences = await prisma.experience.findMany({
    orderBy: [{ sortOrder: "asc" }, { startYear: "desc" }],
    include: {
      stages: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { title: true } },
      _count: { select: { skills: true, contentBlocks: true } },
    },
  });
  return (
    <>
      <AdminHeader kicker="Parcours" title="Expériences" description="Chaque expérience réunit sa progression de fonctions, ses blocs détaillés et ses capacités reliées." actions={<Link className="admin-button admin-button-primary" href="/admin/experiences/new">Ajouter une expérience</Link>} />
      <div className="admin-list">
        {experiences.map((experience, index) => (
          <article className="admin-list-item" key={experience.id}>
            <div>
              <h3>{experience.company} · {experience.stages.map((stage) => stage.title).join(" → ") || experience.role}</h3>
              <p>{experience.period} — {experience._count.contentBlocks} bloc{experience._count.contentBlocks > 1 ? "s" : ""}, {experience._count.skills} capacité{experience._count.skills > 1 ? "s" : ""} liée{experience._count.skills > 1 ? "s" : ""} globalement</p>
              <div className="admin-badges"><span className={`admin-badge ${experience.status === "DRAFT" ? "admin-badge-draft" : ""}`}>{experience.status === "DRAFT" ? "Brouillon" : "Prêt à publier"}</span>{!experience.active && <span className="admin-badge admin-badge-draft">Désactivé</span>}</div>
            </div>
            <div className="admin-actions">
              <form className="admin-order-buttons" action={moveExperienceAction}><input type="hidden" name="id" value={experience.id} /><button className="admin-icon-button" name="direction" value="up" disabled={index === 0} aria-label={`Monter ${experience.company}`}>↑</button><button className="admin-icon-button" name="direction" value="down" disabled={index === experiences.length - 1} aria-label={`Descendre ${experience.company}`}>↓</button></form>
              <Link className="admin-button admin-button-primary" href={`/admin/experiences/${experience.id}`}>Modifier</Link>
              {experience.active && <form action={deactivateExperienceAction}><input type="hidden" name="id" value={experience.id} /><button className="admin-button admin-button-danger" type="submit">Désactiver</button></form>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
