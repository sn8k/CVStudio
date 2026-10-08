"use client";

import { useActionState } from "react";
import { publishAction, type PublishActionState } from "@/app/admin/(protected)/actions";

const initialState: PublishActionState = { status: "idle", message: "" };
const publishedDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function PublishResumeForm({ lastPublishedAt }: { lastPublishedAt: string | null }) {
  const [state, action, pending] = useActionState(publishAction, initialState);
  const effectivePublishedAt = state.publishedAt ?? lastPublishedAt;
  return <form className="admin-publish-form" action={action}>
    <button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? "Publication…" : "Publier le CV"}</button>
    {state.status !== "idle" && <span className={state.status === "success" ? "admin-success" : "admin-error"} role={state.status === "error" ? "alert" : "status"}>{state.message}</span>}
    {effectivePublishedAt && <small>Dernière publication : {publishedDate.format(new Date(effectivePublishedAt))}</small>}
  </form>;
}
