"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  changeAdminPasswordAction,
  resetAudienceSettingsAction,
  resetContactSettingsAction,
  saveAudienceSettingsAction,
  saveContactSettingsAction,
  testSmtpSettingsAction,
} from "@/app/admin/(protected)/settings/actions";
import type { SettingsActionState } from "@/lib/settings-action-state";
import type { SecretStatus, SettingsSource } from "@/lib/system-settings";

const initialState: SettingsActionState = { status: "idle", message: "" };

type ContactFormValues = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  contactFromEmail: string;
  contactFromName: string;
  contactToEmail: string;
  turnstileSiteKey: string;
  encryptionReady: boolean;
  sources: { contact: SettingsSource; smtp: SettingsSource; turnstile: SettingsSource };
  secrets: { smtpPassword: SecretStatus; turnstileSecret: SecretStatus };
  storedSecrets: { smtpPassword: boolean; turnstileSecret: boolean };
};

function sourceLabel(source: SettingsSource) {
  if (source === "database") return "Administration";
  if (source === "environment") return "Variables d’environnement";
  return "Non configuré";
}

function secretLabel(status: SecretStatus) {
  if (status === "configured") return "Configuré";
  if (status === "unreadable") return "Illisible — clé absente ou différente";
  return "Non configuré";
}

function Feedback({ state }: { state: SettingsActionState }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "success" ? "admin-success" : "admin-error"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function Source({ label, source }: { label: string; source: SettingsSource }) {
  return <p className="settings-source"><span>{label}</span><strong>{sourceLabel(source)}</strong></p>;
}

export function ContactSettingsForm({ values }: { values: ContactFormValues }) {
  const [saveState, saveAction, savePending] = useActionState(saveContactSettingsAction, initialState);
  const [resetState, resetAction, resetPending] = useActionState(resetContactSettingsAction, initialState);
  const [testState, testAction, testPending] = useActionState(testSmtpSettingsAction, initialState);
  return <div className="settings-stack">
    {!values.encryptionReady && <p className="admin-error" role="status">SETTINGS_ENCRYPTION_KEY est absente ou invalide. Les valeurs ENV continuent de fonctionner, mais aucun nouveau secret ne peut être enregistré.</p>}
    <div className="settings-sources" aria-label="Origine de la configuration effective">
      <Source label="Activation" source={values.sources.contact} />
      <Source label="SMTP" source={values.sources.smtp} />
      <Source label="Turnstile" source={values.sources.turnstile} />
    </div>
    <form className="admin-form settings-form" action={saveAction}>
      <fieldset className="settings-fieldset">
        <legend>Formulaire de contact</legend>
        <label className="admin-check settings-toggle"><input name="contactFormEnabled" type="checkbox" defaultChecked={values.enabled} /> Activer le formulaire public</label>
        <p className="admin-help">L’activation ne devient opérationnelle que si SMTP et Turnstile sont tous deux complets.</p>
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>SMTP</legend>
        <div className="admin-form-grid">
          <SettingsField label="SMTP Host" name="smtpHost" defaultValue={values.smtpHost} required />
          <SettingsField label="SMTP Port" name="smtpPort" defaultValue={String(values.smtpPort)} type="number" min="1" max="65535" required />
          <SettingsField label="SMTP User" name="smtpUser" defaultValue={values.smtpUser} autoComplete="username" />
          <div className="admin-field"><span>Connexion</span><label className="admin-check settings-toggle"><input name="smtpSecure" type="checkbox" defaultChecked={values.smtpSecure} /> TLS direct (SMTP Secure)</label></div>
          <SettingsField label="From e-mail" name="contactFromEmail" defaultValue={values.contactFromEmail} type="email" required />
          <SettingsField label="From name" name="contactFromName" defaultValue={values.contactFromName} required />
          <SettingsField label="To e-mail" name="contactToEmail" defaultValue={values.contactToEmail} type="email" required full />
          <div className="admin-field admin-field-full settings-secret-field">
            <label htmlFor="smtpPassword">SMTP Password</label>
            <input id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" placeholder={values.secrets.smtpPassword === "missing" ? undefined : "••••••••"} disabled={!values.encryptionReady} />
            <p className="admin-help">État : <strong>{secretLabel(values.secrets.smtpPassword)}</strong>. Laisser vide pour conserver la valeur existante.</p>
            {values.storedSecrets.smtpPassword && <label className="admin-check"><input name="removeSmtpPassword" type="checkbox" /> Supprimer le mot de passe SMTP enregistré et reprendre le fallback ENV</label>}
          </div>
        </div>
      </fieldset>

      <fieldset className="settings-fieldset">
        <legend>Cloudflare Turnstile</legend>
        <div className="admin-form-grid">
          <SettingsField label="Turnstile Site Key" name="turnstileSiteKey" defaultValue={values.turnstileSiteKey} required full />
          <div className="admin-field admin-field-full settings-secret-field">
            <label htmlFor="turnstileSecret">Turnstile Secret Key</label>
            <input id="turnstileSecret" name="turnstileSecret" type="password" autoComplete="new-password" placeholder={values.secrets.turnstileSecret === "missing" ? undefined : "••••••••"} disabled={!values.encryptionReady} />
            <p className="admin-help">État : <strong>{secretLabel(values.secrets.turnstileSecret)}</strong>. Laisser vide pour conserver la valeur existante.</p>
            {values.storedSecrets.turnstileSecret && <label className="admin-check"><input name="removeTurnstileSecret" type="checkbox" /> Supprimer le secret Turnstile enregistré et reprendre le fallback ENV</label>}
          </div>
        </div>
      </fieldset>
      <Feedback state={saveState} />
      <div className="admin-actions"><button className="admin-button admin-button-primary" type="submit" disabled={savePending}>{savePending ? "Enregistrement…" : "Enregistrer les services Contact"}</button></div>
    </form>

    <div className="settings-secondary-actions">
      <form className="settings-compact-form" action={testAction}>
        <p>Le test utilise le destinataire effectif et ne sollicite pas Turnstile.</p>
        <Feedback state={testState} />
        <button className="admin-button" type="submit" disabled={testPending}>{testPending ? "Envoi…" : "Envoyer un e-mail de test"}</button>
      </form>
      <form className="settings-compact-form" action={resetAction}>
        <p>Efface uniquement les réglages Contact stockés en base. Les variables ENV reprennent immédiatement.</p>
        <label className="admin-check"><input name="confirmResetContact" type="checkbox" required /> Confirmer le retour vers ENV</label>
        <Feedback state={resetState} />
        <button className="admin-button admin-button-danger" type="submit" disabled={resetPending}>{resetPending ? "Réinitialisation…" : "Réinitialiser Contact vers ENV"}</button>
      </form>
    </div>
  </div>;
}

export function AudienceSettingsForm({ enabled, source }: { enabled: boolean; source: SettingsSource }) {
  const [saveState, saveAction, savePending] = useActionState(saveAudienceSettingsAction, initialState);
  const [resetState, resetAction, resetPending] = useActionState(resetAudienceSettingsAction, initialState);
  return <div className="settings-stack">
    <div className="settings-sources"><Source label="Source actuelle" source={source} /></div>
    <form className="settings-compact-form" action={saveAction}>
      <label className="admin-check settings-toggle"><input name="audienceMeasurementEnabled" type="checkbox" defaultChecked={enabled} /> Activer la mesure d’audience</label>
      <p>Ce réglage ne modifie ni l’opt-out visiteur, ni les uniques quotidiens, ni la rétention.</p>
      <Feedback state={saveState} />
      <button className="admin-button admin-button-primary" type="submit" disabled={savePending}>{savePending ? "Enregistrement…" : "Enregistrer le réglage Audience"}</button>
    </form>
    <form className="settings-compact-form" action={resetAction}>
      <label className="admin-check"><input name="confirmResetAudience" type="checkbox" required /> Confirmer le retour vers ENV</label>
      <Feedback state={resetState} />
      <button className="admin-button" type="submit" disabled={resetPending}>{resetPending ? "Réinitialisation…" : "Réinitialiser Audience vers ENV"}</button>
    </form>
  </div>;
}

export function PasswordSettingsForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changeAdminPasswordAction, initialState);
  useEffect(() => { if (state.status === "success") formRef.current?.reset(); }, [state.status]);
  return <form ref={formRef} className="admin-form settings-form" action={action}>
    <div className="admin-form-grid">
      <SettingsField label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" required full />
      <SettingsField label="Nouveau mot de passe" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
      <SettingsField label="Confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} required />
    </div>
    <label className="admin-check settings-toggle"><input name="revokeOtherSessions" type="checkbox" defaultChecked /> Déconnecter mes autres sessions</label>
    <p className="admin-help">12 caractères minimum. La session courante est renouvelée lorsque les autres sessions sont révoquées.</p>
    <Feedback state={state} />
    <div className="admin-actions"><button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? "Modification…" : "Modifier le mot de passe"}</button></div>
  </form>;
}

function SettingsField({ label, name, defaultValue = "", full = false, ...props }: {
  label: string;
  name: string;
  defaultValue?: string;
  full?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  return <div className={`admin-field${full ? " admin-field-full" : ""}`}><label htmlFor={name}>{label}</label><input id={name} name={name} defaultValue={defaultValue} {...props} /></div>;
}
