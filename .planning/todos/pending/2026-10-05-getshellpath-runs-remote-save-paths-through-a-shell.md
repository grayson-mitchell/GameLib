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
