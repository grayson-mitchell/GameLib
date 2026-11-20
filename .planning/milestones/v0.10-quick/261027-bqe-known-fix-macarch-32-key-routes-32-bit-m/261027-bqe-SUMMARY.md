---
status: complete
phase: quick-261027-bqe
plan: 01
requirements: [QUICK-BQE-01, QUICK-BQE-02, QUICK-BQE-03]
commits: [a029f1f15, b4e8c11e0, 6a158a41b]
---

# Quick 261027-bqe: macArch "32" known-fix key routes 32-bit Mac builds to Windows

A tier-1 known-fix key `macArch: "32"` now seeds `mac_arch '32'` / `mac_arch_source 'known-fix'` (never verified) on Apple silicon before install routing, so `install()` takes the existing bottle/bridge branch with no Mac download.

## Commits
- a029f1f15: key + validator (only "32"), `KnowFixesInfo.macArch`, `mac_arch_source 'known-fix'`, `macArchKnownFix.ts`, two unit suites.
- b4e8c11e0: `games.ts` (import, `fetchMetadataIfNeeded` re-derivation + source carry-forward, seed in `ensurePlatformsCaptured`, stale comment), `library.ts` (known-fix '32' no longer skips the Mach-O check; paste-ready log; contradiction warning), new routing test, library tests.
- 6a158a41b: bundled seeds 57300 / 63000 / 402060, seed filter test, spec todo moved to completed/ with Resolution, cross-reference in the blocked routing todo.

## Verification (actual results)
- `npx jest src/backend/storeManagers/steam`: 71 suites, 2754 tests passed (includes unmodified, pre-dirty games.test.ts).
- knownFixes suites + new suites: pass. `npx tsc --noEmit`: clean. Prettier: clean on all committed paths. ESLint: no errors on touched files (warnings only, mostly pre-existing).
- `pnpm planning-gates`: 12/12 passed.

## Deviations
- Added `knownFixesMacArchSeeds.test.ts` (seed-file filter test) as a separate file in Task 3, so Task 1's commit does not depend on files committed later.
- Foreign-hunk protocol: games.ts staged through reverse-patched blob plus `update-index --cacheinfo`. After each commit the two foreign hunks (now at ~3111 and ~3121) remain unstaged in the working tree; games.test.ts, gamelib.json and bridge/* were never staged.
- `public/fixes/63000-steam.profile.json` (tier 2, `.profile.json` suffix, separate reader) coexists with the new `63000-steam.json`: different file, different loader, no key or precedence collision.

## Notes for the operator
- No live Apple-silicon install was run; the "no Mac download" claim rests on `macArchKnownFixRouting.test.ts`.
- Mirroring the three seed files into the remote grayson-mitchell/known-fixes repo is an operator step.
- `graphify update .` run.

## Self-Check: PASSED
