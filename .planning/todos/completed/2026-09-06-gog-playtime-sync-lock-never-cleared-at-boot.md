---
created: 2026-09-06
title: "GOG playtime sync lock is never cleared at boot, so one interrupted sync wedges playtime sync forever"
area: tauri-sidecar
status: "RESOLVED 2026-09-07 by quick-260907-odi -- two-leg fix. LEG 1: syncQueuedPlaytime() (gog/library.ts) now wraps its critical section in try/finally, releasing the `lock` sentinel on an in-process throw/rejection without losing queued sessions. LEG 2: bootstrap.ts's init() now calls a new clearStrandedPlaytimeSyncLock(), mirroring the deleted main.ts:469 behavior, to clear a lock stranded by process death (SIGKILL/crash/power loss), which `finally` cannot observe. This todo's own Fix sketch only prescribed the boot-clear leg (LEG 2) -- that reasoning is now superseded, since a boot-clear alone would not release the lock for the remainder of a still-running process after an in-process throw. FINDING A2 (the boot-time queue DRAIN, `runOnceWhenOnline(() => syncQueuedPlaytime())`, never restored) is explicitly OUT OF SCOPE for this fix and REMAINS OPEN, filed separately."
severity: major
source: "quick-260906-gej, sweep FINDINGS.md section A row A1"
files:
  - src/backend/sidecar/index.ts (build/main/sidecar.js:23940, playtimeSyncQueue.delete lock)
  - src/backend/storeManagers/gog/library.ts:170 (syncQueuedPlaytime guard)
resolves_phase: null
---

# GOG playtime sync lock is never cleared at boot, so one interrupted sync wedges playtime sync forever

## The unported side effect

Old `main.ts` cleared the `playtimeSyncQueue`'s `lock` entry on every boot
(`playtimeSyncQueue.delete('lock')` at `main.ts:469`). Nothing in the Tauri sidecar's bootstrap
does this now.

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

`playtimeSyncQueue.delete("lock")` appears **exactly once**, at `sidecar.js:23940`, inside
`syncQueuedPlaytime()` itself.

## Consequence

The lock is only ever cleared on the success path. A crash/kill/throw mid-sync leaves `lock`
persisted in the CacheStore, and `syncQueuedPlaytime()`'s
`if (playtimeSyncQueue.has('lock')) return` guard (`gog/library.ts:170`) then short-circuits
**forever**. `main.ts` cleared the stale lock on every boot; nothing does now. GOG playtime sync
is permanently dead after one interrupted sync.

This is one of the two findings from this sweep (with A5) that has a live user-visible
consequence on the operator's own macOS machine — the operator's platform — which is the reason
FINDINGS.md ranks it `major` rather than `medium`.

## Fix sketch

Clear the stale `lock` entry from `playtimeSyncQueue` at sidecar bootstrap, mirroring what
`main.ts:469` did on every Electron app start. The fix belongs wherever the sidecar's own
one-time boot sequence lives (see `bootstrap.ts`'s other one-time-guarded init calls for the
existing pattern), not inside `syncQueuedPlaytime()` itself — that function's own lock-check
logic is what needs its stale state cleared out from under it, not rewritten.
