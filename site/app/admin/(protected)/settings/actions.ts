"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { auth } from "@/lib/auth";
import { getContactConfig } from "@/lib/contact-config";
import { sendAdminSmtpTest } from "@/lib/contact-mailer";
import { prisma } from "@/lib/prisma";
import { encryptSettingsSecret, SettingsEncryptionUnavailableError } from "@/lib/settings-crypto";
import type { SettingsActionState } from "@/lib/settings-action-state";
import { themeContrastIssues } from "@/lib/visual-theme";
import { safeSmtpErrorDetails } from "@/lib/smtp-error";

const contactSettingsSchema = z.object({
  contactFormEnabled: z.boolean(),
  smtpHost: z.string().trim().min(1, "Le serveur SMTP est obligatoire."),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(200),
  contactFromEmail: z.string().trim().email("L’adresse From n’est pas valide."),
  contactFromName: z.string().trim().min(1).max(100),
  contactToEmail: z.string().trim().email("L’adresse destinataire n’est pas valide."),
  turnstileSiteKey: z.string().trim().min(10, "La site key Turnstile est incomplète."),
  smtpPassword: z.string().max(1000),
  turnstileSecret: z.string().max(2048),
  removeSmtpPassword: z.boolean(),
  removeTurnstileSecret: z.boolean(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "Le nouveau mot de passe doit contenir au moins 12 caractères.").max(128),
  confirmation: z.string(),
  revokeOtherSessions: z.boolean(),
}).refine((value) => value.newPassword === value.confirmation, {
  message: "La confirmation ne correspond pas au nouveau mot de passe.",
  path: ["confirmation"],
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Utilisez une couleur hexadécimale complète, par exemple #0b1116.");
const themeSchema = z.object({
  id: z.string().trim().optional(),
  slug: z.string().trim().min(2).max(50).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "L’identifiant accepte uniquement minuscules, chiffres et tirets."),
  name: z.string().trim().min(2).max(80),
  active: z.boolean(),
  colorScheme: z.enum(["LIGHT", "DARK"]),
  backgroundType: z.enum(["COLOR", "GRADIENT"]),
  backgroundColor: hexColor,
  backgroundColorEnd: z.union([hexColor, z.literal("")]),
  surfaceColor: hexColor,
  surfaceAltColor: hexColor,
  textColor: hexColor,
  mutedColor: hexColor,
  accentColor: hexColor,
  sortOrder: z.coerce.number().int().min(0).max(9999),
}).superRefine((value, context) => {
  if (value.backgroundType === "GRADIENT" && !value.backgroundColorEnd) context.addIssue({ code: "custom", path: ["backgroundColorEnd"], message: "La seconde couleur est obligatoire pour un dégradé." });
  for (const issue of themeContrastIssues({ ...value, backgroundColorEnd: value.backgroundColorEnd || null })) context.addIssue({ code: "custom", message: issue });
});

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Utilisez une date complète.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "La date n’existe pas.");
const timeValue = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Utilisez une heure HH:mm valide.");
const scheduleSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2).max(100),
  active: z.boolean(),
  kind: z.enum(["TIME", "CALENDAR"]),
  themeSlug: z.string().trim().min(1),
  startTime: z.string(),
  endTime: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  recurringAnnual: z.boolean(),
  priority: z.coerce.number().int().min(-9999).max(9999),
  sortOrder: z.coerce.number().int().min(0).max(9999),
}).superRefine((value, context) => {
  if (value.kind === "TIME") {
    const start = timeValue.safeParse(value.startTime);
    const end = timeValue.safeParse(value.endTime);
    if (!start.success) context.addIssue({ code: "custom", path: ["startTime"], message: start.error.issues[0]?.message ?? "Heure de début invalide." });
    if (!end.success) context.addIssue({ code: "custom", path: ["endTime"], message: end.error.issues[0]?.message ?? "Heure de fin invalide." });
    if (value.startTime === value.endTime) context.addIssue({ code: "custom", path: ["endTime"], message: "Les heures de début et de fin doivent différer." });
  } else {
    const start = dateValue.safeParse(value.startDate);
    const end = dateValue.safeParse(value.endDate || value.startDate);
    if (!start.success) context.addIssue({ code: "custom", path: ["startDate"], message: start.error.issues[0]?.message ?? "Date de début invalide." });
    if (!end.success) context.addIssue({ code: "custom", path: ["endDate"], message: end.error.issues[0]?.message ?? "Date de fin invalide." });
    if (!value.recurringAnnual && start.success && end.success && end.data < start.data) context.addIssue({ code: "custom", path: ["endDate"], message: "La date de fin doit suivre la date de début." });
  }
});

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function errorState(error: unknown, fallback: string): SettingsActionState {
  if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? fallback };
  if (error instanceof SettingsEncryptionUnavailableError) {
    return { status: "error", message: "Impossible de chiffrer le secret : configurez une SETTINGS_ENCRYPTION_KEY valide." };
  }
  return { status: "error", message: fallback };
}

function revalidateSettings() {
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/preview");
}

export async function saveThemeModeAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  try {
    const mode = z.enum(["AUTO", "MANUAL"]).parse(text(formData, "themeMode"));
    const defaultThemeSlug = text(formData, "defaultThemeSlug") || "default";
    const manualThemeSlug = text(formData, "manualThemeSlug") || null;
    const requestedSlugs = [defaultThemeSlug, ...(mode === "MANUAL" && manualThemeSlug ? [manualThemeSlug] : [])];
    const available = await prisma.visualTheme.findMany({ where: { slug: { in: requestedSlugs }, active: true }, select: { slug: true } });
    if (available.length !== new Set(requestedSlugs).size) return { status: "error", message: "Sélectionnez uniquement des thèmes actifs." };
    await prisma.systemSettings.upsert({
      where: { id: "main" },
      update: { themeMode: mode, defaultThemeSlug, manualThemeSlug },
      create: { id: "main", themeMode: mode, defaultThemeSlug, manualThemeSlug },
    });
    revalidateSettings();
    return { status: "success", message: mode === "MANUAL" ? "Thème manuel activé." : "Sélection automatique activée." };
  } catch (error) {
    return errorState(error, "Le mode d’apparence n’a pas pu être enregistré.");
  }
}

export async function saveVisualThemeAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  try {
    const input = themeSchema.parse({
      id: text(formData, "id") || undefined,
      slug: text(formData, "slug"),
      name: text(formData, "name"),
      active: checked(formData, "active"),
      colorScheme: text(formData, "colorScheme"),
      backgroundType: text(formData, "backgroundType"),
      backgroundColor: text(formData, "backgroundColor"),
      backgroundColorEnd: text(formData, "backgroundColorEnd"),
      surfaceColor: text(formData, "surfaceColor"),
      surfaceAltColor: text(formData, "surfaceAltColor"),
      textColor: text(formData, "textColor"),
      mutedColor: text(formData, "mutedColor"),
      accentColor: text(formData, "accentColor"),
      sortOrder: text(formData, "sortOrder"),
    });
    const existing = input.id ? await prisma.visualTheme.findUnique({ where: { id: input.id } }) : null;
    if (existing?.slug === "default" || (!existing && input.slug === "default")) return { status: "error", message: "Le thème historique de secours est immuable." };
    const values = {
      slug: existing?.slug ?? input.slug,
      name: input.name,
      active: input.active,
      colorScheme: input.colorScheme,
      backgroundType: input.backgroundType,
      backgroundColor: input.backgroundColor.toLowerCase(),
      backgroundColorEnd: input.backgroundType === "GRADIENT" ? input.backgroundColorEnd.toLowerCase() : null,
      surfaceColor: input.surfaceColor.toLowerCase(),
      surfaceAltColor: input.surfaceAltColor.toLowerCase(),
      textColor: input.textColor.toLowerCase(),
      mutedColor: input.mutedColor.toLowerCase(),
      accentColor: input.accentColor.toLowerCase(),
      sortOrder: input.sortOrder,
    };
    if (existing) await prisma.visualTheme.update({ where: { id: existing.id }, data: values });
    else await prisma.visualTheme.create({ data: values });
    revalidateSettings();
    return { status: "success", message: existing ? "Thème mis à jour." : "Thème créé." };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) return { status: "error", message: "Cet identifiant de thème existe déjà." };
    return errorState(error, "Le thème n’a pas pu être enregistré.");
  }
}

export async function deleteVisualThemeAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  const theme = await prisma.visualTheme.findUnique({ where: { id }, include: { _count: { select: { schedules: true } } } });
  if (!theme) return { status: "error", message: "Thème introuvable." };
  if (theme.builtIn) return { status: "error", message: "Un thème intégré ne peut pas être supprimé." };
  const settings = await prisma.systemSettings.findUnique({ where: { id: "main" } });
  if (theme._count.schedules || settings?.defaultThemeSlug === theme.slug || settings?.manualThemeSlug === theme.slug) return { status: "error", message: "Retirez d’abord ce thème des réglages et des règles." };
  await prisma.visualTheme.delete({ where: { id } });
  revalidateSettings();
  return { status: "success", message: "Thème supprimé." };
}

export async function saveThemeScheduleAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  try {
    const input = scheduleSchema.parse({
      id: text(formData, "id") || undefined,
      name: text(formData, "name"),
      active: checked(formData, "active"),
      kind: text(formData, "kind"),
      themeSlug: text(formData, "themeSlug"),
      startTime: text(formData, "startTime"),
      endTime: text(formData, "endTime"),
      startDate: text(formData, "startDate"),
      endDate: text(formData, "endDate"),
      recurringAnnual: checked(formData, "recurringAnnual"),
      priority: text(formData, "priority"),
      sortOrder: text(formData, "sortOrder"),
    });
    const theme = await prisma.visualTheme.findUnique({ where: { slug: input.themeSlug }, select: { active: true } });
    if (!theme?.active) return { status: "error", message: "La règle doit cibler un thème actif." };
    const values = {
      name: input.name,
      active: input.active,
      kind: input.kind,
      themeSlug: input.themeSlug,
      startTime: input.kind === "TIME" ? input.startTime : null,
      endTime: input.kind === "TIME" ? input.endTime : null,
      startDate: input.kind === "CALENDAR" ? input.startDate : null,
      endDate: input.kind === "CALENDAR" ? input.endDate || input.startDate : null,
      recurringAnnual: input.kind === "CALENDAR" && input.recurringAnnual,
      priority: input.priority,
      sortOrder: input.sortOrder,
    };
    if (input.id) await prisma.themeSchedule.update({ where: { id: input.id }, data: values });
    else await prisma.themeSchedule.create({ data: values });
    revalidateSettings();
    return { status: "success", message: input.id ? "Règle mise à jour." : "Règle créée." };
  } catch (error) {
    return errorState(error, "La règle n’a pas pu être enregistrée.");
  }
}

export async function deleteThemeScheduleAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  try {
    await prisma.themeSchedule.delete({ where: { id } });
    revalidateSettings();
    return { status: "success", message: "Règle supprimée." };
  } catch {
    return { status: "error", message: "La règle n’a pas pu être supprimée." };
  }
}

export async function saveContactSettingsAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  try {
    const input = contactSettingsSchema.parse({
      contactFormEnabled: checked(formData, "contactFormEnabled"),
      smtpHost: text(formData, "smtpHost"),
      smtpPort: text(formData, "smtpPort"),
      smtpSecure: checked(formData, "smtpSecure"),
      smtpUser: text(formData, "smtpUser"),
      contactFromEmail: text(formData, "contactFromEmail"),
      contactFromName: text(formData, "contactFromName"),
      contactToEmail: text(formData, "contactToEmail"),
      turnstileSiteKey: text(formData, "turnstileSiteKey"),
      smtpPassword: text(formData, "smtpPassword"),
      turnstileSecret: text(formData, "turnstileSecret"),
      removeSmtpPassword: checked(formData, "removeSmtpPassword"),
      removeTurnstileSecret: checked(formData, "removeTurnstileSecret"),
    });
    if (input.smtpPassword && input.removeSmtpPassword) return { status: "error", message: "Choisissez entre remplacer et supprimer le mot de passe SMTP." };
    if (input.turnstileSecret && input.removeTurnstileSecret) return { status: "error", message: "Choisissez entre remplacer et supprimer le secret Turnstile." };

    const secretUpdates: { smtpPasswordEncrypted?: string | null; turnstileSecretEncrypted?: string | null } = {};
    if (input.smtpPassword) secretUpdates.smtpPasswordEncrypted = encryptSettingsSecret(input.smtpPassword);
    else if (input.removeSmtpPassword) secretUpdates.smtpPasswordEncrypted = null;
    if (input.turnstileSecret) secretUpdates.turnstileSecretEncrypted = encryptSettingsSecret(input.turnstileSecret);
    else if (input.removeTurnstileSecret) secretUpdates.turnstileSecretEncrypted = null;

    const values = {
      contactFormEnabled: input.contactFormEnabled,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser,
      contactFromEmail: input.contactFromEmail,
      contactFromName: input.contactFromName,
      contactToEmail: input.contactToEmail,
      turnstileSiteKey: input.turnstileSiteKey,
      ...secretUpdates,
    };
    await prisma.systemSettings.upsert({ where: { id: "main" }, update: values, create: { id: "main", ...values } });
    revalidateSettings();
    return { status: "success", message: "Configuration du contact enregistrée." };
  } catch (error) {
    return errorState(error, "La configuration n’a pas pu être enregistrée.");
  }
}

export async function resetContactSettingsAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  if (!checked(formData, "confirmResetContact")) return { status: "error", message: "Confirmez le retour aux variables d’environnement." };
  const values = {
    contactFormEnabled: null,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    smtpUser: null,
    smtpPasswordEncrypted: null,
    contactFromEmail: null,
    contactFromName: null,
    contactToEmail: null,
    turnstileSiteKey: null,
    turnstileSecretEncrypted: null,
  };
  await prisma.systemSettings.upsert({ where: { id: "main" }, update: values, create: { id: "main", ...values } });
  revalidateSettings();
  return { status: "success", message: "Le contact utilise de nouveau les variables d’environnement." };
}

export async function saveAudienceSettingsAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  const audienceMeasurementEnabled = checked(formData, "audienceMeasurementEnabled");
  await prisma.systemSettings.upsert({
    where: { id: "main" },
    update: { audienceMeasurementEnabled },
    create: { id: "main", audienceMeasurementEnabled },
  });
  revalidateSettings();
  return { status: "success", message: "Réglage de la mesure d’audience enregistré." };
}

export async function resetAudienceSettingsAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  if (!checked(formData, "confirmResetAudience")) return { status: "error", message: "Confirmez le retour à la variable d’environnement." };
  await prisma.systemSettings.upsert({
    where: { id: "main" },
    update: { audienceMeasurementEnabled: null },
    create: { id: "main", audienceMeasurementEnabled: null },
  });
  revalidateSettings();
  return { status: "success", message: "La mesure d’audience utilise de nouveau la variable d’environnement." };
}

export async function testSmtpSettingsAction(_previous: SettingsActionState): Promise<SettingsActionState> {
  void _previous;
  await requireAdmin();
  const config = await getContactConfig();
  if (!config) return { status: "error", message: "La configuration SMTP effective est incomplète." };
  try {
    await sendAdminSmtpTest(config);
    return { status: "success", message: "Test SMTP envoyé." };
  } catch (error) {
    const details = safeSmtpErrorDetails(error, [config.password, config.user, process.env.SETTINGS_ENCRYPTION_KEY]);
    console.error("Échec du test SMTP administrateur.", details);
    return { status: "error", message: details.code ? `Échec SMTP (${details.code}). Vérifiez la configuration et les journaux serveur.` : "Échec de connexion ou d’envoi SMTP. Consultez les journaux serveur." };
  }
}

export async function changeAdminPasswordAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdmin();
  try {
    const input = passwordSchema.parse({
      currentPassword: text(formData, "currentPassword"),
      newPassword: text(formData, "newPassword"),
      confirmation: text(formData, "confirmation"),
      revokeOtherSessions: checked(formData, "revokeOtherSessions"),
    });
    const requestHeaders = await headers();
    await auth.api.changePassword({
      headers: requestHeaders,
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: false,
      },
    });
    if (input.revokeOtherSessions) await auth.api.revokeOtherSessions({ headers: requestHeaders });
    return { status: "success", message: input.revokeOtherSessions
      ? "Mot de passe modifié et autres sessions déconnectées."
      : "Mot de passe modifié." };
  } catch (error) {
    if (error instanceof z.ZodError) return errorState(error, "Vérifiez les mots de passe saisis.");
    return { status: "error", message: "Le mot de passe actuel est incorrect ou le changement a échoué." };
  }
}
