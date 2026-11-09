CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterSetId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "filterInteractions" INTEGER NOT NULL DEFAULT 0,
    "searchSubmissions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AnalyticsDaily_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AnalyticsDaily_filterSetId_day_key" ON "AnalyticsDaily"("filterSetId", "day");
CREATE INDEX "AnalyticsDaily_day_idx" ON "AnalyticsDaily"("day");

CREATE TABLE "AnalyticsReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterSetId" TEXT NOT NULL,
    "pageHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "AnalyticsReceipt_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AnalyticsReceipt_filterSetId_pageHash_day_idx" ON "AnalyticsReceipt"("filterSetId", "pageHash", "day");
CREATE INDEX "AnalyticsReceipt_day_idx" ON "AnalyticsReceipt"("day");
