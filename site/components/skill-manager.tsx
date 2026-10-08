"use client";

import { useActionState, useDeferredValue, useState } from "react";
import type { CapabilityKind, ContentStatus } from "@prisma/client";
import { deleteSkillAction, moveSkillAction, saveSkillAction, type SkillDeleteState } from "@/app/admin/(protected)/actions";
import { AdminDialog } from "@/components/admin-dialog";

type SkillRow = {
  id: string;
  slug: string;
  label: string;
  family: string;
  description: string;
  kind: CapabilityKind;
  privateNotes: string | null;
  active: boolean;
  status: ContentStatus;
  sortOrder: number;
  _count: { experiences: number; stages: number; contentBlocks: number; contentItems: number; projects: number };
};

type SkillKindFilter = "ALL" | CapabilityKind;
type SkillActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";
type SkillStatusFilter = "ALL" | ContentStatus;
type SkillUsageFilter = "ALL" | "USED" | "UNUSED";
type SkillSort = "ORDER" | "NAME" | "USAGE" | "FAMILY";

const initialDeleteState: SkillDeleteState = { status: "idle", message: "" };

export function SkillManager({ skills }: { skills: SkillRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SkillKindFilter>("ALL");
  const [active, setActive] = useState<SkillActiveFilter>("ALL");
  const [status, setStatus] = useState<SkillStatusFilter>("ALL");
  const [usage, setUsage] = useState<SkillUsageFilter>("ALL");
  const [sort, setSort] = useState<SkillSort>("ORDER");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("fr"));

  const visible = skills
    .filter((skill) => !deferredQuery || `${skill.label} ${skill.slug} ${skill.family} ${skill.description}`.toLocaleLowerCase("fr").includes(deferredQuery))
    .filter((skill) => kind === "ALL" || skill.kind === kind)
    .filter((skill) => active === "ALL" || skill.active === (active === "ACTIVE"))
    .filter((skill) => status === "ALL" || skill.status === status)
    .filter((skill) => usage === "ALL" || (skillUsageCount(skill) > 0) === (usage === "USED"))
    .toSorted((left, right) => {
      if (sort === "NAME") return left.label.localeCompare(right.label, "fr");
      if (sort === "USAGE") return skillUsageCount(right) - skillUsageCount(left) || left.label.localeCompare(right.label, "fr");
      if (sort === "FAMILY") return left.family.localeCompare(right.family, "fr") || left.label.localeCompare(right.label, "fr");
      return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "fr");
    });

  return <section className="admin-panel">
    <div className="admin-section-heading">
      <div><h2>Référentiel</h2><p>{visible.length} capacité{visible.length > 1 ? "s" : ""} affichée{visible.length > 1 ? "s" : ""} sur {skills.length}.</p></div>
      <AdminDialog title="Ajouter une compétence ou un outil" triggerLabel="+ Ajouter une compétence / un outil"><SkillForm /></AdminDialog>
    </div>
    <div className="admin-table-toolbar" aria-label="Recherche et filtres des compétences">
      <label className="admin-field admin-search"><span>Rechercher</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, slug, famille, description…" /></label>
      <label className="admin-field"><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as SkillKindFilter)}><option value="ALL">Tous</option><option value="DOMAIN">Compétence / domaine</option><option value="TECHNOLOGY">Technologie / outil</option></select></label>
      <label className="admin-field"><span>Activité</span><select value={active} onChange={(event) => setActive(event.target.value as SkillActiveFilter)}><option value="ALL">Tous</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Inactifs</option></select></label>
      <label className="admin-field"><span>Publication</span><select value={status} onChange={(event) => setStatus(event.target.value as SkillStatusFilter)}><option value="ALL">Tous</option><option value="DRAFT">Brouillons</option><option value="PUBLISHED">Prêts à publier</option></select></label>
      <label className="admin-field"><span>Usage</span><select value={usage} onChange={(event) => setUsage(event.target.value as SkillUsageFilter)}><option value="ALL">Tous</option><option value="USED">Utilisés</option><option value="UNUSED">Non utilisés</option></select></label>
      <label className="admin-field"><span>Trier par</span><select value={sort} onChange={(event) => setSort(event.target.value as SkillSort)}><option value="ORDER">Ordre éditorial</option><option value="NAME">Nom</option><option value="USAGE">Nombre d’usages</option><option value="FAMILY">Famille</option></select></label>
    </div>
    <div className="admin-table-wrap">
      <table className="admin-data-table admin-skill-table">
        <thead><tr><th>Nom</th><th>Type</th><th>Famille</th><th>Usages</th><th>État</th><th>Ordre</th><th>Actions</th></tr></thead>
        <tbody>
          {visible.map((skill) => {
            const sourceIndex = skills.findIndex((item) => item.id === skill.id);
            return <tr key={skill.id}>
              <th scope="row"><strong>{skill.label}</strong><small>{skill.slug}</small></th>
              <td>{skill.kind === "DOMAIN" ? "Compétence" : "Technologie"}</td>
              <td>{skill.family}</td>
              <td><strong>{skillUsageCount(skill)} usage{skillUsageCount(skill) > 1 ? "s" : ""}</strong><small>{skillUsageDetail(skill)}</small></td>
              <td><StatusBadges active={skill.active} status={skill.status} /></td>
              <td><span className="admin-order-value">{String(skill.sortOrder).padStart(2, "0")}</span><form className="admin-row-order" action={moveSkillAction}><input type="hidden" name="id" value={skill.id} /><button className="admin-icon-button" name="direction" value="up" disabled={sourceIndex === 0} aria-label={`Monter ${skill.label}`}>↑</button><button className="admin-icon-button" name="direction" value="down" disabled={sourceIndex === skills.length - 1} aria-label={`Descendre ${skill.label}`}>↓</button></form></td>
              <td><div className="admin-row-actions"><AdminDialog title={`Modifier ${skill.label}`} triggerLabel="Éditer"><SkillForm skill={skill} /></AdminDialog><DeleteSkillDialog skill={skill} /></div></td>
            </tr>;
          })}
          {visible.length === 0 && <tr><td className="admin-empty-row" colSpan={7}>Aucune compétence ne correspond aux filtres.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

function SkillForm({ skill }: { skill?: SkillRow }) {
  return <form className="admin-editorial-form admin-dialog-form" action={saveSkillAction}>
    <input type="hidden" name="id" value={skill?.id ?? ""} />
    <div className="admin-form-grid">
      <label className="admin-field"><span>Nom</span><input name="label" defaultValue={skill?.label} required placeholder="Nom de la capacité" /></label>
      <label className="admin-field"><span>Slug</span><input name="slug" defaultValue={skill?.slug} placeholder="généré depuis le nom" /></label>
      <label className="admin-field"><span>Nature</span><select name="kind" defaultValue={skill?.kind ?? "DOMAIN"}><option value="DOMAIN">Domaine / compétence</option><option value="TECHNOLOGY">Technologie / outil / environnement</option></select></label>
      <label className="admin-field"><span>Famille éditoriale</span><input name="family" defaultValue={skill?.family} required placeholder="Résoudre, Environnement…" /></label>
      <label className="admin-field admin-field-wide"><span>Description contextuelle</span><textarea name="description" defaultValue={skill?.description} required /></label>
      <label className="admin-field admin-field-wide"><span>Notes privées / provenance</span><textarea name="privateNotes" defaultValue={skill?.privateNotes ?? ""} placeholder="Jamais affichées sur le site public." /></label>
    </div>
    <div className="admin-actions">
      <select name="status" aria-label="État" defaultValue={skill?.status ?? "DRAFT"}><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
      <label className="admin-check"><input type="checkbox" name="active" defaultChecked={skill?.active ?? true} /> Actif</label>
      <button className="admin-button admin-button-primary" type="submit">{skill ? "Enregistrer" : "Ajouter"}</button>
    </div>
  </form>;
}

function DeleteSkillDialog({ skill }: { skill: SkillRow }) {
  const [state, formAction] = useActionState(deleteSkillAction, initialDeleteState);
  const usages = skillUsageCount(skill);
  return <AdminDialog title={`Supprimer ${skill.label}`} triggerLabel="Supprimer" triggerClassName="admin-button admin-button-danger">
    <form className="admin-confirm-form" action={formAction}>
      <input type="hidden" name="id" value={skill.id} />
      <input type="hidden" name="confirmation" value="DELETE" />
      {usages > 0
        ? <p><strong>Cette compétence est utilisée dans {usages} relation{usages > 1 ? "s" : ""}.</strong> La supprimer retirera également ces associations de la version de travail.</p>
        : <p>Cette compétence n’est utilisée dans aucune relation. Sa suppression ne modifiera aucun autre contenu.</p>}
      <p className="admin-help">Le dernier snapshot public reste inchangé jusqu’à une nouvelle publication.</p>
      <button className="admin-button admin-button-danger" type="submit">{usages > 0 ? `Supprimer malgré ${usages} usages` : "Confirmer la suppression"}</button>
      {state.status !== "idle" && <p className={state.status === "error" ? "admin-error" : "admin-success"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    </form>
  </AdminDialog>;
}

function StatusBadges({ active, status }: { active: boolean; status: ContentStatus }) {
  return <div className="admin-badge-list"><span className={`admin-badge ${status === "PUBLISHED" ? "is-ready" : "is-draft"}`}>{status === "PUBLISHED" ? "Prêt à publier" : "Brouillon"}</span><span className={`admin-badge ${active ? "is-active" : "is-inactive"}`}>{active ? "Actif" : "Inactif"}</span></div>;
}

function skillUsageCount(skill: SkillRow) {
  return skill._count.experiences + skill._count.stages + skill._count.contentBlocks + skill._count.contentItems + skill._count.projects;
}

function skillUsageDetail(skill: SkillRow) {
  return [
    `${skill._count.experiences} expérience${skill._count.experiences > 1 ? "s" : ""}`,
    `${skill._count.stages} fonction${skill._count.stages > 1 ? "s" : ""}`,
    `${skill._count.contentBlocks} bloc${skill._count.contentBlocks > 1 ? "s" : ""}`,
    `${skill._count.contentItems} élément${skill._count.contentItems > 1 ? "s" : ""}`,
    `${skill._count.projects} projet${skill._count.projects > 1 ? "s" : ""}`,
  ].join(" · ");
}
