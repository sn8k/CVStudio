import { AdminHeader } from "@/components/admin-header";
import { AdminDialog } from "@/components/admin-dialog";
import { prisma } from "@/lib/prisma";
import { deleteLinkAction, moveLinkAction, saveLinkAction, updateProfileAction } from "../actions";

export default async function AdminProfilePage() {
  const [profile, links] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: "main" } }),
    prisma.link.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return (
    <>
      <AdminHeader kicker="Identité" title="Présentation publique" description="Gérez l’identité professionnelle, les coordonnées et les liens publics du CV." />
      <section className="admin-panel">
        <h2>Identité et coordonnées</h2>
        <form className="admin-form" action={updateProfileAction}>
          <div className="admin-form-grid">
            <Field label="Nom" name="name" value={profile.name} />
            <Field label="Titre professionnel" name="professionalTitle" value={profile.professionalTitle} />
            <Field label="Accroche" name="intro" value={profile.intro} textarea full />
            <Field label="Titre de la section profil" name="profileHeading" value={profile.profileHeading} full />
            <Field label="Présentation du profil" name="profileLead" value={profile.profileLead} textarea full />
            <Field label="Titre du bloc contact" name="contactHeading" value={profile.contactHeading} full />
            <Field label="Texte du bloc contact" name="contactIntro" value={profile.contactIntro} textarea full />
            <Field label="E-mail public" name="email" value={profile.email} type="email" />
            <Field label="Localisation publique" name="location" value={profile.location} />
            <Field label="Téléphone affiché" name="phoneDisplay" value={profile.phoneDisplay} />
            <Field label="Téléphone pour le lien" name="phoneHref" value={profile.phoneHref} />
            <Field label="Notes privées / provenance" name="privateNotes" value={profile.privateNotes ?? ""} textarea full required={false} />
          </div>
          <div className="admin-actions"><button className="admin-button admin-button-primary" type="submit">Enregistrer la version de travail</button></div>
        </form>
      </section>
      <section className="admin-panel"><h2>Liens publics</h2><p className="admin-help">Ajoutez ici GitHub ou un autre profil public vérifié. Le PDF se gère dans « CV PDF ».</p>
        <datalist id="public-link-kinds"><option value="linkedin" /><option value="github" /><option value="hellowork" /><option value="x" /><option value="facebook" /><option value="instagram" /><option value="website" /></datalist>
        <div className="admin-list-actions"><AdminDialog title="Ajouter un lien public" triggerLabel="+ Ajouter un lien"><LinkForm /></AdminDialog></div>
        <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Libellé</th><th>Type</th><th>Placement</th><th>État</th><th>Ordre</th><th>Actions</th></tr></thead><tbody>{links.map((link, index) => {
          const moveUp = moveLinkAction.bind(null, "up");
          const moveDown = moveLinkAction.bind(null, "down");
          return <tr key={link.id}><th scope="row"><strong>{link.label}</strong><small>{link.url}</small></th><td>{link.kind}</td><td>{placementLabel(link.placement)}</td><td><LinkStatusBadges item={link} /></td><td><span className="admin-order-value">{String(link.sortOrder).padStart(2, "0")}</span><form className="admin-row-order"><input type="hidden" name="id" value={link.id} /><button className="admin-icon-button" formAction={moveUp} disabled={index === 0} aria-label={`Monter ${link.label}`}>↑</button><button className="admin-icon-button" formAction={moveDown} disabled={index === links.length - 1} aria-label={`Descendre ${link.label}`}>↓</button></form></td><td><div className="admin-row-actions"><AdminDialog title={`Modifier ${link.label}`} triggerLabel="Éditer"><LinkForm link={link} /></AdminDialog><form action={deleteLinkAction}><input type="hidden" name="id" value={link.id} /><button className="admin-button admin-button-danger" type="submit">Supprimer</button></form></div></td></tr>;
        })}</tbody></table></div>
      </section>
    </>
  );
}

function Field({ label, name, value, textarea = false, full = false, type = "text", required = true }: { label: string; name: string; value: string; textarea?: boolean; full?: boolean; type?: string; required?: boolean }) {
  return <div className={`admin-field ${full ? "admin-field-full" : ""}`}><label htmlFor={name}>{label}</label>{textarea ? <textarea id={name} name={name} defaultValue={value} required={required} /> : <input id={name} name={name} type={type} defaultValue={value} required={required} />}</div>;
}

type LinkState = { id: string; label: string; url: string; kind: string; placement: "HOME" | "CONTACT" | "BOTH"; active: boolean; status: "DRAFT" | "PUBLISHED"; privateNotes: string | null };

function LinkForm({ link }: { link?: LinkState }) {
  return <form className="admin-editorial-form admin-dialog-form" action={saveLinkAction}>
    <input type="hidden" name="id" value={link?.id ?? ""} />
    <div className="admin-form-grid">
      <label className="admin-field"><span>Libellé</span><input name="label" defaultValue={link?.label ?? ""} required /></label>
      <label className="admin-field"><span>Type / plateforme</span><input name="kind" list="public-link-kinds" placeholder="github" defaultValue={link?.kind ?? ""} required /></label>
      <label className="admin-field admin-field-wide"><span>URL</span><input name="url" type="url" defaultValue={link?.url ?? ""} required /></label>
      <label className="admin-field"><span>Placement</span><select name="placement" defaultValue={link?.placement ?? "CONTACT"}><option value="HOME">Accueil</option><option value="CONTACT">Contact</option><option value="BOTH">Accueil + Contact</option></select></label>
      <label className="admin-field admin-field-wide"><span>Notes privées</span><textarea name="privateNotes" defaultValue={link?.privateNotes ?? ""} /></label>
    </div>
    <div className="admin-actions">
      <select name="status" defaultValue={link?.status ?? "DRAFT"} aria-label="État"><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Prêt à publier</option></select>
      <label className="admin-check"><input name="active" type="checkbox" defaultChecked={link?.active ?? true} /> Actif</label>
      <button className="admin-button admin-button-primary" type="submit">{link ? "Enregistrer" : "Ajouter"}</button>
    </div>
  </form>;
}

function LinkStatusBadges({ item }: { item: Pick<LinkState, "active" | "status"> }) {
  return <div className="admin-badge-list"><span className={`admin-badge ${item.status === "PUBLISHED" ? "is-ready" : "is-draft"}`}>{item.status === "PUBLISHED" ? "Prêt à publier" : "Brouillon"}</span><span className={`admin-badge ${item.active ? "is-active" : "is-inactive"}`}>{item.active ? "Actif" : "Inactif"}</span></div>;
}

function placementLabel(placement: "HOME" | "CONTACT" | "BOTH") {
  if (placement === "HOME") return "Accueil";
  if (placement === "BOTH") return "Accueil + Contact";
  return "Contact";
}
