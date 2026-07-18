---
created: 2026-07-19T00:00:00.000Z
title: "Steam native install progress: speed, ETA, paused-state"
area: steam
files:
  - src/backend/storeManagers/steam/library.ts:1234-1299
  - src/backend/storeManagers/steam/library.ts:1243-1251
  - src/backend/storeManagers/steam/games.ts:604
  - src/frontend/state/InstallProgress.ts:10-12
  - src/frontend/screens/Library/components/GameCard/index.tsx:147-186
---

## Problem

The native-installer-OFF Steam install path (`enableSteamNativeInstall` off →
`steam://install` handoff → `startInstallPolling` → `pollInstallOnce`) already
surfaces a **live download percentage** on the game card, verified live on
2026-07-19 by driving the real built app under Playwright (renderer received
`progressUpdate{runner:'steam', progress:{percent}}` 37→72, edge payloads
0/100/malformed with zero renderer errors). The plumbing works and is generic
over runner (`InstallProgress.ts:10-12` stores under `${appName}_${runner}`;
`hasProgress` → GameCard renders the bar). This todo is **polish on working
code, not new plumbing** — it makes the OFF path a genuinely good install UX,
which matters because it's the simpler alternative to the hard-to-get-right
Phase 21 native depot installer.

Three concrete gaps remain:

1. **Download speed** is not computed. The poller emits only `percent` + a
   formatted `bytes` string; there is no rate.
2. **ETA** is hardcoded empty (`eta: ''` at `library.ts:1295`).
3. **Paused/queued state is invisible.** If the user pauses the download in
   Steam, `BytesDownloaded` stops advancing and the bar just freezes at e.g.
   43% with no indication it's paused. Only the `StateFlags == 1026`
   "waiting for Steam restart" case is special-cased today
   (`library.ts:1243-1251`, `context: 'steam-waiting-for-restart'`).

Plus a trivial doc bug: `games.ts:604` still says *"Does NOT call
sendProgressUpdate — Steam owns the download with its own UI"*, misleading now
that the poller streams a percent.

## Solution

- **Speed:** in `pollInstallOnce`, track previous `BytesDownloaded` + a
  timestamp per appId (natural home is the `activePolls` entry in
  `library.ts`), and derive MB/s from the delta between ticks. Include it in
  the `progressUpdate` payload. Watch out for Steam's preallocation making
  `BytesDownloaded` jump non-linearly — smooth/clamp so speed doesn't spike.
- **ETA:** once speed exists, compute from `(bytesToDownload - bytesDownloaded)
  / speed` and emit in place of the hardcoded `eta: ''` (`library.ts:1295`).
- **Paused/stalled:** detect no byte progress across N consecutive ticks and
  surface a distinct `context` (e.g. `'steam-paused'`) analogous to the
  existing `'steam-waiting-for-restart'` hint, so the frontend shows "Paused"
  instead of a frozen spinner. Add the matching frontend hint rendering.
- **Doc fix:** correct the `games.ts:604` docstring.

**Acceptance criteria:**
- `progress` payload includes a non-empty download rate during an active
  native `steam://` install.
- ETA is populated (non-empty, decreasing) while speed > 0.
- A paused Steam download surfaces a distinct paused/stalled state rather than
  a frozen `installing` bar.
- `games.ts:604` docstring corrected.

**Regression guard:** `pollInstallOnce` is the SAME shared poller used by the
bottle install path (`source: 'bottle'`) — verify the bottle path is not
regressed (it also relies on `GAP-17-BOTTLE-PROGRESS` percent derivation).

**Related:** Phase 21 (Steam native depot install) — this is the fallback/OFF
UX. Sits alongside the shipped percent feature; no new IPC channel needed
(reuse `progressUpdate`).
