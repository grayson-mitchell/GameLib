---
created: 2026-10-05T00:00:00.000Z
title: "getShellPath runs `echo ${path}` through a shell — GOG remote-config save locations and the renderer can inject commands"
area: security
severity: medium
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - src/backend/utils.ts:979-980
  - src/backend/save_sync.ts:204
  - src/backend/storeManagers/gog/library.ts:321-334
  - src/backend/sidecar/shellFilesFlowRegistration.ts:340
---

## Problem

`getShellPath` does `execAsync(\`echo ${path}\`)`. `save_sync.ts:204` feeds it GOG cloud-save
locations for native games, which come from `https://remote-config.gog.com/...`
(`gog/library.ts:321-334`) after `<?VAR?>` substitution. The `getShellPath` invoke channel
(`shellFilesFlowRegistration.ts:340`) also exposes it to the renderer.

## Failure scenario

Whoever controls a GOG game's remote-config entry (or that endpoint) puts `$(...)` in a save path;
it runs when save sync is set up for a native GOG game.

## Suggested fix

Expand `$VAR` / `${VAR}` / `~` in JS from `process.env` and `os.homedir()` instead of spawning a
shell; keep the channel's return shape.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed.** `getShellPath` was `normalize((await execAsync(\`echo ${path}\`)).stdout.trim())`
— the whole path string went to `/bin/sh -c` (cmd.exe on Windows). Callers: `save_sync.ts:204`
(native GOG save locations after `<?VAR?>` substitution) and the `getShellPath` invoke channel
(`shellFilesFlowRegistration.ts:340`, exposed to the renderer via `preload/api/misc.ts:102`). No
frontend code currently calls the preload method, but the channel is live.

**Change** (`src/backend/utils.ts`): no process is spawned any more. A new `expandPathVariables`
expands only what `echo` was relied on for — POSIX: `$VAR`, `${VAR}` (unset -> `''`, as `sh` did)
and a leading `~` / `~/` from `os.homedir()`; Windows: `%VAR%`, case-insensitive, unknown names left
literal (as cmd.exe did — needed because a GOG game installed as `windows` on Windows is native and
takes this path with `%LocalAppData%`-style locations). `$(...)`, backticks, `;`, `&`, `|` are
returned literally. `getShellPath` still returns `Promise<string>` through `normalize(...trim())`,
so the channel's return shape and `save_sync.ts`'s `await` are unchanged.

Deliberate behaviour differences for odd inputs: runs of whitespace inside a path are now preserved
(the shell's word splitting used to collapse them, silently corrupting such paths); `~user`, glob
characters, quotes and `${VAR:-default}` are no longer interpreted by a shell. None appear in the
`gogVariableMap` substitutions in `save_sync.ts`.

**RED** — new `src/backend/__tests__/getShellPath.test.ts`, with `child_process.exec` mocked (the
mock answers like `echo $(...)` would; nothing real runs). Against the old code: 12/12 failed —
every injection case received `"INJECTED"` instead of the literal input, i.e. the string was handed
to `exec`; the `expandPathVariables` cases failed as not-a-function.

**GREEN** — 12/12 pass; `shellFilesFlows.test.ts` (incl. the `getShellPath` invoke round trip),
`getDefaultLegendarySavePathRefresh.test.ts`, `utils.test.ts` pass. `pnpm codecheck` exit 0; eslint
0 errors and no new warnings on touched files; prettier `--check` clean.

**Not verified:** no live app run; the Windows `%VAR%` branch is covered only by the pure-function
test on Linux, not by a run on Windows; no real GOG native save-sync run on macOS/Linux.
