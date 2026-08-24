# dsh-easy-upgrade

DSH Web 插件：检查本地 deepseek-harness 源码仓库与 `origin/<branch>` 的差异，并在侧栏一键升级（停止当前 DSH → `git reset --hard` → 安装依赖 → 构建 → 重启）。

## 功能

- 侧栏版本状态与更新提示，一键升级入口。
- 自动匹配当前 dsh 启动对应的 deepseek-harness 源码目录（也可显式配置 `repoDir`）：
  - 从启动命令解析 dsh 入口脚本；
  - 向上查找满足锚点契约（`package.json` 名为 `@deepseek-ai/dsh-root` + `pnpm-workspace.yaml` + `.git`）的仓库根；
  - 匹配失败时不执行任何 git 操作，返回 `no-repo`，避免对任意目录调用 git。
- 升级流程：`git fetch` → 停止当前 dsh → `git reset --hard origin/<branch>` → `pnpm install --frozen-lockfile` → `pnpm build` → 重启 dsh；失败时回滚至原版本并恢复依赖。
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
| POST | `/dsh-upgrade/api/upgrade` | 开始一键升级（返回 202） |
| GET | `/dsh-upgrade/api/log` | 读取 `upgrade.log` 尾部 |

## 构建

```sh
pnpm build
```

构建使用本地 deepseek-harness checkout 的 tsdown `clientBundle`（与仓库的 client-plugin 产物保持一致），输出到 `lib/`。

## 许可证

MIT
