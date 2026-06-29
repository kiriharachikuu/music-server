# XingTone Server

NestJS 后端 API 服务，为 XingTone 音乐播放器提供数据与认证支撑。

## 技术栈

| 技术 | 用途 |
|------|------|
| NestJS 11 | Web 框架 |
| Prisma ORM | 数据库访问层 |
| SQLite | 轻量级文件数据库（零配置，易于上手） |
| JWT + Passport | 身份认证与鉴权 |
| class-validator | DTO 参数校验 |
| Docker + nginx | 容器化部署 |

## 数据模型

- **User** — 用户（USER / ADMIN 角色）
- **Song** — 歌曲（关联 Album、Tag）
- **Album** — 专辑
- **Tag** — 标签
- **Playlist** — 歌单（关联 User、Songs）
- **Favorite** — 收藏（用户 ↔ 歌曲）
- **PlayHistory** — 播放历史
- **Banner** — 首页横幅
- **SystemSetting** — 系统配置（KV 存储）
- **DownloadRecord** — 下载记录

## API 概览

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/songs` | 歌曲列表 |
| GET | `/api/songs/:id` | 歌曲详情 |
| GET | `/api/albums` | 专辑列表 |
| GET | `/api/albums/:id` | 专辑详情（含歌曲） |
| GET | `/api/playlists` | 歌单列表 |
| GET | `/api/banners` | Banner 列表 |
| GET | `/api/discover` | 发现页数据 |
| GET | `/api/rankings` | 排行榜 |

### 需认证接口（`Authorization: Bearer <token>`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/profile` | 当前用户信息 |
| GET | `/api/user/favorites` | 我的收藏 |
| POST | `/api/user/favorites/:songId` | 添加收藏 |
| DELETE | `/api/user/favorites/:songId` | 取消收藏 |
| GET | `/api/user/playlists` | 我的歌单 |
| POST | `/api/user/playlists` | 创建歌单 |
| PUT | `/api/user/playlists/:id` | 更新歌单 |
| DELETE | `/api/user/playlists/:id` | 删除歌单 |
| POST | `/api/user/playlists/:id/songs` | 添加歌曲到歌单 |
| DELETE | `/api/user/playlists/:id/songs` | 从歌单移除歌曲 |
| GET | `/api/user/history` | 播放历史 |
| DELETE | `/api/user/history` | 清空历史 |

### 管理后台接口（需 ADMIN 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| CRUD | `/api/admin/songs` | 歌曲管理 |
| CRUD | `/api/admin/albums` | 专辑管理 |
| CRUD | `/api/admin/playlists` | 歌单管理 |
| CRUD | `/api/admin/banners` | Banner 管理 |
| CRUD | `/api/admin/users` | 用户管理 |
| GET/PUT | `/api/admin/settings` | 系统设置 |
| POST | `/api/admin/upload` | 文件上传 |

## 快速开始

### 环境要求

- Node.js 20+
- npm / pnpm / yarn
- （数据库无需安装，SQLite 为文件式数据库）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 和 JWT_SECRET
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
npx prisma generate

# 推送 schema 到 SQLite 数据库（自动创建 dev.db 文件）
npx prisma db push

# 填充种子数据（可选，包含管理员账号和示例数据）
npx prisma db seed
```

> 种子数据包含：管理员账号 `admin / admin123`、2 个普通用户、3 个标签、2 张专辑、8 首歌曲、3 个 Banner、2 个歌单和系统设置。

### 4. 启动服务

```bash
# 开发模式（热重载）
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务启动后运行于 `http://localhost:3000`，API 基础路径为 `/api`。

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | 是 | SQLite 数据库文件路径，默认 `file:./dev.db` |
| `PORT` | 否 | 服务端口，默认 3000 |
| `JWT_SECRET` | 是 | JWT 签名密钥（生产必须替换） |
| `JWT_EXPIRES` | 否 | JWT 过期时间，默认 `7d` |
| `CORS_ORIGINS` | 是 | 跨域白名单，逗号分隔 |
| `STORAGE_DRIVER` | 否 | `local` 或 `s3`，默认 `local` |
| `LOCAL_STORAGE_PATH` | 否 | 本地存储路径，默认 `./uploads` |
| `S3_*` | s3 时 | S3 相关配置（见 `.env.example`） |

## 部署

支持 Docker 一键部署：

```bash
docker-compose up -d
```

或参考 `DEPLOY.md`（位于项目根目录）了解手动部署、Vercel 前端部署及 nginx 反向代理配置。

## 项目结构

```
src/
├── common/            # 公共组件：拦截器、过滤器、装饰器、工具函数
├── config/            # 配置文件（.env 映射、JWT、日志）
├── modules/
│   ├── admin/        # 管理后台 API
│   ├── album/        # 专辑
│   ├── auth/         # 认证（登录/注册/JWT）
│   ├── banner/       # Banner
│   ├── playlist/     # 歌单
│   ├── search/       # 搜索
│   ├── song/         # 歌曲
│   ├── stats/        # 统计、发现、排行榜
│   ├── upload/       # 文件上传（本地/S3 存储抽象）
│   └── user/         # 用户个人中心
└── prisma/           # Prisma 模块封装
```

## License

MIT
