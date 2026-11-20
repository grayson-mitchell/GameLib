---
phase: 65-steam-store-manager-decomposition-continued
verified: 2026-11-08T09:45:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 65: Steam store manager decomposition, continued - Verification

**Goal:** Every non-generated file under `src/backend/storeManagers/steam/` ends at or below 1,000 lines (D-01) by pure-move decomposition, with behaviour unchanged (D-14 live smoke).
**Re-verification:** No, initial.

## Observable truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No non-generated steam/ source file over 1,000 lines (D-01) | VERIFIED | Measured: largest is `depot/downloadFiles.ts` at 996. The only larger file is `shimExports.generated.ts` (1,140), which is excluded. `library.ts` is now `library/` (`index.ts` 328 lines); `bottle.ts` is 398; `shimGenerate.ts` is 192. |
| 2 | The ceiling is a lasting gate with an empty allowlist (D-02) | VERIFIED | `node meta/steamLineCeiling.cjs` prints "PASS (169 files scanned, 0 allowlisted over 1000)". It is wired as `steam-line-ceiling` in package.json. |
| 3 | Behaviour unchanged: steam suite | VERIFIED | I re-ran the steam jest suite. 4389 tests, 0 runtime-error suites, 1 failure. That failure ("known-fix macArch 32 routing Intel ...") is listed in the 65-01 pre-phase baseline `65-baseline-steam.txt`. |
| 4 | Behaviour unchanged: live smoke (D-14) | VERIFIED | Both runs passed all 5 items (65-10, 65-20 SUMMARYs). Run 2 was on a sidecar built after HEAD. Counted as human verification already done. |
| 5 | D-19 under the user-revised rule | VERIFIED | I re-ran the census command from 65-01: raw count 482, which matches the SUMMARY claim. Diffing the cycle-module set against `65-baseline-steam-cycle-modules.txt` gives 37 modules not on the list. All 37 are split products of listed files (confirmed by file headers and `git log --diff-filter=A`). They are the library/* files, bottledSteam, bridgeBottle, bridgeBottleLifecycle and provisionBottle (from library/bottle), the gameInstall* and bridgeInstallState files, gameBridgeLaunchGate and gameBridgeWineLaunch, gameMetadata (from games.ts), userTypes (from user.ts), and the bridge/drm/*, helper* and shim* files. No foreign module joined a cycle. `library.ts` and `cache.ts` left the cycle set. |
| 6 | Dependency rules at zero | VERIFIED | `pnpm boundaries` reports no violations (1095 modules). `planning-gates` passes 12/12. `codecheck` printed no errors. |

## Decision accounting (65-CONTEXT.md)

- **D-01, D-02:** Met (truths 1 and 2).
- **D-05:** `library/index.ts` is the public entry point, and `library.ts` is gone.
- **D-06, D-10, D-16:** The seven library clusters are extracted as `library/{pollState, installRoot, installedMap, acfState, macArch, resumeBreadcrumbs, restartHold, installPollOnce, installPolling, resume, runningPoll, uninstallPolling, refresh}`. These match the 65-02 through 65-05 commits.
- **D-07, D-15:** The class stubs are removed, and `user.ts` is split into `userTypes`, `userSignIn`, `userRedeem` and related free-function files.
- **D-14:** Two smoke runs, both passed.
- **D-18:** Reduced scope is recorded in 65-19. 65-13 removed 5 stubs. Quick task 261108-ca6 removed the other 10. 65-19 itself removed none. `games.ts` is 613 lines.
- **D-19:** Judged by the user-revised rule (truth 5). The goal still holds: the named accepted cycle edges in `CYCLE_EDGES` in `gamesModuleSurface.test.ts` pass 7/7, and no leaf-rule violations remain. 65-19 closed a real gap, the missing `gameBridgeLaunchGate` coverage in the leaf rule (commit 0bfd02bab).
- **User decision, 65-04 (`library/installStop.ts` leaf):** Present, and it is in the cycle set as a library split product.

## Ratchets and baselines outside the plan files

| Change | Verdict |
|--------|---------|
| `indexedAccessBaseline` steam tests 451 -> 423 | A tightening: the ratchet now reports "423 (baseline 423)". The cause was not found at 65-05, but the number only moves down. |
| `knip-baseline` edits (4bcac32d2) | Deletions only, 7 stale steam lines removed. A tightening. |
| `steamAuthSessionPolicy` / `logSecretGate` allow-list repoints | Justified. `library.ts` is repointed to `library/refresh.ts` (64c47a0e7). `userRedeem.ts` is added because `redeemKey` moved there (2573ecc44). Both follow the code. |

## Spot-check of the "pre-existing" attributions

- **find-deadcode:** It fails now, but 0 of the "new knip finding" lines are under `storeManagers/steam`. The findings are `preload/api/engine.ts`, `engineTypes`, `schemaTypes` and similar files, which come from the Phase 61 engine move or the Phase 67 schema work, not Phase 65. The "baseline line no longer found" lines are for `steam/engine/*` and `preload/api/steam.ts` engine items, also Phase 61. Attribution holds.
- **indexedAccess:** The only FAIL is `src/backend/humble` (166, below its baseline of 176). That is a slack bucket outside steam. The steam buckets pass.
- **Steam jest failure:** The single failing test is in the pre-phase baseline file (see truth 3).
- **Adjacent suites:** I did not re-run these; I did not independently verify the 7 adjacent-suite failures. They are the same list in 65-10 and 65-20, and the steam suite baseline matches.

## Anti-patterns

No TBD, FIXME or XXX markers in non-test files changed since c40f3ab81 under `steam/` or `meta/`.

## Warnings (non-blocking)

- `.planning/ROADMAP.md` is stale for Phase 65. Line 154 reads "20 plans (1 executed)" and the phase checkbox is unchecked, while the Phase Details say 20/20 complete. The orchestrator should reconcile this at phase close.
- The raw cycle count rose from 321 to 482. This was accepted by user decision (65-10) and is consistent with the revised D-19 rule. The coupling it reflects is the accepted `CYCLE_EDGES` list in `gamesModuleSurface.test.ts`.

## Human verification

None pending. Live smoke runs 1 and 2 are complete and passed.

**Verdict: the phase goal is achieved in the current tree.**

---

_Verifier: Claude (gsd-verifier)_
