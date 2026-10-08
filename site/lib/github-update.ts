type UpdateStatus = {
  state: "idle" | "running" | "success" | "error";
  message: string;
  localCommit: string;
  remoteCommit: string;
  updatedAt: string | null;
};

function configuration() {
  const token = process.env.UPDATE_SERVICE_TOKEN;
  if (!token || token.length < 32 || token.startsWith("CHANGE_ME") || process.env.NODE_ENV !== "production") return null;
  return { token, url: process.env.UPDATE_SERVICE_URL || "http://updater:8765" };
}

export async function getGithubUpdateStatus(): Promise<UpdateStatus | null> {
  const config = configuration();
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/status`, { headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    return await response.json() as UpdateStatus;
  } catch {
    return null;
  }
}

export async function startGithubUpdate() {
  const config = configuration();
  if (!config) throw new Error("Service de mise à jour indisponible.");
  const response = await fetch(`${config.url}/update`, { method: "POST", headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({ message: "Mise à jour refusée." })) as { message?: string };
    throw new Error(result.message || "Mise à jour refusée.");
  }
}
