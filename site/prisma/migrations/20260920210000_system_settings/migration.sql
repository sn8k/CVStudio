-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "contactFormEnabled" BOOLEAN,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "contactFromEmail" TEXT,
    "contactFromName" TEXT,
    "contactToEmail" TEXT,
    "turnstileSiteKey" TEXT,
    "turnstileSecretEncrypted" TEXT,
    "audienceMeasurementEnabled" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
