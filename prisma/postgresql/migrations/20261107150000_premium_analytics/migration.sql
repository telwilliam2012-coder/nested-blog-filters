BEGIN;

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "filterInteractions" INTEGER NOT NULL DEFAULT 0,
    "searchSubmissions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsReceipt" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "pageHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "AnalyticsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsDaily_day_idx" ON "AnalyticsDaily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_filterSetId_day_key" ON "AnalyticsDaily"("filterSetId", "day");

-- CreateIndex
CREATE INDEX "AnalyticsReceipt_filterSetId_pageHash_day_idx" ON "AnalyticsReceipt"("filterSetId", "pageHash", "day");

-- CreateIndex
CREATE INDEX "AnalyticsReceipt_day_idx" ON "AnalyticsReceipt"("day");

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsReceipt" ADD CONSTRAINT "AnalyticsReceipt_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
