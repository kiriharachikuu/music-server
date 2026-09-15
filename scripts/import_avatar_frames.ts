// 运行：npx tsx scripts/import_avatar_frames.ts [素材目录]
// 默认素材目录：仓库根目录 /头像框
//
// 头像框素材导入脚本：
//  - 读取素材目录下的 .png/.webp/.jpg 图片
//  - 复制到本地存储 image/{年月}/{uuid}.{ext}（与 LocalStorageService 落盘规则一致）
//  - 按「文件名（去扩展名）」在 AvatarFrame 表中幂等创建记录（已存在则跳过）
//  - sort 接在现有最大 sort 之后
//  - 仅支持 STORAGE_DRIVER=local；S3/COS 请走后台上传
import 'dotenv/config';
import * as fs from 'fs';
import * as fsP from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IMAGE_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg']);

async function main() {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver !== 'local') {
    console.error(`当前 STORAGE_DRIVER=${driver}，本脚本仅支持 local 模式；请改用后台上传。`);
    process.exit(1);
  }

  const scriptDir = __dirname;
  const defaultDir = path.resolve(scriptDir, '../../头像框');
  const sourceDir = path.resolve(process.argv[2] || defaultDir);

  if (!fs.existsSync(sourceDir)) {
    console.error(`素材目录不存在: ${sourceDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort();
  if (!files.length) {
    console.log(`素材目录中没有图片: ${sourceDir}`);
    return;
  }

  // 本地存储根目录（与 LocalStorageService 保持一致）
  const configured = process.env.LOCAL_STORAGE_PATH || './uploads';
  const root = path.resolve(process.cwd(), configured);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 接在现有最大 sort 之后
  const last = await prisma.avatarFrame.findFirst({ orderBy: { sort: 'desc' } });
  let sort = last?.sort ?? 0;

  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    const existing = await prisma.avatarFrame.findFirst({ where: { name } });
    if (existing) {
      console.log(`跳过（已存在）: ${name}`);
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(root, 'image', ym);
    await fsP.mkdir(dir, { recursive: true });
    await fsP.copyFile(path.join(sourceDir, file), path.join(dir, filename));

    const relPath = `image/${ym}/${filename}`;
    const imageUrl = `/uploads/${relPath}`;
    sort += 1;

    const frame = await prisma.avatarFrame.create({
      data: { name, imageUrl, sort, status: 'VISIBLE' },
    });
    console.log(`已导入: ${name} -> ${imageUrl} (sort=${frame.sort})`);
  }

  console.log('导入完成');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
