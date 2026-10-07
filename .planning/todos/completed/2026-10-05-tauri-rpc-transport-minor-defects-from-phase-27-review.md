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

## Resolution (2026-10-05)

All three mechanisms confirmed against the code; all three fixed.

**1. Stale snapshot overwrite (`src/preload/tauriTransport.ts`).** Per-store
`invalidationEpoch`: a fetch records the epoch it started under and discards its result if an
`invalidated` push bumped it meanwhile; the invalidation no longer reuses the in-flight fetch but
chains a fresh one behind it. Field changes pushed while a fetch is in flight are buffered
(`changesDuringFetch`) and replayed, in arrival order, over the fetched result before it replaces
the snapshot.
RED (`src/preload/__tests__/tauriTransport.test.ts`): "a change pushed while a re-fetch is in
flight survives the older fetch result" -- `Expected "newer", Received "older"`; "an invalidation
during an in-flight fetch starts a fresh fetch" -- `Expected 2, Received 1` fetches.
GREEN: `src/preload/__tests__` 145/145.

**2. Blocking pipe writes on the main thread (`src-tauri/src/main.rs` `sidecar_send`).** Chose
the single writer thread over `async` + `spawn_blocking`: the latter's pool does not preserve
send-to-send order, which the sync command did. `sidecar_send` now enqueues onto
`SidecarSendQueue` (managed beside `SidecarState`) and returns; `spawn_send_writer` writes frames
in FIFO order and logs the always-on `write_frame FAILED` line there.
RED: new `tauriShellSource.test.ts` gate "the sidecar_send body enqueues and never calls
write_frame itself" failed on the pre-fix body. GREEN: that gate, plus Rust
`send_writer_enqueue_does_not_wait_for_a_blocked_write` (3 enqueues return in <500ms while the
writer is blocked; written in order a, b, c) and `send_writer_keeps_going_after_a_failed_write`.
Behaviour change, deliberate: a stdin IO failure on a send no longer comes back to the renderer
as a rejection (it is logged in the shell); the doc comment on `sidecar_send` records why that
path was already lossy.

**3. Oversized frames dropped without an answer (`src/backend/sidecar/sidecarRpc.ts`).** When an
unterminated frame passes `MAX_LINE_LENGTH`, its head is matched against the shell's serialised
`{"id":"…","kind":"invoke"` prefix (`id` is `SidecarRpcRequest`'s first field) and answered
`ok:false` ("oversized frame dropped"). The rest of that frame up to its newline is now skipped
rather than parsed as a malformed frame. `send` frames have no waiting caller and get no answer.
RED (new `src/backend/sidecar/__tests__/sidecarRpcFraming.test.ts`): the two oversized cases
failed (`Expected length: 1, Received length: 0`; a spurious `malformed` drop for the tail).
GREEN: 5/5, including the test gap the todo named -- several frames in one chunk, a frame split
across chunks, a 4-byte character split across chunks. Suite registered in
`testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES`.

**Checks.** `pnpm codecheck` 0; eslint 0 errors on touched files (pre-existing require-await
warnings only); prettier clean on every touched TS path; `cargo fmt --check` clean; `cargo
clippy` 22 warnings, none new; `cargo test --bin gamelib-shell` 317 passed.
`src/backend/sidecar/__tests__` also shows `appRootResolution` / `bootstrap` asset-root failures
that are environmental (gitignored runner binaries absent from this worktree) and an
`appShellFlows` timing failure that passed on re-run -- none touch these files.

**Not done / not verified.**

- `hydrateStoreSnapshot()` (the eager boot fetch) still replaces wholesale without the replay; it
  runs before React mounts, so the window is small, but it is the same shape.
- The opposite direction is unchanged: an oversized `rustInvoke` RESPONSE written by the shell is
  still dropped by the sidecar, and that caller waits its own timeout (forever for dialogs).
- No live run: the UI-freeze scenario and the send ordering under load are unobserved.
