-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "themeMode" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "defaultThemeSlug" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "manualThemeSlug" TEXT;

-- CreateTable
CREATE TABLE "VisualTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "colorScheme" TEXT NOT NULL DEFAULT 'DARK',
    "backgroundType" TEXT NOT NULL DEFAULT 'COLOR',
    "backgroundColor" TEXT NOT NULL,
    "backgroundColorEnd" TEXT,
    "surfaceColor" TEXT NOT NULL,
    "surfaceAltColor" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "mutedColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThemeSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL,
    "themeSlug" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "recurringAnnual" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThemeSchedule_themeSlug_fkey" FOREIGN KEY ("themeSlug") REFERENCES "VisualTheme" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VisualTheme_slug_key" ON "VisualTheme"("slug");
CREATE INDEX "VisualTheme_active_sortOrder_idx" ON "VisualTheme"("active", "sortOrder");
CREATE INDEX "ThemeSchedule_active_kind_priority_sortOrder_idx" ON "ThemeSchedule"("active", "kind", "priority", "sortOrder");
CREATE INDEX "ThemeSchedule_themeSlug_idx" ON "ThemeSchedule"("themeSlug");

-- SeedBuiltInThemes
INSERT INTO "VisualTheme" (
    "id", "slug", "name", "active", "builtIn", "colorScheme", "backgroundType", "backgroundColor", "backgroundColorEnd",
    "surfaceColor", "surfaceAltColor", "textColor", "mutedColor", "accentColor", "sortOrder", "updatedAt"
) VALUES
    ('builtin-default', 'default', 'CVStudio historique', true, true, 'DARK', 'DEFAULT', '#0b1116', NULL, '#111a21', '#162129', '#edf3ef', '#a2afa9', '#9fe7c3', 0, CURRENT_TIMESTAMP),
    ('builtin-daylight', 'daylight', 'Lumière du jour', true, true, 'LIGHT', 'GRADIENT', '#f4f7f5', '#e8f1ed', '#ffffff', '#edf3f0', '#14201b', '#52645c', '#167a57', 10, CURRENT_TIMESTAMP);