# APP 更新检测与加速下载功能实现计划

## 目标
实现一个后端 API 模块，用于检测 APP 最新版本并提供 APK 加速下载功能。

## 需求分析
1.  **版本检测**：从 GitHub Release 获取最新版本信息。
2.  **加速下载**：通过服务器代理下载 GitHub 上的 APK 文件（约 5MB）。
3.  **目标仓库**：`https://github.com/DJChanahCJD/otter-music`

## 技术方案

### 1. API 设计
我们将新增 `functions/routes/update.ts` 路由模块，提供以下接口：

#### 1.1 `GET /api/update/check`
-   **参数**：`version` (可选，客户端当前版本号，如 `1.0.0` 或 `v1.0.0`)
-   **功能**：
    1.  请求 GitHub API `https://api.github.com/repos/DJChanahCJD/otter-music/releases/latest`。
    2.  解析响应，获取 `tag_name` (最新版本)、`body` (更新日志)、`assets` (资源列表)。
    3.  查找 `.apk` 结尾的资源文件。
    4.  对比版本号（如果提供了 `version`）。
    5.  返回标准化响应。
-   **响应示例**：
    ```json
    {
      "code": 200,
      "message": "Success",
      "data": {
        "hasUpdate": true,
        "latestVersion": "v1.2.3",
        "changelog": "更新内容...",
        "downloadUrl": "https://<api-domain>/api/update/download?url=<github_asset_url>",
        "publishDate": "2024-03-01T12:00:00Z"
      }
    }
    ```

#### 1.2 `GET /api/update/download`
-   **参数**：`url` (GitHub Asset 下载链接)
-   **功能**：
    1.  **安全校验**：验证 `url` 是否属于 `github.com` 或 `objects.githubusercontent.com`，防止滥用。
    2.  **流式代理**：请求目标 URL 并通过 Stream 转发给客户端。
    3.  **缓存优化**：设置 HTTP 缓存头（如 `Cache-Control: public, max-age=3600`），利用边缘节点缓存（如果部署在 Cloudflare/Vercel 等环境）。
    4.  **Content-Type**：强制设置为 `application/vnd.android.package-archive`。

### 2. 核心逻辑实现
-   **版本比较**：简单的语义化版本比较（去除 `v` 前缀后比较）。
-   **GitHub API 访问**：需要设置 `User-Agent`（GitHub API 强制要求）。
-   **错误处理**：处理 GitHub API 限流或网络错误，返回友好的错误信息。

## 实施步骤

1.  **创建路由文件**：新建 `functions/routes/update.ts`。
2.  **实现 `/check` 接口**：编写获取 Release 信息和版本比较逻辑。
3.  **实现 `/download` 接口**：编写流式代理下载逻辑，包含安全校验。
4.  **注册路由**：在 `functions/app.ts` 中挂载 `/update` 路由。
5.  **验证**：使用 curl 测试接口。

## 优化建议 (Better Scheme)
1.  **CDN 缓存**：对于 `/download` 接口，由于 Release 文件一旦发布不会改变，我们可以设置极长的缓存时间（`Immutable`），让 CDN 承担大部分流量。
2.  **Cloudflare Workers**：如果项目部署在 Cloudflare Workers 上，此方案天然利用了全球边缘网络，下载速度会显著提升。
3.  **回退机制**：如果代理下载失败，客户端应能回退到直接访问 GitHub 下载链接。我们在响应中同时提供 `directUrl` 和 `proxyUrl`。

