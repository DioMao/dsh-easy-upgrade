# dsh-easy-upgrade

[English](README.md) | [简体中文](README.zh-CN.md)

一个 DSH Web 插件：检查运行中 DSH 对应的源码 checkout 与远程分支差异，并在侧栏提供一键升级。

## 安装

```sh
dsh plugin --profile web add dsh-easy-upgrade
```

安装后启动或重启 web profile。若 profile 启用了包的最短发布时间策略，刚发布的版本需等待策略窗口结束后再安装。

## 更新

```sh
dsh plugin --profile web update dsh-easy-upgrade@latest
```

## 使用

侧栏会显示当前版本或可用更新。选择更新操作后，可查看最新发行说明并确认升级。

插件会安全识别运行中 DSH 所使用的 DeepSeek Harness 源码 checkout。也可以在 profile 配置中显式设置 `repoDir`。

仅当 DSH 从本地 DeepSeek Harness 源码 checkout 启动时，插件才提供 git 更新。npx 与已安装的构建不是更新目标。该流程适用于未修改的官方原版源码；对于修改过的源码或 fork，请谨慎使用，因为升级会将其重置到远程分支。

## 安全提示

升级会拉取选定分支、停止 DSH、将源码重置到 `origin/<branch>`、安装依赖、构建，然后重新启动 DSH。升级失败时会尝试恢复之前的版本和依赖。

`git reset --hard` 会丢弃源码 checkout 中的本地改动。确认升级前，请将需要保留的工作提交到 Git，或放到另一个 clone 中。

## 配置

默认值不适合时，可在 web profile 的 `cordis.patch.yml` 中设置插件选项。

| 选项 | 作用 | 默认值 |
| --- | --- | --- |
| `repoDir` | Harness 源码 checkout；留空则自动识别。 | 自动识别 |
| `branch` | 检查并在升级时安装的远程分支。 | `master` |
| `checkIntervalMs` | 自动检查更新的间隔。 | `3600000`（1 小时） |
| `stateDir` | 状态与升级日志目录。 | `~/.dsh/dsh-easy-upgrade` |
| `logMaxBytes` | 升级日志最大大小。 | `15728640`（15 MiB） |
| `forceUpdateTest` | **仅限开发。** 跳过「已是最新」拦截，随时可重跑完整升级流程。 | `false` |

### 开发演练模式（`forceUpdateTest`）

```yaml
# web profile 的 ~/.dsh/profiles/web/cordis.patch.yml（不是本包的 patch）
- id: dsh-easy-upgrade
  config:
    forceUpdateTest: true
```

开启后，即使本地 checkout 已经与 `origin/<branch>` 一致，侧栏也会显示升级入口；确认后将执行完整流程：拉取、停止 DSH、`git reset --hard origin/<branch>`、`pnpm install`、`pnpm clean`、`pnpm build`、重启。这样无需等待上游提交即可反复演练完整升级（以及可选的失败回滚）。此选项仅供开发 profile 使用——切勿面向生产用户开启，确认弹窗也会明确提示该操作不可逆。

> 注意：profile 的 `config` 覆盖是**整段替换**（不是深合并），请在开发 profile 的 patch 中把需要的键（`branch`、`checkIntervalMs`、`retryCount`、`retryDelayMs`、`stateDir`）与 `forceUpdateTest` 一起写上。

## 许可证

MIT
