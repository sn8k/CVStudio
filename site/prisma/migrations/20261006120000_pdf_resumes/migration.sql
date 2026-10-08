CREATE TABLE "PdfResume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "SystemSettings" ADD COLUMN "activePdfResumeId" TEXT;
