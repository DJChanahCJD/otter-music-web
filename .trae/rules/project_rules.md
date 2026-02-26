---
alwaysApply: true
---
# Vibe-Template-Vercel

## 技术栈
- **核心**: Next.js 16 (App Router), React 19, TypeScript
- **样式**: Tailwind CSS v4, shadcn/ui
- **状态**: Zustand (+ persist)
- **其他**: Lucide React, next-themes, Sonner
- **API**: Vercel Serverless & Edge Functions

## 目录结构
- `app/`: 页面布局与 API 路由 (`api/`)
- `components/`: UI 组件 (`ui/`) 与业务组件
- `hooks/`: 自定义 React Hooks
- `lib/`: 工具函数 (`utils/`) 与类型定义 (`types.ts`)
- `stores/`: Zustand 状态管理
- `public/`: 静态资源
