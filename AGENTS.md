# AGENTS.md — dsh-easy-upgrade

Guidance for AI coding agents and humans working on this repository.

## What this project is

`dsh-easy-upgrade` is a DSH Web plugin ("一键升级"). In the running DSH web UI it
checks the local `deepseek-harness` checkout against `origin/<branch>` and offers a
one-click upgrade: stop DSH → `git reset --hard` → install → build → restart, with
rollback on failure. It is a **standalone package** (not part of the harness
monorepo) and is installed into the DSH web profile via
`dsh-easy-upgrade: link:…` and the bundle patch in `cordis.patch.yml`.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Host half entry: registers the `/dsh-upgrade/api/*` route, boot detection, hourly check schedule. |
| `src/api.ts` | HTTP controller + route handler (status / check / release / upgrade / log). |
| `src/config.ts` | Cordis-row config normalization with safety bounds. |
| `src/detect.ts` | Resolve the running dsh entry script and match it to a source checkout. |
| `src/git.ts` | Thin `git` command wrappers (fetch, status, divergence, origin URL). |
| `src/state.ts` | `StateStore` owning `~/.dsh/dsh-easy-upgrade/{state.json,launch.json,upgrade.log,upgrade-runner.mjs}`. |
| `src/upgrade-runner.ts` | Detached Node runner that stops DSH, resets, installs, builds, restarts, rolls back. |
| `src/release-notes.ts` | Best-effort GitHub latest-release fetch for the confirm dialog. |
| `src/trust-fence.ts` | Same-origin / trusted-host gate for the API. |
| `src/client/` | Browser half: `UpgradeCell` (sidebar footer action), locales, release-notes renderer, CSS module. |
| `.githooks/` | Git hooks (commitlint + staged oxlint + whitespace). See **Commit conventions**. |
| `scripts/` | Harness toolchain resolver, portable build wrapper, bundle and package smoke checks. |
| `.github/workflows/` | PR quality gate and OIDC npm release workflow. |
| `AGENTS.md`, `README.md`, `LICENSE`, `cordis.patch.yml`, `package.json` | Project metadata / config. |

## Quick start

Developer tooling is provided by a checkout of the harness rather than a local
install (the package has no `node_modules` of its own; `node_modules` is a
symlink into the DSH profile store). Commands:

```sh
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm build  # tsdown → lib/ (host index.js + client.js)
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm lint   # oxlint (respects .oxlintrc.json)
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm test   # vitest run (see vitest.config.ts)
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm test:watch
pnpm test:bundle      # asserts the emitted host and client handoff artifacts
pnpm test:package     # asserts the npm publish file list
pnpm hooks:install    # git config core.hooksPath .githooks
```

`DSH_HARNESS_DIR` must identify an installed harness checkout. The scripts retain
`/home/mao/deepseek-harness` only as a compatibility fallback for this checkout;
CI always sets the variable to its pinned toolchain checkout.

## Architecture notes

- **Two halves.** The Host half is plain Node (Cordis plugin returned from
  `apply`) and owns files, git, networking, and the HTTP API. The Client half is
  a browser bundle served by the harness `client-modules` at
  `/plugins/dsh-easy-upgrade/client.js`; it renders the sidebar footer action
  and registers UI in the `sidebar.footer.action` slot. Client and Host share no
  runtime imports — the Client reaches Host only through the same-origin
  `/dsh-upgrade/api/*` endpoints (fenced by `trust-fence.ts`).
- **State ownership.** All persistent data lives in one user-owned directory
  (`stateDir`, default `~/.dsh/dsh-easy-upgrade`). Writes are atomic (tmp +
  rename). A stale `upgrading` flag is cleared at Host boot and mirrored on the
  Client with 3s polling so the UI recovers after a restart.
- **Release notes are decorative.** `src/release-notes.ts` returns `null` on any
  failure (network, timeout, non-github origin, no releases) and the confirm
  dialog degrades to generic copy — the upgrade never depends on it.
- **Native confirm() is forbidden** in the client; confirmation uses the
  framework `Modal` from `@deepseek-ai/dsh-client-ui-primitives`, styled with
  `--dsw-alias-*` theme tokens.

## Conventions

- **Language / build.** Source is TypeScript (host) and TSX (client). The client
  is transpiled by the harness `clientBundle` preset, which forbids cross-package
  value imports of `@deepseek-ai/*` outside the declared `dsh.client.inject`
  list; keep client ↔ host talking over the HTTP API, not through imports.
- **Node globals.** Host code runs in Node and may use `process`, `setInterval`,
  `fetch`, `AbortController`, etc. (oxlint env includes `node` + `browser`).
- **Style / lint.** Enforced by `pnpm lint`. Notable: single quotes, no
  semicolons, 2-space indent, trailing commas, 140-col lines, `prefer-const`,
  no unused vars (`^_` ignored).
- **Locales.** Every new user-facing string lands in **both** `zh` and `en`
  dictionaries in `src/client/locales.ts` (identical key sets).
- **Side effects.** Everything the plugin registers (routes, timers, tools,
  slots, styles) must be removable on stop/update — use Cordis `ctx.effect` /
  `ctx.on` and return disposers.

## Commit conventions

This repository follows **Conventional Commits**, enforced by a pre-commit hook.

```
<type>(<optional scope>): <imperative subject>

<optional body>
<optional footer: BREAKING CHANGE: …>
```

- `type` is one of: `build chore ci docs feat fix perf refactor revert style test`.
- Optional `!` marks a breaking change: `feat!: drop old API` or `feat(api)!: …`.
- `subject` is an imperative, ≤ 72 chars, no trailing period, lowercase start.
- Scope is short and kebab/snake (`feat(client): …`, `fix(api): …`).

### Hooks

Install once per clone:

```sh
git config core.hooksPath .githooks   # or: pnpm hooks:install
```

`.githooks/pre-commit` then runs, on every commit:

1. commit-message lint (`node .githooks/commitlint.mjs`) — Conventional Commits;
2. oxlint on the **staged** `.ts`/`.tsx` files;
3. `git diff --cached --check` (trailing whitespace / conflict markers).

To bypass for a one-off (not recommended): `git commit --no-verify`.

## Testing

Unit tests use **vitest** (`vitest.config.ts`, node environment) and cover the
pure logic: `parseGithubRepo` / release parsing in `src/release-notes.ts`,
config normalization in `src/config.ts`, the `StateStore` in `src/state.ts`,
the release-notes markdown parser in `src/client/notes-markdown.ts`, and the
commit-message validator in `.githooks/commitlint.mjs`. Add tests alongside the
code; keep business logic free of framework imports so it stays testable.

## Gotcha: building a standalone package with the harness preset

`tsdown.config.ts` imports the harness client preset, which resolves the package
manifest by globbing `packages/*/*/package.json` under the harness checkout and
does **not** follow symlinks. `scripts/build.mjs` creates that physical manifest
at `<harness>/packages/experimental/dsh-easy-upgrade/package.json` and removes the
whole temporary directory in `finally`. It refuses to run when that directory
already exists, so it cannot overwrite a harness package. Verify the harness
git status is clean after diagnosing an interrupted build.
