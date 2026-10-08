import { z } from "zod";

export const CONTACT_MAX_BODY_BYTES = 64 * 1024;

export const contactFormSchema = z.object({
  name: z.string().trim().min(2, "Indiquez un nom d’au moins 2 caractères.").max(100, "Le nom ne peut pas dépasser 100 caractères.").refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Le nom contient des caractères non autorisés."),
  email: z.string().trim().max(254, "L’adresse e-mail est trop longue.").email("Indiquez une adresse e-mail valide."),
  message: z.string().trim().min(10, "Le message doit contenir au moins 10 caractères.").max(5000, "Le message ne peut pas dépasser 5 000 caractères."),
  companyWebsite: z.string().max(500).optional().default(""),
}).strict();

export type ContactMessage = z.infer<typeof contactFormSchema>;
export type ContactFieldErrors = Partial<Record<keyof ContactMessage, string>>;

export function getContactFieldErrors(error: z.ZodError): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in contactFormSchema.shape && !errors[field as keyof ContactMessage]) {
      errors[field as keyof ContactMessage] = issue.message;
    }
  }
  return errors;
}

