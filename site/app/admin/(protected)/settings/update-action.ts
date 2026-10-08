"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { startGithubUpdate } from "@/lib/github-update";

export async function updateFromGithubAction() {
  await requireAdmin();
  await startGithubUpdate();
  revalidatePath("/admin/settings");
}
