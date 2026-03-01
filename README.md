# Otter Music

<p align="center">
  <img width="100" alt="Otter Music icon" src="frontend/app/icon.svg">
</p>
<p align="center"><strong>Stream your music like an otter</strong></p>

<p align="center">
  基于 [GD Studio's Online Music Platform API](https://music-api.gdstudio.xyz/api.php) 的现代化多音源聚合音乐播放器。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/shadcn%2Fui-latest-000000?logo=shadcnui&logoColor=white" />
  <img src="https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white" />
</p>

## ✨ 核心特性

- 🎵 **网易云音乐集成**：支持搜索、歌单导入、VIP 歌曲试听（部分）、二维码登录。
- ☁️ **云端同步**：基于 Cloudflare KV 实现多端歌单与配置同步。
- 📝 **歌词系统**：支持 LRC 滚动歌词与实时解析。
- 🎨 **现代化 UI**：Next.js 16 + Tailwind v4 打造的响应式界面，适配桌面与移动端。
- 🚀 **边缘计算**：后端逻辑运行在 Cloudflare Edge，快速响应。

## 🛠️ 技术栈

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Zustand
- **Backend**: Hono (运行于 Cloudflare Pages Functions)
- **Database**: Cloudflare KV (存储配置与歌单)

## 🚀 快速开始

### 前置要求
- Node.js 18+
- Cloudflare 账号

### 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动项目**
   ```bash
   npm run dev
   ```
   - 前端：`http://localhost:3000`
   - 后端：`http://localhost:8080` (Wrangler 代理)

> **Note**: 首次启动可能需要先运行 `npm run build` 构建前端资源。开发环境下默认管理密码为 `123456`。

## 📦 部署指南 (Cloudflare Pages)

1. **创建项目**：Fork 本仓库，在 Cloudflare Dashboard 创建 Pages 项目。
2. **构建配置**：
   - **Build command**: `npm install && npm run build`
   - **Build output directory**: `frontend/out`
3. **环境变量**：
   - `PASSWORD`: 设置你的管理/同步密码（必须）
4. **KV 绑定**：
   - 创建 KV Namespace 命名为 `oh_file_url`
   - 在 Pages 设置中绑定该 KV，变量名设为 `oh_file_url`

## 🤝 贡献

欢迎提交 Issue 或 Pull Request！

## 📄 License

MIT
