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

## License

MIT
