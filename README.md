# dsh-easy-upgrade

DSH Web 插件：检查本地 deepseek-harness 源码仓库与 `origin/<branch>` 的差异，并在侧栏一键升级（停止当前 DSH → `git reset --hard` → 安装依赖 → 构建 → 重启）。

## 功能

- 侧栏版本状态与更新提示，一键升级入口。
- 自动匹配当前 dsh 启动对应的 deepseek-harness 源码目录（也可显式配置 `repoDir`）：
  - 从启动命令解析 dsh 入口脚本；
  - 向上查找满足锚点契约（`package.json` 名为 `@deepseek-ai/dsh-root` + `pnpm-workspace.yaml` + `.git`）的仓库根；
  - 匹配失败时不执行任何 git 操作，返回 `no-repo`，避免对任意目录调用 git。
- 源码目录在 Web UI 中不展示（仅用于内部校验与升级流程），避免暴露本地路径细节。
- 升级确认改为框架风格的自定义弹窗：点击“立即更新”后尝试获取 GitHub 最新发行版的更新说明并展示在弹窗中（含版本变化、发布标签/日期、warn 提示），确认后开始升级；获取失败时降级为通用提示，不阻塞升级。
- 升级流程：`git fetch` → 停止当前 dsh → `git reset --hard origin/<branch>` → `pnpm install --frozen-lockfile` → `pnpm clean` → `pnpm build` → 重启 dsh；失败时回滚至原版本并恢复依赖。
- `upgrade.log` 自动裁剪（默认上限 15 MiB，可配置），避免日志无限增长。
- 启动时清理上次进程遗留的 `upgrading` 标志，避免 UI 卡在“正在升级，服务即将重启…”。

## 安装与配置

通过 `dsh plugin add` 安装，或在 profile 的 `cordis.patch.yml` 中插入配置行（见 `cordis.patch.yml`）。支持的配置项：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `repoDir` | deepseek-harness 源码目录；留空则自动匹配 | 自动匹配 |
| `branch` | 对比/升级的远程分支 | `master` |
| `checkIntervalMs` | 自动检查间隔 | `3600000`（1 小时） |
| `retryCount` / `retryDelayMs` | 检查失败重试次数/间隔 | `3` / `5000` |
| `stateDir` | 状态与日志目录 | `~/.dsh/dsh-easy-upgrade` |
| `logMaxBytes` | `upgrade.log` 上限 | `15728640`（15 MiB） |

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/dsh-upgrade/api/status` | 当前状态（检查结果、是否升级中） |
| POST | `/dsh-upgrade/api/check` | 立即检查更新 |
| GET | `/dsh-upgrade/api/release` | 最新 GitHub 发行版信息（tag、日期、更新说明；获取失败返回 `release: null`） |
| POST | `/dsh-upgrade/api/upgrade` | 开始一键升级（返回 202） |
| GET | `/dsh-upgrade/api/log` | 读取 `upgrade.log` 尾部 |

## 构建

```sh
pnpm build
```

构建使用本地 deepseek-harness checkout 的 tsdown `clientBundle`（与仓库的 client-plugin 产物保持一致），输出到 `lib/`。

## 开发与规范

开发工具（tsdown / oxlint / vitest）由本地 deepseek-harness checkout 提供，无需在本包安装依赖。

```sh
pnpm lint            # oxlint（遵循 .oxlintrc.json）
pnpm test            # vitest 单元测试
pnpm test:watch      # vitest 监听模式
pnpm hooks:install   # 安装 git 钩子：git config core.hooksPath .githooks
```

- **Commit 规范**：遵循 Conventional Commits（`<type>(<scope>): <subject>`，type 限
  `build chore ci docs feat fix perf refactor revert style test`）。`.githooks/pre-commit`
  会在每次提交时校验提交信息、对暂存的 `.ts/.tsx` 运行 oxlint，并检查空白/冲突标记。
  手动安装钩子：`git config core.hooksPath .githooks`（或 `pnpm hooks:install`）。
  临时跳过：`git commit --no-verify`。
- **测试**：`pnpm test` 覆盖 `src/release-notes.ts`、`src/config.ts`、`src/state.ts`、
  `src/client/notes-markdown.ts` 与 `.githooks/commitlint.mjs`。
- 更多开发约定见 `AGENTS.md`。

## 许可证

MIT
