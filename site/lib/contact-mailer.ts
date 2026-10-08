import nodemailer from "nodemailer";
import type { ContactConfig } from "@/lib/contact-config";
import { isContactMailTestMode } from "@/lib/contact-config";
import type { ContactMessage } from "@/lib/contact-schema";

export type ContactTestDelivery = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  text: string;
};

const testDeliveries: ContactTestDelivery[] = [];

function createContactTransport(config: ContactConfig) {
  const testMode = isContactMailTestMode();
  return {
    testMode,
    transporter: testMode
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    }),
  };
}

export async function sendContactMessage(config: ContactConfig, message: ContactMessage) {
  const { transporter, testMode } = createContactTransport(config);
  const subject = `Nouveau message depuis le CV — ${message.name}`;
  const text = [
    "Nouveau message reçu depuis le formulaire de contact CVStudio",
    "",
    "Nom :",
    message.name,
    "",
    "E-mail :",
    message.email,
    "",
    "Message :",
    message.message,
  ].join("\n");

  await transporter.sendMail({
    from: { name: config.fromName, address: config.fromEmail },
    replyTo: { name: message.name, address: message.email },
    to: config.toEmail,
    subject,
    text,
  });

  if (testMode) {
    testDeliveries.push({
      from: config.fromEmail,
      replyTo: message.email,
      to: config.toEmail,
      subject,
      text,
    });
  }
}

export async function sendAdminSmtpTest(config: ContactConfig) {
  const { transporter, testMode } = createContactTransport(config);
  const subject = "Test SMTP — CVStudio";
  const text = "Ce message confirme que la configuration SMTP effective de CVStudio fonctionne.";
  await transporter.sendMail({
    from: { name: config.fromName, address: config.fromEmail },
    replyTo: { name: config.fromName, address: config.fromEmail },
    to: config.toEmail,
    subject,
    text,
  });
  if (testMode) {
    testDeliveries.push({
      from: config.fromEmail,
      replyTo: config.fromEmail,
      to: config.toEmail,
      subject,
      text,
    });
  }
}

export function getContactTestDeliveries() {
  return [...testDeliveries];
}

export function resetContactTestDeliveries() {
  testDeliveries.length = 0;
}
