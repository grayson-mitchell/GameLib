---
phase: 60-steam-overlay-in-bridged-games-on-macos
verified: 2026-11-04T21:30:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none (UAT gaps G1-G4 were the prior failures)
  previous_score: n/a
  gaps_closed:
    - "G1 overlay takes no mouse in gameplay (60-15/17/18/19/20)"
    - "G2 DRM attach-watch false negative (60-13)"
    - "G3 overlay setting not persisted in the settings UI (60-13)"
    - "G4 overlay-unavailable notice never visible (60-14)"
  gaps_remaining: []
  regressions: []
---

# Phase 60 Verification

**Goal:** Shift+Tab opens Mac Steam's overlay, drawn correctly and taking clicks, in games GameLib launches through the macOS Steam bridge (CX_ENV dylib injection on a re-signed CrossOver clone; vendored overlay_shim for 10-bit/Metal 4).
**Re-verification:** yes, after gap closure plans 60-15..60-20.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Overlay opens, draws, takes clicks in CrossOver titles (Schedule I DXVK, Planet Crafter D3DMetal D3D11, Manor Lords D3D12 RGB10A2) | VERIFIED | UAT items 10-12 pass 2026-11-04 (operator: opens, clicks, camera released). Strict bridge criterion met (HELLO + clean GINIT, vmmap, overlay attach). |
| 2 | DRM-mode title (Grim Dawn) gets overlay; attach watch no false negative | VERIFIED | UAT item 13 pass; lsteamclient role=game trace; `applied=false reason=route` as designed; 30 s window from 60-13. |
| 3 | G1: gameplay mouse capture/cursor fixed by overlay_input.dylib (X-RELEASE+BLOCK, routes tcp-clone,env) | VERIFIED | Source `native/steam-bridge/overlay-input/overlay_input.m` and built `public/bin/arm64/darwin/overlay_input.dylib` exist; `OVERLAY_INPUT_FIX_CODE`/routes and the `overlay input fix=` log in `games.ts` (1246, 4809); `inputModulePath` wired in `overlayLaunch.ts`; UAT 14 (Staging fix on, gameplay) pass vs UAT 17 (fix off) reproduces the bug, so the fix is causal. |
| 4 | G3 setting persists (D-02) | VERIFIED | UAT item 15 pass; GamesConfig stores `steamOverlayOverride`; quick-261104-rvy merge fix present. |
| 5 | G4 in-app unavailable notice (D-08/D-09) | VERIFIED | UAT item 16 pass, three launches, `surface=in-app pushed=true`. |
| 6 | Fallback engine (Wine-Staging) handled per D-07; invite routing unchanged (D-16) | VERIFIED | UAT 14/17; `git diff b9d5c71d7..HEAD -- inviteBridge.ts` empty (recorded in UAT). |

## Spot-checks run by verifier

| Check | Result |
|-------|--------|
| `jest` overlay dir + `meta/__tests__/overlaySignal.test.ts` | 8 suites passed, 148 tests passed, 1 skipped |
| Shim/input dylibs present in `public/bin/arm64/darwin` | overlay_shim, overlay_input, overlay_input_probe present |
| Orchestrator-reported: full jest 760 suites/17510 tests, codecheck 0, hardcodedStringGate pass | accepted (not rerun) |

## Requirements

No REQUIREMENTS.md IDs. Gap IDs G1-G4 all closed with live evidence (UAT Gaps section).

## Anti-patterns / Review

60-REVIEW.md: 0 critical, 6 warnings, 7 info. Assessment against the goal:

- WR-01 (no production safety timeout: a missed 331 close leaves game input blocked) is the most substantive. It only triggers if the helper or Steam dies while the overlay is open; the game is then already in a degraded state, and the mouse is blocked, not the game. Advisory but recommended follow-up (add a bounded safety close as the probe has).
- WR-02 (probe + fix co-load) affects only diagnostic runs with GAMELIB_OVERLAY_INPUT_PROBE; not a default path.
- WR-03 (stderr cap), WR-04 (applied=true logged before prepare result: log accuracy), WR-05 (smoke tests don't assert release, skip headless), WR-06 (no DRM-route test): test/diagnostic quality. Live items 12-13 cover the behaviour. Advisory.
- IN-07 stale (marker committed in b83a8c1b2).
- No TBD/FIXME debt markers surfaced in the goal-critical paths examined.
- Lint: tests-scope warning count 665 > ceiling 661 predates the gap run (zero delta on files changed since 3ac3da9db). Pre-existing, not goal-related.

## Human verification

None outstanding. The live UAT (60-UAT.md items 1-17) was performed by the operator and constitutes the goal-level human check.

## Gaps

None blocking. Recommended follow-ups (non-blocking): WR-01 safety timeout, WR-06 DRM-route test, WR-04 log ordering, lint ceiling cleanup.

_Verified: 2026-11-04 | Verifier: Claude (gsd-verifier)_
