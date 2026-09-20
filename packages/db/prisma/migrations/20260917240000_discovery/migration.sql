-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hashtag_follows" (
    "userId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtag_follows_pkey" PRIMARY KEY ("userId","hashtagId")
);

-- CreateTable
CREATE TABLE "ranking_preferences" (
    "userId" TEXT NOT NULL,
    "peopleIInteractWith" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "newCreators" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "nearby" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lessVideo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "recent_searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discover_impressions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discover_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggested_person_dismisses" (
    "userId" TEXT NOT NULL,
    "suggestedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggested_person_dismisses_pkey" PRIMARY KEY ("userId","suggestedUserId")
);

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "placeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE INDEX "places_name_idx" ON "places"("name");

-- CreateIndex
CREATE INDEX "hashtag_follows_hashtagId_idx" ON "hashtag_follows"("hashtagId");

-- CreateIndex
CREATE UNIQUE INDEX "recent_searches_userId_query_key" ON "recent_searches"("userId", "query");

-- CreateIndex
CREATE INDEX "recent_searches_userId_createdAt_idx" ON "recent_searches"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "discover_impressions_userId_createdAt_idx" ON "discover_impressions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "discover_impressions_postId_idx" ON "discover_impressions"("postId");

-- CreateIndex
CREATE INDEX "posts_placeId_idx" ON "posts"("placeId");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hashtag_follows" ADD CONSTRAINT "hashtag_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hashtag_follows" ADD CONSTRAINT "hashtag_follows_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "hashtags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_preferences" ADD CONSTRAINT "ranking_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discover_impressions" ADD CONSTRAINT "discover_impressions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discover_impressions" ADD CONSTRAINT "discover_impressions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_person_dismisses" ADD CONSTRAINT "suggested_person_dismisses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_person_dismisses" ADD CONSTRAINT "suggested_person_dismisses_suggestedUserId_fkey" FOREIGN KEY ("suggestedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
