BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterSet" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSync" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "cursor" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filter" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'metafield',
    "parentKey" TEXT,
    "parentValues" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Filter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterOption" (
    "id" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilterOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "shopifyArticleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '[]',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleOption" (
    "articleId" TEXT NOT NULL,
    "filterOptionId" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,

    CONSTRAINT "ArticleOption_pkey" PRIMARY KEY ("articleId","filterOptionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilterSet_shop_blogId_key" ON "FilterSet"("shop", "blogId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSync_filterSetId_key" ON "ArticleSync"("filterSetId");

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

-- AddForeignKey
ALTER TABLE "ArticleSync" ADD CONSTRAINT "ArticleSync_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filter" ADD CONSTRAINT "Filter_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterOption" ADD CONSTRAINT "FilterOption_filterId_filterSetId_fkey" FOREIGN KEY ("filterId", "filterSetId") REFERENCES "Filter"("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleOption" ADD CONSTRAINT "ArticleOption_articleId_filterSetId_fkey" FOREIGN KEY ("articleId", "filterSetId") REFERENCES "Article"("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleOption" ADD CONSTRAINT "ArticleOption_filterOptionId_filterSetId_fkey" FOREIGN KEY ("filterOptionId", "filterSetId") REFERENCES "FilterOption"("id", "filterSetId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
