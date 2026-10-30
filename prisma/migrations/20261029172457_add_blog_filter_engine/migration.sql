-- CreateTable
CREATE TABLE "FilterSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Filter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Filter_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilterOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterId" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilterOption_filterId_filterSetId_fkey" FOREIGN KEY ("filterId", "filterSetId") REFERENCES "Filter" ("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterSetId" TEXT NOT NULL,
    "shopifyArticleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleOption" (
    "articleId" TEXT NOT NULL,
    "filterOptionId" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,

    PRIMARY KEY ("articleId", "filterOptionId"),
    CONSTRAINT "ArticleOption_articleId_filterSetId_fkey" FOREIGN KEY ("articleId", "filterSetId") REFERENCES "Article" ("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleOption_filterOptionId_filterSetId_fkey" FOREIGN KEY ("filterOptionId", "filterSetId") REFERENCES "FilterOption" ("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FilterSet_shop_blogId_key" ON "FilterSet"("shop", "blogId");

-- CreateIndex
CREATE INDEX "Filter_filterSetId_position_idx" ON "Filter"("filterSetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Filter_id_filterSetId_key" ON "Filter"("id", "filterSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Filter_filterSetId_key_key" ON "Filter"("filterSetId", "key");

-- CreateIndex
CREATE INDEX "FilterOption_filterId_position_idx" ON "FilterOption"("filterId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FilterOption_id_filterSetId_key" ON "FilterOption"("id", "filterSetId");

-- CreateIndex
CREATE UNIQUE INDEX "FilterOption_filterId_value_key" ON "FilterOption"("filterId", "value");

-- CreateIndex
CREATE INDEX "Article_filterSetId_publishedAt_id_idx" ON "Article"("filterSetId", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Article_id_filterSetId_key" ON "Article"("id", "filterSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_filterSetId_shopifyArticleId_key" ON "Article"("filterSetId", "shopifyArticleId");

-- CreateIndex
CREATE INDEX "ArticleOption_articleId_filterSetId_idx" ON "ArticleOption"("articleId", "filterSetId");

-- CreateIndex
CREATE INDEX "ArticleOption_filterOptionId_filterSetId_idx" ON "ArticleOption"("filterOptionId", "filterSetId");
