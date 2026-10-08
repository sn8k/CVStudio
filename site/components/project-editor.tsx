"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  moveProjectAction,
  saveProjectAction,
  type ProjectSaveState,
} from "@/app/admin/(protected)/actions";
import { AdminDialog } from "@/components/admin-dialog";

type ProjectEditorSkill = {
  id: string;
  label: string;
  kind: "DOMAIN" | "TECHNOLOGY";
  active: boolean;
};

type ProjectEditorProject = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string | null;
  active: boolean;
  status: "DRAFT" | "PUBLISHED";
  displayMode: "PINNED" | "ROTATING" | "HIDDEN";
  sortOrder: number;
  privateNotes: string | null;
  skills: { skillId: string }[];
  links: ProjectEditorLink[];
  media: ProjectEditorMedia[];
};

type ProjectEditorMedia = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
};

type ProjectEditorLink = {
  id: string;
  label: string;
  url: string;
  kind: string;
  active: boolean;
};

const initialState: ProjectSaveState = { status: "idle", message: "" };

export function ProjectEditorList({ projects, skills }: { projects: ProjectEditorProject[]; skills: ProjectEditorSkill[] }) {
  return <div className="admin-compact-list">
    <div className="admin-list-actions"><AdminDialog title="Nouveau projet" triggerLabel="+ Nouveau projet"><ProjectForm skills={skills} /></AdminDialog></div>
    <div className="admin-table-wrap">
      <table className="admin-data-table admin-project-table">
        <thead><tr><th>Projet</th><th>Affichage</th><th>État</th><th>Skills</th><th>Cover</th><th>Liens</th><th>Ordre</th><th>Actions</th></tr></thead>
        <tbody>{projects.map((project, index) => {
          const moveUp = moveProjectAction.bind(null, "up");
          const moveDown = moveProjectAction.bind(null, "down");
          return <tr key={project.id}>
            <th scope="row"><strong>{project.title}</strong><small>{project.slug}</small></th>
            <td><span className="admin-badge">{displayModeLabel(project.displayMode)}</span></td>
            <td><StatusBadges active={project.active} status={project.status} /></td>
            <td>{project.skills.length}</td>
            <td>{project.media.length > 0 ? "Oui" : "Non"}</td>
            <td>{project.links.length}</td>
            <td><span className="admin-order-value">{String(project.sortOrder).padStart(2, "0")}</span><form className="admin-row-order"><input type="hidden" name="id" value={project.id} /><button className="admin-icon-button" formAction={moveUp} disabled={index === 0} aria-label={`Monter ${project.title}`}>↑</button><button className="admin-icon-button" formAction={moveDown} disabled={index === projects.length - 1} aria-label={`Descendre ${project.title}`}>↓</button></form></td>
            <td><AdminDialog title={`Modifier ${project.title}`} triggerLabel="Éditer"><ProjectForm project={project} skills={skills} /></AdminDialog></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="admin-button admin-button-primary" type="submit" disabled={pending}>
      {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
    </button>
  );
}

function ProjectForm({ project, skills }: { project?: ProjectEditorProject; skills: ProjectEditorSkill[] }) {
  const [state, formAction] = useActionState(saveProjectAction, initialState);
  const [projectLinks, setProjectLinks] = useState<ProjectEditorLink[]>(project?.links ?? []);
  const [selectedSkillIds, setSelectedSkillIds] = useState(() => project?.skills.map((relation) => relation.skillId) ?? []);
  const [cover, setCover] = useState(() => {
    const current = project?.media[0];
    return { url: current?.url ?? "", alt: current?.alt ?? "", caption: current?.caption ?? "" };
  });
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!project && state.status === "success") {
      formRef.current?.reset();
      const resetFields = window.setTimeout(() => {
        setProjectLinks([]);
        setCover({ url: "", alt: "", caption: "" });
        setSelectedSkillIds([]);
      }, 0);
      return () => window.clearTimeout(resetFields);
    }
  }, [project, state.status, state.projectId]);

  const updateLink = (linkIndex: number, changes: Partial<ProjectEditorLink>) => {
    setProjectLinks((current) => current.map((link, currentIndex) => (
      currentIndex === linkIndex ? { ...link, ...changes } : link
    )));
  };

  const moveLink = (linkIndex: number, direction: -1 | 1) => {
    setProjectLinks((current) => {
      const targetIndex = linkIndex + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[linkIndex], next[targetIndex]] = [next[targetIndex], next[linkIndex]];
      return next;
    });
  };

  return (
    <form ref={formRef} className="admin-editorial-form admin-dialog-form" action={formAction}>
      <input type="hidden" name="id" value={project?.id ?? ""} />
      <div className="admin-form-grid">
        <label className="admin-field"><span>Titre</span><input name="title" defaultValue={project?.title ?? ""} required /></label>
        <label className="admin-field"><span>Slug <small>(automatique si vide)</small></span><input name="slug" defaultValue={project?.slug ?? ""} /></label>
        <label className="admin-field admin-field-wide"><span>Angle / résumé court</span><input name="summary" defaultValue={project?.summary ?? ""} required /></label>
        <label className="admin-field admin-field-wide"><span>Détails publics</span><textarea name="description" defaultValue={project?.description ?? ""} /></label>
        <label className="admin-field admin-field-wide"><span>Notes privées</span><textarea name="privateNotes" defaultValue={project?.privateNotes ?? ""} /></label>
        <label className="admin-field admin-field-wide"><span>Affichage public</span><select name="displayMode" defaultValue={project?.displayMode ?? "ROTATING"}>
          <option value="PINNED">Épinglé</option>
          <option value="ROTATING">Rotation</option>
          <option value="HIDDEN">Masqué du carrousel public</option>
        </select><small className="admin-help">Épinglé : position stable · Rotation : ordre variable à chaque chargement · Masqué : conservé mais non affiché.</small></label>
      </div>
      <fieldset className="admin-skill-fieldset">
        <legend>Compétences associées</legend>
        <ProjectSkillPicker skills={skills} selectedIds={selectedSkillIds} onChange={setSelectedSkillIds} />
      </fieldset>
      <fieldset className="admin-project-cover">
        <legend>Visuel de la card</legend>
        <p className="admin-help">URL HTTP(S) ou chemin public commençant par <code>/</code>. Le texte alternatif est obligatoire si un visuel est renseigné.</p>
        <div className="admin-form-grid">
          <label className="admin-field admin-field-wide">
            <span>URL / chemin du screenshot</span>
            <input name="coverUrl" value={cover.url} onChange={(event) => setCover((current) => ({ ...current, url: event.target.value }))} placeholder="/projects/mon-projet/cover.webp" />
          </label>
          <label className="admin-field admin-field-wide">
            <span>Texte alternatif</span>
            <input name="coverAlt" value={cover.alt} onChange={(event) => setCover((current) => ({ ...current, alt: event.target.value }))} required={Boolean(cover.url.trim())} />
          </label>
          <label className="admin-field admin-field-wide">
            <span>Légende <small>(facultative)</small></span>
            <input name="coverCaption" value={cover.caption} onChange={(event) => setCover((current) => ({ ...current, caption: event.target.value }))} />
          </label>
        </div>
        {cover.url && <button className="admin-button admin-button-secondary" type="button" onClick={() => setCover({ url: "", alt: "", caption: "" })}>Supprimer le visuel</button>}
      </fieldset>
      <fieldset className="admin-project-links">
        <legend>Liens</legend>
        <p className="admin-help">Ajoutez uniquement des adresses publiques vérifiées. Une URL vide est ignorée.</p>
        <input type="hidden" name="projectLinks" value={JSON.stringify(projectLinks)} />
        <datalist id={`project-link-kinds-${project?.id ?? "new"}`}>
          <option value="github" />
          <option value="website" />
          <option value="demo" />
          <option value="docs" />
          <option value="article" />
          <option value="download" />
          <option value="other" />
        </datalist>
        {projectLinks.length > 0 && (
          <div className="admin-project-link-list">
            {projectLinks.map((link, linkIndex) => (
              <div className="admin-project-link-row" key={link.id}>
                <label className="admin-field">
                  <span>Libellé</span>
                  <input value={link.label} onChange={(event) => updateLink(linkIndex, { label: event.target.value })} placeholder="GitHub" required={Boolean(link.url)} />
                </label>
                <label className="admin-field">
                  <span>Type</span>
                  <input value={link.kind} onChange={(event) => updateLink(linkIndex, { kind: event.target.value })} list={`project-link-kinds-${project?.id ?? "new"}`} placeholder="website" required={Boolean(link.url)} />
                </label>
                <label className="admin-field admin-project-link-url">
                  <span>URL</span>
                  <input type="url" value={link.url} onChange={(event) => updateLink(linkIndex, { url: event.target.value })} placeholder="https://…" />
                </label>
                <div className="admin-project-link-actions">
                  <label className="admin-check"><input type="checkbox" checked={link.active} onChange={(event) => updateLink(linkIndex, { active: event.target.checked })} /> Actif</label>
                  <button className="admin-icon-button" type="button" onClick={() => moveLink(linkIndex, -1)} disabled={linkIndex === 0} aria-label={`Monter le lien ${link.label || linkIndex + 1}`}>↑</button>
                  <button className="admin-icon-button" type="button" onClick={() => moveLink(linkIndex, 1)} disabled={linkIndex === projectLinks.length - 1} aria-label={`Descendre le lien ${link.label || linkIndex + 1}`}>↓</button>
                  <button className="admin-button admin-button-secondary" type="button" onClick={() => setProjectLinks((current) => current.filter((_, currentIndex) => currentIndex !== linkIndex))}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="admin-button admin-button-secondary" type="button" onClick={() => setProjectLinks((current) => [...current, {
          id: crypto.randomUUID(), label: "", url: "", kind: "website", active: true,
        }])}>+ Ajouter un lien</button>
      </fieldset>
      <div className="admin-actions">
        <select name="status" defaultValue={project?.status ?? "DRAFT"} aria-label="État"><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
        <label className="admin-check"><input name="active" type="checkbox" defaultChecked={project?.active ?? true} /> Actif</label>
        <SubmitButton editing={Boolean(project)} />
      </div>
      {state.status !== "idle" && (
        <p className={state.status === "error" ? "admin-error" : "admin-success"} role={state.status === "error" ? "alert" : "status"} aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}

function ProjectSkillPicker({ skills, selectedIds, onChange }: { skills: ProjectEditorSkill[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | ProjectEditorSkill["kind"]>("ALL");
  const selected = new Set(selectedIds);
  const selectedSkills = selectedIds.map((id) => skills.find((skill) => skill.id === id)).filter((skill): skill is ProjectEditorSkill => Boolean(skill));
  const visible = skills.filter((skill) => (
    (skill.active || selected.has(skill.id))
    && (kind === "ALL" || skill.kind === kind)
    && skill.label.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))
  ));
  const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);

  return <div className="admin-skill-picker">
    {selectedIds.map((id) => <input key={id} type="hidden" name="skillIds" value={id} />)}
    <div className="admin-picker-heading"><span>{selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}</span>{selectedSkills.length > 0 && <div className="admin-selected-skills">{selectedSkills.map((skill) => <button type="button" key={skill.id} onClick={() => toggle(skill.id)} aria-label={`Retirer ${skill.label}`}>{skill.label}{!skill.active && " · inactive"}<span aria-hidden="true">×</span></button>)}</div>}</div>
    <div className="admin-picker-controls">
      <label className="admin-field"><span>Rechercher une compétence</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Diagnostic, Docker, Linux…" /></label>
      <label className="admin-field"><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as "ALL" | ProjectEditorSkill["kind"])}><option value="ALL">Tous</option><option value="DOMAIN">Compétences</option><option value="TECHNOLOGY">Technologies</option></select></label>
    </div>
    <div className="admin-picker-results">
      {visible.map((skill) => <label className="admin-check" key={skill.id}><input type="checkbox" checked={selected.has(skill.id)} onChange={() => toggle(skill.id)} />{skill.label}<small>{skill.kind === "DOMAIN" ? "compétence" : "outil"}{!skill.active && " · inactive"}</small></label>)}
      {visible.length === 0 && <p className="admin-help">Aucun résultat.</p>}
    </div>
  </div>;
}

function StatusBadges({ active, status }: { active: boolean; status: ProjectEditorProject["status"] }) {
  return <div className="admin-badge-list"><span className={`admin-badge ${status === "PUBLISHED" ? "is-ready" : "is-draft"}`}>{status === "PUBLISHED" ? "Prêt à publier" : "Brouillon"}</span><span className={`admin-badge ${active ? "is-active" : "is-inactive"}`}>{active ? "Actif" : "Inactif"}</span></div>;
}

function displayModeLabel(mode: ProjectEditorProject["displayMode"]) {
  if (mode === "PINNED") return "Épinglé";
  if (mode === "HIDDEN") return "Masqué";
  return "Rotation";
}
