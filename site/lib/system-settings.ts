import type { SystemSettings } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decodeSettingsEncryptionKey, decryptSettingsSecret } from "@/lib/settings-crypto";

const smtpConfigSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().optional(),
  password: z.string().optional(),
  fromEmail: z.string().trim().email(),
  toEmail: z.string().trim().email(),
  fromName: z.string().trim().min(1).max(100),
}).superRefine((value, context) => {
  if (Boolean(value.user) !== Boolean(value.password)) {
    context.addIssue({ code: "custom", message: "Les identifiants SMTP doivent être fournis ensemble.", path: ["user"] });
  }
});

const turnstileConfigSchema = z.object({
  siteKey: z.string().trim().min(10),
  secretKey: z.string().trim().min(20),
  publicSiteUrl: z.string().url(),
});

const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);
const TURNSTILE_TEST_SECRET_KEYS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export type ContactConfig = z.infer<typeof smtpConfigSchema>;
export type TurnstileConfig = {
  siteKey: string;
  secretKey: string;
  expectedHostname: string;
  officialTestKeys: boolean;
};
export type SettingsSource = "database" | "environment" | "none";
export type SecretStatus = "configured" | "missing" | "unreadable";

export type EffectiveSystemSettings = {
  raw: SystemSettings | null;
  contactFormRequested: boolean;
  contactFormOperational: boolean;
  contact: ContactConfig | null;
  turnstile: TurnstileConfig | null;
  audienceMeasurementEnabled: boolean;
  encryptionReady: boolean;
  values: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    contactFromEmail: string;
    contactFromName: string;
    contactToEmail: string;
    turnstileSiteKey: string;
  };
  sources: {
    contact: SettingsSource;
    smtp: SettingsSource;
    turnstile: SettingsSource;
    audience: SettingsSource;
  };
  secrets: {
    smtpPassword: SecretStatus;
    turnstileSecret: SecretStatus;
  };
};

function dbValue<T>(value: T | null | undefined, environmentValue: T | undefined) {
  return value !== null && value !== undefined ? value : environmentValue;
}

function decryptedDbSecret(value: string | null | undefined) {
  if (!value) return { value: undefined, invalid: false };
  try {
    return { value: decryptSettingsSecret(value), invalid: false };
  } catch {
    return { value: undefined, invalid: true };
  }
}

function hasDatabaseValue(settings: SystemSettings | null, keys: Array<keyof SystemSettings>) {
  return Boolean(settings && keys.some((key) => settings[key] !== null && settings[key] !== undefined));
}

export function resolveEffectiveSystemSettings(
  settings: SystemSettings | null,
  environment: NodeJS.ProcessEnv = process.env,
): EffectiveSystemSettings {
  const dbSmtpPassword = decryptedDbSecret(settings?.smtpPasswordEncrypted);
  const dbTurnstileSecret = decryptedDbSecret(settings?.turnstileSecretEncrypted);
  const smtpPassword = settings?.smtpPasswordEncrypted
    ? dbSmtpPassword.value
    : environment.CONTACT_SMTP_PASSWORD || undefined;
  const turnstileSecret = settings?.turnstileSecretEncrypted
    ? dbTurnstileSecret.value
    : environment.TURNSTILE_SECRET_KEY;

  const smtpHost = dbValue(settings?.smtpHost, environment.CONTACT_SMTP_HOST) ?? "";
  const smtpPort = dbValue(settings?.smtpPort, environment.CONTACT_SMTP_PORT ? Number(environment.CONTACT_SMTP_PORT) : undefined) ?? 587;
  const smtpSecure = dbValue(settings?.smtpSecure, environment.CONTACT_SMTP_SECURE === "true") ?? false;
  const smtpUser = dbValue(settings?.smtpUser, environment.CONTACT_SMTP_USER) ?? "";
  const contactFromEmail = dbValue(settings?.contactFromEmail, environment.CONTACT_FROM_EMAIL) ?? "";
  const contactFromName = dbValue(settings?.contactFromName, environment.CONTACT_FROM_NAME || "CVStudio") ?? "CVStudio";
  const contactToEmail = dbValue(settings?.contactToEmail, environment.CONTACT_TO_EMAIL) ?? "";
  const turnstileSiteKey = dbValue(settings?.turnstileSiteKey, environment.TURNSTILE_SITE_KEY) ?? "";

  const smtpResult = smtpConfigSchema.safeParse({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser || undefined,
    password: smtpPassword,
    fromEmail: contactFromEmail,
    fromName: contactFromName,
    toEmail: contactToEmail,
  });

  const turnstileResult = turnstileConfigSchema.safeParse({
    siteKey: turnstileSiteKey,
    secretKey: turnstileSecret,
    publicSiteUrl: environment.PUBLIC_SITE_URL,
  });
  let turnstile: TurnstileConfig | null = null;
  if (turnstileResult.success && turnstileResult.data.siteKey !== "CHANGE_ME" && turnstileResult.data.secretKey !== "CHANGE_ME") {
    const testSiteKey = TURNSTILE_TEST_SITE_KEYS.has(turnstileResult.data.siteKey);
    const testSecretKey = TURNSTILE_TEST_SECRET_KEYS.has(turnstileResult.data.secretKey);
    if (environment.NODE_ENV !== "production" || (!testSiteKey && !testSecretKey)) {
      turnstile = {
        siteKey: turnstileResult.data.siteKey,
        secretKey: turnstileResult.data.secretKey,
        expectedHostname: new URL(turnstileResult.data.publicSiteUrl).hostname,
        officialTestKeys: testSiteKey && testSecretKey,
      };
    }
  }

  const contact = dbValue(settings?.contactFormEnabled, environment.CONTACT_FORM_ENABLED === "true") ?? false;
  const audience = dbValue(settings?.audienceMeasurementEnabled, environment.AUDIENCE_MEASUREMENT_ENABLED !== "false") ?? true;
  const smtpDb = hasDatabaseValue(settings, ["smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPasswordEncrypted", "contactFromEmail", "contactFromName", "contactToEmail"]);
  const turnstileDb = hasDatabaseValue(settings, ["turnstileSiteKey", "turnstileSecretEncrypted"]);
  const smtp = !dbSmtpPassword.invalid && smtpResult.success ? smtpResult.data : null;

  return {
    raw: settings,
    contactFormRequested: contact,
    contactFormOperational: contact && Boolean(smtp) && Boolean(turnstile),
    contact: smtp,
    turnstile,
    audienceMeasurementEnabled: audience,
    encryptionReady: decodeSettingsEncryptionKey(environment.SETTINGS_ENCRYPTION_KEY) !== null,
    values: {
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      contactFromEmail,
      contactFromName,
      contactToEmail,
      turnstileSiteKey,
    },
    sources: {
      contact: settings?.contactFormEnabled !== null && settings?.contactFormEnabled !== undefined ? "database" : environment.CONTACT_FORM_ENABLED !== undefined ? "environment" : "none",
      smtp: smtpDb ? "database" : smtp ? "environment" : "none",
      turnstile: turnstileDb ? "database" : turnstile ? "environment" : "none",
      audience: settings?.audienceMeasurementEnabled !== null && settings?.audienceMeasurementEnabled !== undefined ? "database" : "environment",
    },
    secrets: {
      smtpPassword: dbSmtpPassword.invalid ? "unreadable" : smtpPassword ? "configured" : "missing",
      turnstileSecret: dbTurnstileSecret.invalid ? "unreadable" : turnstileSecret ? "configured" : "missing",
    },
  };
}

export async function getSystemSettings() {
  return prisma.systemSettings.findUnique({ where: { id: "main" } });
}

export async function getEffectiveSystemSettings() {
  return resolveEffectiveSystemSettings(await getSystemSettings());
}
