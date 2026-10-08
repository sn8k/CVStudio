"use client";

import { useMemo, useState } from "react";
import type { CapabilityKind, ContentBlockType, ContentStatus } from "@prisma/client";
import { saveExperienceAction } from "@/app/admin/(protected)/actions";

type Capability = { id: string; label: string; family: string; kind: CapabilityKind };
type Stage = {
  id: string;
  title: string;
  startDateLabel: string;
  endDateLabel: string;
  description: string;
  active: boolean;
  privateNotes: string;
  skillIds: string[];
};
type Item = { id: string; content: string; active: boolean; privateNotes: string; skillIds: string[] };
type Block = {
  id: string;
  type: ContentBlockType;
  title: string;
  body: string;
  active: boolean;
  privateNotes: string;
  skillIds: string[];
  items: Item[];
};

type ExperienceForForm = {
  id?: string;
  slug?: string;
  period?: string;
  startYear?: number;
  endYear?: number | null;
  company?: string;
  place?: string;
  role?: string;
  summary?: string;
  accent?: string;
  active?: boolean;
  status?: ContentStatus;
  sortOrder?: number;
  privateNotes?: string | null;
  skills?: { skillId: string }[];
  stages?: Array<{
    id: string; title: string; startDateLabel: string | null; endDateLabel: string | null;
    description: string | null; active: boolean; privateNotes: string | null; skills: { skillId: string }[];
  }>;
  contentBlocks?: Array<{
    id: string; type: ContentBlockType; title: string; body: string | null; active: boolean; privateNotes: string | null;
    skills: { skillId: string }[];
    items: Array<{ id: string; content: string; active: boolean; privateNotes: string | null; skills: { skillId: string }[] }>;
  }>;
};

const blockTypes: Array<[ContentBlockType, string]> = [
  ["MISSIONS", "Missions"],
  ["ACHIEVEMENTS", "Réalisations / initiatives"],
  ["CONTEXT", "Contexte"],
  ["PROBLEMS", "Problèmes résolus"],
  ["TOOLS", "Outils / technologies"],
  ["FREEFORM", "Texte libre"],
  ["LEGACY", "Bloc importé à reclasser"],
];

const newId = () => `new-${crypto.randomUUID()}`;

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function ExperienceForm({ experience = {}, skills }: { experience?: ExperienceForForm; skills: Capability[] }) {
  const [stages, setStages] = useState<Stage[]>(() =>
    experience.stages?.map((stage) => ({
      id: stage.id,
      title: stage.title,
      startDateLabel: stage.startDateLabel ?? "",
      endDateLabel: stage.endDateLabel ?? "",
      description: stage.description ?? "",
      active: stage.active,
      privateNotes: stage.privateNotes ?? "",
      skillIds: stage.skills.map(({ skillId }) => skillId),
    })) ?? [{ id: "new-stage-initial", title: experience.role ?? "", startDateLabel: "", endDateLabel: "", description: "", active: true, privateNotes: "", skillIds: [] }],
  );
  const [blocks, setBlocks] = useState<Block[]>(() =>
    experience.contentBlocks?.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      body: block.body ?? "",
      active: block.active,
      privateNotes: block.privateNotes ?? "",
      skillIds: block.skills.map(({ skillId }) => skillId),
      items: block.items.map((item) => ({
        id: item.id,
        content: item.content,
        active: item.active,
        privateNotes: item.privateNotes ?? "",
        skillIds: item.skills.map(({ skillId }) => skillId),
      })),
    })) ?? [],
  );

  const model = useMemo(() => JSON.stringify({ stages, blocks }), [stages, blocks]);
  const updateStage = (index: number, patch: Partial<Stage>) => setStages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateBlock = (index: number, patch: Partial<Block>) => setBlocks((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  return (
    <form className="admin-form" action={saveExperienceAction}>
      <input type="hidden" name="id" value={experience.id ?? ""} />
      <input type="hidden" name="sortOrder" value={experience.sortOrder ?? 0} />
      <input type="hidden" name="contentModel" value={model} />
      <div className="admin-form-grid">
        <FormField label="Employeur" name="company" value={experience.company} required />
        <FormField label="Période affichée" name="period" value={experience.period} placeholder="2018 — 2025" required />
        <FormField label="Lieu / modalité" name="place" value={experience.place} required />
        <FormField label="Année de début" name="startYear" type="number" value={experience.startYear} required />
        <FormField label="Année de fin" name="endYear" type="number" value={experience.endYear ?? ""} />
        <FormField label="Identifiant URL" name="slug" value={experience.slug} placeholder="généré depuis l’employeur" />
        <div className="admin-field">
          <label htmlFor="accent">Couleur d’accent</label>
          <div className="admin-color-control"><input id="accent" name="accent" type="color" defaultValue={experience.accent ?? "#9fe7c3"} /><span>Utilisée comme repère discret sur le parcours</span></div>
        </div>
        <FormField label="Résumé court" name="summary" value={experience.summary} textarea full required />
        <div className="admin-field">
          <label htmlFor="status">État éditorial</label>
          <select id="status" name="status" defaultValue={experience.status ?? "DRAFT"}><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
        </div>
        <label className="admin-check"><input type="checkbox" name="active" defaultChecked={experience.active ?? true} /> Active dans la version de travail</label>
        <FormField label="Notes privées / provenance" name="privateNotes" value={experience.privateNotes ?? ""} textarea full placeholder="Jamais affichées sur le site public." />
      </div>

      <section className="admin-editor-section" aria-labelledby="stages-title">
        <div className="admin-section-heading"><div><p className="admin-kicker">Progression</p><h2 id="stages-title">Fonctions dans l’expérience</h2><p>Les dates sont facultatives. L’ordre ci-dessous devient l’ordre de lecture.</p></div><button className="admin-button" type="button" onClick={() => setStages((items) => [...items, { id: newId(), title: "", startDateLabel: "", endDateLabel: "", description: "", active: true, privateNotes: "", skillIds: [] }])}>Ajouter une fonction</button></div>
        <div className="admin-editor-stack">
          {stages.map((stage, index) => (
            <article className="admin-nested-card" key={stage.id}>
              <div className="admin-nested-toolbar"><strong>Fonction {index + 1}</strong><OrderButtons index={index} count={stages.length} onMove={(direction) => setStages((items) => move(items, index, direction))} onRemove={() => setStages((items) => items.filter((_, itemIndex) => itemIndex !== index))} /></div>
              <div className="admin-form-grid">
                <ControlledField label="Intitulé" value={stage.title} onChange={(title) => updateStage(index, { title })} required />
                <ControlledField label="Début (facultatif)" value={stage.startDateLabel} onChange={(startDateLabel) => updateStage(index, { startDateLabel })} placeholder="Année ou date libre" />
                <ControlledField label="Fin (facultatif)" value={stage.endDateLabel} onChange={(endDateLabel) => updateStage(index, { endDateLabel })} placeholder="Année, aujourd’hui…" />
                <ControlledField label="Description courte" value={stage.description} onChange={(description) => updateStage(index, { description })} textarea full />
                <ControlledField label="Notes privées" value={stage.privateNotes} onChange={(privateNotes) => updateStage(index, { privateNotes })} textarea full />
                <label className="admin-check"><input type="checkbox" checked={stage.active} onChange={(event) => updateStage(index, { active: event.target.checked })} /> Active</label>
              </div>
              <CapabilityPicker title="Capacités mobilisées dans cette fonction" skills={skills} selected={stage.skillIds} onChange={(skillIds) => updateStage(index, { skillIds })} />
            </article>
          ))}
        </div>
      </section>

      <section className="admin-editor-section" aria-labelledby="blocks-title">
        <div className="admin-section-heading"><div><p className="admin-kicker">Lecture détaillée</p><h2 id="blocks-title">Blocs de contenu</h2><p>Ajoutez autant de blocs que nécessaire, puis ordonnez-les sans gérer d’indices.</p></div><button className="admin-button" type="button" onClick={() => setBlocks((items) => [...items, { id: newId(), type: "MISSIONS", title: "Missions", body: "", active: true, privateNotes: "", skillIds: [], items: [] }])}>Ajouter un bloc</button></div>
        <div className="admin-editor-stack">
          {blocks.map((block, blockIndex) => (
            <article className="admin-nested-card" key={block.id}>
              <div className="admin-nested-toolbar"><strong>{block.title || `Bloc ${blockIndex + 1}`}</strong><OrderButtons index={blockIndex} count={blocks.length} onMove={(direction) => setBlocks((items) => move(items, blockIndex, direction))} onRemove={() => setBlocks((items) => items.filter((_, index) => index !== blockIndex))} /></div>
              <div className="admin-form-grid">
                <div className="admin-field"><label>Type</label><select value={block.type} onChange={(event) => updateBlock(blockIndex, { type: event.target.value as ContentBlockType })}>{blockTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <ControlledField label="Titre affiché" value={block.title} onChange={(title) => updateBlock(blockIndex, { title })} required />
                <ControlledField label="Texte d’introduction (facultatif)" value={block.body} onChange={(body) => updateBlock(blockIndex, { body })} textarea full />
                <ControlledField label="Notes privées" value={block.privateNotes} onChange={(privateNotes) => updateBlock(blockIndex, { privateNotes })} textarea full />
                <label className="admin-check"><input type="checkbox" checked={block.active} onChange={(event) => updateBlock(blockIndex, { active: event.target.checked })} /> Bloc actif</label>
              </div>
              <CapabilityPicker title="Capacités liées au bloc" skills={skills} selected={block.skillIds} onChange={(skillIds) => updateBlock(blockIndex, { skillIds })} />
              <div className="admin-items-heading"><strong>Éléments du bloc</strong><button className="admin-button admin-button-quiet" type="button" onClick={() => updateBlock(blockIndex, { items: [...block.items, { id: newId(), content: "", active: true, privateNotes: "", skillIds: [] }] })}>Ajouter un élément</button></div>
              <div className="admin-item-list">
                {block.items.map((item, itemIndex) => (
                  <div className="admin-item-editor" key={item.id}>
                    <div className="admin-nested-toolbar"><span>Élément {itemIndex + 1}</span><OrderButtons compact index={itemIndex} count={block.items.length} onMove={(direction) => updateBlock(blockIndex, { items: move(block.items, itemIndex, direction) })} onRemove={() => updateBlock(blockIndex, { items: block.items.filter((_, index) => index !== itemIndex) })} /></div>
                    <ControlledField label="Contenu" value={item.content} onChange={(content) => updateBlock(blockIndex, { items: block.items.map((current, index) => index === itemIndex ? { ...current, content } : current) })} textarea />
                    <details className="admin-item-details"><summary>Relations et note privée</summary><CapabilityPicker title="Capacités liées précisément à cet élément" skills={skills} selected={item.skillIds} onChange={(skillIds) => updateBlock(blockIndex, { items: block.items.map((current, index) => index === itemIndex ? { ...current, skillIds } : current) })} /><ControlledField label="Note privée" value={item.privateNotes} onChange={(privateNotes) => updateBlock(blockIndex, { items: block.items.map((current, index) => index === itemIndex ? { ...current, privateNotes } : current) })} textarea /><label className="admin-check"><input type="checkbox" checked={item.active} onChange={(event) => updateBlock(blockIndex, { items: block.items.map((current, index) => index === itemIndex ? { ...current, active: event.target.checked } : current) })} /> Élément actif</label></details>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-editor-section">
        <CapabilityPicker title="Capacités liées à l’expérience entière" skills={skills} selected={experience.skills?.map(({ skillId }) => skillId) ?? []} inputName="skillIds" />
      </section>
      <div className="admin-actions"><button className="admin-button admin-button-primary" type="submit">Enregistrer l’expérience</button></div>
    </form>
  );
}

function CapabilityPicker({ title, skills, selected: initialSelected, onChange, inputName }: { title: string; skills: Capability[]; selected: string[]; onChange?: (ids: string[]) => void; inputName?: string }) {
  const [query, setQuery] = useState("");
  const [localSelected, setLocalSelected] = useState(initialSelected);
  const selected = onChange ? initialSelected : localSelected;
  const setSelected = (ids: string[]) => onChange ? onChange(ids) : setLocalSelected(ids);
  const visible = skills.filter((skill) => `${skill.label} ${skill.family}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-capability-picker"><div className="admin-picker-heading"><strong>{title}</strong><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher…" aria-label={`Rechercher dans ${title}`} /></div>{(["DOMAIN", "TECHNOLOGY"] as CapabilityKind[]).map((kind) => { const group = visible.filter((skill) => skill.kind === kind); return group.length ? <fieldset key={kind}><legend>{kind === "DOMAIN" ? "Domaines / compétences" : "Technologies / outils / environnements"}</legend><div className="admin-checks">{group.map((skill) => <label className="admin-check" key={skill.id}><input type="checkbox" name={inputName} value={skill.id} checked={selected.includes(skill.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, skill.id] : selected.filter((id) => id !== skill.id))} />{skill.label}<small>{skill.family}</small></label>)}</div></fieldset> : null; })}</div>;
}

function OrderButtons({ index, count, onMove, onRemove, compact = false }: { index: number; count: number; onMove: (direction: -1 | 1) => void; onRemove: () => void; compact?: boolean }) {
  return <div className="admin-order-buttons"><button type="button" className="admin-icon-button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Monter">↑</button><button type="button" className="admin-icon-button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Descendre">↓</button><button type="button" className={`admin-button admin-button-danger ${compact ? "admin-button-compact" : ""}`} onClick={onRemove}>Supprimer</button></div>;
}

function FormField({ label, name, value = "", type = "text", textarea = false, full = false, required = false, placeholder }: { label: string; name: string; value?: string | number; type?: string; textarea?: boolean; full?: boolean; required?: boolean; placeholder?: string }) {
  return <div className={`admin-field ${full ? "admin-field-full" : ""}`}><label htmlFor={name}>{label}</label>{textarea ? <textarea id={name} name={name} defaultValue={value} required={required} placeholder={placeholder} /> : <input id={name} name={name} type={type} defaultValue={value} required={required} placeholder={placeholder} />}</div>;
}

function ControlledField({ label, value, onChange, textarea = false, full = false, required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; full?: boolean; required?: boolean; placeholder?: string }) {
  const control = textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} /> : <input value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />;
  return <label className={`admin-field ${full ? "admin-field-full" : ""}`}><span>{label}</span>{control}</label>;
}
