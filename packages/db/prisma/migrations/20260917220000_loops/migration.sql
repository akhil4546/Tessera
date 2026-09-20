-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'loop';

-- CreateEnum
CREATE TYPE "CaptionStatus" AS ENUM ('pending', 'ready', 'skipped', 'failed');

-- CreateIndex
CREATE INDEX "posts_kind_publishedAt_idx" ON "posts"("kind", "publishedAt" DESC);

-- CreateTable
CREATE TABLE "loops" (
    "postId" TEXT NOT NULL,
    "coverFrameMs" INTEGER NOT NULL DEFAULT 0,
    "allowAudioReuse" BOOLEAN NOT NULL DEFAULT true,
    "audioTrackId" TEXT,
    "captionStatus" "CaptionStatus" NOT NULL DEFAULT 'pending',
    "captionError" TEXT,
    "captionsKey" TEXT,
    "overlays" JSONB NOT NULL DEFAULT '[]',
    "clips" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loops_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "audio_tracks" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourcePostId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Original audio',
    "allowReuse" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER NOT NULL,
    "audioKey" TEXT NOT NULL,
    "waveform" JSONB NOT NULL DEFAULT '[]',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wellbeing_settings" (
    "userId" TEXT NOT NULL,
    "loopsBudgetMinutes" INTEGER,
    "loopsBonusMinutes" INTEGER NOT NULL DEFAULT 0,
    "loopsBonusOn" DATE,
    "loopsDismissedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wellbeing_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "watch_time_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "seconds" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loops_audioTrackId_idx" ON "loops"("audioTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_tracks_sourcePostId_key" ON "audio_tracks"("sourcePostId");

-- CreateIndex
CREATE INDEX "audio_tracks_ownerId_createdAt_idx" ON "audio_tracks"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "watch_time_logs_userId_day_idx" ON "watch_time_logs"("userId", "day");

-- CreateIndex
CREATE INDEX "watch_time_logs_postId_idx" ON "watch_time_logs"("postId");

-- AddForeignKey
ALTER TABLE "loops" ADD CONSTRAINT "loops_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loops" ADD CONSTRAINT "loops_audioTrackId_fkey" FOREIGN KEY ("audioTrackId") REFERENCES "audio_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellbeing_settings" ADD CONSTRAINT "wellbeing_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_time_logs" ADD CONSTRAINT "watch_time_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_time_logs" ADD CONSTRAINT "watch_time_logs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
