import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "CVStudio — CV interactif",
  description:
    "CVStudio, une application de CV interactif avec administration et publication du contenu.",
  openGraph: {
    type: "profile",
    locale: "fr_FR",
    title: "CVStudio — CV interactif",
    description:
      "Créez et publiez votre CV interactif avec CVStudio.",
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1116",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
