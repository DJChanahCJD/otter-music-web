# Otter Music

基于 Next.js 16、Tailwind CSS v4 和 shadcn/ui 的现代化 Cloudflare 开发模板。

## 核心特性

- **框架**: [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/) 
- **语言**: [TypeScript](https://www.typescriptlang.org/)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/) + [Zustand persist](https://github.com/pmndrs/zustand-middleware-persist)
- **样式**: [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **图标**: [Lucide React](https://lucide.dev/)
- **功能**: [next-themes](https://github.com/pacocoursey/next-themes) (暗黑模式) + [Sonner](https://sonner.emilkowal.ski/) (Toast)
- **API**: Cloudflare Pages + Edge Functions

## 快速开始

### 1. 获取项目

```bash
git clone https://github.com/your-username/vibe-template-vercel.git my-project
cd my-project
```

### 2. 重置仓库 (推荐)

移除原有远程仓库关联，开启新项目历史。

```bash
git remote remove origin
```

### 3. 安装与启动

```bash
# 安装依赖 (推荐 pnpm)
pnpm install

# 启动开发服务器
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看效果。
