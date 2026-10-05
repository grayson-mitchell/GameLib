---
created: 2026-10-05T00:00:00.000Z
title: "Tauri RPC transport minor defects: stale store snapshot overwrite, main-thread blocking pipe writes, oversized frames dropped without an answer"
area: tauri-shell
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 27"
files:
  - src/preload/tauriTransport.ts
  - src-tauri/src/main.rs:1693
  - src/backend/sidecar/sidecarRpc.ts:287
---

## Problem

Three independent minor defects found in the Phase 27 review:

1. **Store snapshot overwritten by an older fetch** (`tauriTransport.ts`, `hydrateStore` /
   `ensureChangeListenerAttached`). A `storeChanged` event (`app.emit` from the reader thread) and an
   invoke result (`tx` → `spawn_blocking` → command response) take different routes with no ordering
   guarantee; `hydrateStore` replaces the store wholesale with `{...result}`. `invalidated` also
   reuses an in-flight fetch that began before the invalidation.
2. **Blocking pipe writes on the main thread** (`main.rs:1693` `sidecar_send`). A non-`async`
   `#[tauri::command]` runs on the main thread in Tauri v2; it takes the `stdin` mutex and does a
   blocking `write_all`/`flush`.
3. **Oversized frames dropped without an answer** (`sidecarRpc.ts:287`). An inbound frame over 10 MiB
   is discarded with no response; its invoke waits the 60s timeout, or forever on a long-running
   channel.

## Failure scenario

1. A change landing during an in-flight fetch is applied, then wiped by the older result.
2. With the sidecar's JS thread busy and more than a pipe buffer of frames queued, the UI freezes
   until the write completes.
3. A caller of an oversized frame hangs instead of getting an error.

## Suggested fix

1. Per-store sequence/version number, or replay changes received during a fetch after it resolves;
   start a fresh fetch on invalidation.
2. Make the command `async` with `spawn_blocking`, or route writes through one writer thread.
3. Answer `ok:false` once the id is readable, or enforce the cap on the Rust side before writing.

Test gap: nothing covers a frame split across chunks, a multi-byte character split across chunks,
several frames in one chunk, or an oversized frame.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
