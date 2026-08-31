# dsh-easy-upgrade

[English](README.md) | [简体中文](README.zh-CN.md)

A DSH Web plugin that checks the source checkout running DSH against its remote branch and offers a one-click upgrade from the sidebar.

## Install

```sh
dsh plugin --profile web add dsh-easy-upgrade
```

Start or restart the web profile after installation. If a profile enforces a minimum package release age, wait for that window before installing a newly released version.

## Update

```sh
dsh plugin --profile web update dsh-easy-upgrade@latest
```

## Use

The sidebar shows the installed revision or an available update. Select the update action to review the latest release notes and confirm the upgrade.

The plugin safely identifies the DeepSeek Harness checkout used by the running DSH process. You can also set `repoDir` explicitly in the profile configuration.

Git updates are available only when DSH is launched from a local DeepSeek Harness source checkout. npx and installed builds are not upgrade targets. This flow is intended for an unmodified official checkout; use caution with a modified checkout or fork because an upgrade resets it to its remote branch.

## Safety

An upgrade fetches the selected branch, stops DSH, resets the checkout to `origin/<branch>`, installs dependencies, builds, and starts DSH again. A failed upgrade attempts to restore the previous revision and dependencies.

`git reset --hard` discards local checkout changes. Keep work you need in a commit or another clone before confirming an upgrade.

## Configuration

Set plugin options in the web profile's `cordis.patch.yml` when defaults are not suitable.

| Option | Purpose | Default |
| --- | --- | --- |
| `repoDir` | Harness source checkout. Leave empty for automatic detection. | Automatic detection |
| `branch` | Remote branch checked and installed by an upgrade. | `master` |
| `checkIntervalMs` | Automatic update-check interval. | `3600000` (1 hour) |
| `stateDir` | State and upgrade-log directory. | `~/.dsh/dsh-easy-upgrade` |
| `logMaxBytes` | Maximum size of the upgrade log. | `15728640` (15 MiB) |
| `forceUpdateTest` | **Development only.** Skip the "already up to date" guard so the full upgrade flow can be rerun at any time. | `false` |

### Development drill mode (`forceUpdateTest`)

```yaml
# web profile ~/.dsh/profiles/web/cordis.patch.yml (not this package's patch)
- id: dsh-easy-upgrade
  config:
    forceUpdateTest: true
```

With this option enabled, the sidebar shows the upgrade entry even when the local
checkout already matches `origin/<branch>`, and confirming it runs the complete
flow: fetch, stop DSH, `git reset --hard origin/<branch>`, `pnpm install`,
`pnpm clean`, `pnpm build`, and restart. This lets you exercise the full upgrade
(and the opt-in failure rollback) repeatedly without waiting for upstream
commits. It is intended for a development profile only — never enable it for
production users, and remember the confirmation dialog explains that the
operation is irreversible.

> Profile `config` overrides **replace** the whole config block (they are not
> deep-merged), so repeat the keys you need — `branch`, `checkIntervalMs`,
> `retryCount`, `retryDelayMs`, `stateDir` — alongside `forceUpdateTest` in the
> dev profile patch.

## License

MIT
