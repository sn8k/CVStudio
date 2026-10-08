import { AdminHeader } from "@/components/admin-header";
import { AdminDialog } from "@/components/admin-dialog";
import { ProjectEditorList } from "@/components/project-editor";
import { prisma } from "@/lib/prisma";
import { moveExtraSectionAction, saveExtraSectionAction } from "../actions";

export default async function AdminEditorialPage() {
  const [projects, sections, skills] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: {
        skills: true,
        links: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
        media: { where: { kind: "project-cover" }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
    prisma.extraSection.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.skill.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return <>
    <AdminHeader kicker="Homepage" title="Projets & textes éditoriaux" description="Ces contenus alimentent la section projets et les trois axes d’intervention du CV." />
    <section className="admin-panel"><h2>Projets</h2><p className="admin-help">Choisissez les projets épinglés, ceux qui participent à la rotation et ceux qui restent masqués du carrousel public.</p>
      <ProjectEditorList projects={projects} skills={skills} />
    </section>
    <section className="admin-panel"><h2>Textes structurants</h2><p className="admin-help">Les slugs <code>approach-*</code> forment les trois axes. <code>projects-since-2025</code> introduit la section projets.</p>
      <div className="admin-list-actions"><AdminDialog title="Ajouter un texte structurant" triggerLabel="+ Ajouter un texte"><ExtraSectionForm /></AdminDialog></div>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Titre</th><th>État</th><th>Ordre</th><th>Actions</th></tr></thead><tbody>{sections.map((section, index) => {
        const moveUp = moveExtraSectionAction.bind(null, "up");
        const moveDown = moveExtraSectionAction.bind(null, "down");
        return <tr key={section.id}><th scope="row"><strong>{section.title}</strong><small>{section.slug}</small></th><td><StatusBadges item={section} /></td><td><span className="admin-order-value">{String(section.sortOrder).padStart(2, "0")}</span><form className="admin-row-order"><input type="hidden" name="id" value={section.id} /><button className="admin-icon-button" formAction={moveUp} disabled={index === 0} aria-label={`Monter ${section.title}`}>↑</button><button className="admin-icon-button" formAction={moveDown} disabled={index === sections.length - 1} aria-label={`Descendre ${section.title}`}>↓</button></form></td><td><AdminDialog title={`Modifier ${section.title}`} triggerLabel="Éditer"><ExtraSectionForm section={section} /></AdminDialog></td></tr>;
      })}</tbody></table></div>
    </section>
  </>;
}

type State = { id: string; active: boolean; status: "DRAFT" | "PUBLISHED"; privateNotes: string | null };
function StateControls({ item }: { item?: State }) {
  return <div className="admin-actions">
    <select name="status" defaultValue={item?.status ?? "DRAFT"} aria-label="État"><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
    <label className="admin-check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Actif</label>
    <button className="admin-button admin-button-primary" type="submit">{item ? "Enregistrer" : "Ajouter"}</button>
  </div>;
}

function ExtraSectionForm({ section }: { section?: State & { slug: string; eyebrow: string | null; title: string; content: string } }) {
  return <form className="admin-editorial-form admin-dialog-form" action={saveExtraSectionAction}>
    <input type="hidden" name="id" value={section?.id ?? ""} />
    <div className="admin-form-grid">
      <label className="admin-field"><span>Titre</span><input name="title" defaultValue={section?.title ?? ""} required /></label>
      <label className="admin-field"><span>Slug <small>(automatique si vide)</small></span><input name="slug" defaultValue={section?.slug ?? ""} /></label>
      <label className="admin-field admin-field-wide"><span>Sur-titre</span><input name="eyebrow" defaultValue={section?.eyebrow ?? ""} /></label>
      <label className="admin-field admin-field-wide"><span>Contenu public</span><textarea name="content" defaultValue={section?.content ?? ""} required /></label>
      <label className="admin-field admin-field-wide"><span>Notes privées</span><textarea name="privateNotes" defaultValue={section?.privateNotes ?? ""} /></label>
    </div>
    <StateControls item={section} />
  </form>;
}

function StatusBadges({ item }: { item: State }) {
  return <div className="admin-badge-list"><span className={`admin-badge ${item.status === "PUBLISHED" ? "is-ready" : "is-draft"}`}>{item.status === "PUBLISHED" ? "Prêt à publier" : "Brouillon"}</span><span className={`admin-badge ${item.active ? "is-active" : "is-inactive"}`}>{item.active ? "Actif" : "Inactif"}</span></div>;
}
