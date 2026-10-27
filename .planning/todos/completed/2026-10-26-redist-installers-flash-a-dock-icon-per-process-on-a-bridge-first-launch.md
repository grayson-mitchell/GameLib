---
created: 2026-10-26
title: "Redist installers flash a Dock icon per process on a bridge first launch"
source: 261026-jmm live gate (Manor Lords 1363080), operator report plus a desk probe the same day
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/launcher.ts
severity: minor
platform: macos
ready: live-gate
---

## Problem

On a bridge first launch that installs the shared redists (quick 261025-rkj), the operator saw the
Dock "going a bit mad" as Wine processes opened and closed. The install itself works, and later
launches skip the step, so this is cosmetic and limited to first launches.

Measured 2026-10-26 in `GameLibSteamBridge-1363080`, by diffing `lsappinfo list` (by pid) while
each command ran:

- `reg query ... /reg:32` (the HasRunKey check before and after each entry) registers no app with
  macOS, so it gets no Dock icon.
- `cmd /c ...\vcredist\2022\Microsoft Visual C++ 2022 x86.cmd` (which runs `VC_redist.x86.exe /q
  /norestart`) registers `VC_redist.x86.exe` as `type="Foreground"`, which means a Dock icon. A
  `BackgroundOnly` `VC_redist.x86.exe` and `explorer.exe` appear alongside it, with no icon.
  `/q` already shows no UI, so the icon is not an installer window.
- The same run with the Mac driver disabled (`--dll winemac.drv=d`) registers no app at all, but
  the installer exits 130 instead of 0. It fails, so this switch cannot be used as it stands.

Gotcha found on the way: CrossOver's `bin/wine` is a Perl wrapper that deletes `WINEDLLOVERRIDES`
from the environment (line 716). It takes overrides only from its own `--dll=` option (lines 162
and 717). An environment-variable test therefore silently tests nothing. GameLib's own
`setupWineEnvVars` sets `WINEDLLOVERRIDES` only for the plain-`wine` type, not for CrossOver, so it
is not affected.

The 10-25 and 10-26 runs each started three installers (vcredist x86, vcredist x64, DirectX
Jun2010). dxsetup probably starts further processes of its own (not measured), so expect several
icons per first launch.

## Solution

**Implemented 2026-10-27 in quick 261027-nd3 (`51d26a695`, `2ac9d00e7`). Only the live gate below
remains.** Desk probe first: two fresh scratch win10_64 bottles. On the Mac driver, VC_redist x86
and x64 each registered two `Foreground` apps. DXSETUP registered only a BackgroundOnly
`explorer.exe`, so it was never one of the icons. On `Graphics=null`, none of the three
registered any app, and all three installed identically: the vcredist logs read
`WixBundleInstalled = 0`, `Exit code: 0x0`, with the same `msvcp140.dll`, and DXSETUP exited 0.
Run times were unchanged. Point 1 passes. Points 2 and 3 are covered as follows. `run()` switches
lazily, just before the first real installer, and only in `GameLibSteamBridge-<appId>`, ending
the session with `wineserver -k`. A `finally` restores the exact prior value, checks it with a
read-back and ends the session again. A ledger `displayDriver` marker heals a crashed or failed
restore at the next launch. The cost is still unmeasured.

The original candidate, as first written: switch the bottle to Wine's null display driver
(`HKCU\Software\Wine\Drivers` `Graphics=null`) only for the redist step, and restore it before the
game launches. Bridge bottles hold one game each, and the step already finishes before the
monitor and game start (`fireBridgeWineLaunch`), so the window is clean. What must be proven:

1. The installers succeed under the null driver. The `winemac.drv=d` failure shows they need *a*
   display driver, but not that they need the Mac one.
2. The restore happens even if the step throws or times out, and the wineserver session (with
   its `explorer.exe`) has fully exited before the game starts. Otherwise the game could inherit
   a session with no display.
3. The cost: the extra wineserver shutdown and restart, measured against the step's ~70 s.

If the null driver also fails, record that and close as won't-fix. Nothing lets a launcher set
another process's Dock activation policy from outside.

Done when: on a first launch that installs redists (reset as in 261026-jmm: move the bottle's
`gamelib-shared-redists.json` aside and `reg delete` its `CommonRedist` key), no Wine process
registers as `Foreground` in `lsappinfo` before the game's own, every installer exits successfully
with its HasRunKey written, and the game starts normally.

## Resolution (2026-10-27, live gate passed)

Live-gated on Manor Lords 1363080 (operator-driven `tauri dev`, sidecar rebuilt), with the bottle
reset as above each time and the reset checked in `system.reg` before each launch.

- First launch with the fix (17:10): no Dock icons, the game started on the Mac driver, and
  `Graphics` was absent afterwards with no `displayDriver` marker. The vcredist x86 HasRunKey
  `reg add` ran past the 15 s `REG_TIMEOUT_MS`, so the ledger did not settle (`markPending`),
  although the value was in `system.reg`. The next launch (20:51) wrote the mark, settled, and
  started the game a second later with no display switch.
- A/B (21:02 and 21:07), the same reset each time. A: as shipped. B: switch disabled without a
  code change by storing `Graphics`=`mac` as `REG_EXPAND_SZ`, which `parseRegQueryGraphics`
  does not read, so `openNullDisplay` returns before switching.

| step | A: null (shipped) | B: Mac driver |
| ---- | ----------------- | ------------- |
| Dock icons | none | yes |
| vcredist x86 | 86 s | 88 s |
| vcredist x64 | 68 s | 7 s |
| DXSETUP | 23 s | 89 s |
| a 15 s registry timeout | x64 query | dxsetup query |
| step start to game start | 3 min 31 s | 3 min 40 s |

The fix removes the icons. The slowness is present on both drivers, so it is not caused by the
switch; it is filed separately as
`2026-10-27-bridge-shared-redist-step-is-slow-inside-gamelib-launches.md`. The extra cost of the
two session ends is within the noise of that slowness and was not isolated. Afterwards the
bottle's `Graphics` value was deleted and its ledger settled with nothing pending.
