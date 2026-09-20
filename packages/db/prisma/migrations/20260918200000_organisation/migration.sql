-- AlterEnum
ALTER TYPE "PostVisibility" ADD VALUE 'circles';
ALTER TYPE "MomentVisibility" ADD VALUE 'circles';

-- CreateEnum
CREATE TYPE "BoardVisibility" AS ENUM ('private', 'shared', 'public');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('post', 'loop', 'moment');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "circles" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_members" (
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_members_pkey" PRIMARY KEY ("circleId","userId")
);

-- CreateTable
CREATE TABLE "post_audiences" (
    "postId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,

    CONSTRAINT "post_audiences_pkey" PRIMARY KEY ("postId","circleId")
);

-- CreateTable
CREATE TABLE "moment_audiences" (
    "momentId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,

    CONSTRAINT "moment_audiences_pkey" PRIMARY KEY ("momentId","circleId")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "BoardVisibility" NOT NULL DEFAULT 'private',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_collaborators" (
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "board_collaborators_pkey" PRIMARY KEY ("boardId","userId")
);

-- CreateTable
CREATE TABLE "board_items" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_follows" (
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_follows_pkey" PRIMARY KEY ("boardId","userId")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circles_ownerId_name_key" ON "circles"("ownerId", "name");

-- CreateIndex
CREATE INDEX "circles_ownerId_idx" ON "circles"("ownerId");

-- CreateIndex
CREATE INDEX "circle_members_userId_idx" ON "circle_members"("userId");

-- CreateIndex
CREATE INDEX "post_audiences_circleId_idx" ON "post_audiences"("circleId");

-- CreateIndex
CREATE INDEX "moment_audiences_circleId_idx" ON "moment_audiences"("circleId");

-- CreateIndex
CREATE INDEX "boards_ownerId_updatedAt_idx" ON "boards"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "boards_visibility_title_idx" ON "boards"("visibility", "title");

-- CreateIndex
CREATE UNIQUE INDEX "boards_one_default_per_owner" ON "boards"("ownerId") WHERE "isDefault" = true;

-- CreateIndex
CREATE INDEX "board_collaborators_userId_idx" ON "board_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "board_items_boardId_postId_key" ON "board_items"("boardId", "postId");

-- CreateIndex
CREATE INDEX "board_items_postId_idx" ON "board_items"("postId");

-- CreateIndex
CREATE INDEX "board_items_boardId_createdAt_idx" ON "board_items"("boardId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "board_follows_userId_idx" ON "board_follows"("userId");

-- CreateIndex
CREATE INDEX "drafts_userId_updatedAt_idx" ON "drafts"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "posts_scheduledAt_publishedAt_idx" ON "posts"("scheduledAt", "publishedAt");

-- AddForeignKey
ALTER TABLE "circles" ADD CONSTRAINT "circles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audiences" ADD CONSTRAINT "post_audiences_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audiences" ADD CONSTRAINT "post_audiences_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_audiences" ADD CONSTRAINT "moment_audiences_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_audiences" ADD CONSTRAINT "moment_audiences_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_collaborators" ADD CONSTRAINT "board_collaborators_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_collaborators" ADD CONSTRAINT "board_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_follows" ADD CONSTRAINT "board_follows_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_follows" ADD CONSTRAINT "board_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
