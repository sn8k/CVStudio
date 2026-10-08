import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { SignOutButton } from "@/components/sign-out-button";
import "../admin.css";

const links = [
  ["00", "Vue d’ensemble", "/admin"],
  ["01", "Identité", "/admin/profile"],
  ["02", "Expériences", "/admin/experiences"],
  ["03", "Compétences & outils", "/admin/skills"],
  ["04", "Formation & compléments", "/admin/foundations"],
  ["05", "Projets & éditorial", "/admin/editorial"],
  ["06", "Sauvegarde", "/admin/data"],
  ["07", "Configuration", "/admin/settings"],
  ["08", "CV PDF", "/admin/cv"],
] as const;

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="admin-page">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link className="admin-brand" href="/admin">
            <span className="brand-mark" aria-hidden="true">YG</span>
            <span><strong>CV Studio</strong><small>Administration privée</small></span>
          </Link>
          <nav className="admin-nav" aria-label="Navigation de l’administration">
            {links.map(([index, label, href]) => <Link href={href} key={href}><span>{index}</span>{label}</Link>)}
          </nav>
          <div className="admin-sidebar-footer">
            <Link href="/preview" target="_blank">Aperçu de travail ↗</Link>
            <Link href="/" target="_blank">Site public ↗</Link>
            <SignOutButton />
          </div>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
