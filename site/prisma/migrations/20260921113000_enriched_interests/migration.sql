-- Enrich existing interests without changing or deleting their current data.
ALTER TABLE "Interest" ADD COLUMN "description" TEXT;

-- Reuse the existing Media model for an optional interest image.
ALTER TABLE "Media" ADD COLUMN "interestId" TEXT REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Media_interestId_kind_sortOrder_idx" ON "Media"("interestId", "kind", "sortOrder");

-- This description is backed by the repository's electronics and home-automation content notes.
UPDATE "Interest"
SET "description" = 'Microcontrôleurs, capteurs, intégrations domestiques et bidouille.'
WHERE "label" = 'Électronique' AND "description" IS NULL;
