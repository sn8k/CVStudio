-- Existing public links were rendered in Contact only. Keep that behavior.
ALTER TABLE "Link" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'CONTACT';

-- Existing projects participate in rotation unless explicitly changed later.
ALTER TABLE "Project" ADD COLUMN "displayMode" TEXT NOT NULL DEFAULT 'ROTATING';
