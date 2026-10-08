-- Privacy-friendly public traffic counter: one row per calendar day.
CREATE TABLE "DailyPageView" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "views" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
