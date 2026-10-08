"use client";

import { useContentRibbon } from "@/components/content-ribbon";
import type { ResumeData } from "@/lib/resume-types";

type Project = ResumeData["projects"][number];

type ProjectRibbonProps = {
  projects: Project[];
  selectedSkillSlug: string | null;
  hasEvidence: boolean;
};

export function ProjectRibbon({ projects, selectedSkillSlug, hasEvidence }: ProjectRibbonProps) {
  const {
    activeItem: activeProject,
    closeDialog: closeProject,
    dialogRef,
    handleDialogClose,
    isMoving,
    openItem: openProject,
    orderedItems: orderedProjects,
    reducedMotion,
    scrollItems: scrollProjects,
    setUserPaused,
    trackProps,
    userPaused,
  } = useContentRibbon({ items: projects, cardSelector: ".project-entry" });

  return <div className="content-ribbon project-ribbon" data-autoplay={isMoving ? "running" : "paused"} data-dialog-open={activeProject ? "true" : undefined}>
    {projects.length > 1 && <div className="content-ribbon-toolbar project-carousel-toolbar" aria-label="Contrôles du ruban de projets">
      <p aria-live="polite">{isMoving ? "Ruban en mouvement" : "Défilement en pause"} · glisser librement</p>
      <div>
        <button type="button" onClick={() => scrollProjects(-1)} aria-label="Projet précédent"><span aria-hidden="true">←</span> Précédent</button>
        <button type="button" onClick={() => scrollProjects(1)} aria-label="Projet suivant">Suivant <span aria-hidden="true">→</span></button>
        <button
          className="project-autoplay-toggle"
          type="button"
          aria-pressed={userPaused}
          aria-label={reducedMotion ? "Défilement automatique désactivé par les préférences de mouvement" : userPaused ? "Reprendre le défilement automatique" : "Mettre le défilement automatique en pause"}
          onClick={() => setUserPaused((current) => !current)}
          disabled={reducedMotion}
          title={reducedMotion ? "Défilement automatique désactivé par les préférences de mouvement" : undefined}
        >
          <span aria-hidden="true">{reducedMotion ? "—" : userPaused ? "▶" : "Ⅱ"}</span> {reducedMotion ? "Mouvement réduit" : userPaused ? "Reprendre" : "Pause"}
        </button>
      </div>
    </div>}
    <div
      className="content-ribbon-track project-list"
      {...trackProps}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Ruban des projets personnels"
    >
      {orderedProjects.map((project, index) => {
        const matches = selectedSkillSlug && project.skills.some((skill) => skill.slug === selectedSkillSlug);
        const dimmed = selectedSkillSlug && hasEvidence && !matches;
        return <ProjectCard
          key={project.id}
          project={project}
          index={index}
          matches={Boolean(matches)}
          dimmed={Boolean(dimmed)}
          onOpen={openProject}
        />;
      })}
    </div>
    <dialog
      className="content-dialog project-dialog"
      ref={dialogRef}
      aria-labelledby={activeProject ? `project-dialog-title-${activeProject.id}` : undefined}
      onClose={handleDialogClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeProject();
      }}
    >
      {activeProject && <div className="content-dialog-panel project-dialog-panel">
        <header className="content-dialog-header project-dialog-header">
          <div><p>Projet personnel</p><h2 id={`project-dialog-title-${activeProject.id}`}>{activeProject.title}</h2></div>
          <button className="content-dialog-close project-dialog-close" type="button" onClick={closeProject} autoFocus aria-label={`Fermer le projet ${activeProject.title}`}>Fermer <span aria-hidden="true">×</span></button>
        </header>
        <div className="project-dialog-layout">
          <ProjectVisual project={activeProject} eager />
          <div className="project-dialog-copy">
            <p className="project-dialog-summary">{activeProject.summary}</p>
            <ProjectDetail project={activeProject} />
          </div>
        </div>
      </div>}
    </dialog>
  </div>;
}

function ProjectCard({ project, index, matches, dimmed, onOpen }: {
  project: Project;
  index: number;
  matches: boolean;
  dimmed: boolean;
  onOpen: (project: Project, trigger: HTMLElement) => void;
}) {
  const visibleSkills = project.skills.slice(0, 4);
  const hiddenSkillCount = Math.max(0, project.skills.length - visibleSkills.length);
  return <article
    id={`project-${project.slug}`}
    className={["content-ribbon-card", "project-entry", matches ? "is-match" : "", dimmed ? "is-dimmed" : ""].filter(Boolean).join(" ")}
    aria-roledescription="projet"
    aria-label={project.title}
  >
    <details>
      <summary onClick={(event) => {
        event.preventDefault();
        onOpen(project, event.currentTarget);
      }}>
        <ProjectVisual project={project} eager={index < 4} />
        <div className="project-card-copy">
          <span className="project-number">Projet personnel</span>
          <p className="project-name">{project.title}</p>
          <h3>{project.summary}</h3>
          {visibleSkills.length > 0 && <div className="project-card-tags" aria-label="Compétences principales">
            {visibleSkills.map((skill) => <span key={skill.id}>{skill.label}</span>)}
            {hiddenSkillCount > 0 && <span aria-label={`${hiddenSkillCount} compétences supplémentaires`}>+{hiddenSkillCount}</span>}
          </div>}
        </div>
        <span className="project-open-hint"><span>Voir le projet</span><span className="project-toggle" aria-hidden="true">↗</span></span>
      </summary>
      <ProjectDetail project={project} />
    </details>
  </article>;
}

function ProjectDetail({ project }: { project: Project }) {
  return <div className="project-detail">
    {project.description && paragraphs(project.description)}
    {project.skills.length > 0 && <div className="project-tags">{project.skills.map((skill) => <span key={skill.id}>{skill.label}</span>)}</div>}
    {project.links.length > 0 && <nav className="project-links" aria-label={`Liens du projet ${project.title}`}>
      {project.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.label} — ${project.title} (nouvel onglet)`}><span>{link.label}</span><span aria-hidden="true">↗</span></a>)}
    </nav>}
  </div>;
}

function ProjectVisual({ project, eager }: { project: Project; eager: boolean }) {
  if (project.cover) {
    return <figure className="content-card-visual project-visual project-visual-image">
      {/* URLs can be public HTTP(S) resources or versioned files from /public. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={project.cover.url} alt={project.cover.alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />
      {project.cover.caption && <figcaption>{project.cover.caption}</figcaption>}
    </figure>;
  }

  const initials = project.title.split(/[\s+-]+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("").toUpperCase();
  return <div className="content-card-visual project-visual project-visual-fallback" aria-hidden="true"><span>{initials || "CV"}</span><i /><i /></div>;
}

function paragraphs(value: string) {
  return value.split(/\n\s*\n|\n/).filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>);
}
