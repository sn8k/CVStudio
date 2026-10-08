"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { deletePdfResume, selectPdfResume, storePdfResume } from "@/lib/pdf-resumes";

function refreshCv() {
  revalidatePath("/admin/cv");
  revalidatePath("/");
  revalidatePath("/preview");
}

export async function uploadPdfAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("pdf");
  if (!(file instanceof File)) throw new Error("Choisissez un PDF.");
  await storePdfResume(file);
  refreshCv();
}

export async function selectPdfAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Choix invalide.");
  await selectPdfResume(id || null);
  refreshCv();
}

export async function deletePdfAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Choix invalide.");
  await deletePdfResume(id);
  refreshCv();
}
