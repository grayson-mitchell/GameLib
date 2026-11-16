---
created: 2026-11-16T00:00:00Z
title: 'Phase 79 code review: 21 warnings and 23 info findings to triage and fix'
area: steam-cm
severity: medium
platform: any
ready: live-gate
source: .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md
files: [src-tauri/crates/gamelib-steamcm/src, src-tauri/src/steamcm_dispatch.rs, src/backend/storeManagers/steam, src/frontend/screens/Login/components/SteamLogin/index.tsx, src/backend/sidecar/bootstrap.ts]
---

## Problem

The phase 79 code review (79-REVIEW.md, four slices A, B, C1 and C2) found 2 critical findings, 21 warnings and 23 info items. Both criticals were fixed before the phase closed (7744eeb7f, 63b3b470e). The warnings and info items are still open. Finding IDs are local to their slice.

## Warnings worth doing first (user-visible)

- **C2/WR-03:** signing out mid-install shows a network error, not the "sign in" action. Rust's `leaseUnknown` is not mapped to the depot crate's `not_signed_in`.
- **C2/WR-01:** a guard-code error restarts the credential poll after the dialog has closed, so a later phone approval signs the user in after they dismissed sign-in.
- **C1/WR-06:** overlapping 2 s sign-in polls can each return `done`, so one sign-in runs several library resets and Refreshes.
- **C1/WR-02:** a sign-out during sign-in finalisation is undone.
- **C1/WR-01:** Refresh takes the install-state snapshot before a 150 s Rust call, so an install or uninstall in that window is reverted.
- **C2/WR-04:** `steamcm_configure` is sent once at boot and never retried. If it fails, the signed-in session is dead for the whole app run.
- **A/WR-01:** the stages of a large first Refresh can add up to more than the 150 s limit.
- **A/WR-04:** an acquire with a different account's token swaps the credentials under live leases.
- **B/WR-02:** the shutdown restore clears the owed go-online record before the URL has opened.
- **B/WR-01:** the `steamcm_refresh` macSteam `helperPath` is not validated. The Mac path is off by default.

The remaining warnings and all info items are in 79-REVIEW.md.

## Direction

Triage with `/gsd-code-review 79 --fix` (Critical+Warning scope), or plan a small follow-up phase. Each fix needs a regression test that fails on the old code.

## Resolution (2026-11-16)

All 44 open findings are fixed and on `main`, plus the QR → credentials → QR round-trip bug. A/IN-08 was closed by operator decision (accept SteamID64 on argv, never log it). C2/IN-03 moved to its own todo, `2026-11-16-remove-the-dead-guided-go-offline-dialog-chain.md`. Commits and tests per finding are in `79-REVIEW-FIX.md`. Every behaviour fix has a regression test that fails on the old code.

The todo stays open only for the live gate below. No unit test can reach these checks. Move it to `completed/` once they pass.

## Live gate

1. `pnpm tauri:dev` (not `tauri:dev:run`). Boot while signed in, and check that a signed-in Refresh works (C2/WR-04 configure gate).
2. Sign out, then sign in by **QR**. The dialog should close once, and exactly one library Refresh should run (C1/WR-06, C2/WR-05).
3. Sign out, then sign in with **credentials plus phone approval**. Again the dialog should close once and one Refresh should run (C1/WR-02, C1/WR-06, C2/WR-01).
4. Enter a wrong Steam Guard code. The code input should stay, and the "incorrect code" copy should read right (C2/WR-02).
5. On the QR tab, switch to credentials and back to QR. A fresh code should draw and the poll should resume (round-trip fix).
6. Start a Refresh, and install or uninstall a game while it runs. The install change should survive the Refresh (C1/WR-01).
7. Optional: kill the sidecar (`kill -9`). The crash dialog should appear, and Restart should work (B/IN-02).

**Live gate passed 2026-11-16 (operator).** It turned up two follow-up UX issues in the credentials Steam Guard step, which a quick task fixes.
