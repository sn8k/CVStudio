"use client";

import { useState } from "react";
import { useContentRibbon } from "@/components/content-ribbon";
import type { ResumeData } from "@/lib/resume-types";

type Interest = ResumeData["interests"][number];

export function InterestCarousel({ interests }: { interests: Interest[] }) {
  const {
    activeItem: activeInterest,
    closeDialog,
    dialogRef,
    handleDialogClose,
    isMoving,
    openItem: openInterest,
    orderedItems: orderedInterests,
    reducedMotion,
    scrollItems,
    setUserPaused,
    trackProps,
    userPaused,
  } = useContentRibbon({ items: interests, cardSelector: ".interest-card" });

  return <div className="content-ribbon interest-carousel" data-autoplay={isMoving ? "running" : "paused"} data-dialog-open={activeInterest ? "true" : undefined}>
    {interests.length > 1 && <div className="content-ribbon-toolbar interest-carousel-toolbar" aria-label="Contrôles du ruban des centres d’intérêt">
      <p aria-live="polite">{isMoving ? "Ruban en mouvement" : "Défilement en pause"} · glisser librement</p>
      <div>
        <button type="button" onClick={() => scrollItems(-1)} aria-label="Centre d’intérêt précédent"><span aria-hidden="true">←</span> Précédent</button>
        <button type="button" onClick={() => scrollItems(1)} aria-label="Centre d’intérêt suivant">Suivant <span aria-hidden="true">→</span></button>
        <button
          className="interest-autoplay-toggle"
          type="button"
          aria-pressed={userPaused}
          aria-label={reducedMotion ? "Défilement automatique des centres d’intérêt désactivé par les préférences de mouvement" : userPaused ? "Reprendre le défilement automatique des centres d’intérêt" : "Mettre le défilement automatique des centres d’intérêt en pause"}
          onClick={() => setUserPaused((current) => !current)}
          disabled={reducedMotion}
          title={reducedMotion ? "Défilement automatique désactivé par les préférences de mouvement" : undefined}
        >
          <span aria-hidden="true">{reducedMotion ? "—" : userPaused ? "▶" : "Ⅱ"}</span> {reducedMotion ? "Mouvement réduit" : userPaused ? "Reprendre" : "Pause"}
        </button>
      </div>
    </div>}
    <div
      className="content-ribbon-track interest-carousel-track"
      {...trackProps}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Ruban des centres d’intérêt"
    >
      {orderedInterests.map((interest, index) => <InterestCard interest={interest} index={index} key={interest.id} onOpen={openInterest} />)}
    </div>
    <dialog
      className="content-dialog interest-dialog"
      ref={dialogRef}
      aria-labelledby={activeInterest ? `interest-dialog-title-${activeInterest.id}` : undefined}
      onClose={handleDialogClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      {activeInterest && <div className="content-dialog-panel interest-dialog-panel">
        <header className="content-dialog-header interest-dialog-header">
          <div><p>Centre d’intérêt</p><h2 id={`interest-dialog-title-${activeInterest.id}`}>{activeInterest.label}</h2></div>
          <button className="content-dialog-close interest-dialog-close" type="button" onClick={closeDialog} autoFocus aria-label={`Fermer le centre d’intérêt ${activeInterest.label}`}>Fermer <span aria-hidden="true">×</span></button>
        </header>
        <div className={`interest-dialog-layout${activeInterest.description ? "" : " is-visual-only"}`}>
          <InterestVisual interest={activeInterest} eager />
          {activeInterest.description && <div className="interest-dialog-copy"><p>{activeInterest.description}</p></div>}
        </div>
      </div>}
    </dialog>
  </div>;
}

function InterestCard({ interest, index, onOpen }: { interest: Interest; index: number; onOpen: (interest: Interest, trigger: HTMLElement) => void }) {
  return <article className="content-ribbon-card interest-card" aria-roledescription="centre d’intérêt" aria-label={interest.label}>
    <details>
      <summary onClick={(event) => {
        event.preventDefault();
        onOpen(interest, event.currentTarget);
      }}>
        <InterestVisual interest={interest} eager={index < 4} />
        <div className="interest-card-copy">
          <span className="interest-card-kicker">Centre d’intérêt</span>
          <p className="interest-card-name">{interest.label}</p>
          {interest.description && <h3>{interest.description}</h3>}
        </div>
        <span className="interest-open-hint"><span>Voir le détail</span><span className="interest-toggle" aria-hidden="true">↗</span></span>
      </summary>
      {interest.description && <div className="interest-detail"><p>{interest.description}</p></div>}
    </details>
  </article>;
}

function InterestVisual({ interest, eager = false }: { interest: Interest; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!interest.image || failed) {
    const initials = interest.label.split(/[\s+-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return <div className="content-card-visual interest-card-media interest-card-fallback" aria-hidden="true"><span>{initials || "CI"}</span><i /><i /></div>;
  }
  return <figure className="content-card-visual interest-card-media">
    {/* URLs can be public HTTP(S) resources or versioned files from /public. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={interest.image.url} alt={interest.image.alt} width="640" height="400" loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => setFailed(true)} />
    {interest.image.caption && <figcaption>{interest.image.caption}</figcaption>}
  </figure>;
}
