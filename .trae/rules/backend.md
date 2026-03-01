---
alwaysApply: false
globs: functions/*
---
## 后端最小上下文（functions/）
- 入口：Hono app 在 `functions/app.ts`，路由前缀：`/auth`、`/sync`、`/music-api`、`/proxy`，另有 `/health`
- 管理员鉴权：`POST /auth/login` 校验 `PASSWORD`，成功后下发 `auth` Cookie（HttpOnly）
- `authMiddleware`：仅检查 `auth` Cookie（JWT），用于保护管理员接口
- 同步模型：一个 `syncKey` 代表一个同步空间
  - 数据接口：`/sync`、`/sync/check` 使用 `Authorization: Bearer <syncKey>`
  - 管理接口：`/sync/create-key`、`/sync/keys`、`/sync/keys/:key` 需要管理员 `auth` Cookie