-- AppVersion 支持多平台独立版本号 + Windows 双形态（安装版/便携版）
-- 1. versionCode 由全局唯一改为 (platform, versionCode) 组合唯一：
--    Android 与 Windows 版本号各自独立递增，互不冲突
-- 2. 新增 variant 字段：full(APK完整包) / setup(Win安装版) / portable(Win便携版)

-- AlterTable
ALTER TABLE "AppVersion" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'full';

-- DropIndex（移除全局唯一约束）
DROP INDEX IF EXISTS "AppVersion_versionCode_key";

-- CreateIndex（平台内唯一）
CREATE UNIQUE INDEX "AppVersion_platform_versionCode_key" ON "AppVersion"("platform", "versionCode");
