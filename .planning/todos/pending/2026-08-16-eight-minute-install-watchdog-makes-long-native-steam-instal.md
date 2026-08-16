---
created: 2026-08-16T21:37:50.156Z
title: "The 8-minute install watchdog makes ANY native Steam install longer than 8 minutes structurally impossible"
area: steam-depot
severity: major
found_by: "Live gate for 2026-08-16-orphaned-depot-download-outlives-failure, run 2026-08-17 (NZST) on branch fix/steam-native-install-stability"
files:
  - src/backend/downloadmanager/utils.ts:36
  - src/backend/downloadmanager/utils.ts:153-192
  - src/backend/storeManagers/steam/games.ts:1498
---

## Problem

`INSTALL_WATCHDOG_MS` is `8 * 60 * 1000` (`utils.ts:36`) and wraps the whole `install()`
call in `withTimeout` (`utils.ts:153-170`). For Steam, `install()` awaits the **entire**
depot download — `SteamGame.install()` → `installDepotDownload()` →
`runNativeDepotDownload()` → `await downloadSteamDepots(...)` (`games.ts:1498`).

So the watchdog is not a stall detector. It is a hard ceiling on total install duration:
**any native Steam install whose download takes longer than 8 minutes is declared failed**,
no matter how healthy the connection is. Since quick task `260816-vgc`, that terminal error
also aborts the in-flight download outright, so the install does not merely *report* failure
— it stops.

The user-facing error is `install did not settle — connection may be stale`, which actively
misdirects: it names a connection problem when the real cause is simply that the game is big.

## Evidence (live, 2026-08-17 NZST, Electron build, branch `fix/steam-native-install-stability`)

Installing HUMANKIND (appId `1124300`), a ~37 GB Mac-native title:

```
(09:24:09) [DownloadManager]: Aborting in-flight download for 1124300 after terminal install failure
(09:24:09) [ERROR]: Installation of 1124300 failed with: install did not settle — connection may be stale
(09:24:10) [Timing] runNativeDepotDownload: downloadSteamDepots took 480944ms (status=cancelled)
```

`480944ms` = 8m01s — the watchdog, to the second. At the trip the download was at **14%**
and the connection was **provably healthy**:

```
totalAttempts=8478 rotations=0 timeouts=0 hosts=3
cache1-akl-tpwr.steamcontent.com[a=3115 ok=3115 to=0 err=0 avgMs=385]
cache1-akl-edgx.steamcontent.com[a=2802 ok=2802 to=0 err=0 avgMs=423]
cache2-akl-tpwr.steamcontent.com[a=2561 ok=2561 to=0 err=0 avgMs=386]
```

Zero timeouts, zero errors, 8,478 successful chunk attempts. At the observed ~7.4 MiB/s,
HUMANKIND needs roughly **an hour** — it can never complete on this path. A second attempt
at 09:31 reproduced the same trajectory (1% at @16s, 6% at @148s) before being cancelled by
hand.

Evidence log preserved at
`<scratchpad>/abort-gate/RUN-20260817-humankind-watchdog.log`.

## Why this matters more than it looks

- **It makes native install unusable for most of a real Steam library.** Anything over a few
  GB on a domestic connection exceeds 8 minutes. Only small titles (WazHack-scale) can
  currently succeed, which is plausibly why Phase 23's install work never hit this.
- **It reframes `2026-08-16-orphaned-depot-download-outlives-failure`.** That todo's
  "Suspected trigger (inference — not investigated)" section blamed a race between the
  watchdog and the library-sync connection canary. That is a **red herring** — the trigger is
  download duration and nothing else. Both runs today tripped at exactly 8m with no
  concurrent sync involved.
- **`260816-vgc` made the user-visible outcome worse for large titles.** Before it, a >8min
  install was declared failed but the chunk loop kept running and could still finish and hand
  off. Now it is killed at 8:00. That fix is correct on its own terms — the defect is the
  watchdog's *scope*, not the abort. Do not fix this by reverting the abort.

## Solution

TBD — decide the shape before planning. Candidate directions:

1. **Make the watchdog a stall detector instead of a duration cap.** Reset the deadline on
   observed progress (bytes written / chunk completions) rather than timing the whole call.
   This is what the error message already claims to detect, and it preserves the watchdog's
   original purpose (catching a genuinely wedged install).
2. **Scope the watchdog to the pre-download phase only** — `ensureSteamClientReady`,
   `resolveSteamInstallTarget`, `buildDepotPlan` — and leave the streaming phase governed by
   its own per-chunk timeouts and the abort path.
3. **Raise the ceiling** — simplest, but wrong: any fixed value is a bet on connection speed
   and library size, and it re-breaks for the next-larger title.

Option 1 or 2 is likely right. Whichever is chosen, the error string must stop asserting a
connection fault it has not established.

## Verification

Not closable by jest — the property is about elapsed wall-clock against a real download.
Live gate: install a Mac-native title needing >8 minutes, and assert it reaches 100% and
writes its `appmanifest_*.acf` rather than tripping at 8m00s. The harness used for the
sibling todo (`<scratchpad>/abort-gate/monitor-abort-gate.sh`) already parses the relevant
log lines and can be inverted for this.
