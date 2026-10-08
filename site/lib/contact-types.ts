export const contactFeedback = {
  sent: "Message envoyé. Merci — je vous répondrai dès que possible.",
  invalid: "Certains champs sont incomplets ou invalides. Vérifiez le formulaire.",
  "rate-limited": "Trop de tentatives rapprochées. Réessayez dans quelques minutes.",
  unavailable: "Le formulaire est temporairement indisponible. Vous pouvez utiliser l’adresse e-mail ci-dessus.",
  verification: "La vérification anti-spam n’a pas pu être validée. Réessayez ou utilisez l’adresse e-mail ci-dessus.",
  error: "Le message n’a pas pu être envoyé. Vous pouvez utiliser l’adresse e-mail ci-dessus.",
} as const;

export type ContactStatus = keyof typeof contactFeedback;

export function normalizeContactStatus(value: string | string[] | undefined): ContactStatus | null {
  const status = Array.isArray(value) ? value[0] : value;
  return status && status in contactFeedback ? status as ContactStatus : null;
}
