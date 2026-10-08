"use client";

import { useId, useRef, type ReactNode } from "react";

type AdminDialogProps = {
  title: string;
  triggerLabel: string;
  children: ReactNode;
  triggerClassName?: string;
  description?: string;
};

export function AdminDialog({ title, triggerLabel, children, triggerClassName = "admin-button admin-button-secondary", description }: AdminDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = () => dialogRef.current?.close();

  return <>
    <button ref={triggerRef} className={triggerClassName} type="button" onClick={() => dialogRef.current?.showModal()}>{triggerLabel}</button>
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby={titleId}
      onClose={() => triggerRef.current?.focus()}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="admin-dialog-panel">
        <header className="admin-dialog-header">
          <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
          <button className="admin-dialog-close" type="button" onClick={close} aria-label={`Fermer ${title}`}>Fermer <span aria-hidden="true">×</span></button>
        </header>
        <div className="admin-dialog-body">{children}</div>
      </div>
    </dialog>
  </>;
}