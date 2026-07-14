/**
 * XT-Music 存储迁移脚本（v2.0）
 *
 * 功能：将本地 uploads/ 目录下的音频/图片等文件迁移到对象存储（S3 兼容 / 腾讯云 COS），
 *       并将数据库中引用了本地 URL 的字段更新为对象存储公开 URL。
 *
 * 用法：
 *   node scripts/migrate_to_s3.js [--dry-run] [--force] [--resume] [--verify]
 *
 * 参数：
 *   --dry-run   仅打印将迁移的文件列表，不实际上传、不更新数据库
 *   --force      跳过确认提示，直接迁移（默认需输入 y 确认）
 *   --resume     从上次中断处继续（读取 .migrate-state.json）
 *   --verify     迁移完成后校验已上传文件的完整性
 *
 * 所需环境变量（从 .env 自动加载，与 config-v1.js 简洁风格一致）：
 *   DATABASE_URL              SQLite 数据库路径
 *   STORAGE_DRIVER            s3 | cos
 *   LOCAL_STORAGE_PATH        本地存储根目录（默认 ./uploads）
 *   STORAGE_BUCKET            存储桶名称
 *   STORAGE_REGION            存储桶所在地域
 *   STORAGE_SECRET_ID         SecretId / AccessKey
 *   STORAGE_SECRET_KEY        SecretKey
 *   STORAGE_SESSION_TOKEN     临时密钥 SessionToken（可选）
 *   STORAGE_ENDPOINT          S3 Endpoint（仅 S3 兼容服务需要，COS 无需）
 *   STORAGE_PUBLIC_DOMAIN     公开访问域名（可选，默认使用存储桶默认域名）
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');

// ============ 配置读取（与 config-v1.js 简洁风格一致）============
const DRIVER = (process.env.STORAGE_DRIVER || 's3').toLowerCase();
const LOCAL_ROOT = path.resolve(
  process.cwd(),
  process.env.LOCAL_STORAGE_PATH || './uploads',
);
const BUCKET = process.env.STORAGE_BUCKET || '';
const REGION = process.env.STORAGE_REGION || '';
const SECRET_ID = process.env.STORAGE_SECRET_ID || '';
const SECRET_KEY = process.env.STORAGE_SECRET_KEY || '';
const SESSION_TOKEN = process.env.STORAGE_SESSION_TOKEN || '';
const ENDPOINT = process.env.STORAGE_ENDPOINT || '';
const PUBLIC_DOMAIN = process.env.STORAGE_PUBLIC_DOMAIN || '';

const URL_PREFIX = '/uploads';
const STATE_FILE = path.resolve(process.cwd(), '.migrate-state.json');

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

function getPublicUrl(key) {
  if (DRIVER === 'cos') {
    return `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key.replace(/^\/+/, '')}`;
  }
  const base = PUBLIC_DOMAIN || `https://${BUCKET}.s3.amazonaws.com`;
  return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.lrc': 'text/plain',
    '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive',
  };
  return map[ext] || 'application/octet-stream';
}

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

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    resume: args.includes('--resume'),
    verify: args.includes('--verify'),
  };
}

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

function fileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { completed: [], failed: [] };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

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
      console.error(`  数据库更新失败 [${model}.${field}]：${e.message}`);
    }
  }
  return total;
}

// ============ 存储客户端工厂 ============

function createStorageClient() {
  if (DRIVER === 'cos') {
    const COS = require('cos-nodejs-sdk-v5');
    const cos = new COS({
      SecretId: SECRET_ID,
      SecretKey: SECRET_KEY,
      SecurityToken: SESSION_TOKEN || undefined,
    });
    return {
      type: 'cos',
      putObject: (params) => new Promise((resolve, reject) => {
        cos.putObject({ Bucket: BUCKET, Region: REGION, ...params }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      }),
      headObject: (params) => new Promise((resolve, reject) => {
        cos.headObject({ Bucket: BUCKET, Region: REGION, ...params }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      }),
    };
  }
  const s3 = new S3Client({
    region: REGION || undefined,
    endpoint: ENDPOINT || undefined,
    credentials: {
      accessKeyId: SECRET_ID,
      secretAccessKey: SECRET_KEY,
      ...(SESSION_TOKEN ? { sessionToken: SESSION_TOKEN } : {}),
    },
  });
  return {
    type: 's3',
    putObject: (params) => s3.send(new PutObjectCommand({ Bucket: BUCKET, ...params })),
    headObject: (params) => s3.send(new HeadObjectCommand({ Bucket: BUCKET, ...params })),
  };
}

// ============ 主流程 ============

let prisma = null;

async function main() {
  const { dryRun, force, resume, verify } = parseArgs();
  console.log('XT-Music 存储迁移脚本 v2.0');
  console.log(`驱动：${DRIVER.toUpperCase()}`);
  console.log(`模式：${dryRun ? 'DRY-RUN（预演）' : '实际迁移'}`);
  console.log(`续传：${resume ? '是' : '否'}`);
  console.log(`校验：${verify ? '是' : '否'}`);
  console.log(`本地目录：${LOCAL_ROOT}`);
  console.log(`Bucket：${BUCKET || '(未配置)'}`);
  console.log(`Region：${REGION || '(未配置)'}`);
  console.log('');

  if (!BUCKET) {
    console.error('错误：未配置 STORAGE_BUCKET 环境变量');
    process.exit(1);
  }
  if (!fs.existsSync(LOCAL_ROOT)) {
    console.error(`错误：本地存储目录不存在 ${LOCAL_ROOT}`);
    process.exit(1);
  }

  console.log('扫描本地文件...');
  const files = await walk(LOCAL_ROOT);
  if (files.length === 0) {
    console.log('本地目录为空，无需迁移。');
    return;
  }
  console.log(`共发现 ${files.length} 个文件。`);
  console.log('');

  let state = { completed: [], failed: [] };
  if (resume) {
    state = loadState();
    console.log(`续传模式：已完成 ${state.completed.length}，失败 ${state.failed.length}`);
  }

  if (dryRun) {
    console.log('=== DRY-RUN 预演 ===');
    files.forEach((absPath, i) => {
      const relPath = path.relative(LOCAL_ROOT, absPath).split(path.sep).join('/');
      const s3Url = getPublicUrl(relPath);
      const status = state.completed.includes(relPath) ? '[已完成]' : '';
      console.log(`[${i + 1}/${files.length}] ${relPath} -> ${s3Url} ${status}`);
    });
    console.log(`\n预演完成：共 ${files.length} 个文件待迁移。`);
    return;
  }

  if (!SECRET_ID || !SECRET_KEY) {
    console.error('错误：未配置 STORAGE_SECRET_ID / STORAGE_SECRET_KEY');
    process.exit(1);
  }

  if (!force) {
    const ok = await confirm(
      `即将迁移 ${files.length} 个文件到 ${DRIVER.toUpperCase()} (${BUCKET}) 并更新数据库，是否继续？[y/N] `,
    );
    if (!ok) {
      console.log('已取消。');
      return;
    }
  }

  const storage = createStorageClient();
  prisma = new PrismaClient();

  let migrated = 0, failed = 0, skipped = 0, dbUpdated = 0;
  const failedItems = [];

  for (let i = 0; i < files.length; i++) {
    const absPath = files[i];
    const filename = path.basename(absPath);
    const relPath = path.relative(LOCAL_ROOT, absPath).split(path.sep).join('/');
    const key = relPath;
    const s3Url = getPublicUrl(key);
    const localUrl = `${URL_PREFIX}/${relPath}`;

    if (resume && state.completed.includes(relPath)) {
      skipped++;
      continue;
    }

    try {
      const body = await fs.promises.readFile(absPath);
      const hash = fileHash(body);

      let alreadyExists = false;
      try {
        const head = await storage.headObject({ Key: key });
        if (head.ETag || head.ContentLength) {
          alreadyExists = head.ContentLength === body.length;
        }
      } catch {}

      if (!alreadyExists) {
        await storage.putObject({
          Key: key,
          Body: body,
          ContentType: guessContentType(absPath),
        });
      }

      if (verify) {
        try {
          const head = await storage.headObject({ Key: key });
          if (head.ContentLength !== body.length) {
            throw new Error(`大小不匹配：本地 ${body.length}，远端 ${head.ContentLength}`);
          }
        } catch (e) {
          throw new Error(`校验失败：${e.message}`);
        }
      }

      const updated = await updateDbReferences(prisma, localUrl, s3Url);
      dbUpdated += updated;
      migrated++;
      state.completed.push(relPath);
      saveState(state);

      console.log(
        `[${i + 1}/${files.length}] ${filename} - 成功${alreadyExists ? '（已存在，跳过上传）' : ''}${updated > 0 ? `（DB 更新 ${updated} 条）` : ''}`,
      );
    } catch (e) {
      failed++;
      failedItems.push({ file: relPath, error: e.message });
      state.failed.push(relPath);
      saveState(state);
      console.error(`[${i + 1}/${files.length}] ${filename} - 失败：${e.message}`);
    }
  }

  console.log('');
  console.log('=== 迁移完成 ===');
  console.log(
    `迁移 ${migrated} 个，失败 ${failed} 个，跳过 ${skipped} 个，数据库记录更新 ${dbUpdated} 条`,
  );
  if (failedItems.length > 0) {
    console.log('\n失败文件：');
    failedItems.forEach((item) => console.log(`  - ${item.file}: ${item.error}`));
  }
  if (migrated > 0 && failed === 0) {
    try { fs.unlinkSync(STATE_FILE); } catch {}
  }
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
