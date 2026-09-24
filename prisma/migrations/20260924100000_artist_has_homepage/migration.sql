-- 虚拟歌手: hasHomepage=false 表示仅在歌曲信息里署名、没有公开主页
-- 上传歌曲时输入新名字自动建档; 不出现在公开歌手列表/搜索; 客户端歌手名不可点
-- 存量歌手默认都有主页

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "hasHomepage" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Artist_hasHomepage_idx" ON "Artist"("hasHomepage");
