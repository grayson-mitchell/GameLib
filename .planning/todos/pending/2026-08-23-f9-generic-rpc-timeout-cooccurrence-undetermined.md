---
created: 2026-08-23
title: "F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED"
source: 34.4.1 gap cycle 3, plan 34 (from D-29-06 / F-9, open since gate run 2)
status: pending
severity: low
resolves_phase: null
blocked_by: "nothing external — it needs a RECURRENCE, which cannot be scheduled. Not blocked, UNSCHEDULED. Note id=1575 carries no channel name, so the originating request must be located in the same scrollback AT THE TIME; co-occurrence cannot be settled after the fact."
parked: 2026-08-23
parked_by: operator
revisit_trigger: "the timeout recurs with a cookie operation in the same window"
related_requirement: REQ-34.4.1-GAP-11
---

# F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED

```
[shell] response for unknown/timed-out id=1575 (dropped)
```

A request timed out, was abandoned, and its response arrived to find no waiter.

**`keyring:timeout` specifically did NOT fire** — plan 26's classified 8s message never appeared, and
the post-relaunch boot in gate item 2 was clean. So this is not the keyring path.

## The answer is UNDETERMINED and is recorded as such

The gate contract's specific question was: *did it co-occur with a cookie operation?*

**That is UNDETERMINED, and is deliberately NOT rounded to "no".** `id=1575` carries no channel name.
Answering it requires locating the request that opened that id in the same scrollback.

Rounding an unknown to the convenient answer is the failure this project paid nine live runs for
once already (F-10, correlation shipped as cause).

## The transferable correction — this is the valuable part

This was **first recorded as "F-9 watch CLEAN"** on the strength of a `gamelib.log` grep.

**That grep could not have seen it.** Shell `eprintln!` never reaches the log file — stdout is the
RPC frame pipe, so the shell's diagnostics go to stderr and the log captures neither.

> **A clean grep of the wrong source is not evidence of absence.**

## Discharge condition

Capture the **full shell scrollback** — not `gamelib.log` — across a run that exercises a cookie
operation, and correlate `id=` values to find which request opened the timed-out id.

## Cross-link

`REQ-34.4.1-GAP-11` is the related **observability** requirement: `keyring_get` returns a classified,
bounded-timeout error instead of silently consuming the sidecar's whole 60s RPC budget. It was
un-checked on 2026-08-23 (gap cycle 3, plan 30) because its own body says *"This box stays UNCHECKED
— live-only"*.

**GAP-11 is explicitly NOT a root-cause fix for F-9** — it is observability, and F-9's underlying
cause is not established. Do not close one by satisfying the other.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"), alongside
`REQ-34.4.1-GAP-11` and `D-29-02`. Parked is **not** assigned — no phase owns this. The answer stays
**UNDETERMINED** and must be written as such; a park is not permission to round it to "no".

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

34.6's live gate independently reproduced the **same class** of event this todo tracks — a
different id, a different session, but the same shell-layer shape:
`[shell] response for unknown/timed-out id=10023 (dropped)`, recorded during Step 6 (`egsSync`)'s
`openDialog` finding.

This is a **recurrence of the pattern, not a discharge of this specific case.** The new
occurrence's root cause was diagnosed and is different from what this todo (id=`1575`) needs
answered: it traces to `openDialog` missing from the shell's `LONG_RUNNING_CHANNELS`
(`main.rs:184`), a >60s dialog-picker interaction — tracked in its own committed todo (`99e8300f1`)
— not a cookie operation. So the new occurrence answers "was id=10023's timeout a dialog-picker
issue" (yes); it says nothing about whether id=`1575` (this todo's own case) co-occurred with a
cookie operation. That original question still requires the full shell scrollback across id=1575's
specific window, which was never captured — this todo's own established correction stands
unchanged: "a clean grep of the wrong source is not evidence of absence" (`gamelib.log` cannot see
shell `eprintln!` output).

**Stays pending, UNDETERMINED**, exactly as before. Recorded so a future reader does not mistake
the new id=10023/`openDialog` finding for a resolution of this todo's still-open id=1575 question —
same failure **class**, not the same **case** — rounding one to answer the other would repeat the
exact F-10 correlation-as-cause mistake this todo's own text already warns against.

## Disposition (2026-09-05, quick task `260905-omc`) — does NOT close

The **discharge condition is now mechanically satisfiable on the next recurrence.** It was not
before. Nothing about id=`1575` changed.

`blocked_by` above states the real obstacle: *"id=1575 carries no channel name, so the originating
request must be located in the same scrollback AT THE TIME; co-occurrence cannot be settled after
the fact."* That was true of the **code**, not of the world — and it was still true at HEAD, which
meant the *next* occurrence would have been exactly as unanswerable as this one. Two sites in
`src-tauri/src/main.rs` threw the channel name away:

- `SidecarState.pending` was `HashMap<String, Sender<..>>` — id → sender only. `pending.remove(&id)`
  on the timeout branch destroyed the last trace of which channel opened that id.
- The reader thread could therefore only print the bare id.

Both are fixed. `pending` now carries `(channel, sender)`; abandoned ids are recorded into a
bounded `id -> channel` ring (`ABANDONED_IDS_CAP = 64`, oldest-dropped); the diagnostic reads

```
[shell] response for unknown/timed-out id=1575 channel=getCookies (dropped)
```

and renders `channel=<unrecorded>` — never a guess — when the id is not in the ring. The bounded
timeout `Err` now names its channel too (`sidecar invoke timed out: {channel}`), adopting the
format the **opposite leg of this same transport already used** (`rustInvoke timed out after
60000ms: keyring_get`, `sidecarRpc.ts:385`). That asymmetry — one direction naming its channel, the
other not — was the whole of this todo's blind spot.

**The question this todo asks remains UNDETERMINED.** Did id=`1575` co-occur with a cookie
operation? Unknown, and now unknowable: the scrollback for its window was never captured, and no
code written afterwards can reconstruct a diagnostic that was never emitted. Per this todo's own
standing rule, that is recorded as UNDETERMINED and **not** rounded to "no" — and per its own
cross-link rule, an observability improvement does not discharge it (the same rule that keeps
`REQ-34.4.1-GAP-11` from closing it applies here, to this task, unchanged).

**Stays `pending`. Status unchanged. No box checked.**

What a future reader may now rely on: if this fires again, the terminal line itself names the
channel, so the `revisit_trigger` above ("the timeout recurs with a cookie operation in the same
window") becomes answerable from a single line of scrollback rather than requiring an id
correlation performed live. The correction this todo already carries still stands and still
applies to that capture — **`gamelib.log` cannot see shell `eprintln!` output** (stdout is the RPC
frame pipe; shell diagnostics go to stderr), so the capture must be the full shell scrollback, not
the log file. A clean grep of the wrong source is not evidence of absence.

Gates: `src/backend/__tests__/abandonedInvokeAttribution.test.ts` (9 tests, runs in CI) pins the
wiring; `src-tauri/src/main.rs`'s cargo module covers the helpers (251 passed, manual — CI runs no
cargo step).
