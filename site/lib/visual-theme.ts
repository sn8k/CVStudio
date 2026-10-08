export const VISUAL_THEME_TIME_ZONE = "Europe/Paris";

export type ThemeColorScheme = "LIGHT" | "DARK";
export type ThemeBackgroundType = "DEFAULT" | "COLOR" | "GRADIENT";
export type ThemeSelectionMode = "AUTO" | "MANUAL";
export type ThemeRuleKind = "TIME" | "CALENDAR";

export type VisualThemeDefinition = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  builtIn: boolean;
  colorScheme: ThemeColorScheme;
  backgroundType: ThemeBackgroundType;
  backgroundColor: string;
  backgroundColorEnd: string | null;
  surfaceColor: string;
  surfaceAltColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  sortOrder: number;
};

export type ThemeScheduleDefinition = {
  id: string;
  name: string;
  active: boolean;
  kind: ThemeRuleKind;
  themeSlug: string;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  recurringAnnual: boolean;
  priority: number;
  sortOrder: number;
};

export type ThemeResolverSettings = {
  mode?: ThemeSelectionMode | string | null;
  manualThemeSlug?: string | null;
  defaultThemeSlug?: string | null;
};

export type ResolvedVisualTheme = {
  theme: VisualThemeDefinition;
  reason: "manual" | "calendar" | "time" | "default" | "fallback";
  ruleId: string | null;
};

export const DEFAULT_VISUAL_THEME: VisualThemeDefinition = {
  id: "builtin-default",
  slug: "default",
  name: "CVStudio historique",
  active: true,
  builtIn: true,
  colorScheme: "DARK",
  backgroundType: "DEFAULT",
  backgroundColor: "#0b1116",
  backgroundColorEnd: null,
  surfaceColor: "#111a21",
  surfaceAltColor: "#162129",
  textColor: "#edf3ef",
  mutedColor: "#a2afa9",
  accentColor: "#9fe7c3",
  sortOrder: 0,
};

const parisDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VISUAL_THEME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parisParts(now: Date) {
  const parts = Object.fromEntries(parisDateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    monthDay: `${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function parseTime(value: string | null) {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function matchesTimeRule(rule: ThemeScheduleDefinition, minutes: number) {
  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function matchesCalendarRule(rule: ThemeScheduleDefinition, date: string, monthDay: string) {
  const start = validDate(rule.startDate);
  const end = validDate(rule.endDate ?? rule.startDate);
  if (!start || !end) return false;
  if (!rule.recurringAnnual) return start <= end && date >= start && date <= end;
  const annualStart = start.slice(5);
  const annualEnd = end.slice(5);
  return annualStart <= annualEnd
    ? monthDay >= annualStart && monthDay <= annualEnd
    : monthDay >= annualStart || monthDay <= annualEnd;
}

function orderedRules(rules: ThemeScheduleDefinition[]) {
  return [...rules].sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
}

export function resolveActiveTheme({
  now,
  settings = {},
  themes = [],
  rules = [],
}: {
  now: Date;
  settings?: ThemeResolverSettings;
  themes?: VisualThemeDefinition[];
  rules?: ThemeScheduleDefinition[];
}): ResolvedVisualTheme {
  const availableThemes = new Map(themes.filter((theme) => theme.active && theme.slug !== "default").map((theme) => [theme.slug, theme]));
  availableThemes.set(DEFAULT_VISUAL_THEME.slug, DEFAULT_VISUAL_THEME);
  const selectedTheme = (slug: string | null | undefined) => slug ? availableThemes.get(slug) : undefined;

  if (settings.mode === "MANUAL") {
    const manualTheme = selectedTheme(settings.manualThemeSlug);
    if (manualTheme) return { theme: manualTheme, reason: "manual", ruleId: null };
  }

  const current = parisParts(now);
  const activeRules = orderedRules(rules.filter((rule) => rule.active && selectedTheme(rule.themeSlug)));
  const calendarRule = activeRules.find((rule) => rule.kind === "CALENDAR" && matchesCalendarRule(rule, current.date, current.monthDay));
  if (calendarRule) return { theme: selectedTheme(calendarRule.themeSlug)!, reason: "calendar", ruleId: calendarRule.id };

  const timeRule = activeRules.find((rule) => rule.kind === "TIME" && matchesTimeRule(rule, current.minutes));
  if (timeRule) return { theme: selectedTheme(timeRule.themeSlug)!, reason: "time", ruleId: timeRule.id };

  const defaultTheme = selectedTheme(settings.defaultThemeSlug);
  if (defaultTheme) return { theme: defaultTheme, reason: "default", ruleId: null };
  return { theme: DEFAULT_VISUAL_THEME, reason: "fallback", ruleId: null };
}

export function visualThemeStyle(theme: VisualThemeDefinition): Record<string, string> {
  if (theme.slug === DEFAULT_VISUAL_THEME.slug) return {};
  const background = theme.backgroundType === "GRADIENT" && theme.backgroundColorEnd
    ? `linear-gradient(145deg, ${theme.backgroundColor}, ${theme.backgroundColorEnd})`
    : theme.backgroundColor;
  const accentContrast = contrastRatio(theme.accentColor, "#ffffff") >= 4.5 ? "#ffffff" : "#07130e";
  return {
    "--theme-color-scheme": theme.colorScheme.toLowerCase(),
    "--theme-page-background": background,
    "--bg": theme.backgroundColor,
    "--bg-deep": theme.backgroundColorEnd ?? theme.backgroundColor,
    "--surface": theme.surfaceColor,
    "--surface-2": theme.surfaceAltColor,
    "--text": theme.textColor,
    "--muted": theme.mutedColor,
    "--faint": `color-mix(in srgb, ${theme.mutedColor} 76%, transparent)`,
    "--line": `color-mix(in srgb, ${theme.textColor} 13%, transparent)`,
    "--line-strong": `color-mix(in srgb, ${theme.textColor} 24%, transparent)`,
    "--mint": theme.accentColor,
    "--mint-soft": `color-mix(in srgb, ${theme.accentColor} 12%, transparent)`,
    "--accent-contrast": accentContrast,
    "--accent-hover": `color-mix(in srgb, ${theme.accentColor} 86%, ${theme.textColor})`,
    "--blue": theme.accentColor,
    "--warm": theme.accentColor,
    "--header-bg": `color-mix(in srgb, ${theme.backgroundColor} 84%, transparent)`,
    "--surface-translucent": `color-mix(in srgb, ${theme.surfaceColor} 72%, transparent)`,
    "--surface-hover": `color-mix(in srgb, ${theme.surfaceAltColor} 86%, transparent)`,
    "--surface-gradient": `linear-gradient(145deg, color-mix(in srgb, ${theme.surfaceAltColor} 94%, transparent), color-mix(in srgb, ${theme.surfaceColor} 72%, transparent))`,
    "--hero-outline": `color-mix(in srgb, ${theme.textColor} 76%, transparent)`,
    "--hero-map-background": `linear-gradient(150deg, color-mix(in srgb, ${theme.surfaceAltColor} 92%, transparent), color-mix(in srgb, ${theme.surfaceColor} 78%, transparent))`,
    "--project-card-background": `linear-gradient(145deg, ${theme.surfaceColor}, ${theme.surfaceAltColor})`,
    "--contact-background": `radial-gradient(circle at 95% 0, color-mix(in srgb, ${theme.accentColor} 10%, transparent), transparent 34%), linear-gradient(145deg, ${theme.surfaceColor}, ${theme.surfaceAltColor})`,
    "--field-bg": `color-mix(in srgb, ${theme.surfaceColor} 58%, transparent)`,
    "--field-focus-bg": `color-mix(in srgb, ${theme.surfaceColor} 82%, transparent)`,
    "--dialog-backdrop": `color-mix(in srgb, ${theme.textColor} 48%, transparent)`,
    "--dialog-header": `color-mix(in srgb, ${theme.surfaceColor} 96%, transparent)`,
    "--grid-line": `color-mix(in srgb, ${theme.textColor} 4%, transparent)`,
  };
}

function relativeLuminance(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function themeContrastIssues(theme: Pick<VisualThemeDefinition, "backgroundColor" | "backgroundColorEnd" | "surfaceColor" | "surfaceAltColor" | "textColor" | "accentColor">) {
  const backgrounds = [theme.backgroundColor, theme.backgroundColorEnd, theme.surfaceColor, theme.surfaceAltColor].filter((value): value is string => Boolean(value));
  const issues: string[] = [];
  if (backgrounds.some((background) => contrastRatio(theme.textColor, background) < 4.5)) issues.push("Le texte doit atteindre un contraste AA (4,5:1) sur tous les fonds.");
  if (contrastRatio(theme.accentColor, theme.backgroundColor) < 3 || contrastRatio(theme.accentColor, theme.surfaceColor) < 3) issues.push("L’accent doit rester distinct du fond et des surfaces (3:1).");
  return issues;
}