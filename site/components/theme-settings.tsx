"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import {
  deleteThemeScheduleAction,
  deleteVisualThemeAction,
  saveThemeModeAction,
  saveThemeScheduleAction,
  saveVisualThemeAction,
} from "@/app/admin/(protected)/settings/actions";
import type { SettingsActionState } from "@/lib/settings-action-state";
import type { ThemeScheduleDefinition, VisualThemeDefinition } from "@/lib/visual-theme";

const initialState: SettingsActionState = { status: "idle", message: "" };

type ThemeSettingsProps = {
  mode: "AUTO" | "MANUAL";
  defaultThemeSlug: string;
  manualThemeSlug: string;
  resolvedThemeName: string;
  resolvedReason: string;
  themes: VisualThemeDefinition[];
  schedules: ThemeScheduleDefinition[];
};

export function ThemeSettings({ mode: initialMode, defaultThemeSlug, manualThemeSlug, resolvedThemeName, resolvedReason, themes, schedules }: ThemeSettingsProps) {
  const [mode, setMode] = useState(initialMode);
  const [selectedDefaultTheme, setSelectedDefaultTheme] = useState(defaultThemeSlug);
  const [selectedManualTheme, setSelectedManualTheme] = useState(manualThemeSlug);
  const [state, action, pending] = useActionState(saveThemeModeAction, initialState);
  const activeThemes = themes.filter((theme) => theme.active);
  return <div className="settings-stack">
    <div className="theme-current" aria-live="polite"><span>Thème résolu côté serveur</span><strong>{resolvedThemeName}</strong><small>{resolvedReason} · Europe/Paris</small></div>
    <form className="settings-compact-form theme-mode-form" action={action}>
      <fieldset className="theme-mode-options">
        <legend>Mode de sélection</legend>
        <label className={mode === "AUTO" ? "is-selected" : ""}><input type="radio" name="themeMode" value="AUTO" checked={mode === "AUTO"} onChange={() => setMode("AUTO")} /> Automatique</label>
        <label className={mode === "MANUAL" ? "is-selected" : ""}><input type="radio" name="themeMode" value="MANUAL" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Manuel</label>
      </fieldset>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Thème par défaut</span><select name="defaultThemeSlug" value={selectedDefaultTheme} onChange={(event) => setSelectedDefaultTheme(event.target.value)}>{activeThemes.map((theme) => <option key={theme.slug} value={theme.slug}>{theme.name}</option>)}</select></label>
        <label className="admin-field"><span>Thème forcé</span><select name="manualThemeSlug" value={selectedManualTheme} onChange={(event) => setSelectedManualTheme(event.target.value)}>{activeThemes.map((theme) => <option key={theme.slug} value={theme.slug}>{theme.name}</option>)}</select></label>
      </div>
      <p>Le mode manuel suspend les règles sans les supprimer. Le retour en automatique les réactive immédiatement.</p>
      <Feedback state={state} />
      <button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le mode"}</button>
    </form>

    <div className="theme-subsection-heading"><div><h3>Thèmes disponibles</h3><p>Le thème historique est immuable et reste le secours ultime.</p></div><AdminDialog title="Créer un thème" triggerLabel="+ Créer un thème"><ThemeForm /></AdminDialog></div>
    <div className="admin-table-wrap"><table className="admin-data-table theme-table"><thead><tr><th>Thème</th><th>Ambiance</th><th>État</th><th>Ordre</th><th>Actions</th></tr></thead><tbody>{themes.map((theme) => <tr key={theme.id}>
      <th scope="row"><div className="theme-name-cell"><ThemeSwatch theme={theme} /><span><strong>{theme.name}</strong><small>{theme.slug}{theme.slug === "default" ? " · défaut historique" : ""}</small></span></div></th>
      <td>{theme.colorScheme === "LIGHT" ? "Clair" : "Sombre"}<small>{theme.backgroundType === "GRADIENT" ? "Dégradé" : theme.backgroundType === "COLOR" ? "Couleur" : "Historique"}</small></td>
      <td><span className={`admin-badge ${theme.active ? "is-active" : "is-inactive"}`}>{theme.active ? "Actif" : "Inactif"}</span></td>
      <td>{theme.sortOrder}</td>
      <td><div className="admin-row-actions"><Link className="admin-button" href={`/preview?theme=${encodeURIComponent(theme.slug)}`} target="_blank">Tester</Link>{theme.slug === "default" ? <span className="admin-muted">Référence</span> : <AdminDialog title={`Modifier ${theme.name}`} triggerLabel="Éditer"><ThemeForm theme={theme} /></AdminDialog>}{!theme.builtIn && <DeleteThemeForm theme={theme} />}</div></td>
    </tr>)}</tbody></table></div>

    <div className="theme-subsection-heading"><div><h3>Programmation</h3><p>Priorité : manuel, calendrier, horaire, défaut. À priorité égale : ordre croissant puis identifiant.</p></div><AdminDialog title="Créer une règle" triggerLabel="+ Créer une règle"><ScheduleForm themes={activeThemes} /></AdminDialog></div>
    {schedules.length === 0 ? <p className="admin-notice">Aucune règle active ou inactive. Le thème par défaut reste utilisé en mode automatique.</p> : <div className="admin-table-wrap"><table className="admin-data-table theme-table"><thead><tr><th>Règle</th><th>Période</th><th>Thème</th><th>Priorité</th><th>Actions</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.id}>
      <th scope="row"><strong>{schedule.name}</strong><small>{schedule.active ? "Active" : "Inactive"} · {schedule.kind === "TIME" ? "Horaire" : "Calendrier"}</small></th>
      <td>{scheduleLabel(schedule)}</td><td>{themes.find((theme) => theme.slug === schedule.themeSlug)?.name ?? schedule.themeSlug}</td><td>{schedule.priority}<small>ordre {schedule.sortOrder}</small></td>
      <td><div className="admin-row-actions"><AdminDialog title={`Modifier ${schedule.name}`} triggerLabel="Éditer"><ScheduleForm schedule={schedule} themes={activeThemes} /></AdminDialog><DeleteScheduleForm schedule={schedule} /></div></td>
    </tr>)}</tbody></table></div>}
  </div>;
}

function ThemeForm({ theme }: { theme?: VisualThemeDefinition }) {
  const [state, action, pending] = useActionState(saveVisualThemeAction, initialState);
  const defaults = theme ?? {
    backgroundType: "GRADIENT", colorScheme: "LIGHT", backgroundColor: "#f4f7f5", backgroundColorEnd: "#e8f1ed",
    surfaceColor: "#ffffff", surfaceAltColor: "#edf3f0", textColor: "#14201b", mutedColor: "#52645c", accentColor: "#167a57", sortOrder: 50, active: true,
  };
  return <form className="admin-dialog-form admin-form" action={action}>
    <input type="hidden" name="id" value={theme?.id ?? ""} />
    <div className="admin-form-grid">
      <label className="admin-field"><span>Identifiant interne</span><input name="slug" defaultValue={theme?.slug ?? ""} readOnly={Boolean(theme)} placeholder="hiver-clair" required /></label>
      <label className="admin-field"><span>Nom visible</span><input name="name" defaultValue={theme?.name ?? ""} required /></label>
      <label className="admin-field"><span>Mode de contraste</span><select name="colorScheme" defaultValue={defaults.colorScheme}><option value="LIGHT">Clair</option><option value="DARK">Sombre</option></select></label>
      <label className="admin-field"><span>Background</span><select name="backgroundType" defaultValue={defaults.backgroundType}><option value="COLOR">Couleur</option><option value="GRADIENT">Dégradé</option></select></label>
      <ColorField label="Fond principal" name="backgroundColor" value={defaults.backgroundColor} />
      <ColorField label="Fond secondaire" name="backgroundColorEnd" value={defaults.backgroundColorEnd ?? defaults.backgroundColor} />
      <ColorField label="Surface" name="surfaceColor" value={defaults.surfaceColor} />
      <ColorField label="Surface secondaire" name="surfaceAltColor" value={defaults.surfaceAltColor} />
      <ColorField label="Texte" name="textColor" value={defaults.textColor} />
      <ColorField label="Texte atténué" name="mutedColor" value={defaults.mutedColor} />
      <ColorField label="Accent" name="accentColor" value={defaults.accentColor} />
      <label className="admin-field"><span>Ordre</span><input name="sortOrder" type="number" min="0" max="9999" defaultValue={defaults.sortOrder} required /></label>
    </div>
    <label className="admin-check settings-toggle"><input name="active" type="checkbox" defaultChecked={defaults.active} /> Thème actif</label>
    <p className="admin-help">Les palettes insuffisamment contrastées sont refusées. Les images pourront être ajoutées plus tard via l’infrastructure média existante.</p>
    <Feedback state={state} />
    <button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? "Enregistrement…" : theme ? "Enregistrer le thème" : "Créer le thème"}</button>
  </form>;
}

function ScheduleForm({ schedule, themes }: { schedule?: ThemeScheduleDefinition; themes: VisualThemeDefinition[] }) {
  const [kind, setKind] = useState(schedule?.kind ?? "TIME");
  const [state, action, pending] = useActionState(saveThemeScheduleAction, initialState);
  return <form className="admin-dialog-form admin-form" action={action}>
    <input type="hidden" name="id" value={schedule?.id ?? ""} />
    <div className="admin-form-grid">
      <label className="admin-field"><span>Nom</span><input name="name" defaultValue={schedule?.name ?? ""} required /></label>
      <label className="admin-field"><span>Type</span><select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "TIME" | "CALENDAR")}><option value="TIME">Plage horaire</option><option value="CALENDAR">Date ou période</option></select></label>
      <label className="admin-field"><span>Thème</span><select name="themeSlug" defaultValue={schedule?.themeSlug ?? themes[0]?.slug}>{themes.map((theme) => <option key={theme.slug} value={theme.slug}>{theme.name}</option>)}</select></label>
      <label className="admin-field"><span>Priorité</span><input name="priority" type="number" min="-9999" max="9999" defaultValue={schedule?.priority ?? 0} required /></label>
      {kind === "TIME" ? <><label className="admin-field"><span>Début</span><input name="startTime" type="time" defaultValue={schedule?.startTime ?? "07:00"} required /></label><label className="admin-field"><span>Fin</span><input name="endTime" type="time" defaultValue={schedule?.endTime ?? "19:00"} required /></label></> : <><label className="admin-field"><span>Date de début</span><input name="startDate" type="date" defaultValue={schedule?.startDate ?? ""} required /></label><label className="admin-field"><span>Date de fin</span><input name="endDate" type="date" defaultValue={schedule?.endDate ?? ""} /></label></>}
      <label className="admin-field"><span>Ordre à priorité égale</span><input name="sortOrder" type="number" min="0" max="9999" defaultValue={schedule?.sortOrder ?? 0} required /></label>
    </div>
    {kind === "CALENDAR" && <label className="admin-check settings-toggle"><input name="recurringAnnual" type="checkbox" defaultChecked={schedule?.recurringAnnual ?? false} /> Répéter chaque année</label>}
    <label className="admin-check settings-toggle"><input name="active" type="checkbox" defaultChecked={schedule?.active ?? true} /> Règle active</label>
    <p className="admin-help">Une plage horaire peut traverser minuit. Une date de fin vide crée une règle sur une seule journée.</p>
    <Feedback state={state} />
    <button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? "Enregistrement…" : schedule ? "Enregistrer la règle" : "Créer la règle"}</button>
  </form>;
}

function ColorField({ label, name, value }: { label: string; name: string; value: string }) {
  return <label className="admin-field theme-color-field"><span>{label}</span><span><input name={name} type="color" defaultValue={value} /><code>{value}</code></span></label>;
}

function ThemeSwatch({ theme }: { theme: VisualThemeDefinition }) {
  const background = theme.backgroundType === "GRADIENT" && theme.backgroundColorEnd ? `linear-gradient(145deg, ${theme.backgroundColor}, ${theme.backgroundColorEnd})` : theme.backgroundColor;
  return <span className="theme-swatch" style={{ background, color: theme.textColor, borderColor: theme.accentColor }} aria-hidden="true"><i style={{ background: theme.surfaceColor }} /><b style={{ background: theme.accentColor }} /></span>;
}

function DeleteThemeForm({ theme }: { theme: VisualThemeDefinition }) {
  const [state, action, pending] = useActionState(deleteVisualThemeAction, initialState);
  return <form action={action}><input type="hidden" name="id" value={theme.id} /><button className="admin-button admin-button-danger" type="submit" disabled={pending}>Supprimer</button><Feedback state={state} /></form>;
}

function DeleteScheduleForm({ schedule }: { schedule: ThemeScheduleDefinition }) {
  const [state, action, pending] = useActionState(deleteThemeScheduleAction, initialState);
  return <form action={action}><input type="hidden" name="id" value={schedule.id} /><button className="admin-button admin-button-danger" type="submit" disabled={pending}>Supprimer</button><Feedback state={state} /></form>;
}

function Feedback({ state }: { state: SettingsActionState }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "success" ? "admin-success" : "admin-error"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function scheduleLabel(schedule: ThemeScheduleDefinition) {
  if (schedule.kind === "TIME") return `${schedule.startTime} → ${schedule.endTime}`;
  const range = schedule.endDate && schedule.endDate !== schedule.startDate ? `${schedule.startDate} → ${schedule.endDate}` : schedule.startDate;
  return `${range}${schedule.recurringAnnual ? " · annuel" : ""}`;
}
