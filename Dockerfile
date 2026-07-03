# XingTone后端 - 多阶段构建
# 构建阶段
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# 运行阶段
FROM node:20-slim
# Prisma 运行时需要 openssl
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
# 启动前同步数据库 schema（如新增 SearchLog 表），再拉起服务
# 使用 db push 而非 migrate deploy：项目未维护 migrations 目录，db push 适配 SQLite 迭代
# --skip-generate：构建阶段已 prisma generate，运行时无需重复生成 client
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
