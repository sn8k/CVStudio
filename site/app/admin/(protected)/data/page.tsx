import { AdminHeader } from "@/components/admin-header";
import { importDataAction } from "../actions";

export default function AdminDataPage() {
  return (
    <>
      <AdminHeader kicker="Portabilité" title="Sauvegarde des données" description="Exportez une copie lisible du contenu ou restaurez une sauvegarde dans la version de travail." />
      <section className="admin-panel">
        <h2>Exporter</h2>
        <p className="admin-notice">Le format versionné V6 contient tout le contenu de travail, les profils publics, les centres d’intérêt enrichis et leurs médias, les modes d’affichage des projets, les permis, les liens, les ordres, les notes privées et les relations fines. Les secrets, comptes et sessions ne sont jamais inclus.</p>
        <div className="admin-actions" style={{ marginTop: 18 }}><a className="admin-button admin-button-primary" href="/api/admin/export">Télécharger la sauvegarde JSON</a></div>
      </section>
      <section className="admin-panel">
        <h2>Importer</h2>
        <form className="admin-form" action={importDataAction}>
          <p className="admin-notice">L’import remplace la version de travail actuelle après validation complète du fichier. L’instantané public reste inchangé jusqu’à une nouvelle publication.</p>
          <div className="admin-field"><label htmlFor="backup">Fichier JSON</label><input id="backup" name="backup" type="file" accept="application/json,.json" required /></div>
          <div className="admin-field"><label htmlFor="confirmation">Confirmation</label><input id="confirmation" name="confirmation" placeholder="Saisir IMPORTER" required /><p className="admin-help">Cette confirmation évite un remplacement accidentel.</p></div>
          <div className="admin-actions"><button className="admin-button admin-button-danger" type="submit">Importer dans la version de travail</button></div>
        </form>
      </section>
    </>
  );
}
