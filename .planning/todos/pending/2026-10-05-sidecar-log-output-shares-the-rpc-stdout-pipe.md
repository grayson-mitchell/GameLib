---
created: 2026-10-05T00:00:00.000Z
title: "Sidecar log output shares stdout with RPC frames — a logged line shaped like a frame is executed by the shell (security)"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 27"
files:
  - src/backend/logger/index.ts:179-184
  - src/backend/logger/log_writer.ts:12-16
  - src/backend/logger/log_writer.ts:239
  - src/backend/sidecar/bootstrap.ts:863-865
  - src-tauri/src/main.rs:11244-11412
  - src/backend/utils.ts:421
---

## Problem

The main `LogWriter` is constructed with `outputToOsStreams = true` (`logger/index.ts:180-184`), so
INFO/DEBUG lines go to `console.log` (`log_writer.ts:13-14`), i.e. to stdout — and the sidecar's
stdout IS the RPC pipe (`bootstrap.ts:864` says so). The Rust reader JSON-parses every stdout line
and acts on any of:

- `kind:"rustInvoke"` → `dispatch_rust_channel` (`shell_open_path`, `keyring_delete`, `app_exit`,
  `store_embed_navigate`, …). The sidecar's `RUST_INVOKE_CHANNELS` allow-list does not apply on this
  path, because the line never went through the sidecar's outbound framing.
- `kind:"openExternal"` — opened with no scheme check (reader arm near `:11400`).
- `ok` + `id` — can resolve a pending invoke whose counter id is guessable.

Subprocess output is logged raw and may span lines, e.g. `logInfo(stdout)` in
`legendary/library.ts:819` and `gog/games.ts:731`, and bridge helper output in
`steam/bridge/helperProcess.ts:124`.

## Failure scenario

Output from a tool the launcher runs (legendary, gogdl, the Steam bridge helper) contains a newline
followed by `{"kind":"rustInvoke","id":"x","channel":"shell_open_path","args":["/path/evil.app"]}`;
the shell executes it. An attacker needs to control that tool's output.

Related: the renderer can reach the reader's unchecked `openExternal` arm via
`send('openExternalUrl',['httpfoo:…'])`, because `openUrlOrFile` (`backend/utils.ts:421`) only tests
`startsWith('http')`.

## Suggested fix

- Keep the RPC pipe frames-only: build the sidecar's main `LogWriter` with
  `outputToOsStreams = false`, or redirect `console.log` / `console.info` to stderr in the sidecar.
- Defence in depth: give frames a per-boot nonce or a schema the reader enforces.
- Apply `open_external_scheme_check` to the reader's `openExternal` arm.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
