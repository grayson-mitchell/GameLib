---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 07
type: execute
completed: 2026-07-13
tasks_total: 2
tasks_done: 2
requirements: [MACSTEAM-01, MACSTEAM-02, MACSTEAM-03, MACSTEAM-04, MACSTEAM-05, MACSTEAM-06]
---

# 17-07 SUMMARY — Phase 17 validation gate (automated + human UAT sign-off)

## Outcome

Phase 17 is **validated and signed off** (`approved 2026-07-13`). Both tasks complete:

- **Task 1 (auto — full-suite gate):** ✅ green on the final merged tree (incl. 17-16). `npm test` → 50 suites / 1042 tests passed, 0 failed; `npm run codecheck` (`tsc --noEmit`) → exit 0. Steam **bottle** suite is 71/71 with **no worker force-exit** (17-16 GAP C fixed the bottle-side leak). The one residual "worker failed to exit gracefully" warning on the full run is the **pre-existing** `library.ts` `pollInstallOnce`→`readAcfState` timer leak (deferred from 17-11, tracked in `deferred-items.md`) — exit code is still 0 and it is out of scope for this phase's sign-off. `17-VALIDATION.md` Per-Task Verification Map + Test Infrastructure filled and re-confirmed across every gap-closure merge (17-08…17-16).

- **Task 2 (checkpoint:human-verify, blocking):** ✅ PASSED. Human tester ran the end-to-end macOS + CrossOver UAT. All 7 steps green:
  1. Provision + all entry points (game-details + library grid) — pass (session 5)
  2. One-time bottled-Steam login persistence — pass (session 5)
  3. Install dialog renders + install-to-disk — pass (session 5; CEF grey-bar fixed by 17-15 win10_64 template)
  4. Launch / install recognition (Install→Play, launches from GameLib) — pass (fixed via `/gsd:debug`, human-verified 2026-07-12)
  5. **Indicator** — "Runs via Windows Steam bottle" row shows — pass (session 6, 2026-07-13)
  6. **D-11 guard** — unsynced-platform game not force-bottled — pass (session 6, 2026-07-13)
  7. **Scope fences** — native-Mac steam://, GOG/Epic shared bottle unchanged, Linux Proton delegation, steamwebhelper-hang recovery hint — pass (session 6, 2026-07-13)

## 17-16 static gap-fixes re-confirmed on real hardware (session 6)

- **GAP-17-PROVISIONED-FLAG-STUCK** (GAP A) — guided-setup surface no longer reappears after a completed click-through install (no re-provision loop).
- **GAP-17-CEF-RECREATE-RUNNING** (GAP B) — win32→win64 auto-recreate now succeeds while the bottled Steam client is running (WINEPREFIX-scoped `wineserver -k` before `cxbottle --delete`; no "applications still running" abort).
- **Focus / leak-safe raise loop** (GAP C) — focus reliably moves to the bottled Steam / installer window.

## Requirements confirmed

MACSTEAM-01..06 confirmed in reality (not just unit tests): per-OS `isNative()` + D-11 guard (01), guided provisioning + all entry points (02), bottled login persistence (03), bottled install/launch (04), bottle-scoped ACF badge = Windows install (05), D-08 "runs via Windows Steam bottle" indicator (06). Scope fences (Linux Proton / Windows / native-Mac steam:// / GOG-Epic shared bottle) confirmed unchanged.

## Files touched

- `.planning/phases/17-.../17-VALIDATION.md` — filled automated map, recorded all 6 UAT sessions, `approved 2026-07-13` sign-off, `status: approved`.

## Notes / deferred (not gaps, documented)

- `library.ts` `pollInstallOnce` timer leak — pre-existing (17-11), full-suite force-exit warning only, exit 0. Tracked in `deferred-items.md`.
- GAME-05 "Playing" badge parity for bottled games — explicitly out of Phase 17 scope (install + launch only); known follow-up limitation.

## Next

Phase 17 ready for `/gsd-verify-work` (goal verification) and `/gsd:secure-phase` (threat-mitigation audit), then v0.5 continues with Phase 19.

## Self-Check: PASSED
