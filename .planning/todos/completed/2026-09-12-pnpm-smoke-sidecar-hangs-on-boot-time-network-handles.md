---
created: 2026-09-12
title: "pnpm smoke:sidecar hangs at the exact 30s timeout -- an un-unref'd GOG presence keep-alive interval keeps the event loop alive past stdin EOF"
area: backend/sidecar boot / CI gate
severity: major
platform: any
ready: code
status: completed
source: quick-260912-e6k (fix sidecar uncaughtException guard EPIPE self-feed), discovered running the plan's own required `pnpm smoke:sidecar` verification step
resolved: 2026-09-13
resolved_by: quick-260913-901 (fix smoke:sidecar hang)
files:
  - src/backend/storeManagers/gog/presence.ts
resolves_phase: null
---

# `pnpm smoke:sidecar` hangs at the exact 30s timeout -- an un-unref'd GOG presence keep-alive holds the event loop past stdin EOF

**RESOLVED 2026-09-13 by quick-260913-901.** `setPresence()`'s 5-minute keep-alive interval is now
`.unref()`'d at its creation site (`src/backend/storeManagers/gog/presence.ts:39`).
`pnpm smoke:sidecar` went from `rc=1` at 30.7s (ETIMEDOUT arm) to `rc=0` in **1.9s**.

## What was observed

`pnpm smoke:sidecar` (`meta/sidecarStartupSmoke.cjs`, run in CI via `.github/workflows/test.yml`)
failed consistently and reproducibly, timing out at exactly `30000ms`:

```
[sidecar-smoke] FAIL: the sidecar did not exit within 30000ms of stdin EOF. It is hanging at
startup rather than crashing, which is its own defect.
```

Reproduced repeatedly on 2026-09-13: the raw bundle, run under the operator's real `HOME` exactly
as the gate runs it, did not exit within **60 seconds** and had to be SIGKILLed.

## Root cause -- measured AT THE TIMEOUT MOMENT (this section was rewritten; see below)

**HOLDER: the repeating 5-minute `setInterval` armed by `setPresence()` in
`src/backend/storeManagers/gog/presence.ts:39`
(`interval = setInterval(setPresence, 5 * 60 * 1000)`), never `.unref()`'d, so it referenced the
libuv event loop for the life of the process.**

Two independent instruments, both taken while the process was hung (not at t=3s):

1. **Node diagnostic report** (`--report-on-signal`, SIGUSR2 at t=40s). Of 14 `libuv` entries,
   **exactly one was both `is_active` and `is_referenced`: a `timer`**. Its address sat inside
   Node's internal per-`Environment` handle block — i.e. `env->timer_handle()`, the single libuv
   timer that drives all JS timers. Both `tcp` handles were `is_referenced: false`, and the
   `installed.json` `fs_event` was `is_referenced: false` (its existing `unref()` holds).

2. **`async_hooks` timer probe** (its own dump timer `unref()`'d so it could not be the artefact).
   Identical at t=10s, 20s, 30s and 40s:

   ```
   --- REFD Timeout asyncId=1714 _idleTimeout=300000 _repeat=300000
       at setInterval (node:timers:161:19)
       at Object.setPresence (build/main/sidecar.js:2481:18)
   ===== REFD_TIMER_COUNT=1 =====
   ```

`beforeExit` never fired, which is exactly what a ref'd timer produces: the loop never drains.

### Why the earlier "five live TLSSockets" root cause was WRONG

The previous version of this section reported five `TLSSocket`s from `pingSites()` and blamed
boot-time network fan-out. That snapshot was taken **3 seconds** after boot, while the pings were
still in flight — it measured the boot transient, not the hang. At the timeout moment the pings
had long since SUCCEEDED (`connectivity-changed {status:"online"}` was emitted) and **no socket
was referenced at all**. Network was never the holder.

### Why it looked impossible, and why `_getActiveHandles()` lied

The original investigation reasonably concluded "zero non-stdio handles, zero pending requests,
yet no exit", which looks self-contradictory. It was an **instrument artefact**:
`process._getActiveHandles()` only reports libuv handles that have a JS wrapper object. Node
multiplexes *every* JS `setTimeout`/`setInterval` onto one internal `uv_timer_t` with no JS
wrapper, so a ref'd JS timer is invisible to it by construction, and
`process._getActiveRequests()` does not report timers either.
`process.getActiveResourcesInfo()` would have shown it.

### Why it only reproduced on some machines

`setPresence()` returns early unless a GOG account is logged in
(`!GOGUser.isLoggedIn()`), so the interval is only ever armed under a profile with a live GOG
session. Under an empty fake `HOME` it is never created and the sidecar exits normally. This is
why the failure looked environment-dependent.

## Hypotheses falsified along the way

- **stdout backpressure** — three real-HOME runs with fd 1 pointing at an undrained pipe, a file,
  and `/dev/null` all hung identically; total output was 713 bytes against a ~64KB pipe buffer.
- **`installed.json` FSWatcher regression** — its `fs_event` is `is_referenced: false`.
- **A blocked native Keychain/keyring thread** — the process was demonstrably responsive
  throughout (it serviced the probe's own 10s dump interval at t=10/20/30/40s). The project also
  ships no native keyring/keytar/fsevents addon.
- **Un-unref'd `requestRustInvoke` boot-time timers** — already `.unref()`'d at
  `sidecarRpc.ts:392`; `REFD_TIMER_COUNT` was 1, and that one was `setPresence`'s.

## What is still unknown / spun out

Two separate defects were found while diagnosing this one. Neither is fixed by the `unref()`, and
each has its own pending todo:

1. **`2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md`**
   — a cold boot sits referenced on ~25 pooled keep-alive TLS sockets for ~26s, leaving the gate a
   2.3s margin on an always-cold CI runner.
2. **`2026-09-13-smoke-sidecar-cannot-detect-a-module-evaluation-crash-the-uncaughtexception-guard-makes-the-exit-code-always-zero.md`**
   — the gate's negative control FAILED: a `throw` at `bootstrap.ts` module scope still produces
   `PASS`, because the `uncaughtException` guard makes the child's exit code unconditionally 0.
   The gate's ETIMEDOUT arm (the one that caught *this* todo) is still sound.
