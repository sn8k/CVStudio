"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return <button className="admin-signout" type="button" onClick={async () => { await authClient.signOut(); router.push("/admin/login"); router.refresh(); }}>Déconnexion</button>;
}
