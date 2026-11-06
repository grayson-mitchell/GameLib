---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 16
subsystem: steam-bridge-drm
tags: [live-gate, drm, steamclient-layer, grim-dawn]
requires: [56-15]
provides:
  - scored 56-15-LIVE-GATE.md (Verdict FAIL at item 4)
affects: [phase-56-verification]
key-files:
  modified:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md
  created:
    - .planning/todos/pending/2026-10-28-drm-second-launch-bottle-stage-hang.md
    - .planning/todos/pending/2026-10-28-grim-dawn-drm-crash-after-getactionsethandle.md
    - .planning/todos/pending/2026-10-28-stale-redist-status-after-bridge-install-disables-play.md
    - .planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md
    - .planning/todos/pending/2026-10-28-bridge-notice-dialog-display-unconfirmed.md
decisions:
  - "Gate verdict FAIL at item 4: Grim Dawn passed D-15/D-16 but crashed before its menu"
metrics:
  tasks: 4
  completed: 2026-10-28
---

# Phase 56 Plan 16: Run the Phase 56 live gate Summary

The gate ran and **failed at item 4**: Grim Dawn 219990 got through the steamclient-layer DRM setup and Steam init (census `verified`), but crashed with a null read before its main menu. Raft reached its menu in DRM mode and is `verified`; Ranch Simulator never took the DRM path.

## Verdict (verbatim)

`Verdict: FAIL — item 4: Grim Dawn 219990 never reached its main menu; it crashed (c0000005, null read after ISteamController_SteamController008_GetActionSetHandle) although the D-15/D-16 criterion held (census verified, game call ISteamUser_SteamUser017_GetSteamID); the launch-4 HKLM diagnostic failed at drm-bottle-stage and gave no signal`

## Census rows

| appId | evidence | evidenceDetail |
| --- | --- | --- |
| 219990 | verified | game call ISteamUser_SteamUser017_GetSteamID |
| 648800 | verified | game call ISteamUser_SteamUser017_GetSteamID |
| 1119730 | unverified | no HELLO |

## Item scores

| Item | Result |
| --- | --- |
| 1 component (D-18) | pass: six names, sha256 matches the pin, unsigned, `component=download` |
| 2 reinstall | pass: `StateFlags` 4 |
| 3 DRM setup | pass: one anchor, zero `drm-` notices |
| 4 menu | issue: crash c0000005 at `grim dawn.exe+0x1d10a`, read of 0x18 |
| 5 attach (D-15) | pass: role=game pid 240, no role=helper lines |
| 6 census (D-16) | pass: verified, names pinned |
| 7 D-21 | issue: literal count 5, all shared-redist marks (contract defect, Gap 5); no InstallPath keys at launch 1 |
| 8 Raft | pass: DRM mode, menu reached, verified, no `gamelib_bridge.cfg` left |
| 9 Ranch | issue: ordinary bridge path (`stubbed:` notice), exited in 2-3 s twice, `no HELLO` |
| 10 networking lead | pass (recorded): `SteamNetworkingSocketsSerialized005` count 0 in every capture |
| 11 HKLM diagnostic | issue: armed, two attempts, both failed at `drm-bottle-stage`; no D-21 signal |

## Traced call names (Grim Dawn, launch 1)

role=game, pid 240, iface `SteamClient017`; 23 calls pinned verbatim in item 6 (including `ISteamUser_SteamUser017_GetSteamID`, `ISteamApps_..._BIsSubscribedApp`, `ISteamController_SteamController008_Init` and `..._GetActionSetHandle`). No role=helper lines. None of the counting names starts with `ISteamClient_` or contains `SetMinidumpSteamID`.

## Item 11 outcome

Armed because item 4 failed. Claude added both F7 `InstallPath` keys (clone runner `bin/wine` + CX_BOTTLE). Launch 4 failed twice (22:49:14 and the delimited retry 09:55:04Z) at `drm-bottle-stage` on a `reg add` timeout, so the game never started. Both keys were then deleted and `system.reg` shows 0 `InstallPath` lines and 0 bare Valve\Steam key lines.

## D-E handling

Contract commit scored against: `7909f4612` (56-15 Task 4; authored in `3e0f07035`). Sections 1-4 diff against `7909f4612` is empty (checked with `diff`; the item-6 call-name pin lives in Section 5). `git diff --stat 7909f4612` of the contract: 1 file, 50 insertions, 13 deletions, all in `result:` lines, Run record, Gaps and the Verdict line.

## Gaps (for /gsd:verify-work)

1. Preflight never checked that Grim Dawn was uninstalled elsewhere. Non-blocking, contract.
2. Route notice shows the scan-miss warning for a DRM-mode title. Non-blocking, product.
3. Stale `redist` status after a bridge install disables Play. Blocking for install UX, product.
4. Cmd+R reload is a no-op under Tauri. Non-blocking.
5. Item 7 regex counts shared-redist `CommonRedist` marks. Non-blocking, contract defect.
6. Install-time "could not restore the Wine display driver" warning. Non-blocking.
7. Grim Dawn crashes after `GetActionSetHandle`. **Blocking** (item 4).
8. pc6-pid.txt captured before the window was up. Non-blocking, process.
9. Second DRM launch in a bottle hangs at bottle-stage (wineboot --init, winedevice spin). **Blocking** for DRM mode.
10. `display=unconfirmed` bridge-notice dialog. Non-blocking.
11. Ranch Simulator took the ordinary bridge path and exited in 2-3 s. Non-blocking.
12. `reg delete /f` of the Wow6432Node key also deleted the CommonRedist marks; restored by Claude. Non-blocking, process.
13. Gate fails at item 4; HKLM keys untested as a fix. Blocking.

Five todos were filed in `.planning/todos/pending/` for gaps 9, 7, 3, 2 and 10.

## Deviations from Plan

- **[Rule 1 - collateral damage] CommonRedist marks.** Deleting the HKLM Wow6432Node key removed its `Apps\CommonRedist` subtree (Gap 12). I re-added all five marks from the launch-4 `system.reg` copy; `grep` shows them back. The plan's Task 4 verify regex (no closing `]`) therefore still counts 5 and cannot reach 0 (Gap 5).
- **Contract file gaps.** There was no LAUNCH 3 delimiter and no per-launch `gamelib-launch-2.log` / `-3.log`. Claude created those two as copies of the cumulative `gamelib-launch-4.log` and recorded this in the Run record.
- **Extra launches.** Two unscripted DRM launches (Grim Dawn 22:49:14, Raft 22:52:09) are recorded outside the contract.
- The plan's `autonomous: false` Task 1 and Task 3 were operator checkpoints and ran as such.

## Known Stubs

None.

## Self-Check: PASSED

- 56-15-LIVE-GATE.md has no `result: pending`, one `Verdict:` line, Sections 1-4 unchanged.
- Commits `8be3911be` (Task 2) and `36539c9e4` (Task 4) exist.
- `pnpm planning-gates`: 12/12 passed.
