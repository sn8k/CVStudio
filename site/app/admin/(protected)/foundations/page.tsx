import { AdminHeader } from "@/components/admin-header";
import { prisma } from "@/lib/prisma";
import { INTEREST_IMAGE_KIND } from "@/lib/interest-image";
import {
  moveDrivingLicenseAction,
  moveEducationAction,
  moveInterestAction,
  moveLanguageAction,
  saveDrivingLicenseAction,
  saveEducationAction,
  saveInterestAction,
  saveLanguageAction,
} from "../actions";

export default async function AdminFoundationsPage() {
  const [education, languages, interests, drivingLicenses] = await Promise.all([
    prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.language.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.interest.findMany({ orderBy: { sortOrder: "asc" }, include: { media: { where: { kind: INTEREST_IMAGE_KIND }, orderBy: { sortOrder: "asc" }, take: 1 } } }),
    prisma.drivingLicense.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return (
    <>
      <AdminHeader kicker="Compléments" title="Formation, langues, permis & intérêts" description="Ces éléments complètent le parcours sans concurrencer les expériences." />
      <p className="admin-notice">Un élément « Prêt à publier » ne rejoint le site public qu’au moment de la prochaine publication globale du CV.</p>
      <section className="admin-panel"><h2>Formation</h2>{education.map((item, index) => <EducationForm key={item.id} item={item} index={index} count={education.length} />)}<EducationForm /></section>
      <section className="admin-panel"><h2>Langues</h2>{languages.map((item, index) => <LanguageForm key={item.id} item={item} index={index} count={languages.length} />)}<LanguageForm /></section>
      <section className="admin-panel"><h2>Permis</h2><p className="admin-help">Catégories libres, statut d’obtention et note publique facultative.</p>{drivingLicenses.map((item, index) => <DrivingLicenseForm key={item.id} item={item} index={index} count={drivingLicenses.length} />)}<DrivingLicenseForm /></section>
      <section className="admin-panel"><h2>Centres d’intérêt</h2><p className="admin-help">Une description courte et une image sont facultatives. Le visuel utilise la médiathèque existante et exige un texte alternatif.</p>{interests.map((item, index) => <InterestForm key={item.id} item={item} index={index} count={interests.length} />)}<InterestForm /></section>
    </>
  );
}

type Common = { id: string; sortOrder: number; active: boolean; status: "DRAFT" | "PUBLISHED"; privateNotes: string | null };

function StateFields({ item, index = 0, count = 0, moveAction }: { item?: Common; index?: number; count?: number; moveAction: (direction: "up" | "down", formData: FormData) => Promise<void> }) {
  const moveUp = moveAction.bind(null, "up");
  const moveDown = moveAction.bind(null, "down");
  return <div className="admin-actions">{item && <><button className="admin-icon-button" type="submit" formAction={moveUp} disabled={index === 0} aria-label="Monter">↑</button><button className="admin-icon-button" type="submit" formAction={moveDown} disabled={index === count - 1} aria-label="Descendre">↓</button></>}<select name="status" defaultValue={item?.status ?? "DRAFT"} aria-label="État"><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select><label className="admin-check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Actif</label><button className="admin-button admin-button-primary" type="submit">{item ? "Enregistrer" : "Ajouter"}</button></div>;
}

function EducationForm({ item, index, count }: { item?: Common & { period: string; school: string; degree: string }; index?: number; count?: number }) {
  return <form className="admin-inline-form" action={saveEducationAction}><input type="hidden" name="id" value={item?.id ?? ""} /><input name="degree" aria-label="Diplôme" placeholder="Diplôme" defaultValue={item?.degree} required /><input name="school" aria-label="Établissement" placeholder="Établissement" defaultValue={item?.school} required /><input name="period" aria-label="Période" placeholder="Période" defaultValue={item?.period} required /><input name="privateNotes" aria-label="Notes privées" placeholder="Notes privées (facultatif)" defaultValue={item?.privateNotes ?? ""} /><StateFields item={item} index={index} count={count} moveAction={moveEducationAction} /></form>;
}

function LanguageForm({ item, index, count }: { item?: Common & { name: string; level: string }; index?: number; count?: number }) {
  return <form className="admin-inline-form" action={saveLanguageAction}><input type="hidden" name="id" value={item?.id ?? ""} /><input name="name" aria-label="Langue" placeholder="Langue" defaultValue={item?.name} required /><input name="level" aria-label="Niveau" placeholder="Niveau" defaultValue={item?.level} required /><input name="privateNotes" aria-label="Notes privées" placeholder="Notes privées (facultatif)" defaultValue={item?.privateNotes ?? ""} /><StateFields item={item} index={index} count={count} moveAction={moveLanguageAction} /></form>;
}

type InterestItem = Common & {
  label: string;
  description: string | null;
  media: { url: string; alt: string; caption: string | null }[];
};

function InterestForm({ item, index, count }: { item?: InterestItem; index?: number; count?: number }) {
  const image = item?.media[0];
  return <form className="admin-interest-form" action={saveInterestAction}>
    <input type="hidden" name="id" value={item?.id ?? ""} />
    <div className="admin-interest-fields">
      <label className="admin-field"><span>Centre d’intérêt</span><input name="label" aria-label="Centre d’intérêt" placeholder="Électronique" defaultValue={item?.label} required /></label>
      <label className="admin-field admin-field-full"><span>Description courte</span><textarea name="description" aria-label={`Description de ${item?.label ?? "ce centre d’intérêt"}`} placeholder="Quelques mots concrets, 280 caractères maximum" maxLength={280} rows={2} defaultValue={item?.description ?? ""} /></label>
      <label className="admin-field admin-field-full"><span>Image</span><input name="imageUrl" aria-label={`Image de ${item?.label ?? "ce centre d’intérêt"}`} placeholder="/interests/photo.webp ou https://…" defaultValue={image?.url ?? ""} /></label>
      <label className="admin-field"><span>Texte alternatif</span><input name="imageAlt" aria-label={`Texte alternatif de ${item?.label ?? "ce centre d’intérêt"}`} defaultValue={image?.alt ?? ""} /></label>
      <label className="admin-field"><span>Légende</span><input name="imageCaption" aria-label={`Légende de ${item?.label ?? "ce centre d’intérêt"}`} defaultValue={image?.caption ?? ""} /></label>
      <label className="admin-field admin-field-full"><span>Notes privées</span><input name="privateNotes" aria-label={`Notes privées de ${item?.label ?? "ce centre d’intérêt"}`} placeholder="Non publiées" defaultValue={item?.privateNotes ?? ""} /></label>
    </div>
    <StateFields item={item} index={index} count={count} moveAction={moveInterestAction} />
  </form>;
}

type DrivingLicenseItem = {
  id: string;
  label: string;
  status: "NOT_HELD" | "PLANNED" | "IN_PROGRESS" | "OBTAINED";
  note: string | null;
  obtainedAt: Date | null;
  active: boolean;
  publicationStatus: "DRAFT" | "PUBLISHED";
  sortOrder: number;
  privateNotes: string | null;
};

function DrivingLicenseForm({ item, index = 0, count = 0 }: { item?: DrivingLicenseItem; index?: number; count?: number }) {
  const moveUp = moveDrivingLicenseAction.bind(null, "up");
  const moveDown = moveDrivingLicenseAction.bind(null, "down");
  return <form className="admin-inline-form admin-license-form" action={saveDrivingLicenseAction}>
    <input type="hidden" name="id" value={item?.id ?? ""} />
    <input name="label" aria-label="Catégorie du permis" placeholder="Catégorie (B, A2…)" defaultValue={item?.label ?? ""} required />
    <select name="licenseStatus" aria-label="Statut du permis" defaultValue={item?.status ?? "NOT_HELD"}>
      <option value="NOT_HELD">Non détenu</option><option value="PLANNED">Prévu</option><option value="IN_PROGRESS">En cours</option><option value="OBTAINED">Obtenu</option>
    </select>
    <input name="note" aria-label="Note publique du permis" placeholder="Note publique (facultatif)" defaultValue={item?.note ?? ""} />
    <input name="obtainedAt" aria-label="Date d’obtention" type="date" defaultValue={item?.obtainedAt?.toISOString().slice(0, 10) ?? ""} />
    <input name="privateNotes" aria-label="Notes privées du permis" placeholder="Notes privées (facultatif)" defaultValue={item?.privateNotes ?? ""} />
    <div className="admin-actions">
      {item && <><button className="admin-icon-button" type="submit" formAction={moveUp} disabled={index === 0} aria-label={`Monter le permis ${item.label}`}>↑</button><button className="admin-icon-button" type="submit" formAction={moveDown} disabled={index === count - 1} aria-label={`Descendre le permis ${item.label}`}>↓</button></>}
      <select name="publicationStatus" defaultValue={item?.publicationStatus ?? "DRAFT"} aria-label="État éditorial"><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
      <label className="admin-check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Actif</label>
      <button className="admin-button admin-button-primary" type="submit">{item ? "Enregistrer" : "Ajouter"}</button>
    </div>
  </form>;
}
