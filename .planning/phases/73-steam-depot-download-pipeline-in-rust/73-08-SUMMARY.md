---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 08
subsystem: testing
tags: [steam-depot, golden, parity, jest, oracle]
requires: [73-07]
provides:
  - runTsOracle (real TS depot pipeline over fixtures, local HTTP server)
  - expected.json Tier 1 goldens for the seven fixture cases
  - gen:depot-goldens script
affects: [73-10]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/depotGoldenOracle.ts
    - src/backend/storeManagers/steam/__tests__/depotGolden.test.ts
    - src-tauri/crates/gamelib-depot/tests/fixtures/expected.json
  modified:
    - package.json
    - src-tauri/crates/gamelib-depot/tests/fixtures/README.md
key-decisions:
  - "Oracle drives real fetchDepotPlanEntry through a fake client, so no plan.ts export was needed"
  - "Plan inputs for Rust to mirror: ownerAppId = case appId, appinfoRank = depot index in case.json, buildid/lastOwner from case.json finalize"
  - "caseSensitive collision variant is only produced on a case-sensitive volume (GAMELIB_DEPOT_ORACLE_TMP)"
requirements-completed: [P73-A, D-14, D-15]
duration: 30min
completed: 2026-11-09
---

# Phase 73 Plan 08: TS oracle goldens Summary

The existing TS depot pipeline (manifest unwrap and parse, filename decrypt, collision resolution, chunk download over a local HTTP server, ACF finalize) now runs over all seven synthetic fixture cases and its output is committed as `expected.json`, pinned by a Jest test, before any TS code is deleted.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | a743d54b8 | `depotGoldenOracle.ts` (`runTsOracle`) |
| 2 | 39dd80e04 | `depotGolden.test.ts`, `expected.json`, `gen:depot-goldens`, README path fix |

## Verification

- Jest golden test passes without the env var (on the default case-insensitive tmp, and on a case-sensitive volume); tsc, eslint and prettier clean.
- All cases completed with zero failures, `allFilesVerified` and `allModesApplied` true, StateFlags 4 for every finalizing case, none for `shared-redist`; no absolute paths in the file.
- Collision case records `caseInsensitive` (`data/` only) and `caseSensitive` (`Data/` and `data/`) variants.

## Deviations from Plan

**1. [Rule 3 - Blocking] Manifest unwrap and plaintext names.** The TS parser cannot read `VZa`/`VSZa` wrappers, and `fetchDepotPlanEntry` always decrypts names while only `encrypted-names` has them encrypted. The oracle unwraps with steam-user's own `cdn_compression.unzip` (what `getRawManifest` does) and, when the manifest metadata says `filenames_encrypted` is false, re-encrypts names in Steam format so the real TS code runs unchanged.

**2. [Rule 1 - Bug] caseSensitive variant is host-dependent.** On macOS's case-insensitive APFS a first run recorded two real write failures and StateFlags 1026. The golden was regenerated on a case-sensitive APFS sparse image; the test compares that variant only on a case-sensitive volume and refuses to regenerate on any other. Regeneration: set `GAMELIB_DEPOT_ORACLE_TMP` to a case-sensitive directory (hdiutil recipe in the test error message).

**3. finalize inputs from case.json, not the plan's literals.** buildid and lastOwner come from each case's `finalize` (single source of truth shared with Rust) instead of `12345`/`76561197960287930`. Directory modes are omitted (umask-dependent); the ACF tree entry carries no size/sha1 (LastUpdated changes it) and is covered by the normalised `acf` text.

**4. Plan listed `meta/genDepotGoldens.ts`.** The fixture README named it; corrected to the real oracle path.

## Known Stubs

None.

## Threat Flags

None. T-73-28 (mkdtemp roots, Jest containment HOME asserted), T-73-29 (relative paths, grep 0) and T-73-30 (server unref'd and closed) mitigated.

## Self-Check: PASSED
