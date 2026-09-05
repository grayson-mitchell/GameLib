---
id: 260905-omc
slug: f9-name-the-channel-in-shell-rpc-timeout-diag
title: "F-9 — name the CHANNEL in the shell's RPC timeout/drop diagnostics"
created: 2026-09-05
mode: quick
actions_todo: .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
closes_todo: false
---

# F-9 — name the CHANNEL in the shell's RPC timeout/drop diagnostics

## What this does NOT do

**It does not close the F-9 todo, and does not answer its question.**

F-9 asks: did `id=1575` co-occur with a cookie operation? That answer is **UNDETERMINED** and
stays UNDETERMINED. The todo's own text is explicit that a park is not permission to round an
unknown to the convenient answer, and that satisfying a related *observability* requirement
(`REQ-34.4.1-GAP-11`) does not discharge F-9. The same rule binds this task. The scrollback for
id=1575's window was never captured; nothing written now can reconstruct it.

## The actionable defect underneath it

F-9's `blocked_by` states the real blocker in one line:

> `id=1575` carries no channel name, so the originating request must be located in the same
> scrollback AT THE TIME; co-occurrence cannot be settled after the fact.

That is not a fact of nature — it is a code defect, and it is still live at HEAD. So **the next**
recurrence would be exactly as unanswerable as id=1575 was. That is the part this task fixes.

Two sites in `src-tauri/src/main.rs` discard the channel name:

1. `SidecarState.pending` (`main.rs:1016`) is `HashMap<String, Sender<...>>` — id → sender only.
   The channel name is moved into the request frame and never retained. At the timeout branch
   (`main.rs:1093-1098`) the entry is removed, and with it the last trace of which channel
   opened that id.
2. The reader thread's drop diagnostic (`main.rs:8194`) can therefore only print the bare id:
   `[shell] response for unknown/timed-out id={id} (dropped)`.

## Why the fix is precedented, not invented

The **opposite direction of this same transport already names its channel.** Sidecar→Rust
(`rustInvoke`) rejects with:

```
rustInvoke timed out after 60000ms: keyring_get      # sidecarRpc.ts:385
```

and `sidecarTransport.ts:124-146` documents that format as the diagnostic contract for that
direction. Rust→sidecar (`invoke`) rejects with a bare `sidecar invoke timed out` — no channel.
The asymmetry is the whole of F-9's blind spot. This task removes it by adopting the convention
already in force on the other leg.

## Tasks

### Task 1 — retain the channel name on the pending entry

Change `pending` to hold the channel alongside the sender. On the timeout and
sidecar-closed branches, record the abandoned `id -> channel` into a bounded ring
(`ABANDONED_IDS_CAP`) on `SidecarState`, so a late response can still be attributed after its
pending entry is gone. Bounded, oldest-dropped — same shape as the existing
`STORE_EMBED_NAV_EVENTS_CAP` queue in this file, so the memory cost is fixed.

### Task 2 — name the channel in both diagnostics

- Reader thread: `[shell] response for unknown/timed-out id={id} channel={channel} (dropped)`,
  falling back to `channel=<unrecorded>` when the id is not in the ring (never guess).
- Timeout `Err`: `sidecar invoke timed out: {channel}`, mirroring `rustInvoke`'s format.

**T-28-04 boundary held:** a channel NAME is a fixed identifier from a known set, not a
`result`/`error` body. The `frontendMessage` branch in this same loop already logs channel names.
No payload is added to any diagnostic.

### Task 3 — Rust tests

Cover: the ring records id→channel on timeout; it is bounded oldest-dropped; a hit renders the
channel and a miss renders `<unrecorded>`; the timeout `Err` names the channel. RED-prove each
by inverting the assertion before committing.

## Verification

- `cd src-tauri && cargo test` — baseline at HEAD is **244 passed / 0 failed / 2 ignored**
  (measured this session). Must be 244 + new tests, still 0 failed.
- CI runs **no cargo step** (`.github/workflows/*.yml` has neither `cargo test` nor
  `cargo check`), so this is a manual gate — as the existing `timeout_for` test module already
  documents at `main.rs:9335`.
- `sidecar invoke timed out` string change: checked for consumers first. No production code
  matches on it; the only hits are in
  `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx`, which constructs its own
  `Error('sidecar invoke timed out')` as an arbitrary passthrough message and never asserts the
  Rust-emitted string. Prefix is preserved regardless, so a `startsWith`/`includes` consumer
  would still match.

## Todo disposition

Update the F-9 todo in place: **stays `pending`, stays UNDETERMINED.** Record that its
discharge condition is now *mechanically satisfiable* on the next recurrence (the diagnostic
names the channel), where previously it was not. Do not check any box, do not alter its status.
