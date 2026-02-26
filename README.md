# Otter Music

基于 **Next.js 16**、**Hono** (Cloudflare Pages Functions) 和 **Tailwind CSS v4** 的现代化音乐播放器项目。

## 核心特性

- **前端框架**: [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- **后端 API**: [Hono](https://hono.dev/) (运行于 Cloudflare Pages Functions)
- **语言**: [TypeScript](https://www.typescriptlang.org/) (Monorepo 架构)
- **样式**: [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/)
- **图标**: [Lucide React](https://lucide.dev/)
- **部署**: Cloudflare Pages + Edge Functions

## 项目结构

本项目采用 Monorepo 结构管理：

- **`frontend/`**: Next.js 前端应用，包含 UI 组件、页面和状态管理。
- **`functions/`**: 基于 Hono 的后端 API，处理音乐数据代理、认证等逻辑。
- **`shared/`**: 前后端共享的 TypeScript 类型定义和工具函数。

## 快速开始

### 1. 获取项目

```bash
git clone https://github.com/your-username/otter-music-web.git
cd otter-music-web
```

### 2. 安装依赖

推荐使用 `npm` 或 `pnpm` 安装依赖（本项目根目录使用 npm workspaces）：

```bash
npm install
# 或者
pnpm install
```

### 3. 启动开发服务器

使用以下命令同时启动前端和后端服务：

```bash
npm run build
npm run dev
```

- **前端地址**: [http://localhost:3000](http://localhost:3000)
- **后端 API**: [http://localhost:8080](http://localhost:8080)

> **注意**: 后端服务使用 `wrangler` 模拟 Cloudflare Pages 环境。

## API 参考

后端 API 位于 `functions/routes` 目录下，主要端点包括：

- `/api/auth/*`: 用户认证相关
- `/api/music/*`: 音乐搜索、播放链接获取
- `/api/proxy/*`: 代理服务

详细接口定义请参考 `functions/routes` 源码或 `test/test.js` 中的测试用例。
