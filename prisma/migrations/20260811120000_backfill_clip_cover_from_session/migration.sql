-- ============================================================
-- v1.5.0 后续补丁：把历史歌切的 coverUrl 从所属直播场次回填
-- ============================================================
-- 目的：解决歌切没有自定义封面、又未继承场次封面导致的列表/播放器空封面
-- 逻辑：对每一条 coverUrl 为空的歌切，尝试从所属 LiveSession 拉一份 cover
-- 注意：使用 UPDATE ... FROM（SQLite 3.33+ 支持）
-- 若 clip 自身已有 coverUrl，则跳过（保留用户上传的自定义封面）

UPDATE "LiveClip"
SET "coverUrl" = (
  SELECT "LiveSession"."cover"
  FROM "LiveSession"
  WHERE "LiveSession"."id" = "LiveClip"."sessionId"
    AND "LiveSession"."cover" IS NOT NULL
    AND TRIM("LiveSession"."cover") != ''
)
WHERE "coverUrl" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "LiveSession"
    WHERE "LiveSession"."id" = "LiveClip"."sessionId"
      AND "LiveSession"."cover" IS NOT NULL
      AND TRIM("LiveSession"."cover") != ''
  );
