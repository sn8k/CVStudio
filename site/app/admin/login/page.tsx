import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { LoginForm } from "@/components/login-form";
import "../admin.css";

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <main className="admin-login">
      <section className="admin-login-card" aria-labelledby="login-title">
        <span className="brand-mark" aria-hidden="true">YG</span>
        <h1 id="login-title">Administration privée</h1>
        <p>Connectez-vous pour modifier, prévisualiser et publier le CV.</p>
        <LoginForm />
      </section>
    </main>
  );
}
