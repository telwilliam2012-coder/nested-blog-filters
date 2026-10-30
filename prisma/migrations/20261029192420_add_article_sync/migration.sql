-- CreateTable
CREATE TABLE "ArticleSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterSetId" TEXT NOT NULL,
    "cursor" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ArticleSync_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FilterSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FilterSet" ("blogId", "createdAt", "id", "name", "shop", "updatedAt") SELECT "blogId", "createdAt", "id", "name", "shop", "updatedAt" FROM "FilterSet";
DROP TABLE "FilterSet";
ALTER TABLE "new_FilterSet" RENAME TO "FilterSet";
CREATE UNIQUE INDEX "FilterSet_shop_blogId_key" ON "FilterSet"("shop", "blogId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSync_filterSetId_key" ON "ArticleSync"("filterSetId");
