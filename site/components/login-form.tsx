"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (result.error) {
      setError("Identifiants incorrects ou compte indisponible.");
      setPending(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-field">
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="admin-field">
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-button admin-button-primary" type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
