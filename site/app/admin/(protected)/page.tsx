import Link from "next/link";
import { ContentStatus } from "@prisma/client";
import { AdminHeader } from "@/components/admin-header";
import { PublishResumeForm } from "@/components/publish-resume-form";
import { prisma } from "@/lib/prisma";
import { getVisitStats } from "@/lib/visit-stats";

const shortDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit" });

export default async function AdminDashboardPage() {
  const [experienceCount, skillCount, draftCount, lastSnapshot, visits] = await Promise.all([
    prisma.experience.count({ where: { active: true } }),
    prisma.skill.count({ where: { active: true } }),
    prisma.experience.count({ where: { active: true, status: ContentStatus.DRAFT } }),
    prisma.publishedSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    getVisitStats(),
  ]);
  const maxRecentAudience = Math.max(1, ...visits.recent.flatMap((day) => [day.views, day.uniqueVisitors]));

  return (
    <>
      <AdminHeader
        kicker="Vue d’ensemble"
        title="Piloter le CV"
        description="Modifiez la version de travail, vérifiez-la dans l’aperçu, puis publiez-la lorsque tout est prêt."
        actions={<><Link className="admin-button" href="/preview" target="_blank">Prévisualiser</Link><PublishResumeForm lastPublishedAt={lastSnapshot?.createdAt.toISOString() ?? null} /></>}
      />
      <div className="admin-grid">
        <Link className="admin-card" href="/admin/experiences"><span>Parcours</span><div><strong>{experienceCount}</strong><p>expériences actives</p></div></Link>
        <Link className="admin-card" href="/admin/skills"><span>Référentiel</span><div><strong>{skillCount}</strong><p>compétences, outils et environnements</p></div></Link>
        <Link className="admin-card" href="/preview" target="_blank"><span>Version de travail</span><div><strong>{draftCount}</strong><p>élément{draftCount > 1 ? "s" : ""} au statut brouillon</p></div></Link>
      </div>
      <section className="admin-panel admin-traffic-panel">
        <div className="admin-section-heading"><div><p className="admin-kicker">Audience publique</p><h2>Pages vues et navigateurs quotidiens</h2><p>Agrégats journaliers sans identifiant, adresse IP ni suivi entre les jours.</p></div></div>
        <div className="admin-traffic-metrics">
          <div><span>Pages vues · total</span><strong>{visits.total}</strong></div>
          <div><span>Pages vues · aujourd’hui</span><strong>{visits.today}</strong></div>
          <div><span>Pages vues · 7 jours</span><strong>{visits.last7Days}</strong></div>
          <div><span>Pages vues · 30 jours</span><strong>{visits.last30Days}</strong></div>
          <div><span>Navigateurs · aujourd’hui</span><strong>{visits.uniqueToday}</strong></div>
          <div><span>Navigateurs · moyenne / jour · 7 jours</span><strong>{visits.uniqueDailyAverage7Days.toLocaleString("fr-FR")}</strong></div>
          <div><span>Navigateurs · moyenne / jour · 30 jours</span><strong>{visits.uniqueDailyAverage30Days.toLocaleString("fr-FR")}</strong></div>
        </div>
        <div className="admin-traffic-legend" aria-label="Légende du graphique"><span><i className="admin-traffic-key admin-traffic-key-views" />Pages vues</span><span><i className="admin-traffic-key admin-traffic-key-unique" />Navigateurs distincts du jour</span></div>
        <figure className="admin-traffic-figure">
          <figcaption className="sr-only">Comparaison des pages vues et des navigateurs distincts quotidiens sur 14 jours. {visits.recent.map((day) => `${day.date} : ${day.views} pages vues, ${day.uniqueVisitors} navigateurs`).join(" ; ")}.</figcaption>
          <div className="admin-traffic-chart" aria-hidden="true">
            {visits.recent.map((day) => <div className="admin-traffic-day" key={day.date} title={`${day.date} : ${day.views} pages vues, ${day.uniqueVisitors} navigateurs`}><span className="admin-traffic-value">{day.views}/{day.uniqueVisitors}</span><span className="admin-traffic-bars"><i className="admin-traffic-bar admin-traffic-bar-views" style={{ height: `${Math.max(day.views ? 8 : 2, (day.views / maxRecentAudience) * 100)}%` }} /><i className="admin-traffic-bar admin-traffic-bar-unique" style={{ height: `${Math.max(day.uniqueVisitors ? 8 : 2, (day.uniqueVisitors / maxRecentAudience) * 100)}%` }} /></span><small>{shortDate.format(new Date(`${day.date}T12:00:00Z`)).replace(".", "")}</small></div>)}
          </div>
        </figure>
        <p className="admin-traffic-note">Un navigateur est compté au plus une fois par jour grâce à un cookie booléen sans identifiant. Les journées ne sont pas reliées entre elles.</p>
      </section>
      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2>État de publication</h2>
        <p className="admin-notice">
          Le site public affiche l’instantané publié {lastSnapshot ? `le ${lastSnapshot.createdAt.toLocaleString("fr-FR")}` : "— aucune publication disponible"}.
          Les éléments « Prêts à publier » seront intégrés lors de la prochaine publication globale du CV. Les brouillons restent privés.
        </p>
      </section>
    </>
  );
}
