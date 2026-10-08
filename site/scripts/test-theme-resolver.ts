import assert from "node:assert/strict";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
// @ts-expect-error The shared migration helper is intentionally plain JavaScript.
import { deployMigrationsOnCopy } from "./test-database.mjs";
import {
  DEFAULT_VISUAL_THEME,
  resolveActiveTheme,
  themeContrastIssues,
  type ThemeScheduleDefinition,
  type VisualThemeDefinition,
} from "../lib/visual-theme";

const daylight: VisualThemeDefinition = {
  ...DEFAULT_VISUAL_THEME,
  id: "daylight",
  slug: "daylight",
  name: "Lumière du jour",
  colorScheme: "LIGHT",
  backgroundType: "GRADIENT",
  backgroundColor: "#f4f7f5",
  backgroundColorEnd: "#e8f1ed",
  surfaceColor: "#ffffff",
  surfaceAltColor: "#edf3f0",
  textColor: "#14201b",
  mutedColor: "#52645c",
  accentColor: "#167a57",
  sortOrder: 10,
};
const midnight: VisualThemeDefinition = { ...DEFAULT_VISUAL_THEME, id: "midnight", slug: "midnight", name: "Minuit", sortOrder: 20 };
const disabled: VisualThemeDefinition = { ...daylight, id: "disabled", slug: "disabled", name: "Désactivé", active: false };

function rule(values: Partial<ThemeScheduleDefinition> & Pick<ThemeScheduleDefinition, "id" | "kind" | "themeSlug">): ThemeScheduleDefinition {
  return {
    name: values.id,
    active: true,
    startTime: null,
    endTime: null,
    startDate: null,
    endDate: null,
    recurringAnnual: false,
    priority: 0,
    sortOrder: 0,
    ...values,
  };
}

const dayRule = rule({ id: "day", kind: "TIME", themeSlug: "daylight", startTime: "07:00", endTime: "19:00" });
const nightRule = rule({ id: "night", kind: "TIME", themeSlug: "midnight", startTime: "19:00", endTime: "07:00" });
const christmasRule = rule({ id: "christmas", kind: "CALENDAR", themeSlug: "daylight", startDate: "2026-12-24", endDate: "2026-12-26", recurringAnnual: true, priority: 10 });

assert.equal(resolveActiveTheme({ now: new Date("2026-06-01T10:00:00Z") }).theme.slug, "default", "Aucun réglage ne conserve le thème historique.");
assert.equal(resolveActiveTheme({ now: new Date(), settings: { mode: "MANUAL", manualThemeSlug: "daylight" }, themes: [daylight] }).reason, "manual");
assert.equal(resolveActiveTheme({ now: new Date("2026-06-01T10:00:00Z"), themes: [daylight, midnight], rules: [dayRule, nightRule] }).theme.slug, "daylight", "Midi à Paris n’utilise pas le thème jour.");
assert.equal(resolveActiveTheme({ now: new Date("2026-06-01T21:00:00Z"), themes: [daylight, midnight], rules: [dayRule, nightRule] }).theme.slug, "midnight", "La nuit à Paris n’utilise pas le thème nuit.");
assert.equal(resolveActiveTheme({ now: new Date("2026-06-01T03:00:00Z"), themes: [midnight], rules: [nightRule] }).ruleId, "night", "La plage traversant minuit ne couvre pas le matin.");
assert.equal(resolveActiveTheme({ now: new Date("2026-12-25T11:00:00Z"), themes: [daylight, midnight], rules: [dayRule, nightRule, christmasRule] }).reason, "calendar", "Le calendrier ne prime pas sur l’horaire.");
assert.equal(resolveActiveTheme({ now: new Date("2027-12-25T11:00:00Z"), themes: [daylight], rules: [christmasRule] }).ruleId, "christmas", "L’événement annuel ne se répète pas.");
const newYear = rule({ id: "new-year", kind: "CALENDAR", themeSlug: "daylight", startDate: "2026-12-30", endDate: "2027-01-02", recurringAnnual: true });
assert.equal(resolveActiveTheme({ now: new Date("2028-01-01T11:00:00Z"), themes: [daylight], rules: [newYear] }).ruleId, "new-year", "L’intervalle annuel traversant janvier échoue.");
assert.equal(resolveActiveTheme({ now: new Date("2026-12-25T22:00:00Z"), settings: { mode: "MANUAL", manualThemeSlug: "midnight" }, themes: [daylight, midnight], rules: [christmasRule] }).theme.slug, "midnight", "Le mode manuel ne prime pas sur le calendrier.");
assert.equal(resolveActiveTheme({ now: new Date(), settings: { mode: "MANUAL", manualThemeSlug: "disabled" }, themes: [disabled] }).theme.slug, "default", "Un thème désactivé peut être forcé.");
const invalidRule = rule({ id: "invalid", kind: "TIME", themeSlug: "daylight", startTime: "25:00", endTime: "07:00" });
assert.equal(resolveActiveTheme({ now: new Date(), themes: [daylight], rules: [invalidRule] }).theme.slug, "default", "Une règle invalide ne déclenche pas le fallback.");
assert.equal(resolveActiveTheme({ now: new Date(), settings: { defaultThemeSlug: "missing" }, themes: [daylight] }).reason, "fallback", "Un thème par défaut inconnu ne revient pas au thème historique.");
assert(themeContrastIssues({ ...daylight, textColor: "#f4f7f5" }).length > 0, "Une palette illisible passe la validation de contraste.");

async function validateMigration() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const artifacts = fileURLToPath(new URL("../.test-artifacts/", import.meta.url));
  const sourceDatabase = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
  const databasePath = fileURLToPath(new URL("../.test-artifacts/themes-migration.db", import.meta.url));
  await mkdir(artifacts, { recursive: true });
  await copyFile(sourceDatabase, databasePath);
  const before = new DatabaseSync(databasePath);
  const preservedTables = ["Profile", "Experience", "Project", "Skill", "User", "Session", "DailyPageView", "SystemSettings", "PublishedSnapshot"];
  const counts = Object.fromEntries(preservedTables.map((table) => [table, before.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()!.count]));
  before.exec('DROP TABLE IF EXISTS "ThemeSchedule"; DROP TABLE IF EXISTS "VisualTheme";');
  const settingsColumns = before.prepare('PRAGMA table_info("SystemSettings")').all().map((column) => String(column.name));
  for (const column of ["themeMode", "defaultThemeSlug", "manualThemeSlug"]) {
    if (settingsColumns.includes(column)) before.exec(`ALTER TABLE "SystemSettings" DROP COLUMN "${column}"`);
  }
  before.prepare('DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?').run("20260920223000_visual_themes");
  before.close();

  try {
    deployMigrationsOnCopy(root, databasePath);
    const migrated = new DatabaseSync(databasePath);
    for (const table of preservedTables) {
      assert.equal(migrated.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()!.count, counts[table], `La migration modifie ${table}.`);
    }
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM "VisualTheme"').get()!.count, 2, "La migration ne crée pas les deux thèmes intégrés.");
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM "ThemeSchedule"').get()!.count, 0, "La migration active implicitement des règles.");
    const historical = migrated.prepare('SELECT * FROM "VisualTheme" WHERE "slug" = ?').get("default");
    assert(historical, "Le thème historique migré est absent.");
    assert.equal(historical.backgroundColor, DEFAULT_VISUAL_THEME.backgroundColor, "La palette historique migrée diverge du fallback codé.");
    assert.equal(historical.active, 1, "Le fallback historique n’est pas actif.");
    migrated.close();
  } finally {
    await rm(databasePath, { force: true });
  }
}

validateMigration()
  .then(() => console.log(JSON.stringify({ fallback: "default", manual: "ok", time: "day night midnight", calendar: "single range annual cross-year", priority: "manual calendar time default", invalid: "ignored", timeZone: "Europe/Paris", migration: "additive two built-ins no rules" })))
  .catch((error) => { console.error(error); process.exitCode = 1; });