---
phase: 61-unified-macos-engine-for-all-stores
plan: 20
subsystem: verification
tags: [uat, gates, crossover, engine-fallback, spike-068, spike-060]
requires: [61-19]
provides:
  - 61-UAT.md (12 items, run live on the operator's Mac with real CrossOver)
  - phase gate results
affects: [61-UAT.md, IPC-PORT-INVENTORY, spike 060 README]
key-files:
  created:
    - .planning/phases/61-unified-macos-engine-for-all-stores/61-UAT.md
  modified:
    - .planning/spikes/060-crossover-trial-expiry/README.md
decisions:
  - "Deadline branch: armed (z-path), taken from spike 068 verdict.json and 61-16-SUMMARY.md"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 20: Gates and live UAT Summary

The Phase 61 gates were run and the 12-item live UAT was walked on the operator's Mac under real CrossOver: 8 passed, 1 minor issue, 3 skipped.

## Tasks

| Task | Name                                  | Commits                |
| ---- | ------------------------------------- | ---------------------- |
| 1    | Run every phase gate, write 61-UAT.md | 145054a3a, 3ef324435   |
| 2    | Live UAT with the operator            | recorded in 61-UAT.md  |

145054a3a filed the five Phase 61 engine channels in IPC-PORT-INVENTORY (this cleared planning-gates). 3ef324435 wrote the UAT.

## Gate results

| Gate                  | Exit | Note                                                                                                                             |
| --------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| codecheck             | 0    |                                                                                                                                  |
| boundaries            | 0    |                                                                                                                                  |
| lint-translations     | 0    |                                                                                                                                  |
| smoke:sidecar         | 0    |                                                                                                                                  |
| planning-gates        | 0    | after 145054a3a                                                                                                                  |
| build:sidecar         | 0    |                                                                                                                                  |
| lint                  | 1    | pre-existing: tests scope 662 against 661 (it was 664 at base 850819137)                                                         |
| test:ci               | 1    | 6 pre-existing failures: bottle.test.ts, games.test.ts, macArchKnownFixRouting, tauriShellSource, x86CallbackWineHarness, genI18nGateScope A-17 |

Orchestrator fixes during the phase: c6fa096d0 (logSecretGate ratchet 14 to 15) and 575474dc2 (i18n gate artifacts repointed after the 61-17/61-18 renames).

## Deadline branch

Deadline branch: armed (z-path).

UAT item 7 observation: the normal-start half was verified live under real CrossOver for Epic Trash Goblin (19:47:10, `gameProcessWatch: game process seen`, then `launch deadline for key legendary:54f7… cancelled (first-match)`) and GOG Bloody Hell (20:01:38, cancelled at first match 14 s after launch). This closes spike 068's "CrossOver only synthetically confirmed" caveat for Epic and GOG. The hang half is not reproducible as written: an expired bottle is detected up front and always falls back to the built-in engine (item 5), so the expired-nag hang no longer occurs. The 180 s fire path is covered by unit tests only; the operator accepted this and declined a rigged hang.

## UAT results

Passed (8): items 2, 4, 5, 6, 7 (partial), 9, 10, 11. Issue (1, minor): item 3. Skipped (3): item 1 (no Epic/GOG game in the shared bottle, which no longer exists), item 8 (no two non-Steam games share a bottle; unit-tested), item 12 (Linux/Windows not reachable on a Mac). Licence mtime unchanged (Oct 22 19:57); the throwaway bottle's InstallTime was restored.

## New finding: CrossOver `InstallTime` encoding (spike 060)

The bottle `InstallTime` dword is the first-unlicensed-run Unix time XOR a constant: `K = stored ^ install_unix`. To set N days remaining, write `((install_unix - (15-N)*86400 - 3600) ^ K)`. Measured on `GameLib-legendary-54f7…`: stored `0x61431346` at install `1794034026` (the registry key's mtime); `0x614c5676` gave "5 days remaining" and `0x6145f9f6` gave "10 days remaining". The spike's `sub:` arithmetic is non-monotonic for this reason. A licensed CrossOver writes no `InstallTime` until the bottle first runs unlicensed. Appended to the spike 060 README as an Investigation Trail addendum dated 2026-11-07.

## Deviations from Plan

None - plan executed as written. (The UAT file's "passed" count in the orchestrator's brief said 7 but listed 8 items; the file records 8, recounted from the result lines.)

## Open items for the user

1. Item 3 gap: `needsFreshBottleConfirm` (src/frontend/screens/Settings/components/engineOverrideLogic.ts:48) returns true only for prefixKind 'plain', so a Legacy game with a winePrefix gets no "Move this game to its own bottle?" warning on switching to Automatic (D-04). Logged in 61-UAT.md `## Gaps`.
2. Decision needed on the A-17 / engineOverrideLogic.ts gate-scope regeneration (genI18nGateScope failure).
3. The 61-10 dropped "bogus overlay step" test coverage.
4. GOG Bloody Hell now runs on CrossOver in a fresh bottle (`GameLib-gog-1542190742`), away from its GPTK saves in `~/Games/GameLib/Prefixes/Bloody Hell`; the user may want it restored to Legacy/GPTK.

## Known Stubs

None.

## Self-Check: PASSED

Commits 145054a3a and 3ef324435 exist; 61-UAT.md has 12 `result:` lines starting with a bare status word.
