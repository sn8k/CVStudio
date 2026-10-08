import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AUDIENCE_OPTOUT_COOKIE } from "@/lib/audience-cookies";
import { getPublishedResume } from "@/lib/resume-data";

export const metadata: Metadata = {
  title: "Confidentialité — CVStudio",
  description: "Informations sur la mesure d’audience, le formulaire de contact et les cookies techniques de ce CV.",
  alternates: { canonical: "/confidentialite" },
};

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ audience?: string | string[] }> }) {
  const [cookieStore, resume, query] = await Promise.all([cookies(), getPublishedResume(), searchParams]);
  const optedOut = cookieStore.get(AUDIENCE_OPTOUT_COOKIE)?.value === "1";
  const feedback = Array.isArray(query.audience) ? query.audience[0] : query.audience;

  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <Link href="/">← Retour au CV</Link>
        <p>CV interactif · Confidentialité</p>
        <h1>Des données réduites au strict nécessaire</h1>
        <p>Ce site limite sa mesure d’audience à des totaux quotidiens et ne fait appel à aucun service publicitaire ou outil d’analytics tiers.</p>
      </header>

      <div className="privacy-sections">
        <section aria-labelledby="privacy-audience">
          <p className="privacy-kicker">Audience</p>
          <h2 id="privacy-audience">Mesure d’audience locale</h2>
          <p>Chaque affichage humain de la page d’accueil augmente un total journalier de pages vues. Un cookie first-party booléen, <code>cv_audience_day=1</code>, permet aussi de compter au plus une fois le même navigateur pendant une journée civile en Europe/Paris.</p>
          <p>Ce cookie ne contient ni identifiant, ni date, ni adresse IP, ni empreinte. Il expire au prochain changement de jour. Les navigateurs distincts sont estimés séparément chaque jour : ils ne sont pas suivis ni dédupliqués d’un jour à l’autre.</p>
          <p>Les robots connus sont exclus. Seuls des agrégats quotidiens sont conservés, pendant 25 mois au maximum, puis supprimés automatiquement. Les statistiques ne sont visibles que dans l’administration authentifiée.</p>
        </section>

        <section id="audience-control" tabIndex={-1} aria-labelledby="privacy-choice">
          <p className="privacy-kicker">Votre choix</p>
          <h2 id="privacy-choice">S’opposer à la mesure d’audience</h2>
          <p>Vous pouvez désactiver cette mesure à tout moment. Un cookie technique <code>cv_audience_optout=1</code>, valable 13 mois, mémorise alors votre opposition. Il ne contient aucun identifiant.</p>
          <p className="privacy-status" role="status">
            {feedback === "disabled" ? "La mesure d’audience est désactivée sur ce navigateur." : feedback === "enabled" ? "La mesure d’audience est réactivée sur ce navigateur." : optedOut ? "La mesure d’audience est actuellement désactivée sur ce navigateur." : "La mesure d’audience est actuellement active sur ce navigateur."}
          </p>
          <form action="/api/audience/preference" method="post">
            <input type="hidden" name="audience" value={optedOut ? "enable" : "disable"} />
            <button type="submit">{optedOut ? "Réactiver la mesure d’audience" : "Désactiver la mesure d’audience"}</button>
          </form>
        </section>

        <section aria-labelledby="privacy-contact">
          <p className="privacy-kicker">Contact</p>
          <h2 id="privacy-contact">Formulaire et courriel</h2>
          <p>Le formulaire transmet le nom, l’adresse e-mail et le message directement par e-mail. Son contenu n’est pas enregistré dans la base du site et n’est pas envoyé à Cloudflare. Lors de l’affichage et de l’utilisation du formulaire, le navigateur communique avec Cloudflare Turnstile afin de vérifier l’absence d’abus automatisé. Cette vérification est distincte de la mesure d’audience du site.</p>
        </section>

        <section aria-labelledby="privacy-admin">
          <p className="privacy-kicker">Administration</p>
          <h2 id="privacy-admin">Cookies techniques</h2>
          <p>L’espace d’administration utilise des cookies de session strictement nécessaires à l’authentification. Ils ne servent ni à la publicité ni au suivi du public.</p>
        </section>

        <section aria-labelledby="privacy-rights">
          <p className="privacy-kicker">Vos droits</p>
          <h2 id="privacy-rights">Question ou demande</h2>
          <p>Pour toute question relative à ces traitements ou à vos droits, contactez le responsable du site à <a href={`mailto:${resume.profile.email}`}>{resume.profile.email}</a>. Les mesures d’audience ne permettent pas d’isoler un parcours individuel.</p>
        </section>
      </div>

      <footer className="privacy-footer"><span>CVStudio</span><Link href="/">Retour au CV</Link></footer>
    </main>
  );
}
