---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
verified: 2026-11-14T00:00:00Z
status: passed
score: 6/6 must-haves verified (ARCH-03.1 to ARCH-03.6), 4 follow-up warnings
overrides_applied: 0
---

# Phase 70: Split GameInfo into shared and per-store shapes - Verification Report

**Phase Goal:** `GameInfo` carries only what every store shares; store-specific data lives in per-store shapes (split, readers migrated under a shrink-only ratchet, store types moved out of `common/types.ts`, Phase 67 passthroughs closed with strict schemas and a strip at load).
**Status:** passed (with warnings). **ARCH-03 is satisfied; the [x] / Complete stands.**
**Re-verification:** No

## Observable Truths

| # | Truth (ARCH-03.x) | Status | Evidence |
|---|---|---|---|
| 1 | .1 Shared core plus five members, discriminated union, narrowing helper | VERIFIED | `common/types.ts:223` `GameInfoCore`, `:278` `GameInfoByRunner`, `:291` `GameInfo` is a union of Steam/Gog/Legendary/Nile/Sideload. `common/gameInfoNarrowing.ts` has `isStoreGame`/`asStoreGame`. `SteamGameInfo` (`common/types/steam.ts:341`) holds `is_delisted`, `steamPlatformsCaptured`, `installable`. `metacritic_score`, `is_windows_native` and the capability flags stay in core by documented decision D-07 / CONTEXT lines 50-59 (the roadmap's "Steam-only Metacritic" wording was overridden by the operator in discuss-phase). `gameInfoNarrowing.test.ts` passes (drift guard included). |
| 2 | .2 Readers migrated; shrink-only ratchet wired | VERIFIED | `node meta/gameInfoNarrowingCeiling.cjs` -> PASS (786 files, 18 allowlisted, each with a reason). Wired in `package.json`, `.husky/pre-push`, `lint.yml` (see WR-01 for the CI-skip caveat). Wiring and ceiling tests pass. |
| 3 | .3 Store-specific types moved out of `common/types.ts` | VERIFIED | `common/types.ts` is 1254 lines (down from 1336); `typesHomes.test.ts` passes. |
| 4 | .4 All passthroughs closed, strict schemas, helper deleted | VERIFIED | The only hits for `phase70Passthrough` are the census test that forbids it, a containment-test filename, and a stale JSDoc mention in `schemaTypes.ts:10` (INFO). Census test passes. Only loose objects: the named `dlcList` blob, `wineVersionInfo`, `noWineInstallation` (WR-06). `ipcSchemas/*` and `settingsParity` tests pass. |
| 5 | .5 Strip migration on all library caches and the download queue | VERIFIED | `storeMigrations/gameInfoLibraries.ts` wired through `storeMigrations/index.ts`. `gameInfoLibraries.test.ts` and `gameInfoLibrariesEngine.test.ts` pass. Live gate: all 7 stores at schemaVersion 2, counts unchanged. |
| 6 | .6 Live gate on upgraded profile | VERIFIED | 70-UAT.md: 13/14 pass. Item 3 (Steam Friends re-login after go-offline wrap) is outside the phase surface (no `(70-NN)` commit touched the wrap) and is filed as a todo. Evidence limitation noted: the gate-window sidecar log rotated, so the IPC_INVALID_ARGS grep is partial, but the install, addNewApp and settings writes were observed working. |

Behavioural check: `npx jest` over `src/common/__tests__`, `ipcSchemas`, `storeMigrations`, `storeVersioning`, census and ratchet wiring: 50 suites / 1992 tests, all pass.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| ARCH-03 (.1 to .6) | SATISFIED | Truths 1-6 above. REQUIREMENTS.md line 35 `[x]` and the traceability row "Complete" are correct as of now, although they were ticked prematurely by 70-01. No orphaned requirement IDs for Phase 70. |

## Review warnings: gap or follow-up?

None of the warnings falsifies a must-have truth, so none is a BLOCKER. All are WARNINGs and should be tracked as follow-ups. WR-01 is a one-line fix and should be landed soon.

- **WR-01 (confirmed in `lint.yml:50-51`): follow-up, fix promptly.** The step has no `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`. It is skipped whenever lint is red, and lint is red today from another session's `updateEstimate.ts:138`. The pre-push chain also has `backend-di-ceilings` in front of it. D-15's "wired into lint.yml and pre-push" holds, and the ratchet itself passes locally. The "enforced in CI at all times" intent does not hold while an earlier step is red. This is the same trap that was fixed for Backend DI ceilings (quick 261114-2gg), so it should be fixed the same way. It does not stop the goal being achieved, because the red state comes from another session and the tool is correct.
- **WR-02: follow-up.** The ratchet counts only `isStoreGame`/`asStoreGame` and the member names. `GameInfoByRunner['x']`, `Extract<>`, `isStore` and `src/common` are not counted. D-15 asked for a shrink-only count of direct reads outside store homes. The baseline is real and reviewed, so the reader migration is verified, but the ratchet can be sidestepped. Harden it later. One bypass is already used in the `testUtils` fixtures.
- **WR-03: follow-up.** `addNewApp` validates the full union but writes only sideload. This is over-acceptance, not a rejection regression. Tighten it to the sideload member schema.
- **WR-04 / WR-05: follow-up, highest priority.** These are latent regressions: the strict schemas are stricter than the strip. Not present on the operator's profile (census showed 0 offenders), so the live gate could not hit them. But `useSteamRuntime` (removed from `GameSettings` in 56b1edc46) is a plausible real case on Linux. It would make the install dialog's `writeConfig` throw `IPC_INVALID_ARGS` and block the install, with no recovery. Nulls, array-element extra keys and `steam_metadata.json` `extra` re-injection are similar. D-12 and the plan scope did not require settings strip chains, so this is a plan gap rather than a failed truth. Recommend fixing before a release to users with older profiles.
- **WR-06, WR-07, IN-01, IN-02, and the stale `schemaTypes.ts:10` JSDoc:** follow-ups (type honesty, loose no-wine arm, `{} as SteamGameInfo` stub, a baseline reason, an undefined GOG launch-option name).

## Facts attributed

- The 8 failing `test:ci` suites, lint error `updateEstimate.ts:138` and `backend-di-ceilings` failure are outside this phase's `(70-NN)` commits per the orchestrator's attribution. I did not re-trace them. The 50 suites relevant to this phase pass.

## Human verification

None outstanding for the phase (D-16 already run by the operator).

## Gaps Summary

No blocking gaps. Phase goal achieved. Suggested follow-up plan: (a) WR-01 CI/pre-push fix; (b) WR-04/05 strip alignment (derive the strip from the schemas, add `settings/game` and `settings/global` strip chains and a `steam_metadata` `extra` sanitiser); (c) WR-02/03/06/07 hardening.

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_
