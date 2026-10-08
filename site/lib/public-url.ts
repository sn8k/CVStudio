import { z } from "zod";

export const publicHttpUrlSchema = z.string().trim().url("L’URL est invalide.").refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}, "Seules les URL HTTP et HTTPS sont autorisées.");
