BEGIN;

CREATE TABLE "FilterUsageDaily" (
    "id" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FilterUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FilterUsageDaily_filterId_day_key" ON "FilterUsageDaily"("filterId", "day");
CREATE INDEX "FilterUsageDaily_filterSetId_day_idx" ON "FilterUsageDaily"("filterSetId", "day");
CREATE INDEX "FilterUsageDaily_day_idx" ON "FilterUsageDaily"("day");

ALTER TABLE "FilterUsageDaily" ADD CONSTRAINT "FilterUsageDaily_filterId_filterSetId_fkey" FOREIGN KEY ("filterId", "filterSetId") REFERENCES "Filter"("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
