import { PublicCv } from "@/components/public-cv";
import { requireAdmin } from "@/lib/admin-session";
import { getLastPublishedAt, getWorkingResume } from "@/lib/resume-data";
import { getPublicCvPdfUrl } from "@/lib/public-assets";
import { prepareResumeForPresentation } from "@/lib/project-presentation";
import { getSystemSettings } from "@/lib/system-settings";
import { getPreviewTheme, getVisualThemeCatalog, resolveConfiguredVisualTheme } from "@/lib/visual-theme-data";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ theme?: string | string[] }> }) {
  await requireAdmin();
  const [query, data, lastPublishedAt, settings, themeCatalog, pdfUrl] = await Promise.all([searchParams, getWorkingResume(true), getLastPublishedAt(), getSystemSettings(), getVisualThemeCatalog(), getPublicCvPdfUrl()]);
  const configuredTheme = resolveConfiguredVisualTheme(settings, themeCatalog);
  const requestedSlug = Array.isArray(query.theme) ? query.theme[0] : query.theme;
  const previewTheme = getPreviewTheme(requestedSlug, themeCatalog);
  return <PublicCv data={prepareResumeForPresentation(data)} visualTheme={previewTheme ?? configuredTheme.theme} preview previewThemeName={previewTheme?.name} pdfUrl={pdfUrl} lastPublishedAt={lastPublishedAt} />;
}
