# XingTone Server

XingTone 后端 API 服务，负责认证、内容管理、播放数据、文件上传、对象存储与管理后台接口。

完整项目文档见 [docs](../docs/README.md)。

## 技术栈

| 技术 | 用途 |
|------|------|
| NestJS 11 | 后端应用框架 |
| Prisma ORM | 数据模型与数据库访问 |
| SQLite | 默认开发数据库 |
| JWT + Passport | 认证与角色鉴权 |
| class-validator | DTO 参数校验 |
| Multer | 文件上传 |
| fluent-ffmpeg | 音频处理与转码 |
| AWS SDK / COS SDK | S3 兼容与腾讯云 COS 存储 |
| Winston + nest-winston | 日志 |
| Docker / nginx | 容器化与反向代理部署 |

## 核心能力

- 用户认证：注册、登录、JWT、管理员角色鉴权。
- 音乐内容：歌曲、专辑、歌手、歌单、标签、Banner。
- 播放数据：播放历史、收藏、下载记录、播放量统计。
- 榜单与发现：发现页聚合、飙升榜、热歌榜。
- 管理后台 API：内容管理、用户管理、系统设置、资源维护。
- 文件上传：图片、音频、歌词上传，支持大小限制。
- 存储驱动：本地存储、S3 兼容存储、腾讯云 COS。
- 音频处理：元数据读取、转码与资源清理。

## 快速开始

### 环境要求

- Node.js 20+
- npm
- SQLite 默认无需额外安装

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

至少需要配置：

```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="replace-with-a-strong-secret"
CORS_ORIGINS="http://localhost:3000,http://localhost:3001"
```

### 初始化数据库

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

种子数据用于本地开发，通常包含管理员账号、测试用户、标签、专辑、歌曲、Banner、歌单与系统设置。

### 启动服务

```bash
npm run start:dev
```

默认运行于 `http://localhost:3000`，API 前缀为 `/api`。

### 生产构建

```bash
npm run build
npm run start:prod
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run start:dev` | 开发模式热重载 |
| `npm run build` | 构建生产版本，构建前自动生成 Prisma Client |
| `npm run start:prod` | 运行生产构建 |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:migrate` | 创建并应用开发迁移 |
| `npm run prisma:deploy` | 部署迁移 |
| `npm run prisma:seed` | 写入种子数据 |
| `npm run prisma:studio` | 打开 Prisma Studio |
| `npm run test` | 单元测试 |
| `npm run test:e2e` | e2e 测试 |

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `NODE_ENV` | 否 | 运行环境 |
| `DATABASE_URL` | 是 | Prisma 数据库连接，默认 `file:./dev.db` |
| `PORT` | 否 | 服务端口，默认 `3000` |
| `JWT_SECRET` | 是 | JWT 签名密钥，生产必须替换 |
| `JWT_EXPIRES` | 否 | JWT 过期时间，默认 `7d` |
| `CORS_ORIGINS` | 是 | 跨域白名单，多个域名用逗号分隔 |
| `STORAGE_DRIVER` | 否 | `local`、`s3` 或 `cos` |
| `LOCAL_STORAGE_PATH` | 否 | 本地上传目录，默认 `./uploads` |
| `STORAGE_BUCKET` | 对象存储时 | Bucket 名称 |
| `STORAGE_REGION` | 对象存储时 | 区域 |
| `STORAGE_SECRET_ID` | 对象存储时 | Access Key / SecretId |
| `STORAGE_SECRET_KEY` | 对象存储时 | Secret Key |
| `STORAGE_ENDPOINT` | S3 兼容时 | 自定义 Endpoint |
| `STORAGE_PUBLIC_DOMAIN` | 否 | 资源公开访问域名 |
| `UPLOAD_MAX_SIZE_IMAGE_MB` | 否 | 图片上传大小限制 |
| `UPLOAD_MAX_SIZE_AUDIO_MB` | 否 | 音频上传大小限制 |
| `UPLOAD_MAX_SIZE_LYRIC_MB` | 否 | 歌词上传大小限制 |

## API 概览

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 用户登录 |
| `GET` | `/api/songs` | 歌曲列表 |
| `GET` | `/api/songs/:id` | 歌曲详情 |
| `GET` | `/api/albums` | 专辑列表 |
| `GET` | `/api/albums/:id` | 专辑详情 |
| `GET` | `/api/playlists` | 歌单列表 |
| `GET` | `/api/banners` | Banner 列表 |
| `GET` | `/api/discover` | 发现页聚合数据 |
| `GET` | `/api/rankings` | 排行榜 |

### 认证接口

需要请求头：

```text
Authorization: Bearer <token>
```

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/user/profile` | 当前用户信息 |
| `GET` | `/api/user/favorites` | 我的收藏 |
| `POST` | `/api/user/favorites/:songId` | 添加收藏 |
| `DELETE` | `/api/user/favorites/:songId` | 取消收藏 |
| `GET` | `/api/user/playlists` | 我的歌单 |
| `POST` | `/api/user/playlists` | 创建歌单 |
| `PUT` | `/api/user/playlists/:id` | 更新歌单 |
| `DELETE` | `/api/user/playlists/:id` | 删除歌单 |
| `GET` | `/api/user/history` | 播放历史 |
| `DELETE` | `/api/user/history` | 清空历史 |

### 管理接口

需要 `ADMIN` 角色：

| 方法 | 路径 | 说明 |
|------|------|------|
| `CRUD` | `/api/admin/songs` | 歌曲管理 |
| `CRUD` | `/api/admin/albums` | 专辑管理 |
| `CRUD` | `/api/admin/artists` | 歌手管理 |
| `CRUD` | `/api/admin/playlists` | 歌单管理 |
| `CRUD` | `/api/admin/banners` | Banner 管理 |
| `CRUD` | `/api/admin/users` | 用户管理 |
| `GET/PUT` | `/api/admin/settings` | 系统设置 |
| `POST` | `/api/admin/upload` | 文件上传 |

## Docker 部署

```bash
docker-compose up -d
```

更多部署方式见 [deployment](../docs/deployment/README.md)。

## 项目结构

```text
prisma/               Prisma schema 与 seed
scripts/              导入、迁移、统计脚本
src/common/           公共装饰器、过滤器、工具函数
src/config/           配置与日志
src/modules/admin/    管理后台 API
src/modules/auth/     认证与鉴权
src/modules/song/     歌曲与下载
src/modules/upload/   文件上传与存储驱动
src/modules/user/     用户中心
src/modules/stats/    发现页、榜单、统计
src/prisma/           Prisma 模块封装
test/                 e2e 测试
```

## 相关子项目

- [music-web](../music-web/README.md)：用户端 Web/PWA。
- [music-admin](../music-admin/README.md)：管理后台。

## 许可

MIT
