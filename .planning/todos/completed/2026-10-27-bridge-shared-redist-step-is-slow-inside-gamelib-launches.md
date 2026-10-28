---
created: 2026-10-27
title: "Bridge shared-redist step is slow inside GameLib launches: wine calls ~4 s each, installers up to 89 s, a 15 s reg timeout leaves the ledger unsettled"
source: 261027-nd3 live gate and A/B on Manor Lords 1363080 (2026-10-27)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/launcher.ts
severity: medium
platform: macos
ready: live-gate
---

## Problem

On a bridge first launch the shared-redist step takes 3.5 to 4 minutes in GameLib, while the same
wine commands from a shell take seconds. Measured 2026-10-27 on Manor Lords 1363080, with the
bottle reset to a first launch each time (ledger moved aside, `CommonRedist` key deleted and
checked in `system.reg`):

| step | from a shell (null or Mac driver) | GameLib run A (null) | GameLib run B (Mac) |
| ---- | --------------------------------- | -------------------- | ------------------- |
| `reg query` / `reg add` | ~0.3 s | ~4 s, one hit 15 s | ~4 s, one hit 15 s |
| vcredist x86 | ~2 s | 86 s | 88 s |
| vcredist x64 | ~1-2 s | 68 s | 7 s |
| DXSETUP | 22-25 s | 23 s | 89 s |
| step start to game start | | 3 min 31 s | 3 min 40 s |

The shell runs used `CX_BOTTLE=<bottle> .../CrossOver/bin/wine <cmd>` in the same call order as
`run()`, on fresh win10_64 scratch bottles and on 1363080 itself. Neither run stalled. The A/B shows
the null display driver switch (261027-nd3) is not the cause: both drivers stall, at different
installers. The 10-25 first launch (261025-rkj) ran the three installers in about 70 s, so the
step has also become slower since then, unexplained.

Second-order effect: a HasRunKey `reg add` that runs past `REG_TIMEOUT_MS` (15 s) is recorded in
`markPending`, so the ledger does not settle on that launch even when the value was written (seen
on the 17:10 run: x86 mark present in `system.reg`, ledger unsettled). The next launch heals it,
at the cost of one more CM round trip and reg spawn. A `reg query` HasRunKey check that times out
is treated as not done, so an installer can be re-run needlessly.

## Solution

TBD. Start with the ~4 s per wine call that GameLib pays and the shell does not. Candidates, none
measured:

1. What `runWineCommand` adds for a CrossOver bottle: the env from `setupWineEnvVars`, the
   "Checking if wine version exists" step logged before every call, and whatever the CrossOver
   `bin/wine` wrapper does without `--no-update` (bottle lock or update check per call).
2. Contention with work GameLib runs in the same bottle during the step, such as the known-fixes
   step just before it, or the stray installer that `runBounded` leaves behind after a timeout.
3. Raise or split `REG_TIMEOUT_MS`, so a slow but successful `reg` call does not stop the ledger
   settling. This is a mitigation, not the fix.

Done when: a reset first launch of 1363080 runs each `reg` call in under 1 s and each installer
within a few seconds of its shell time, and the ledger settles on that launch.

## Resolution (2026-10-29)

Root cause: `runWineCommand` settled on the child's `close`, which waits for the wineserver the call
starts (it inherits the piped stdout/stderr and lingers ~3 s after the last client leaves). None of the
three candidates above (per-call env overhead, contention, `REG_TIMEOUT_MS`) was the cause. Fix: opt-in
`WineCommandArgs.resolveOnExit`, used by `runBounded` in `sharedRedistInstall.ts`. Live gate on Manor
Lords 1363080 (reset first launch, 2026-10-29): reg calls 0-1 s, vcredist x86 3 s, x64 2 s, DXSETUP 21 s,
game start 31 s after the first reg query, ledger settled on that launch.

Not shown fixed: the intermittent ~80 s wineserver stall (reproduced in a plain shell too; absent in the
one live run). Reopen as a new todo if it recurs. Session: `.planning/debug/resolved/shared-redist-slow-wine-calls.md`.
