---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 10
subsystem: meta-tooling
tags: [rust, scanners, cli, parity-sweep, fake-home]
requires: [63-05]
provides:
  - meta/gamelibScanCli.ts (resolveScanCliPath, runScanCliSync, runScanCliBatch)
  - pnpm scanner-parity-sweep (D-12 tier 2)
affects: [63-11]
key-files:
  created:
    - meta/gamelibScanCli.ts
    - meta/__tests__/gamelibScanCli.test.ts
    - meta/scannerParitySweep.ts
    - meta/__tests__/scannerParitySweep.test.ts
  modified:
    - meta/bridgeCensus.ts
    - package.json
    - knip.jsonc
decisions:
  - Census objdump arm and importParse.ts kept; only the two D-09 PE reads moved to the CLI.
  - cargo build is a package.json prefix (scan-cli:build), never spawned under a fake HOME.
  - Sweep Rust side is one --ndjson process with one fresh profile.
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 63 Plan 10: CLI helper, census D-09 lines and parity sweep Summary

Headless path to the Rust scanners: a fake-HOME CLI spawn helper, the census's delay-import and Steam DRM reads routed through it, and a local tier-2 sweep that diffs the TS oracle against Rust and exits non-zero on any diff or on zero inputs.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 CLI helper + census | f134489b5 | gamelibScanCli.ts, census readDelayImports/scanExeSteamDrm via CLI, `scan-cli:build` + bridge-census prefix |
| 2 Parity sweep | 2f786347f | scannerParitySweep.ts, tests, package.json script, knip entry |

## Plumbing smoke run

Two fixture copies (bind-present.bin as a.exe, bind-absent.bin as b.exe):
`pnpm scanner-parity-sweep --no-bottles --root <scratch> --scanner peSections`

```
scanner-parity-sweep: exes=2 dlls=0 wineBundles=0 requests=2
scanner | checked | equal | diff
peSections | 2 | 2 | 0
```
Exit 0. Without inputs (`--no-bottles` alone) exit is 3. The sweep was not run against real games (63-11 does that).

## Deviations from Plan

**1. [Rule 3 - Blocking] Census main() would run inside the sweep bundle.** The sweep imports census helpers; esbuild runs the census module's top-level `main()` guard (only JEST_WORKER_ID). Fix: guard now also requires `!process.env.GAMELIB_SWEEP_BUNDLE`, and the `scanner-parity-sweep` script compiles with `--define:process.env.GAMELIB_SWEEP_BUNDLE=true`. Commit 2f786347f.

**2. [Rule 3] ObjdumpRunner type.** The plan's runObjdump shape returned `string | null`; the real type is `Promise<{code, stdout}>`. Adapted.

**3.** The census exports (BOTTLES_DIR, readManifests, walkExes, isExcludedExeName) landed in the Task 1 commit with the census edit rather than Task 2.

Wine bundle default enumeration searches `~/Library/Application Support/gamelib/tools/{wine,steam-engines}` for winemac.so (depth-bounded).

## Deferred / out-of-scope failures

- `pnpm find-deadcode` reports 5 new findings for `RUST_SCAN_*` exports in `src/common/types/sidecarTransport.ts` (from 63-06, not touched here); no findings remain in meta/.
- `meta/__tests__/genI18nGateScope.test.ts` fails (A-17 live git derivation); unrelated to this plan.

## Checks

Passed: jest (gamelibScanCli, scannerParitySweep, bridgeCensus, fakeHomeIsolation), `tsc -p tsconfig.meta.json`, prettier --check on written paths (none ignored), `graphify update .`.

## Self-Check: PASSED
