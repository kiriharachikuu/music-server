/**
 * XT-Music 存储迁移脚本（3.2.3）
 *
 * 功能：将本地 uploads/ 目录下的音频/图片等文件迁移到 S3（或兼容对象存储），
 *       并将数据库中引用了本地 URL 的字段更新为 S3 公开 URL。
 *
 * 用法：
 *   node scripts/migrate_to_s3.js [--dry-run] [--force]
 *
 * 参数：
 *   --dry-run   仅打印将迁移的文件列表，不实际上传、不更新数据库
 *   --force      跳过确认提示，直接迁移（默认需输入 y 确认）
 *
 * 所需环境变量（从 .env 自动加载，dotenv 为项目已有依赖）：
 *   DATABASE_URL          SQLite 数据库路径（如 file:./dev.db）
 *   LOCAL_STORAGE_PATH    本地存储根目录（默认 ./uploads）
 *   S3_BUCKET             S3 存储桶名
 *   S3_REGION             S3 区域（如 us-east-1）
 *   S3_ACCESS_KEY         S3 访问密钥 ID（兼容 S3_ACCESS_KEY_ID）
 *   S3_SECRET_KEY         S3 访问密钥（兼容 S3_SECRET_ACCESS_KEY）
 *   S3_ENDPOINT           S3 端点（自定义域名 / 兼容服务如 R2、MinIO）
 *   S3_PUBLIC_DOMAIN      S3 公开访问域名（如 https://cdn.example.com，兼容 S3_PUBLIC_URL）
 *
 * 注意事项：
 *   - S3 key 保持与本地 uploads/ 的相对路径结构一致（如 audio/2025-07/xxx.mp3）
 *   - 数据库中匹配 /uploads/{相对路径} 的记录会被替换为 S3 公开 URL
 *   - 单文件迁移失败不会中断整体流程，最终打印统计
 *   - 已迁移过的记录（S3 URL）不会被重复匹配，重复运行安全
 *   - 运行前请确保已执行 prisma generate
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');

// ============ 配置读取 ============
const LOCAL_ROOT = path.resolve(
  process.cwd(),
  process.env.LOCAL_STORAGE_PATH || './uploads',
);
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || '';
const S3_ACCESS_KEY =
  process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_KEY =
  process.env.S3_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_PUBLIC_DOMAIN =
  process.env.S3_PUBLIC_DOMAIN || process.env.S3_PUBLIC_URL || '';

/** 本地静态资源对外暴露的 URL 前缀（与 LocalStorageService.URL_PREFIX 一致） */
const URL_PREFIX = '/uploads';

/**
 * 需要扫描并更新的数据库 URL 字段
 * 覆盖所有可能引用本地 uploads 文件的字段
 */
const URL_FIELDS = [
  { model: 'song', field: 'fileUrl' },
  { model: 'song', field: 'coverUrl' },
  { model: 'song', field: 'lyricUrl' },
  { model: 'album', field: 'cover' },
  { model: 'playlist', field: 'cover' },
  { model: 'banner', field: 'imageUrl' },
  { model: 'user', field: 'avatar' },
  { model: 'appVersion', field: 'downloadUrl' },
];

// ============ 工具函数 ============

/**
 * 计算 S3 公开访问 URL
 * 与 s3-storage.service.ts 的 getUrl 逻辑一致
 */
function getS3Url(key) {
  const base = S3_PUBLIC_DOMAIN || `https://${S3_BUCKET}.s3.amazonaws.com`;
  return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

/** 根据扩展名推断 ContentType */
function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.lrc': 'text/plain',
    '.txt': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * 递归扫描目录，返回所有普通文件的绝对路径
 */
async function walk(dir) {
  let results = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`无法读取目录 ${dir}：${e.message}`);
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/** 命令行参数解析 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  };
}

/** y/n 确认提示 */
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^[yY]/.test(answer.trim()));
    });
  });
}

/**
 * 更新数据库中引用了 localUrl 的字段为 s3Url
 * 遍历所有可能的 URL 字段，逐个 updateMany，返回受影响记录总数
 */
async function updateDbReferences(prisma, localUrl, s3Url) {
  let total = 0;
  for (const { model, field } of URL_FIELDS) {
    try {
      const result = await prisma[model].updateMany({
        where: { [field]: { contains: localUrl } },
        data: { [field]: s3Url },
      });
      total += result.count || 0;
    } catch (e) {
      // 某个模型更新失败时打印但不中断后续字段
      console.error(`  数据库更新失败 [${model}.${field}]：${e.message}`);
    }
  }
  return total;
}

// ============ 主流程 ============

let prisma = null;

async function main() {
  const { dryRun, force } = parseArgs();
  console.log('XT-Music 存储迁移脚本');
  console.log(
    `模式：${dryRun ? 'DRY-RUN（预演，不上传不更新数据库）' : '实际迁移'}`,
  );
  console.log(`本地目录：${LOCAL_ROOT}`);
  console.log(`S3 Bucket：${S3_BUCKET || '(未配置)'}`);
  console.log(
    `S3 公开域名：${S3_PUBLIC_DOMAIN || '(未配置，将使用 bucket 默认域名)'}`,
  );
  console.log('');

  // 校验基础配置
  if (!S3_BUCKET) {
    console.error('错误：未配置 S3_BUCKET 环境变量');
    process.exit(1);
  }
  if (!fs.existsSync(LOCAL_ROOT)) {
    console.error(`错误：本地存储目录不存在 ${LOCAL_ROOT}`);
    process.exit(1);
  }

  // 扫描本地文件
  console.log('扫描本地文件...');
  const files = await walk(LOCAL_ROOT);
  if (files.length === 0) {
    console.log('本地目录为空，无需迁移。');
    return;
  }
  console.log(`共发现 ${files.length} 个文件。`);
  console.log('');

  // dry-run 模式：仅打印预演清单
  if (dryRun) {
    console.log('=== DRY-RUN 预演 ===');
    files.forEach((absPath, i) => {
      const relPath = path
        .relative(LOCAL_ROOT, absPath)
        .split(path.sep)
        .join('/');
      const key = relPath;
      const s3Url = getS3Url(key);
      console.log(`[${i + 1}/${files.length}] ${relPath} -> ${s3Url}`);
    });
    console.log('');
    console.log(`预演完成：共 ${files.length} 个文件待迁移。`);
    return;
  }

  // 实际迁移 - 校验 S3 凭证
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
    console.error(
      '错误：未配置 S3 访问密钥（S3_ACCESS_KEY / S3_SECRET_KEY）',
    );
    process.exit(1);
  }

  // 确认提示（--force 跳过）
  if (!force) {
    const ok = await confirm(
      `即将迁移 ${files.length} 个文件到 S3 (${S3_BUCKET}) 并更新数据库，是否继续？[y/N] `,
    );
    if (!ok) {
      console.log('已取消。');
      return;
    }
  }

  // 初始化 S3 客户端（与 s3-storage.service.ts 配置一致）
  const s3 = new S3Client({
    region: S3_REGION || undefined,
    endpoint: S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
  });

  prisma = new PrismaClient();

  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  let dbUpdated = 0;

  for (let i = 0; i < files.length; i++) {
    const absPath = files[i];
    const filename = path.basename(absPath);
    const relPath = path
      .relative(LOCAL_ROOT, absPath)
      .split(path.sep)
      .join('/');
    const key = relPath;
    const s3Url = getS3Url(key);
    const localUrl = `${URL_PREFIX}/${relPath}`;

    try {
      const body = await fs.promises.readFile(absPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: guessContentType(absPath),
        }),
      );
      const updated = await updateDbReferences(prisma, localUrl, s3Url);
      dbUpdated += updated;
      migrated += 1;
      console.log(
        `[${i + 1}/${files.length}] ${filename} - 成功${updated > 0 ? `（数据库更新 ${updated} 条）` : ''}`,
      );
    } catch (e) {
      failed += 1;
      console.error(
        `[${i + 1}/${files.length}] ${filename} - 失败：${e.message}`,
      );
    }
  }

  console.log('');
  console.log('=== 迁移完成 ===');
  console.log(
    `迁移 ${migrated} 个，失败 ${failed} 个，跳过 ${skipped} 个，数据库记录更新 ${dbUpdated} 条`,
  );
}

main()
  .catch((e) => {
    console.error('迁移脚本异常：', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
