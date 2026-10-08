type SmtpLikeError = Error & {
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
  response?: unknown;
};

function clean(value: unknown, redactions: string[]) {
  if (typeof value !== "string") return undefined;
  let result = value;
  for (const secret of redactions.filter((item) => item.length >= 3)) result = result.replaceAll(secret, "[REDACTED]");
  return result.slice(0, 1000);
}

export function safeSmtpErrorDetails(error: unknown, sensitiveValues: Array<string | undefined> = []) {
  const redactions = sensitiveValues.filter((value): value is string => Boolean(value));
  if (!(error instanceof Error)) return { type: typeof error };
  const smtpError = error as SmtpLikeError;
  return {
    name: smtpError.name,
    code: clean(smtpError.code, redactions),
    command: clean(smtpError.command, redactions),
    responseCode: typeof smtpError.responseCode === "number" ? smtpError.responseCode : undefined,
    message: clean(smtpError.message, redactions),
    response: clean(smtpError.response, redactions),
  };
}
