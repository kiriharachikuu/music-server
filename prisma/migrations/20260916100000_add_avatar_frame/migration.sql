-- 头像框: 后台维护素材, 用户佩戴后多端同步显示
-- 佩戴关系存 User.avatarFrameId 外键, 删除框自动摘除 (SetNull)

-- CreateTable
CREATE TABLE "AvatarFrame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable 索引
CREATE INDEX "AvatarFrame_sort_status_idx" ON "AvatarFrame"("sort", "status");

-- AlterTable: 用户佩戴的头像框
ALTER TABLE "User" ADD COLUMN "avatarFrameId" TEXT;
CREATE INDEX "User_avatarFrameId_idx" ON "User"("avatarFrameId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFrameId_fkey" FOREIGN KEY ("avatarFrameId") REFERENCES "AvatarFrame"("id") ON DELETE SET NULL ON UPDATE CASCADE;
