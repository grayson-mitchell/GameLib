---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 37
subsystem: steam-cm
tags: [uat, live-gate, mac-steam-path, d-09]
requires: [79-26, 79-33, 79-36]
provides:
  - UAT part B items 12-19 for plan 79-38
  - pending todo for Mac-path playtime
affects: [79-38]
key-files:
  created:
    - .planning/todos/pending/2026-11-15-refresh-playtime-on-mac-steam-path.md
  modified:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-UAT.md
metrics:
  completed: 2026-11-15
---

# Phase 79 Plan 37: UAT part B Summary

Part B of 79-UAT.md is written (items 12-19, all `result: pending`), plus a pending todo for stale playtime on the Mac Steam path.

## Items

12 Rust Refresh on the CM path, Mac Steam quit; 13 D-09 second arm (helper renamed, verdict PASS branch, Friends watched 90 s, helper restored with `test -x`); 14 Mac Steam path with no CM logon (stale-playtime note included); 15 Mac path fallback; 16 account-mismatch fallback (skipped unless a second account is available); 17 Rust store enrichment; 18 restart keeps the user signed in; 19 Force Quit during a held lease. The Structural Reachability Review has rows 12-19 and a helper-rename paragraph.

## Proof strings checked in source

All cited lines were grepped: `Steam Refresh: Mac Steam path ok ... (no CM logon)` (rustRefresh.ts), `Mac Steam path unavailable (<reason>), using CM` (refresh.ts), `helper-missing` and `account-mismatch` reasons, `[steamcm] rust <channel>` (rustSteamCm.ts), `steamcm_store_enrich` and `steamcm_store_appdetails`, `Steam Refresh enrichment:`, `Steam library sync complete:`, `CM logon mode=authenticated reason=` (session.rs).

Not provable from source: item 19's shell steamcm shutdown line after a SIGKILL of the shell (the item records it as present-or-absent, not required). Item 13's "no gooffline" proof is an absence check; the Rust path has no wrap, so no positive line exists.

## Deviations from Plan

None. Verdict in 79-WRAP-RETEST.md is PASS, so item 13 uses the unwrapped branch and names the FAIL branch for completeness.

## Self-Check: PASSED
