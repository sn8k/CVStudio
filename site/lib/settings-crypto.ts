import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SETTINGS_SECRET_VERSION = "v1";
const SETTINGS_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export class SettingsEncryptionUnavailableError extends Error {}
export class SettingsSecretDecryptionError extends Error {}

export function decodeSettingsEncryptionKey(value = process.env.SETTINGS_ENCRYPTION_KEY) {
  if (!value || !SETTINGS_KEY_PATTERN.test(value)) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 && key.toString("base64") === value ? key : null;
}

export function isSettingsEncryptionReady() {
  return decodeSettingsEncryptionKey() !== null;
}

export function encryptSettingsSecret(plaintext: string, keyValue = process.env.SETTINGS_ENCRYPTION_KEY) {
  const key = decodeSettingsEncryptionKey(keyValue);
  if (!key) throw new SettingsEncryptionUnavailableError("SETTINGS_ENCRYPTION_KEY invalide ou absente.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SETTINGS_SECRET_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSettingsSecret(payload: string, keyValue = process.env.SETTINGS_ENCRYPTION_KEY) {
  const key = decodeSettingsEncryptionKey(keyValue);
  if (!key) throw new SettingsEncryptionUnavailableError("SETTINGS_ENCRYPTION_KEY invalide ou absente.");
  const [version, ivValue, tagValue, ciphertextValue, extra] = payload.split(".");
  if (version !== SETTINGS_SECRET_VERSION || !ivValue || !tagValue || !ciphertextValue || extra !== undefined) {
    throw new SettingsSecretDecryptionError("Format de secret chiffré invalide.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SettingsSecretDecryptionError("Le secret chiffré ne peut pas être déchiffré.");
  }
}
