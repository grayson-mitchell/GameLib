---
created: 2026-09-06
title: "Queued GOG playtime never drains at boot — only drains after the next completed GOG session"
area: tauri-sidecar
status: OPEN
severity: medium
source: "quick-260906-gej, sweep FINDINGS.md section A row A2"
files:
  - src/backend/storeManagers/gog/games.ts:1346 (post-game-session syncQueuedPlaytime call site)
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
