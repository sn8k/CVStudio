"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResumeData, ResumeSkill } from "@/lib/resume-types";
import { ProjectRibbon } from "@/components/project-ribbon";
import { ContactForm } from "@/components/contact-form";
import { InterestCarousel } from "@/components/interest-carousel";
import type { ContactStatus } from "@/lib/contact-types";
import { DEFAULT_VISUAL_THEME, visualThemeStyle, type VisualThemeDefinition } from "@/lib/visual-theme";

type PublicCvProps = { data: ResumeData; visualTheme?: VisualThemeDefinition; preview?: boolean; previewThemeName?: string; pdfUrl?: string | null; lastPublishedAt?: string | null; contactFormEnabled?: boolean; contactTurnstileSiteKey?: string | null; contactStatus?: ContactStatus | null };

const approachSlugs = new Set(["approach-diagnostiquer", "approach-resoudre", "approach-transmettre"]);
const compactSocialKinds = new Set(["linkedin", "github", "facebook", "x", "twitter", "instagram", "hellowork"]);

export function PublicCv({ data, visualTheme = DEFAULT_VISUAL_THEME, preview = false, previewThemeName, pdfUrl = null, lastPublishedAt = null, contactFormEnabled = false, contactTurnstileSiteKey = null, contactStatus = null }: PublicCvProps) {
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedSkill = data.skills.find((skill) => skill.slug === activeSkill) ?? null;
  const employment = data.extraSections.find((section) => section.slug === "employment-search");
  const approach = data.extraSections.filter((section) => approachSlugs.has(section.slug));
  const projectsIntro = data.extraSections.find((section) => section.slug === "projects-since-2025");
  const homeLinks = data.links.filter((link) => link.placement === "HOME" || link.placement === "BOTH");
  const contactLinks = data.links.filter((link) => link.placement === "CONTACT" || link.placement === "BOTH");
  const contactSocialLinks = contactLinks.filter((link) => isCompactSocialKind(link.kind));
  const contactTextLinks = contactLinks.filter((link) => !isCompactSocialKind(link.kind));
  const relatedExperiences = selectedSkill
    ? data.experiences.filter((experience) => experienceHasSkill(experience, selectedSkill.slug))
    : [];
  const relatedProjects = selectedSkill
    ? data.projects.filter((project) => project.skills.some((skill) => skill.slug === selectedSkill.slug))
    : [];
  const years = data.experiences.flatMap((experience) => [experience.startYear, experience.endYear ?? experience.startYear]);
  const firstYear = years.length ? Math.min(...years) : null;
  const lastYear = years.length ? Math.max(...years) : null;
  const skillGroups = (["DOMAIN", "TECHNOLOGY"] as const)
    .map((kind) => ({ kind, skills: data.skills.filter((skill) => skill.kind === kind) }))
    .filter((group) => group.skills.length > 0);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 16);
      setProgress(scrollable > 0 ? window.scrollY / scrollable : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
      return () => window.removeEventListener("scroll", onScroll);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -24px" });
    document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [data]);

  const toggleSkill = (skill: ResumeSkill) => {
    setActiveSkill((current) => (current === skill.slug ? null : skill.slug));
  };

  return (
    <div className="public-theme" data-visual-theme={visualTheme.slug} data-color-scheme={visualTheme.colorScheme.toLowerCase()} style={visualThemeStyle(visualTheme) as React.CSSProperties}>
      <noscript><style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style></noscript>
      {preview && <div className="preview-banner" role="status">Aperçu de la version de travail{previewThemeName && <span> · thème testé : {previewThemeName}</span>}<a href="/admin">Retour à l’administration</a></div>}
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <a className="brand" href="#accueil" aria-label="Retour en haut de page">
          <span className="brand-mark" aria-hidden="true">CV</span>
          <span className="brand-name">{data.profile.name}</span>
        </a>
        <nav className="main-nav" aria-label="Navigation principale">
          <a href="#parcours">Parcours</a>
          {data.projects.length > 0 && <a href="#projets">Projets</a>}
          <a href="#competences">Compétences</a>
          <a href="#apropos">À propos</a>
          <a className="nav-contact" href="#contact">Contact</a>
        </nav>
      </header>

      <main id="contenu">
        <section className="hero" id="accueil" aria-labelledby="hero-title">
          <div className="hero-ambient" aria-hidden="true"><span className="ambient-line ambient-line-a" /><span className="ambient-line ambient-line-b" /><span className="ambient-node ambient-node-a" /><span className="ambient-node ambient-node-b" /></div>
          <div className="hero-copy reveal">
            <p className="eyebrow"><span /> Parcours · compétences · projets</p>
            <h1 id="hero-title"><span>{data.profile.name.split(" ")[0]}</span><span className="hero-surname">{data.profile.name.split(" ").slice(1).join(" ")}</span></h1>
            <p className="hero-role">{data.profile.professionalTitle}</p>
            <div className="hero-intro">{paragraphs(data.profile.intro)}</div>
            {employment && <p className="hero-search">{employment.content}</p>}
            <div className="hero-actions">
              <a className="button button-primary" href="#parcours">Voir mon parcours<Arrow /></a>
              <a className="button button-quiet" href="#competences">Explorer mes compétences</a>
              {data.projects.length > 0 && <a className="button button-quiet" href="#projets">Voir mes projets</a>}
            </div>
            {homeLinks.length > 0 && <nav className="hero-social-links" aria-label="Profils publics">
              {homeLinks.map((link) => <a href={link.url} target="_blank" rel="noopener noreferrer" key={link.id} aria-label={`${link.label} (nouvel onglet)`}><SocialIcon kind={link.kind} /><span>{link.label}</span><span aria-hidden="true">↗</span></a>)}
            </nav>}
          </div>

          {employment && <aside className="hero-map hero-target reveal" aria-label="Objectif professionnel">
            <div className="map-kicker">Objectif</div>
            <h2>{employment.title}</h2>
            <div className="target-lines">
              {employment.eyebrow?.split(" · ").map((line) => <p key={line}>{line}</p>)}
            </div>
          </aside>}

          <div className="hero-signals reveal" aria-label="Repères clés">
            {firstYear !== null && lastYear !== null && <Signal value={`${firstYear} → ${lastYear}`} label="parcours professionnel" />}
            <Signal value={String(data.experiences.length)} label="expériences documentées" />
            <Signal value={String(data.projects.length)} label="projets présentés" />
          </div>
        </section>

        {approach.length > 0 && (
          <section className="approach section-shell" id="pratique" aria-labelledby="approach-title">
            <div className="section-index" aria-hidden="true">01</div>
            <div className="section-heading reveal"><p className="eyebrow"><span /> En pratique</p><h2 id="approach-title">Ce que je fais réellement.</h2></div>
            <div className="approach-list reveal">
              {approach.map((item, index) => <article key={item.id}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.content}</p></article>)}
            </div>
          </section>
        )}

        <section className="journey section-shell" id="parcours" aria-labelledby="journey-title">
          <div className="section-index" aria-hidden="true">02</div>
          <div className="section-heading reveal"><p className="eyebrow"><span /> Parcours professionnel</p><h2 id="journey-title">L’essentiel d’abord. Les faits au clic.</h2><p>La chronologie reste la colonne vertébrale. Chaque expérience peut s’ouvrir pour montrer les missions, outils et problèmes documentés.</p></div>
          {selectedSkill && <ActiveFilter skill={selectedSkill} onClear={() => setActiveSkill(null)} />}
          <div className="timeline">
            {data.experiences.map((experience) => {
              const matches = selectedSkill && experienceHasSkill(experience, selectedSkill.slug);
              const dimmed = selectedSkill && (relatedExperiences.length > 0 || relatedProjects.length > 0) && !matches;
              const className = ["experience", matches ? "is-match" : "", dimmed ? "is-dimmed" : ""].filter(Boolean).join(" ");
              return (
                <article id={`experience-${experience.slug}`} key={experience.id} className={className} style={{ "--experience-accent": experience.accent } as React.CSSProperties}>
                  <div className="experience-period">{experience.period}</div><span className="experience-marker" aria-hidden="true" />
                  <div className="experience-card"><details><summary>
                    <div className="experience-topline"><h3 className="experience-company">{experience.company}</h3><span className="experience-place">{experience.place}</span></div>
                    <p className="experience-role">{experience.stages.map((stage) => stage.title).join(" → ") || experience.role}</p>
                    <p className="experience-summary">{experience.summary}</p>
                    {preview && experience.status === "DRAFT" && <span className="experience-status">Brouillon</span>}
                    <span className="experience-toggle" aria-hidden="true" />
                  </summary>
                    <div className="experience-detail">
                      {experience.stages.length > 1 && <section className="experience-chapter experience-progression"><h4>Évolution des fonctions</h4><ol>{experience.stages.map((stage) => <li key={stage.id}><strong>{stage.title}</strong>{(stage.startDateLabel || stage.endDateLabel) && <span>{[stage.startDateLabel, stage.endDateLabel].filter(Boolean).join(" — ")}</span>}{stage.description && <p>{stage.description}</p>}</li>)}</ol></section>}
                      {experience.blocks.map((block) => <section className={`experience-chapter experience-chapter-${block.type.toLowerCase()}`} key={block.id}><h4>{block.title}</h4>{block.body && <p className="chapter-lead">{block.body}</p>}{block.items.length > 0 && <ul>{block.items.map((item) => <li key={item.id}>{item.content}</li>)}</ul>}</section>)}
                    </div>
                    <div className="experience-tags" aria-label="Domaines associés">{experience.skills.map((skill) => <span className="experience-tag" key={skill.id}>{skill.label}</span>)}</div>
                  </details></div>
                </article>
              );
            })}
          </div>
        </section>

        {data.projects.length > 0 && (
          <section className="projects section-shell" id="projets" aria-labelledby="projects-title">
            <div className="section-index" aria-hidden="true">03</div>
            <div className="section-heading reveal"><p className="eyebrow"><span /> {projectsIntro?.eyebrow ?? "Projets & expérimentations"}</p><h2 id="projects-title">{projectsIntro?.title ?? "Projets"}</h2>{projectsIntro?.content && <p>{projectsIntro.content}</p>}</div>
            <ProjectRibbon key={data.generatedAt} projects={data.projects} selectedSkillSlug={selectedSkill?.slug ?? null} hasEvidence={relatedExperiences.length > 0 || relatedProjects.length > 0} />
          </section>
        )}

        <section className="skills section-shell" id="competences" aria-labelledby="skills-title">
          <div className="section-index" aria-hidden="true">04</div>
          <div className="section-heading reveal"><p className="eyebrow"><span /> Compétences reliées aux preuves</p><h2 id="skills-title">Pas de jauges. Des preuves.</h2><p>Sélectionnez un domaine pour retrouver les expériences et projets qui le documentent réellement.</p></div>
          <div className="skill-explorer reveal">
            <div className="skill-list" aria-label="Liste des compétences et outils">
              {skillGroups.map(({ kind, skills }) => <div className="skill-group" key={kind}><p>{kind === "DOMAIN" ? "Domaines / compétences" : "Outils / environnements"}</p>{skills.map((skill) => <button key={skill.id} type="button" className="skill-button" aria-pressed={activeSkill === skill.slug} onClick={() => toggleSkill(skill)}>{skill.label}<span className="skill-count" aria-hidden="true">{skill.count}</span></button>)}</div>)}
            </div>
            <aside className="skill-context" aria-live="polite">
              <div className="context-orbit" aria-hidden="true"><span /><span /><span /></div>
              {selectedSkill ? <>
                <p className="context-kicker">{selectedSkill.family}</p><h3>{selectedSkill.label}</h3><p>{selectedSkill.description}</p>
                <div className="context-related">
                  {relatedExperiences.map((experience) => <a href={`#experience-${experience.slug}`} key={experience.id}>{experience.company}</a>)}
                  {relatedProjects.map((project) => <a href={`#project-${project.slug}`} key={project.id}>{project.title}</a>)}
                  {!relatedExperiences.length && !relatedProjects.length && <span>Connaissance déclarée</span>}
                </div>
                {selectedSkill.usages.some((usage) => usage.stageTitle || usage.blockTitle || usage.itemContent) && <ul className="context-usages">{selectedSkill.usages.filter((usage) => usage.stageTitle || usage.blockTitle || usage.itemContent).map((usage, index) => <li key={`${usage.experienceId ?? usage.projectId}-${index}`}><strong>{usage.company ?? usage.projectTitle}</strong><span>{[usage.stageTitle, usage.blockTitle, usage.itemContent].filter(Boolean).join(" → ")}</span></li>)}</ul>}
                {(relatedExperiences.length > 0 || relatedProjects.length > 0) && <a className="context-jump" href={relatedExperiences.length ? "#parcours" : "#projets"}>Voir les preuves <span aria-hidden="true">↗</span></a>}
              </> : <><p className="context-kicker">Mode d’exploration</p><h3>Choisissez un domaine</h3><p>Les liens mènent aux expériences et projets qui servent de preuve, sans classement arbitraire.</p></>}
            </aside>
          </div>
        </section>

        <section className="foundations section-shell" id="apropos" aria-labelledby="foundations-title">
          <div className="section-index" aria-hidden="true">05</div>
          <div className="section-heading reveal"><p className="eyebrow"><span /> Fondations / à propos</p><h2 id="foundations-title">{data.profile.profileHeading}</h2></div>
          <div className="about-layout"><div className="about-copy reveal">{paragraphs(data.profile.profileLead)}</div>
            <div className="foundation-grid">
              <article className="foundation-block reveal"><p className="block-label">Formation</p>{data.education.map((item) => <div key={item.id}><h3>{item.degree}</h3><p>{item.school} · {item.period}</p></div>)}</article>
              <article className="foundation-block reveal"><p className="block-label">Langues</p>{data.languages.map((item) => <div className="language-row" key={item.id}><strong>{item.name}</strong><span>{item.level}</span></div>)}</article>
            </div>
          </div>
          <div className="interest-section reveal"><p className="block-label">Centres d’intérêt</p><InterestCarousel interests={data.interests} /></div>
        </section>

        <section className="contact section-shell" id="contact" aria-labelledby="contact-title">
          <div className="contact-inner reveal"><p className="eyebrow"><span /> Contact</p><h2 id="contact-title">{data.profile.contactHeading}</h2><p>{data.profile.contactIntro}</p>
            <div className="contact-actions">
              <a className="contact-link" href={`mailto:${data.profile.email}`}><span>Courriel</span><strong>{data.profile.email}</strong></a>
              {data.profile.phoneHref && <a className="contact-link" href={`tel:${data.profile.phoneHref}`}><span>Téléphone</span><strong>{data.profile.phoneDisplay}</strong></a>}
              <div className="contact-link contact-location"><span>Localisation</span><strong>{data.profile.location}</strong></div>
              {data.drivingLicenses.length > 0 && <div className="contact-link contact-licenses"><span>Mobilité</span><strong>{formatDrivingLicenses(data.drivingLicenses)}</strong></div>}
              {pdfUrl && <a className="contact-link" href={pdfUrl} download><span>CV</span><strong>Télécharger le CV PDF</strong></a>}
              {contactTextLinks.map((link) => <a className="contact-link contact-public-link" href={link.url} target="_blank" rel="noopener noreferrer" key={link.id} aria-label={`${link.label} (nouvel onglet)`}><span><SocialIcon kind={link.kind} />{formatLinkKind(link.kind)}</span><strong>{link.label}</strong></a>)}
            </div>
            {contactSocialLinks.length > 0 && <nav className="contact-socials" aria-labelledby="contact-socials-title">
              <p id="contact-socials-title">Profils publics</p>
              <div>
                {contactSocialLinks.map((link) => {
                  const accessibleLabel = `${formatLinkKind(link.kind)} — ${link.label}`;
                  return <a href={link.url} target="_blank" rel="noopener noreferrer" key={link.id} aria-label={`${accessibleLabel} (nouvel onglet)`}><SocialIcon kind={link.kind} /><span className="sr-only">{accessibleLabel}</span></a>;
                })}
              </div>
            </nav>}
            {(contactFormEnabled || preview) && <ContactForm initialStatus={contactStatus} preview={preview} turnstileSiteKey={contactTurnstileSiteKey} turnstileTheme={visualTheme.colorScheme.toLowerCase() as "light" | "dark"} />}
          </div>
        </section>
      </main>
      <footer className="site-footer"><p className="footer-meta"><span className="footer-label">CVStudio</span>{lastPublishedAt && <span className="footer-updated">Dernière mise à jour : {formatPublishedDate(lastPublishedAt)}</span>}</p><p className="footer-credit">CVStudio</p><nav className="footer-links" aria-label="Liens de pied de page"><Link href="/confidentialite">Confidentialité</Link><a href="#accueil">Retour en haut <span aria-hidden="true">↑</span></a></nav></footer>
      <div className="scroll-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
    </div>
  );
}

function paragraphs(value: string) {
  return value.split(/\n\s*\n|\n/).filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>);
}

const drivingLicenseLabels = {
  NOT_HELD: "non détenu",
  PLANNED: "prévu",
  IN_PROGRESS: "en cours",
  OBTAINED: "obtenu",
} as const;

function formatDrivingLicenses(licenses: ResumeData["drivingLicenses"]) {
  return licenses.map((license, index) => `${index === 0 ? "Permis " : ""}${license.label} — ${drivingLicenseLabels[license.status]}${license.note ? ` (${license.note})` : ""}`).join(" · ");
}

function formatPublishedDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(value));
}

function experienceHasSkill(experience: ResumeData["experiences"][number], slug: string) {
  return experience.skills.some((skill) => skill.slug === slug)
    || experience.stages.some((stage) => stage.skills.some((skill) => skill.slug === slug))
    || experience.blocks.some((block) => block.skills.some((skill) => skill.slug === slug)
      || block.items.some((item) => item.skills.some((skill) => skill.slug === slug)));
}

function Signal({ value, label }: { value: string; label: string }) {
  return <div className="signal"><strong>{value}</strong><span>{label}</span></div>;
}

function ActiveFilter({ skill, onClear }: { skill: ResumeSkill; onClear: () => void }) {
  return <div className="active-filter" aria-live="polite"><span>Filtre actif</span><strong>{skill.label}</strong><button type="button" onClick={onClear}>Tout afficher</button></div>;
}

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function formatLinkKind(kind: string) {
  const normalized = kind.trim().toLowerCase();
  const labels: Record<string, string> = {
    linkedin: "LinkedIn",
    github: "GitHub",
    hellowork: "HelloWork",
    x: "X",
    twitter: "X",
    facebook: "Facebook",
    instagram: "Instagram",
    website: "Site",
  };
  return labels[normalized] ?? (kind || "Profil public");
}

function isCompactSocialKind(kind: string) {
  return compactSocialKinds.has(kind.trim().toLowerCase());
}

function SocialIcon({ kind }: { kind: string }) {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "linkedin") return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="5" r="2" /><path d="M3.5 9v11M9 20V9m0 5c1.2-3.2 7-3.5 7 1v5m0-5c0-2.2-1.2-3-3-3" /></svg>;
  if (normalized === "github") return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 19c-4 .8-4-2-5-2.5M14.5 22v-3.1c0-.9.3-1.7.8-2.2 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.3 4.4 4.4 0 0 0-.1-3.3s-1-.3-3.4 1.3a11.8 11.8 0 0 0-6 0C7.6 3.8 6.6 4.1 6.6 4.1a4.4 4.4 0 0 0-.1 3.3 4.7 4.7 0 0 0-1.3 3.3c0 4.7 2.8 5.7 5.5 6 .5.5.8 1.2.8 2.2V22" /></svg>;
  if (normalized === "instagram") return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg>;
  if (normalized === "facebook") return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2.2-2H18V1.5c-.8-.1-1.7-.2-2.6-.2C12 1.3 10 3.3 10 6.8V9H7v4h3v8" /></svg>;
  if (normalized === "x" || normalized === "twitter") return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 3l16 18M20 3L4 21" /></svg>;
  if (normalized === "hellowork") return <svg className="social-icon social-icon-text" aria-hidden="true" viewBox="0 0 24 24"><text x="12" y="15" textAnchor="middle">HW</text></svg>;
  return <svg className="social-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4.1l2.2-2.2a4.5 4.5 0 0 0-6.4-6.4L11 6.7M14 10a4.5 4.5 0 0 0-6.4-.1l-2.2 2.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></svg>;
}
