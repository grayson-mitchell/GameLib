---
created: 2026-09-13
title: "The sidecar's stdin-owned exit contract is load-bearing, broken three times in three weeks, documented only in scattered inline comments, and gated only by smoke:sidecar"
area: backend/sidecar boot / CI gate
severity: medium
platform: any
ready: code
status: pending
source: quick-260913-m9c follow-up; the orchestrator's original "there is no shutdown path" framing was WRONG and is corrected below
files:
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/installedJsonWatcher.ts
  - src/backend/storeManagers/gog/presence.ts
  - meta/sidecarStartupSmoke.cjs
  - CLAUDE.md
resolves_phase: null
---

# The sidecar's exit contract is real, load-bearing, and written down nowhere central

## First, the correction — what this todo is NOT

This was nearly filed as "the sidecar has no shutdown path at all." **That framing was wrong
in two separate ways** and is recorded here so nobody re-derives it:

1. **The Rust shell does reap the sidecar.** `SidecarState::shutdown_child()`
   (`src-tauri/src/main.rs:1158`) is called from the `RunEvent::Exit` handler: on unix it
   SIGTERMs the sidecar's whole process group, polls `try_wait()` through a bounded grace
   period, then SIGKILLs. Quick task `260907-juv` (Layer B) widened it from the sidecar alone
   to the group precisely so `comet` and the Steam bridge helper get a catchable signal.
2. **`startRpcServer()`'s lack of an `'end'` handler is BY DESIGN, not an oversight.** The
   design is stated at `installedJsonWatcher.ts:133-142`: the sidecar's *"lifetime is owned by
   stdin (the RPC frame stream), and it must exit when the shell closes it."* Exit happens by
   **event-loop drain**, not by an explicit EOF handler. That is why there is nothing to hang
   an `'end'` listener on, and adding one would not be the fix.

## The actual finding

Because exit is by event-loop drain, the whole design rests on one invariant:

> **No handle may hold a reference to the event loop past stdin EOF.**

That invariant is load-bearing, it is real, and it is enforced almost entirely by developer
discipline. Measured at `a5a84eac9`:

- **13 `unref()` call sites** exist across sidecar-reachable backend code — every one of them
  a place where someone had to remember this rule unprompted.
- The contract itself is written in **exactly three files**: `installedJsonWatcher.ts`,
  `gog/presence.ts`, and `meta/sidecarStartupSmoke.cjs`. All three state it as a local
  in-situ comment attached to their own fix.
- It appears **nowhere central**. `CLAUDE.md`'s only `unref` mention (line 167) cites the GOG
  presence defect as an *example* inside the fake-HOME two-profile section — it never states
  the contract. `.planning/spikes/CONVENTIONS.md` has nothing.
- **No test asserts it.** The two test files that match `unref` do so incidentally: one names
  the defect inside a string literal, the other matched the unrelated word "unrefreshed".

## Evidence it is load-bearing: three breaks in three weeks

| when | what referenced the loop | how it was found |
| --- | --- | --- |
| 2026-08-29 (`ef77e4a1e`) | the `installed.json` `FSWatcher` | `smoke:sidecar` went red; bisection |
| 2026-09-13 (`9e8e1b224`) | an un-`unref()`-ed 5-minute `setInterval` in `setPresence()` | a full day of investigation; invisible to `_getActiveHandles()` |
| open (`260913-m9c`) | ~5 in-flight boot downloads on `https.globalAgent` | a diagnostic report plus an agent probe |

Note the third is a **different class** and is the reason this contract needs stating rather
than just more `unref()` calls: those sockets are *in-flight*, not idle. `unref()` is the
wrong tool for them, and someone reading only the two in-situ comments would reach for it.

## Why the existing gate is not sufficient

`pnpm smoke:sidecar` (`.github/workflows/test.yml:32`) is the only thing enforcing this, and it
is a blunt instrument for the job:

- It catches **total failure to exit** (its `ETIMEDOUT` arm) but not **slow** exit. Todo
  `260913-m9c` measured cold boots at 27–39s against a 30s budget, i.e. the contract can be
  substantially violated while the gate stays green.
- It is the **named real-profile exemption** of the two-profile rule, so it runs warm locally
  and only ever sees the cold path on CI.
- A developer who breaks the contract learns about it from a red CI gate with a 30s timeout,
  not from anything at the call site they are writing.

## What remains

1. **Write the contract down once, centrally** — most likely a `CLAUDE.md` convention
   alongside the two-profile rule, derived from the `installedJsonWatcher.ts:133-142` comment
   rather than composed fresh. It must say both halves: `unref()` every handle you create AND
   do not leave unbounded in-flight work at boot, because the second is what `260913-m9c`
   proved `unref()` cannot fix.
2. **Consider a gate.** A source gate over sidecar-reachable `setInterval`/`setTimeout`/
   watcher/socket creation is plausible, but note it would have caught none of the three real
   breaks cleanly — and this repo has a standing rule against gates that appear to cover more
   than they do. A gate that cannot see the in-flight class would be worse than the honest
   sentence. Decide deliberately; do not add one reflexively.
3. **Beware the grep spelling.** `.unref?.()` is the dominant form in this codebase — **8 of
   the 13** sites use optional-call syntax. A census grepping `\.unref()` returns 5 and looks
   complete. That miscount happened while writing this todo and is exactly how a "nothing here"
   conclusion gets reached on a live population.

## Not in scope

Do **not** "fix" this by adding an `'end'`/`'close'` handler to `startRpcServer()`, by
weakening `installUncaughtExceptionGuard()`, or by raising `STARTUP_TIMEOUT_MS`. The first
misunderstands the design; the other two are pinned by their own todos.
