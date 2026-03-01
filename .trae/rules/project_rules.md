---
alwaysApply: true
---
# Otter Music Web
Otter Music Web 是基于第三方音乐 API 的 音乐播放 Monorepo 项目（npm workspaces）：`frontend/` + `functions/` + `shared/`

## 技术栈
- **核心**: Next.js 16 (App Router), React 19, TypeScript
- **样式**: Tailwind CSS v4, shadcn/ui
- **状态**: Zustand (+ persist)
- **其他**: Lucide React, next-themes, Sonner, Hono

## 仓库形态
- 根目录脚本：`dev`(前后端并行)、`build`(构建前端)、`ci-test`(起后端 + mocha)

## 目录结构
- `app/`: 页面布局与 API 路由 (`api/`)
- `components/`: UI 组件 (`ui/`) 与业务组件
- `hooks/`: 自定义 React Hooks
- `lib/`: 工具函数 (`utils/`) 与类型定义 (`types.ts`)
- `stores/`: Zustand 状态管理
- `public/`: 静态资源
- `functions/`: Hono 后端路由与中间件
- `shared/`: 跨项目共享代码（如类型定义）