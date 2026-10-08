import { AdminHeader } from "@/components/admin-header";
import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { deletePdfAction, selectPdfAction, uploadPdfAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPdfPage() {
  await requireAdmin();
  const [resumes, settings] = await Promise.all([
    prisma.pdfResume.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.systemSettings.findUnique({ where: { id: "main" }, select: { activePdfResumeId: true } }),
  ]);
  return <>
    <AdminHeader kicker="Documents" title="CV à télécharger" description="Envoyez plusieurs PDF et choisissez celui proposé aux visiteurs. Le changement est immédiat." />
    <section className="admin-panel">
      <h2>Ajouter un CV</h2>
      <form action={uploadPdfAction} className="admin-form" encType="multipart/form-data">
        <label className="admin-field"><span>Fichier PDF · 10 Mo maximum</span><input name="pdf" type="file" accept="application/pdf,.pdf" required /></label>
        <button className="admin-button admin-button-primary" type="submit">Envoyer le PDF</button>
      </form>
    </section>
    <section className="admin-panel">
      <h2>CV disponible au téléchargement</h2>
      {resumes.length === 0 && <p className="admin-notice">Aucun PDF disponible. Le lien de téléchargement est masqué sur le site public.</p>}
      {resumes.map((resume) => <div className="admin-pdf-row" key={resume.id}>
        <div><strong>{resume.originalName}</strong><p>{(resume.byteSize / 1024 / 1024).toFixed(2)} Mo · envoyé le {resume.createdAt.toLocaleString("fr-FR")}{settings?.activePdfResumeId === resume.id ? " · actif" : ""}</p></div>
        <div className="admin-actions">
          <form action={selectPdfAction}><input type="hidden" name="id" value={resume.id} /><button className="admin-button" type="submit" disabled={settings?.activePdfResumeId === resume.id}>Utiliser</button></form>
          <form action={deletePdfAction}><input type="hidden" name="id" value={resume.id} /><button className="admin-button admin-button-danger" type="submit">Supprimer</button></form>
        </div>
      </div>)}
    </section>
  </>;
}
