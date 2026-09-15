-- 跨端续播: 每用户一条最新播放状态
-- 任意端 (Web / TWA / PC 客户端) 播放时上报, 切换设备后可从上次进度继续

-- CreateTable
CREATE TABLE "PlaybackState" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT,
    "clipId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "queueIds" TEXT,
    "device" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable 索引
CREATE INDEX "PlaybackState_updatedAt_idx" ON "PlaybackState"("updatedAt");

-- AddForeignKey
ALTER TABLE "PlaybackState" ADD CONSTRAINT "PlaybackState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
