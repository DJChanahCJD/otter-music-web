# 260226 Monorepo 结构优化计划

为了解决 monorepo 结构不规范和根目录依赖冗余的问题，我们将执行以下步骤：

## 1. 清理根目录依赖
- 修改根目录 [package.json](file:///c%3A/Users/DJCHAN/SE/2_GithubProject/vibe-template-cf/package.json)，移除所有生产依赖（`dependencies` 字段）。
- 这些依赖（如 `hono`, `zod`, `jose`, `node-forge` 等）已经迁移到 `functions/package.json` 或 `frontend/package.json` 中。
- 根目录仅保留 `devDependencies`（如 `concurrently`, `wrangler`, `typescript`）和 `scripts`。

## 2. 完善 Functions 子包配置
- 修改 [functions/package.json](file:///c%3A/Users/DJCHAN/SE/2_GithubProject/vibe-template-cf/functions/package.json)：
    - 添加对 `@vibe-template-cf/shared` 的依赖：`"@vibe-template-cf/shared": "workspace:*"`。
    - 确保包含所有必要的业务依赖（目前已包含大部分，只需确认无遗漏）。

## 3. 验证与同步
- 运行 `npm install` 确保所有 workspace 的依赖关系正确链接。
- 检查 `functions` 和 `frontend` 是否仍能正常解析 `@shared` 模块。

## 4. 预期结果
- 根目录变得清爽，仅负责多项目调度。
- `functions` 成为一个标准、自包含的子包，具备独立的依赖管理能力。
- 整个 monorepo 结构符合现代开发规范。
