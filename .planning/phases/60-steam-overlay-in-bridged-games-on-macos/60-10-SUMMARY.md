---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 10
subsystem: steam-bridge-overlay
tags: [overlay, uat, live-gate]
requires: [60-01, 60-02, 60-03, 60-04, 60-05, 60-06, 60-07, 60-08, 60-09]
provides:
  - D-15 live gate run on all four titles, recorded in 60-UAT.md
  - D-16 invite-button observation
  - Gaps G1-G4 for gap closure
affects: [.planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md]
key-files:
  modified:
    - .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md
key-decisions:
  - "D-15 gate did NOT pass: items 1-2 (both Unity titles on the CrossOver overlay runner) are `issue`; 60-UAT.md stays `status: testing` per the plan, not `complete`"
  - "D-07 todo not recreated: quick 261103-wci already shipped plain-env injection on the fallback engine and moved the todo to completed (UAT item 9 pass), so Task 3's todo step is superseded"
  - "Item 4 recorded as pass despite `overlay attach: not attached within 10s`: Steam's console_log shows the attach 3 s after the window closed; logged as diagnostic gap G2"
metrics:
  tasks: 3
  completed: 2026-11-04
---

# Phase 60 Plan 10: Overlay live gate Summary

The operator ran the D-15 gate through GameLib's real launch path on 2026-11-04. Two of the four titles pass, so the phase gate is not met.

## Results

| # | Item | Result |
|---|------|--------|
| 1 | Schedule I (Unity, DXVK, TCP) | issue: overlay works in menu, no mouse in gameplay |
| 2 | The Planet Crafter (Unity, D3DMetal, TCP) | issue: same as 1 |
| 3 | Manor Lords (Unreal, D3D12 RGB10A2, UE stub) | pass |
| 4 | Grim Dawn (DRM clone) | pass (attach-watch false negative, G2) |
| 5 | Invite button (D-16) | pass (record only: no Invite option shown) |
| 6 | Toggle off | pass |
| 7 | Fail-open toast | issue: backend notice fires, nothing reaches the operator |
| 8 | Fallback engine skipped | skipped (superseded by 9) |
| 9 | Fallback engine overlay | pass (2026-11-03) |

Every run kept the bridge verified to the strict criterion, and every overlay-on run logged `overlay=on`, `hook_set_pixel_format` and an attach line. `inviteBridge.ts` is unchanged since the phase base `b9d5c71d7`.

## Gaps (detail in 60-UAT.md)

- **G1 (blocking D-15):** no mouse in the overlay during gameplay in Unity titles on the CrossOver overlay runner. Works on the Staging fallback engine and in Unreal on the same runner. Lead: nothing calls `np_overlay_shim_set_active` (Pitfall 9).
- **G2:** the D-11 attach watch's 10 s window closes before DRM-mode attach.
- **G3:** the Advanced > Steam overlay select showed Automatic while `off` was stored (operator ~90% sure, not reproduced).
- **G4:** the overlay-unavailable notice is OS-notification only and was never seen.

## Deviations

- Item 2's first launch failed on the Staging -> CrossOver DXVK restore check (`reg query code=0`). This was already fixed by `1249a076f` (quick 261104-9ou, another session), which the running sidecar predated. A sidecar rebuild at 07:08 fixed it; not a Phase 60 defect.
- Task 3's pending D-07 todo was not created (see key-decisions).
- vmmap was captured for item 4 only. For 1-3 the game had quit before the evidence pull; `overlay_shim_load` lines show the shim in the game process.

## Self-Check: PASSED (plan tasks executed; phase goal not met, see Gaps)
