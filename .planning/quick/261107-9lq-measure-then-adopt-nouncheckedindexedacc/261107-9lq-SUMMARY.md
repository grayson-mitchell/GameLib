# Quick 261107-9lq: Measure, then adopt noUncheckedIndexedAccess (steam/)

Per-bucket noUncheckedIndexedAccess ratchet (TypeScript compiler API, equality ceilings) wired into CI; 145 non-test sites in `src/backend/storeManagers/steam/**` narrowed to 0 with no `!`.

## Commits

- d066d59fb feat: ratchet script, baseline, jest test, package.json script
- 7a79c8b17 refactor: 78 bridge/ sites
- 0466c399e refactor: 67 sites outside bridge/, CI step, todo moved, follow-up todo filed

## Final baseline (exact counts, deduplicated across both tsconfigs)

Adopted: `src/backend/storeManagers/steam` = 0 (measured 145 before fixes).
Baseline total 2,023 across 38 buckets, largest first: steam (tests) 451, screens 335, components 218, humble 176, sidecar 149, helpers 130, `backend/__tests__` 125, tools 121, meta 328 (see baseline file for full list).
Measured numbers differ slightly from the orchestrator's raw totals because sites are deduplicated per file+start+code (steam tests 451 vs 468 raw, meta 328 vs 380 which included src files pulled in by tsconfig.meta.json).

## Deviations / behaviour notes

- Malformed or impossible input now throws where the old code returned an unchecked `undefined` (all unreachable on valid input): `depot/outcome.ts selectPrimaryDepotFailure` throws on empty failures (documented non-empty precondition); `installLocation.ts resolveOverride` throws with no libraries (both callers already guard); `depot/decompress.ts` throws on an empty hosts list when no hostHealth is supplied (previously fetched from host "undefined"); `depot/hostHealth.ts` pick helper throws if no candidate (unreachable, empty list already throws).
- Other sites take the existing `null`/`continue`/default path.
- `drm/runnerClone.ts` uses `return stepFail(...)` because `stepFail` is an untyped-const arrow, so `never` does not narrow.

## Test results

- Meta ratchet test: 27 pass; fakeHomeIsolation: 7 pass; `pnpm codecheck`, `pnpm planning-gates` (12/12), eslint (0 errors), prettier all green.
- Bridge jest: 1525 pass.
- Full steam jest: 3 failures, all pre-existing and unrelated: `bottle.test.ts` and `games.test.ts` read a missing `.planning/phases/56-.../56-01-SUMMARY.md`; `macArchKnownFixRouting.test.ts` Intel case fails with my changes reverted too (host-arch dependent).
- `pnpm typecheck:indexed-access` prints PASS; tsconfig files do not contain the flag.

## Known Stubs

None.

## Self-Check: PASSED
