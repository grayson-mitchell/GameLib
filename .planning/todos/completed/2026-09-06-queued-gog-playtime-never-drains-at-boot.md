---
created: 2026-09-06
title: "Queued GOG playtime never drains at boot — only drains after the next completed GOG session"
area: tauri-sidecar
status: "RESOLVED 2026-09-08 by quick-260908-wk0 -- restored the boot-time drain as Block G of bootstrap.ts's init(), sequenced strictly after Block D (the stranded-lock clear from quick-260907-odi), so a queue that survived an interrupted prior sync is unlocked before this drain reads it. New exported syncQueuedPlaytimeWhenOnline() reads GlobalConfig's disablePlaytimeSync setting outside the runOnceWhenOnline callback, logs the same verbatim skip message as the deleted main.ts when sync is disabled, and otherwise defers libraryManagerMap['gog'].syncQueuedPlaytime() to online via runOnceWhenOnline(), with three guarded layers (outer try around registration, inner try around the deferred callback body, and an explicit .catch() on the floated async call) so a throw or rejection anywhere in this path can never abort sidecar boot. Proven by a new dedicated suite (playtimeQueueBootDrain.test.ts, 6 cases) plus 4 required mutations, including a load-bearing ordering mutation (Block G moved above Block D) that correctly turned the ordering assertion RED. NOT in scope for this fix: `runOnceWhenOnline(gogPresence.setPresence)`, which sat on the very next line of the deleted main.ts source -- it remains open, filed separately at `2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`. This todo's files: line (`games.ts:1346`) had already drifted to `games.ts:1391` by the time this fix landed -- noted here, not corrected, since that call site was not touched by this fix."
severity: medium
platform: any
ready: code
source: "quick-260906-gej, sweep FINDINGS.md section A row A2"
files:
  - src/backend/storeManagers/gog/games.ts:1346 (post-game-session syncQueuedPlaytime call site; drifted to :1391 as of 2026-09-08)
resolves_phase: null
---

# Queued GOG playtime never drains at boot — only drains after the next completed GOG session

## The unported side effect

Old `main.ts` called `runOnceWhenOnline(() => libraryManagerMap['gog'].syncQueuedPlaytime())` at
startup (`main.ts:471`), so any playtime queued while offline would attempt to drain as soon as
the app came online at boot.

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

The only caller of `syncQueuedPlaytime()` in the bundle is `sidecar.js:23753`
(`gog/games.ts:1346`, post-game-session). There is no boot-time call.

## Consequence

Sessions queued while offline never drain at boot — they wait for the *next* completed GOG game
session. A user who plays offline and then never launches another GOG game never uploads that
playtime.

Related to A1 (`2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md`): if a sync ever gets
interrupted, A1's stale lock will also block this drain path once it does eventually get a
trigger.
