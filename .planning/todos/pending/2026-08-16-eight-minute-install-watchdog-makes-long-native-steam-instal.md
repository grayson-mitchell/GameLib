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

## Resolution

**CODE FIX LANDED 2026-08-17 by quick task `260817-dib`** — commits `e92d0dc03` (RED),
`8738b6422` (GREEN), `4d2b319e8` (wire-up), `f021b6a7d` (live-gate recipe), `33744c33d` (docs).
**Option 1 was chosen.** This todo **stays in `pending/`** because the property it names is
about elapsed wall-clock against a real download and is therefore **not closable by jest** —
see `## Verification` below. It closes only when Gate A of
`.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md` passes on
hardware, which the operator runs as part of phase 23 wave 10.

What shipped:

- New runner-agnostic `src/backend/downloadmanager/installStallWatchdog.ts` exporting
  `withStallTimeout`, `isStallError`, and `INSTALL_NO_PROGRESS_TIMEOUT_MS`. `installQueueElement`
  now uses it in place of the total-duration `withTimeout`.
- **The threshold VALUE is unchanged at 480,000ms — it was re-semantified, not raised.** As a
  no-progress window it must still clear the pre-download phase's ~320s of legitimate silence
  (50s `resolveSteamInstallTarget` + 90s `STEAM_PICS_BULK_TIMEOUT_MS` × 3 attempts) and must sit
  *above* the depot layer's own inner `STALL_TIMEOUT_MS` of 3 min (`steam/depot/stallTracker.ts:46`)
  so the inner detector gives up first. Because the number does not move, the change adds zero new
  false-trip risk for any runner.
- **Anti-vacuity is the load-bearing detail.** `depot.ts:1952-1958` runs a 1s
  `PROGRESS_HEARTBEAT_MS` interval that emits an honest ~0 MB/s `progressUpdate` *regardless of
  chunk activity*. A watchdog re-armed on event **ARRIVAL** would therefore never trip for Steam —
  non-vacuous, correctly computed, and guarding **nothing**. `withStallTimeout` re-arms only on an
  observed **ADVANCE** (`percent` increased OR the `bytes` string changed), pinned by a spec that
  replays depot.ts's literal heartbeat payload for 400 ticks and asserts it **still trips**.
- Steam's progress was not reaching the bus at all: `depot.ts:1912` called
  `sendFrontendMessage('progressUpdate', …)` raw, bypassing `sendProgressUpdate`. Now routed
  through it, with the `appId`/`appName` identity traced end-to-end — a mismatch there would have
  left the watchdog silently blind for Steam.
- `260816-vgc`'s abort block (`downloadmanager/utils.ts:193-277`) is **byte-identical**; a stall
  trip reaches it through the same `status = 'error'` assignment. The new `isStallError` branch
  sits *ahead* of `isTimeoutError`, so `connection may be stale` survives only on the inner
  `withTimeout` branch where it is accurate. New i18n key `box.error.install.stalled` uses
  `{{minutes}}` (never the i18next-reserved `{{count}}`).
- No runner loses its bound. sideload has no progress emitter and degrades to exactly today's
  fixed ceiling; gog/legendary/nile/zoom already route through `sendProgressUpdate` and gain the
  same relief Steam does.

174/174 jest across 4 suites, `codecheck` clean, eslint 0 errors on touched files,
`lint-translations` exit 0 — all re-run by the orchestrator rather than accepted from agent
self-reports. VERIFICATION passed 6/6.

### Live evidence — 2026-08-17 (Age of Wonders: Planetfall)

Age of Wonders: Planetfall (appId `718850`, Mac-native, ~17.15 GB) was freshly uninstalled and
reinstalled 2026-08-17 through GameLib's native Steam depot path, on a build carrying both
`260817-ihr` (TOP_N_FANOUT / InflightLimiter throughput fix) and `260817-pkx` (SEA-sidecar
decompress-worker embedded as a Node SEA asset). Readings below are from
`~/Library/Logs/GameLib/gamelib.log`.

- Total duration: 1029s (17m09s) — well past the old 8-minute (480,000ms) ceiling.
- Proof by absence, both greps returned EMPTY:

  ```bash
  grep -n "Installation of 718850 failed with:" ~/Library/Logs/GameLib/gamelib.log
  grep -n "Aborting in-flight download for 718850" ~/Library/Logs/GameLib/gamelib.log
  ```

  Neither command produced any output. The watchdog never tripped.
- `.acf` written cleanly: `StateFlags="4"`, `SizeOnDisk="17151298416"` — full-ownership manifest,
  no manual chmod needed.
- `pool[...inline=false]` on every `[Timing] chunk-stream stats` sample from `@15s` through
  completion — decode workers really spawning via worker_threads inside the packaged SEA
  sidecar binary.
- New observation: `avgDecodeMs` climbed steadily across the run (1287ms -> 1738ms -> 2692ms)
  while `avgNetMs` stayed flat (~250-283ms). Decode is the dominant cost by the end (~9.5x net).
  The decode queue backed up early (`queued=51` at `@15s`).
- Rough throughput: ~60s/GB. Extrapolated to HUMANKIND's ~37 GB that is roughly ~37 minutes if
  the rate holds, versus the pre-fix ~93-minute projection.

**Gate A's PROPERTY is now demonstrated generically**: a Mac-native install survived well past
8 minutes without tripping, reached 100%, and wrote a clean `StateFlags=4` manifest. The
re-semantified no-progress watchdog behaved exactly as `260817-dib` intended on real hardware.

This **does not** move this todo to `completed/`. It stays in `pending/`. `LIVE-GATE.md`'s
Gate A is written entirely against appId `1124300`, and its precondition 4 binds that run to
phase `23-10` Task 1's fresh-install precondition — so only the canonical HUMANKIND run closes
this, and it has not happened yet. Two items stay open: (1) Phase 23's `23-10` Task 1 — Gate 2
must re-run CLEAN on HUMANKIND (`1124300`) specifically; (2) this todo's own closure, which
still requires that HUMANKIND-specific live gate run, not a substitute title.

## Solution (chosen: option 1)

Candidate directions as originally filed:

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
