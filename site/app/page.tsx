import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { AudienceTracker } from "@/components/audience-tracker";
import { PublicCv } from "@/components/public-cv";
import { AUDIENCE_OPTOUT_COOKIE } from "@/lib/audience-cookies";
import { getPublishedResume, getPublishedResumeWithMetadata } from "@/lib/resume-data";
import { recordPublicPageView } from "@/lib/visit-stats";
import { getPublicCvPdfUrl } from "@/lib/public-assets";
import { prepareResumeForPresentation } from "@/lib/project-presentation";
import { normalizeContactStatus } from "@/lib/contact-types";
import { getEffectiveSystemSettings } from "@/lib/system-settings";
import { getVisualThemeCatalog, resolveConfiguredVisualTheme } from "@/lib/visual-theme-data";

export async function generateMetadata(): Promise<Metadata> {
  const resume = await getPublishedResume();
  const title = `${resume.profile.name} — ${resume.profile.professionalTitle}`;
  return {
    title,
    description: resume.profile.intro,
    alternates: { canonical: "/" },
    openGraph: { type: "profile", locale: "fr_FR", title, description: resume.profile.intro, siteName: "CVStudio" },
    twitter: { card: "summary", title, description: resume.profile.intro },
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ contact?: string | string[] }> }) {
  noStore();
  const [requestHeaders, cookieStore, query, settings, themeCatalog] = await Promise.all([headers(), cookies(), searchParams, getEffectiveSystemSettings(), getVisualThemeCatalog()]);
  const audienceAllowed = settings.audienceMeasurementEnabled && cookieStore.get(AUDIENCE_OPTOUT_COOKIE)?.value !== "1";
  const contactConfig = settings.contactFormOperational && settings.contact && settings.turnstile
    ? { contact: settings.contact, turnstile: settings.turnstile }
    : null;
  const [{ data: resume, lastPublishedAt }, pdfUrl] = await Promise.all([
    getPublishedResumeWithMetadata(),
    getPublicCvPdfUrl(),
    audienceAllowed ? recordPublicPageView(requestHeaders.get("user-agent") ?? "") : Promise.resolve(false),
  ]);
  const visualTheme = resolveConfiguredVisualTheme(settings.raw, themeCatalog);
  return <><AudienceTracker /><PublicCv data={prepareResumeForPresentation(resume)} visualTheme={visualTheme.theme} pdfUrl={pdfUrl} lastPublishedAt={lastPublishedAt} contactFormEnabled={Boolean(contactConfig)} contactTurnstileSiteKey={contactConfig?.turnstile.siteKey} contactStatus={normalizeContactStatus(query.contact)} /></>;
}
