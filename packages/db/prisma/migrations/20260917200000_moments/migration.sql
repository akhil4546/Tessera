-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'moment';

-- CreateEnum
CREATE TYPE "MomentVisibility" AS ENUM ('public', 'followers');

-- CreateEnum
CREATE TYPE "MomentStickerKind" AS ENUM ('text', 'drawing', 'mention', 'location', 'hashtag', 'poll', 'question', 'countdown', 'link');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "momentArchiveEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "moments" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "visibility" "MomentVisibility" NOT NULL DEFAULT 'public',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_segments" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_stickers" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "kind" "MomentStickerKind" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_sticker_responses" (
    "id" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_sticker_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_views" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_reactions" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_shelves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reel_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_shelf_items" (
    "id" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "keptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_shelf_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moments_authorId_publishedAt_idx" ON "moments"("authorId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "moments_expiresAt_expiredAt_idx" ON "moments"("expiresAt", "expiredAt");

-- CreateIndex
CREATE INDEX "moment_segments_momentId_sortOrder_idx" ON "moment_segments"("momentId", "sortOrder");

-- CreateIndex
CREATE INDEX "moment_segments_mediaId_idx" ON "moment_segments"("mediaId");

-- CreateIndex
CREATE INDEX "moment_stickers_segmentId_idx" ON "moment_stickers"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "moment_sticker_responses_stickerId_userId_key" ON "moment_sticker_responses"("stickerId", "userId");

-- CreateIndex
CREATE INDEX "moment_sticker_responses_userId_idx" ON "moment_sticker_responses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "moment_views_segmentId_viewerId_key" ON "moment_views"("segmentId", "viewerId");

-- CreateIndex
CREATE INDEX "moment_views_momentId_viewedAt_idx" ON "moment_views"("momentId", "viewedAt");

-- CreateIndex
CREATE INDEX "moment_views_viewerId_viewedAt_idx" ON "moment_views"("viewerId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "moment_reactions_segmentId_userId_key" ON "moment_reactions"("segmentId", "userId");

-- CreateIndex
CREATE INDEX "moment_reactions_momentId_idx" ON "moment_reactions"("momentId");

-- CreateIndex
CREATE INDEX "reel_shelves_userId_sortOrder_idx" ON "reel_shelves"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "reel_shelf_items_shelfId_momentId_key" ON "reel_shelf_items"("shelfId", "momentId");

-- CreateIndex
CREATE INDEX "reel_shelf_items_momentId_idx" ON "reel_shelf_items"("momentId");

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_segments" ADD CONSTRAINT "moment_segments_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_segments" ADD CONSTRAINT "moment_segments_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_stickers" ADD CONSTRAINT "moment_stickers_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "moment_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_sticker_responses" ADD CONSTRAINT "moment_sticker_responses_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "moment_stickers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_sticker_responses" ADD CONSTRAINT "moment_sticker_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_views" ADD CONSTRAINT "moment_views_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_views" ADD CONSTRAINT "moment_views_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "moment_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_views" ADD CONSTRAINT "moment_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_reactions" ADD CONSTRAINT "moment_reactions_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_reactions" ADD CONSTRAINT "moment_reactions_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "moment_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_reactions" ADD CONSTRAINT "moment_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_shelves" ADD CONSTRAINT "reel_shelves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_shelves" ADD CONSTRAINT "reel_shelves_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_shelf_items" ADD CONSTRAINT "reel_shelf_items_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "reel_shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_shelf_items" ADD CONSTRAINT "reel_shelf_items_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
