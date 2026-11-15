---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 44
subsystem: steam-cm
tags: [uat, live, post-deletion, ci]
requires: [79-43]
provides: [UAT part C results, post-deletion CI line]
affects: []
key-files:
  modified:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-UAT.md
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md
    - src-tauri/crates/gamelib-steamcm/src/vent.rs
    - .planning/todos/pending/2026-11-15-mac-steam-path-shows-playing-spacewar.md
decisions:
  - "The sign-in persona name is read with Player.GetPlayerLinkDetails, not ClientRequestFriendData: the friend-data request signed Mac Steam out of Friends & Chat (bisected live)"
  - "Pushed with the phase 76 steam-line-ceiling breach in the tree on the operator's instruction; it is phase 76's to fix"
metrics:
  completed: 2026-11-16
requirements: [CF-01, D-07, D-14]
---

# Phase 79 Plan 44: post-deletion smoke and CI Summary

UAT part C ran live on macOS on the build without steam-user and steam-session. All six items pass, one after a fix found live. CI on the post-deletion commit 1d65dab25 is green where phase 79 is concerned. The operator approved on 2026-11-16.

## UAT part C

| Item | Result |
|------|--------|
| 20 Launch: still signed in | pass |
| 21 Refresh, Mac Steam running (Rust CM path) | pass: 401 games, Friends online, no Spacewar |
| 22 Refresh, Mac Steam quit | pass: 401 games |
| 23 Install a small game (ADOM, 537 MB) | pass: Rust depot key, content servers and depot job; InstallApp adoption without restart |
| 24 Sign out, then QR sign-in | pass after fix e70995a2c |
| 25 Cmd-Q: no orphan, Mac Steam online | pass |

**Deviation from the plan's truth list:** the plan named a Mac-path Refresh with Mac Steam running. The Mac path ships OFF by default since 79-38 (Spacewar presence), so item 21 checked the Rust CM path with Mac Steam running instead.

## Defect found live and fixed

**e70995a2c: every GameLib sign-in signed Mac Steam out of Friends & Chat.** Mac Steam itself stayed logged on, with no LogOff in connection_log. The operator reproduced it twice, right after the phone approval. Two live tests isolated the cause:
1. A Refresh on the new token kept Friends online, so the logon is not the cause.
2. A temporary build that skipped the sign-in `ClientRequestFriendData` call (persona flags 0x7fff) also kept Friends online.

So the cause is that request. Mac Steam also logged clan-rank warnings one second after each one. `VentConn::personas` now calls `Player.GetPlayerLinkDetails`. The re-run kept Friends online, and the stored persona name is real (not the fallback). The crate's 277 tests, clippy and rustfmt are clean.

## Recorded, not fixed (pre-existing)

Item 23 showed that the bridge helper's InstallApp adoption and UninstallApp each flash "playing Spacewar" (AppID 480) for about 2 s. The Spacewar todo predicted this for `gl_ia_attach`, and it is now recorded there. These calls are not behind `macSteamPathEnabled()`.

## Push and CI

All hook checks were run on a clean `git archive HEAD` export. Every one passed except steam-line-ceiling: `gameLaunch.ts` is 1131 lines, from phase 76 commit eea599129. The operator chose to push anyway with `--no-verify`. The push was a986c318a..1d65dab25.

| Run | Result |
|-----|--------|
| Rust test 43748179863 | green on windows, macos and ubuntu |
| Test 43748179910 (attempt 2) | 8 baseline suites, plus 4 from other sessions: themeTokens (szs), flowRegistrationCensus and ipcDomainCensus (tk8), steamLineCeiling (phase 76). `dxvkInstallRemove` failed on attempt 1 and passed on the rerun (flake). |
| Lint | red only on the phase 76 line ceiling |
| Code check | green |
| Supply-chain 43748179923 | green |

The post-deletion line is recorded under `## Delete gate` in 79-PARITY.md (4e497e410).

## Self-Check: PASSED
