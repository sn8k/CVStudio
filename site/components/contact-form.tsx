"use client";

import Script from "next/script";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { contactFeedback, type ContactStatus } from "@/lib/contact-types";

const TURNSTILE_ACTION = "contact";

type ContactFormProps = {
  initialStatus?: ContactStatus | null;
  preview?: boolean;
  turnstileSiteKey?: string | null;
  turnstileTheme?: "light" | "dark";
};

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: "light" | "dark";
    size: "flexible";
    language: "fr";
    callback: () => void;
    "error-callback": () => void;
    "expired-callback": () => void;
    "timeout-callback": () => void;
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type ContactFields = "name" | "email" | "message";
type ContactApiResponse = {
  ok: boolean;
  code: string;
  message: string;
  errors?: Partial<Record<ContactFields, string>>;
};

export function ContactForm({ initialStatus = null, preview = false, turnstileSiteKey = null, turnstileTheme = "dark" }: ContactFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verificationState, setVerificationState] = useState<"loading" | "ready" | "error">(preview ? "ready" : "loading");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactFields, string>>>({});
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(() => {
    if (!initialStatus) return null;
    return { kind: initialStatus === "sent" ? "success" : "error", message: contactFeedback[initialStatus] };
  });

  const focusFirstError = (errors: Partial<Record<ContactFields, string>>) => {
    const firstField = (["name", "email", "message"] as const).find((field) => errors[field]);
    const field = firstField ? formRef.current?.elements.namedItem(firstField) : null;
    if (field instanceof HTMLElement) field.focus();
  };

  const resetTurnstile = useCallback(() => {
    setVerificationState("loading");
    if (turnstileWidgetRef.current && window.turnstile) window.turnstile.reset(turnstileWidgetRef.current);
  }, []);

  const renderTurnstile = useCallback(() => {
    if (preview || !turnstileSiteKey || !window.turnstile || !turnstileContainerRef.current || turnstileWidgetRef.current) return;
    turnstileWidgetRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      action: TURNSTILE_ACTION,
      theme: turnstileTheme,
      size: "flexible",
      language: "fr",
      callback: () => setVerificationState("ready"),
      "error-callback": () => setVerificationState("error"),
      "expired-callback": () => setVerificationState("loading"),
      "timeout-callback": () => setVerificationState("error"),
    });
  }, [preview, turnstileSiteKey, turnstileTheme]);

  useEffect(() => () => {
    if (turnstileWidgetRef.current && window.turnstile) window.turnstile.remove(turnstileWidgetRef.current);
    turnstileWidgetRef.current = null;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (preview) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (pending) return;
    if (verificationState !== "ready") {
      setFeedback({ kind: "error", message: contactFeedback.verification });
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = new URLSearchParams();
    for (const [key, value] of formData) {
      if (typeof value === "string") body.append(key, value);
    }

    setPending(true);
    setFieldErrors({});
    setFeedback(null);
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
      });
      const result = await response.json() as ContactApiResponse;
      if (response.ok && result.ok) {
        form.reset();
        resetTurnstile();
        setFeedback({ kind: "success", message: result.message });
      } else {
        const errors = result.errors ?? {};
        setFieldErrors(errors);
        setFeedback({ kind: "error", message: result.message || contactFeedback.error });
        if (["TURNSTILE_REQUIRED", "TURNSTILE_FAILED", "TURNSTILE_UNAVAILABLE", "DELIVERY_FAILED"].includes(result.code)) resetTurnstile();
        window.requestAnimationFrame(() => focusFirstError(errors));
      }
    } catch {
      resetTurnstile();
      setFeedback({ kind: "error", message: contactFeedback.error });
    } finally {
      setPending(false);
    }
  };

  const describedBy = (field: ContactFields) => fieldErrors[field] ? `contact-${field}-error` : undefined;

  return <section className="contact-form-panel" aria-labelledby="contact-form-title">
    <div className="contact-form-heading">
      <p className="contact-form-kicker">Échange direct</p>
      <h3 id="contact-form-title">M’envoyer un message</h3>
      <p>Trois champs, sans compte ni pièce jointe.</p>
    </div>
    <form ref={formRef} className="contact-form" method="post" action="/api/contact" noValidate aria-busy={pending} onSubmit={handleSubmit}>
      <fieldset disabled={preview || pending}>
        <div className="contact-field">
          <label htmlFor="contact-name">Nom</label>
          <input id="contact-name" name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={describedBy("name")} />
          {fieldErrors.name && <span className="contact-field-error" id="contact-name-error">{fieldErrors.name}</span>}
        </div>
        <div className="contact-field">
          <label htmlFor="contact-email">Adresse e-mail</label>
          <input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={describedBy("email")} />
          {fieldErrors.email && <span className="contact-field-error" id="contact-email-error">{fieldErrors.email}</span>}
        </div>
        <div className="contact-field contact-field-message">
          <label htmlFor="contact-message">Message</label>
          <textarea id="contact-message" name="message" rows={7} minLength={10} maxLength={5000} required aria-invalid={Boolean(fieldErrors.message)} aria-describedby={describedBy("message")} />
          {fieldErrors.message && <span className="contact-field-error" id="contact-message-error">{fieldErrors.message}</span>}
        </div>
        <div className="contact-honeypot" aria-hidden="true">
          <label htmlFor="contact-company-website">Site web de votre entreprise</label>
          <input id="contact-company-website" name="companyWebsite" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {preview
          ? <div className="contact-turnstile-preview" aria-hidden="true">Vérification anti-spam · désactivée dans l’aperçu</div>
          : <div className="contact-turnstile-block" tabIndex={0} role="group" aria-labelledby="contact-turnstile-label" aria-describedby="contact-turnstile-status">
            <p id="contact-turnstile-label" className="contact-turnstile-label">Cloudflare Turnstile · protection anti-spam</p>
            <div ref={turnstileContainerRef} className="contact-turnstile-widget" data-testid="turnstile-widget" />
            <p id="contact-turnstile-status" className={`contact-turnstile-status is-${verificationState}`} role="status" aria-live="polite">
              {verificationState === "ready" ? "Vérification anti-spam validée." : verificationState === "error" ? "La vérification anti-spam a échoué. Elle va être relancée." : "Vérification anti-spam en cours…"}
            </p>
            <noscript><p className="contact-turnstile-noscript">La vérification anti-spam du formulaire nécessite JavaScript. Vous pouvez me contacter directement par e-mail avec le lien ci-dessus.</p></noscript>
          </div>}
        <button className="button button-primary contact-form-submit" type="submit" disabled={preview || pending || verificationState !== "ready"} aria-describedby={!preview ? "contact-turnstile-status" : undefined}>{pending ? "Envoi…" : "Envoyer le message"}</button>
      </fieldset>
      {preview && <p className="contact-form-preview-note" role="status">Envoi désactivé dans l’aperçu.</p>}
      {!preview && <div className={`contact-form-feedback${feedback ? ` is-${feedback.kind}` : ""}`} aria-live="polite" aria-atomic="true">{feedback?.message}</div>}
    </form>
    <p className="contact-form-privacy">Le site ne conserve pas votre message en base de données. Il est transmis par e-mail afin que je puisse vous répondre.</p>
    {!preview && turnstileSiteKey && <Script id="cloudflare-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderTurnstile} onError={() => setVerificationState("error")} />}
  </section>;
}
