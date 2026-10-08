import { getEffectiveSystemSettings, type ContactConfig, type TurnstileConfig } from "@/lib/system-settings";

export type { ContactConfig, TurnstileConfig };

export type ContactFormConfig = {
  contact: ContactConfig;
  turnstile: TurnstileConfig;
};

export async function getContactConfig() {
  return (await getEffectiveSystemSettings()).contact;
}

export async function getTurnstileConfig() {
  return (await getEffectiveSystemSettings()).turnstile;
}

export async function getContactFormConfig(): Promise<ContactFormConfig | null> {
  const settings = await getEffectiveSystemSettings();
  return settings.contactFormOperational && settings.contact && settings.turnstile
    ? { contact: settings.contact, turnstile: settings.turnstile }
    : null;
}

export async function isContactFormConfigured() {
  return (await getContactFormConfig()) !== null;
}

export function isContactMailTestMode() {
  return process.env.CONTACT_MAIL_TEST_MODE === "1" && process.env.NODE_ENV !== "production";
}
