-- Add private editorial notes. These columns are never serialized to public snapshots.
ALTER TABLE "Profile" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Experience" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Education" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Language" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Interest" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Project" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "Link" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "ExtraSection" ADD COLUMN "privateNotes" TEXT;

-- A position progression belongs to one experience and accepts imprecise date labels.
CREATE TABLE "ExperienceStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startDateLabel" TEXT,
    "endDateLabel" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "privateNotes" TEXT,
    "experienceId" TEXT NOT NULL,
    CONSTRAINT "ExperienceStage_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Editorial blocks replace the fixed three-section form without deleting the V1 tables.
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'FREEFORM',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "privateNotes" TEXT,
    "experienceId" TEXT NOT NULL,
    CONSTRAINT "ContentBlock_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "privateNotes" TEXT,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "ContentItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ContentBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ExperienceStageSkill" (
    "stageId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    PRIMARY KEY ("stageId", "skillId"),
    CONSTRAINT "ExperienceStageSkill_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ExperienceStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExperienceStageSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ContentBlockSkill" (
    "blockId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    PRIMARY KEY ("blockId", "skillId"),
    CONSTRAINT "ContentBlockSkill_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ContentBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentBlockSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ContentItemSkill" (
    "itemId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    PRIMARY KEY ("itemId", "skillId"),
    CONSTRAINT "ContentItemSkill_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentItemSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectSkill" (
    "projectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    PRIMARY KEY ("projectId", "skillId"),
    CONSTRAINT "ProjectSkill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SQLite needs a table rebuild to add the capability kind and snapshot version defaults.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOMAIN',
    "privateNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Skill" ("active", "description", "family", "id", "label", "slug", "sortOrder", "status")
SELECT "active", "description", "family", "id", "label", "slug", "sortOrder", "status" FROM "Skill";
DROP TABLE "Skill";
ALTER TABLE "new_Skill" RENAME TO "Skill";
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

CREATE TABLE "new_PublishedSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PublishedSnapshot" ("createdAt", "data", "id", "note")
SELECT "createdAt", "data", "id", "note" FROM "PublishedSnapshot";
DROP TABLE "PublishedSnapshot";
ALTER TABLE "new_PublishedSnapshot" RENAME TO "PublishedSnapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "ExperienceStage_experienceId_sortOrder_idx" ON "ExperienceStage"("experienceId", "sortOrder");
CREATE INDEX "ContentBlock_experienceId_sortOrder_idx" ON "ContentBlock"("experienceId", "sortOrder");
CREATE INDEX "ContentItem_blockId_sortOrder_idx" ON "ContentItem"("blockId", "sortOrder");

-- Preserve every V1 section and mission. Only a block literally named "Missions"
-- is classified automatically; all other headings remain LEGACY to avoid guessing.
INSERT INTO "ContentBlock" ("id", "type", "title", "active", "sortOrder", "privateNotes", "experienceId")
SELECT
  'block-' || "id",
  CASE WHEN lower(trim("title")) = 'missions' THEN 'MISSIONS' ELSE 'LEGACY' END,
  "title",
  true,
  "sortOrder",
  CASE WHEN lower(trim("title")) = 'missions' THEN NULL ELSE 'Import V1 : classification éditoriale à confirmer.' END,
  "experienceId"
FROM "ExperienceSection";

INSERT INTO "ContentItem" ("id", "content", "active", "sortOrder", "blockId")
SELECT 'item-' || "id", "text", true, "sortOrder", 'block-' || "sectionId"
FROM "Mission";

-- Existing role strings remain as a compatibility fallback.
INSERT INTO "ExperienceStage" ("id", "title", "active", "sortOrder", "experienceId")
SELECT 'stage-' || "id" || '-0',
  "role",
  true, 0, "id"
FROM "Experience";

-- Only three existing labels are unambiguously environments/technologies.
UPDATE "Skill" SET "kind" = 'TECHNOLOGY' WHERE "slug" IN ('windows', 'mac', 'linux');
