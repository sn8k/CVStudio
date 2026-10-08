import { AdminHeader } from "@/components/admin-header";
import { AudienceSettingsForm, ContactSettingsForm, PasswordSettingsForm } from "@/components/settings-forms";
import { ThemeSettings } from "@/components/theme-settings";
import { requireAdmin } from "@/lib/admin-session";
import { getEffectiveSystemSettings } from "@/lib/system-settings";
import { getVisualThemeCatalog, resolveConfiguredVisualTheme } from "@/lib/visual-theme-data";
import packageMetadata from "@/package.json";

function stateLabel(value: boolean, enabled = "Activé", disabled = "Désactivé") {
  return value ? enabled : disabled;
}

function themeReasonLabel(reason: string) {
  if (reason === "manual") return "manuel";
  if (reason === "calendar") return "règle calendrier";
  if (reason === "time") return "règle horaire";
  if (reason === "default") return "thème par défaut";
  return "fallback historique";
}

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, themeCatalog] = await Promise.all([getEffectiveSystemSettings(), getVisualThemeCatalog()]);
  const resolvedTheme = resolveConfiguredVisualTheme(settings.raw, themeCatalog);
  const publicUrl = process.env.PUBLIC_SITE_URL ?? "Non configurée";
  return <>
    <AdminHeader kicker="Configuration" title="Réglages globaux" description="Pilotez les services applicatifs sans exposer les paramètres d’infrastructure ni les secrets en clair." />

    <div className="settings-section-heading"><p className="admin-kicker">A · Services</p><h2>Services applicatifs</h2></div>
    <section className="admin-panel settings-panel" aria-labelledby="settings-contact-title">
      <div className="settings-panel-heading"><div><h2 id="settings-contact-title">Formulaire de contact</h2><p>Activation, transport SMTP et protection Cloudflare Turnstile.</p></div><span className={`settings-status ${settings.contactFormOperational ? "is-ready" : "is-incomplete"}`}>{stateLabel(settings.contactFormOperational, "Opérationnel", "Incomplet ou désactivé")}</span></div>
      <ContactSettingsForm values={{
        enabled: settings.contactFormRequested,
        ...settings.values,
        encryptionReady: settings.encryptionReady,
        sources: { contact: settings.sources.contact, smtp: settings.sources.smtp, turnstile: settings.sources.turnstile },
        secrets: settings.secrets,
        storedSecrets: {
          smtpPassword: Boolean(settings.raw?.smtpPasswordEncrypted),
          turnstileSecret: Boolean(settings.raw?.turnstileSecretEncrypted),
        },
      }} />
    </section>

    <section className="admin-panel settings-panel" aria-labelledby="settings-audience-title">
      <div className="settings-panel-heading"><div><h2 id="settings-audience-title">Mesure d’audience</h2><p>Interrupteur global ; l’opposition individuelle reste prioritaire.</p></div><span className={`settings-status ${settings.audienceMeasurementEnabled ? "is-ready" : "is-incomplete"}`}>{stateLabel(settings.audienceMeasurementEnabled, "Activée", "Désactivée")}</span></div>
      <AudienceSettingsForm enabled={settings.audienceMeasurementEnabled} source={settings.sources.audience} />
    </section>

    <div className="settings-section-heading"><p className="admin-kicker">B · Apparence</p><h2>Thèmes visuels</h2></div>
    <section className="admin-panel settings-panel" aria-labelledby="settings-theme-title">
      <div className="settings-panel-heading"><div><h2 id="settings-theme-title">Ambiance du CV public</h2><p>Palettes sobres, sélection manuelle ou programmation en heure de Paris.</p></div><span className="settings-status is-ready">{resolvedTheme.theme.name}</span></div>
      <ThemeSettings
        mode={settings.raw?.themeMode ?? "AUTO"}
        defaultThemeSlug={settings.raw?.defaultThemeSlug ?? "default"}
        manualThemeSlug={settings.raw?.manualThemeSlug ?? "default"}
        resolvedThemeName={resolvedTheme.theme.name}
        resolvedReason={themeReasonLabel(resolvedTheme.reason)}
        themes={themeCatalog.themes}
        schedules={themeCatalog.rules}
      />
    </section>

    <div className="settings-section-heading"><p className="admin-kicker">C · Sécurité du compte</p><h2>Mot de passe administrateur</h2></div>
    <section className="admin-panel settings-panel" aria-labelledby="settings-password-title">
      <div className="settings-panel-heading"><div><h2 id="settings-password-title">Changer le mot de passe</h2><p>Le mot de passe reste entièrement géré et haché par Better Auth.</p></div></div>
      <p className="admin-notice"><code>ADMIN_PASSWORD</code> sert uniquement au bootstrap initial. Le modifier dans l’environnement ne change pas le compte existant.</p>
      <PasswordSettingsForm />
    </section>

    <div className="settings-section-heading"><p className="admin-kicker">D · Logiciel</p><h2>Version installée</h2></div>
    <section className="admin-panel settings-panel" aria-labelledby="settings-update-title">
      <h2 id="settings-update-title">CV Studio {packageMetadata.version}</h2>
      <p className="admin-notice">Les mises à jour sont réalisées par l’exploitant depuis le serveur, avec une sauvegarde préalable du volume et de la configuration.</p>
    </section>

    <div className="settings-section-heading"><p className="admin-kicker">E · État système</p><h2>Diagnostic non sensible</h2></div>
    <section className="admin-panel settings-panel" aria-labelledby="settings-system-title">
      <h2 id="settings-system-title">État effectif</h2>
      <dl className="settings-system-grid">
        <SystemState label="URL publique" value={publicUrl} />
        <SystemState label="Environnement" value={process.env.NODE_ENV ?? "development"} />
        <SystemState label="Formulaire contact" value={stateLabel(settings.contactFormOperational)} />
        <SystemState label="SMTP" value={stateLabel(Boolean(settings.contact), "Configuré", "Incomplet")} />
        <SystemState label="Turnstile" value={stateLabel(Boolean(settings.turnstile), "Configuré", "Incomplet")} />
        <SystemState label="Mesure audience" value={stateLabel(settings.audienceMeasurementEnabled, "Activée", "Désactivée")} />
        <SystemState label="Thème actif" value={`${resolvedTheme.theme.name} (${themeReasonLabel(resolvedTheme.reason)})`} />
        <SystemState label="Fuseau thèmes" value="Europe/Paris" />
        <SystemState label="Base" value="SQLite" />
        <SystemState label="Chiffrement settings" value={stateLabel(settings.encryptionReady, "Prêt", "Clé absente ou invalide")} />
        <SystemState label="Version CVStudio" value={packageMetadata.version} />
      </dl>
    </section>
  </>;
}

function SystemState({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
