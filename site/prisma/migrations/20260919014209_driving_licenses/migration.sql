-- CreateTable
CREATE TABLE "DrivingLicense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_HELD',
    "note" TEXT,
    "obtainedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publicationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "privateNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DrivingLicense_label_key" ON "DrivingLicense"("label");
