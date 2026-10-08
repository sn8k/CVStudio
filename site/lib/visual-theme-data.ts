import type { SystemSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveActiveTheme,
  type ThemeScheduleDefinition,
  type VisualThemeDefinition,
} from "@/lib/visual-theme";

export type VisualThemeCatalog = {
  themes: VisualThemeDefinition[];
  rules: ThemeScheduleDefinition[];
};

export async function getVisualThemeCatalog(): Promise<VisualThemeCatalog> {
  try {
    const [themes, rules] = await prisma.$transaction([
      prisma.visualTheme.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] }),
      prisma.themeSchedule.findMany({ orderBy: [{ priority: "desc" }, { sortOrder: "asc" }, { id: "asc" }] }),
    ]);
    return {
      themes: themes.map((theme) => ({
        id: theme.id,
        slug: theme.slug,
        name: theme.name,
        active: theme.active,
        builtIn: theme.builtIn,
        colorScheme: theme.colorScheme,
        backgroundType: theme.backgroundType,
        backgroundColor: theme.backgroundColor,
        backgroundColorEnd: theme.backgroundColorEnd,
        surfaceColor: theme.surfaceColor,
        surfaceAltColor: theme.surfaceAltColor,
        textColor: theme.textColor,
        mutedColor: theme.mutedColor,
        accentColor: theme.accentColor,
        sortOrder: theme.sortOrder,
      })),
      rules: rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        active: rule.active,
        kind: rule.kind,
        themeSlug: rule.themeSlug,
        startTime: rule.startTime,
        endTime: rule.endTime,
        startDate: rule.startDate,
        endDate: rule.endDate,
        recurringAnnual: rule.recurringAnnual,
        priority: rule.priority,
        sortOrder: rule.sortOrder,
      })),
    };
  } catch {
    return { themes: [], rules: [] };
  }
}

export function resolveConfiguredVisualTheme(
  settings: Pick<SystemSettings, "themeMode" | "manualThemeSlug" | "defaultThemeSlug"> | null,
  catalog: VisualThemeCatalog,
  now = new Date(),
) {
  return resolveActiveTheme({
    now,
    settings: {
      mode: settings?.themeMode,
      manualThemeSlug: settings?.manualThemeSlug,
      defaultThemeSlug: settings?.defaultThemeSlug,
    },
    themes: catalog.themes,
    rules: catalog.rules,
  });
}

export function getPreviewTheme(themeSlug: string | undefined, catalog: VisualThemeCatalog) {
  if (!themeSlug) return null;
  return catalog.themes.find((theme) => theme.slug === themeSlug) ?? null;
}
