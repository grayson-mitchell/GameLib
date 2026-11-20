---
phase: 75-steam-local-file-formats-in-rust
plan: 03
subsystem: steam-local-files
tags: [oracle, golden, parity, vdf, shortcuts]
requires: [75-02]
provides:
  - expected.json: 278 TS-oracle cases over the plan-02 corpus (Tier 1 golden)
  - per-area oracle modules (raw, library, installdir, acfUpdate, adoption, bridge, shortcuts)
  - steamFilesGolden.test.ts (TS == golden; GAMELIB_WRITE_STEAMFILES_GOLDENS=1 rewrites)
affects: [75-04, 75-11]
key-files:
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/oracle/*.ts (8 modules)
    - src/backend/storeManagers/steam/localFiles/__tests__/steamFilesGolden.test.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/expected.json
  modified:
    - src/backend/storeManagers/steam/localFiles/__tests__/shortcutsFixtures.test.ts
decisions:
  - A parse that never returns is captured as a `{hangs: ...}` marker, not run
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 03: TS oracle golden capture Summary

The current TS readers (`@node-steam/vdf`, `parseAcfTree`, `parseKv1`, the typed library/adoption/bridge functions and `steam-shortcut-editor` parse plus add/remove-by-title edits) were run over the synthetic corpus and pinned as 278 cases in `expected.json`, before any reader changed.

## Commits
- 50fa0c766: oracle modules and normaliser
- ce796d470: golden test and expected.json

## Findings worth carrying forward
- **`@node-steam/vdf` `parse` never terminates on truncated input** (EOF inside a block). Hits `acf/truncated.acf`, `installscript/malformed.vdf` and `scan/lib1/steamapps/appmanifest_30.acf`. The README claimed "throws"; the real behaviour is a 100% CPU spin, so a corrupt ACF in a library would freeze the sidecar. Rust parsers must return an error. Captured as `{ "hangs": ... }`; library scans run over a copy without manifest 30 and the hang is recorded as separate `library/<fn>/with-truncated-manifest` cases.
- Oracle numeric coercion confirmed in the golden (e.g. `LastOwner` 76561199000000000, manifest 9223372036854776000, sizeOnDisk as number).

## Deviations from Plan
**1. [Rule 3 - Blocking] Hang handling.** The oracle capture hung the Jest worker; added `VDF_PARSE_HANGS`/`unlessHangs` in `oracle/normalize.ts`.
**2. [Rule 3 - Blocking] tsc errors in 75-02's `shortcutsFixtures.test.ts`** (`noUncheckedIndexedAccess`) made the task's `tsc --noEmit` verify fail; fixed with optional chaining, no behaviour change.
**3.** `expected.json` is passed through prettier after generation (the generator writes plain `JSON.stringify`); reruns of the generator need `prettier --write` on it.

`getSteamLibraries` output drops the distro `/usr/share/steam` entry so the golden is machine independent. `pnpm backend-di-ceilings` pre-existing failure not touched.

## Known Stubs
None.

## Self-Check: PASSED
Jest green with and without the write env var, tsc and prettier clean, no absolute paths in expected.json, 26 `shortcuts/` cases (at least 15 required), commits 50fa0c766 and ce796d470 exist.
