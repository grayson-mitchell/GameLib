---
id: 260905-omc
slug: f9-name-the-channel-in-shell-rpc-timeout-diag
title: "F-9 — name the CHANNEL in the shell's RPC timeout/drop diagnostics"
status: complete
completed: 2026-09-05
actions_todo: .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
closes_todo: false
commits:
  - e4abdac11 docs — plan
  - 48ffd6472 feat — main.rs attribution + 7 cargo tests
  - 26f023246 test — CI gate (9 tests)
---

# F-9 — name the CHANNEL in the shell's RPC timeout/drop diagnostics

## The F-9 question is still UNDETERMINED

Did `id=1575` co-occur with a cookie operation? **Unknown, and now unknowable.** The scrollback for
its window was never captured, and no code written afterwards can reconstruct a diagnostic that was
never emitted. The todo stays `pending`, its status untouched, no box checked. Per its own standing
rule this is written as UNDETERMINED rather than rounded to "no", and per its own cross-link rule an
observability improvement does not discharge it — the constraint that stops `REQ-34.4.1-GAP-11`
closing F-9 applies to this task equally.

## What was actually fixed

F-9's `blocked_by` named the obstacle: *"id=1575 carries no channel name … co-occurrence cannot be
settled after the fact."* That described the **code**, not the world — and it was still true at
HEAD, so the *next* occurrence would have been just as unanswerable. Two sites discarded the channel:

| Site | Before | After |
| --- | --- | --- |
| `SidecarState.pending` (`main.rs`) | `HashMap<String, Sender<..>>` — `remove(&id)` at the timeout destroyed the only record of the id's channel | `HashMap<String, (String, Sender<..>)>` |
| reader-thread diagnostic | `response for unknown/timed-out id={id} (dropped)` | `… id={id} channel={channel} (dropped)` |

Abandoned ids (timeout **and** sidecar-disconnect) go into a bounded `id -> channel` ring —
`ABANDONED_IDS_CAP = 64`, oldest-dropped, mirroring `STORE_EMBED_NAV_EVENTS_CAP` — so a late
response is attributable after its pending entry is gone. A miss renders `channel=<unrecorded>`, a
literal that cannot be mistaken for a channel name, rather than borrowing the nearest one.

The bounded timeout `Err` now reads `sidecar invoke timed out: {channel}`.

## The finding that made this worth doing

**The opposite leg of this same transport already named its channel.** Sidecar→Rust rejects with
`rustInvoke timed out after 60000ms: keyring_get` (`sidecarRpc.ts:385`), documented as that
direction's diagnostic contract in `sidecarTransport.ts`. Rust→sidecar rejected with a bare,
unattributable string. **That asymmetry was the whole of F-9's blind spot** — so the fix is adopting
a convention already in force one layer over, not inventing one.

## Two things I got wrong first, both caught by mutation

1. **My own CI gate was blind to the case it existed for.** It asserted
   `toContain('self.record_abandoned(&id, &channel)')`. Deleting that call from the **timeout**
   branch — the exact branch F-9's event came from — left the gate **8/8 green**, because the
   disconnect branch's copy still satisfied it. A `toContain` pin catches deletion of *every*
   occurrence, never one of two. Now counted (`toHaveLength(2)`) and pinned to specific arms by the
   `Err` each returns; the same mutation reds 2.
2. **`cargo fmt` is red repo-wide, which nearly hid a hunk of mine.** Baseline at `8a48f3c59` is 61
   hunks; my tree was 62. Rather than accept "pre-existing", I diffed hunk locations against a
   stashed baseline at the same sha, isolated the one at line 8286 as mine, and fixed it. Back to
   61 — I added none.

## Verification

| Gate | Result |
| --- | --- |
| `cargo test` (`src-tauri`) | **251 passed, 0 failed, 2 ignored** — baseline this session was 244/0/2, so +7, no regressions |
| `abandonedInvokeAttribution.test.ts` | **9/9** — runs in CI |
| All 8 jest gates reading `main.rs` | **338/338** |
| `useTauriOAuthLogin.test.tsx` (only file referencing the timeout string) | **72/72** |
| `cargo fmt --check` | 61 hunks = baseline, none added |
| `cargo check` | clean, no new warnings |
| prettier + eslint on the new test file | clean |

**RED-proofs.** Every cargo test was proved by mutating the *implementation*, not the assertion:
lookup always returning the constant kills 4; removing the eviction loop kills the bounded test
alone; a last-wins ring kills 2; dropping the channel from the message kills 1; rewriting the prefix
kills 2. The CI gate: reverting the diagnostic to the bare-id form reds 2; deleting one
`record_abandoned` call reds 2.

## Notes for the next reader

- **CI runs no cargo step** (`.github/workflows/*.yml` has neither `cargo test` nor `cargo check`).
  The Rust module is a manual gate; the jest file is what actually runs on push.
- **No IPC channel was added or changed** — this is transport-internal diagnostics only, so the
  `IPC-PORT-INVENTORY.md` discipline is not engaged.
- The capture requirement in F-9 is unchanged and still binds: **`gamelib.log` cannot see shell
  `eprintln!` output** (stdout is the RPC frame pipe; diagnostics go to stderr). A future capture
  must be the full shell scrollback. A clean grep of the wrong source is not evidence of absence.
