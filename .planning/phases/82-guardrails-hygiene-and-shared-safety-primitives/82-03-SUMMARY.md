---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 03
subsystem: infra
tags: [rust, safety, tri-state, symlink, junction, safe-path, adversarial-tests, fakehome, ci]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-01 green Rust CI baseline (steampoll clippy, depot Windows fetch tests); 82-02 census floor helper (not needed here)"
provides:
  - "gamelib-safety: Tauri-free crate with Tri/Probe, wire types, safe_path, check_removal and a re-checking remove_tree, dispatch ops safety_check_removal and safety_remove_tree"
  - "gamelib-testutil: FakeHome (Rust twin of createFakeHomeProfile), make_dir_link, require_link"
  - "src/common/types/safety.ts: TS wire mirror and closed reason/kind/verdict/outcome sets, pinned by safetyWireParity.test.ts"
  - "tests/adversarial.rs: 41-row criterion-4 table, each row asserting an outside sentinel survives"
  - "rust-test.yml: gamelib-safety/gamelib-testutil as their own first cargo test step on all three OS legs, pinned by rustTestWorkflow.test.ts"
  - "crates README section 2b: destructive-path rules, and section 3 refreshed to today's wiring"
affects: [82-05, 82-06, 82-07, 82-08, 82-09, 82-11, 83-gamelib-core]

actuals:
  tokens: 26000
  tasks: 3
  commits: 4
plan_head_before: fb9ea6f9117513f54baea7bd00b5e7941a9f93ff
plan_head_after: 9699769f62b45f882dc22384d7a8555b9fc37898

tech-stack:
  added: [unicode-normalization 0.1, dunce 1 (already locked)]
  patterns:
    - "Guard-then-delete inside one Rust call: remove_tree re-runs every check and never trusts an earlier verdict"
    - "Tri verdict (Kleene AND, only Yes allows) and Probe (absent vs unreadable) as the only guard/reader shapes"
    - "Link-creating tests go through make_dir_link + require_link, which panics under CI and never silently skips"

key-files:
  created:
    - src-tauri/crates/gamelib-safety/Cargo.toml
    - src-tauri/crates/gamelib-safety/src/lib.rs
    - src-tauri/crates/gamelib-safety/src/tri.rs
    - src-tauri/crates/gamelib-safety/src/wire.rs
    - src-tauri/crates/gamelib-safety/src/safe_path.rs
    - src-tauri/crates/gamelib-safety/src/remove.rs
    - src-tauri/crates/gamelib-safety/tests/adversarial.rs
    - src-tauri/crates/gamelib-testutil/Cargo.toml
    - src-tauri/crates/gamelib-testutil/src/lib.rs
    - src/common/types/safety.ts
    - src/backend/__tests__/safetyWireParity.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/cargoFeatures.test.ts
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src-tauri/crates/README.md

key-decisions:
  - "A trailing path separator is trimmed before any lookup: lstat('link/') follows the link on Unix, which would delete the referent and break D-15"
  - "Known-install paths: empty is skipped (no install), relative or unresolvable is Unknown (refuse), a link known install is compared by both its own location and its referent"
  - "When the case probe cannot answer, the strict direction per comparison is used: containment compares Sensitive, known-install and protected-root compare Insensitive"
  - "A failed delete sets that item to No/delete-failed and recomputes overall, so overall stays the Kleene AND of the items"
  - "Sideload exec-bit rule applies to any regular file with an execute bit on Unix, per D-22; native Linux game folders with helper scripts therefore over-refuse by design"

patterns-established:
  - "Rows that depend on the volume (case, NFC/NFD) inject CaseMode and assert the Sensitive direction only when the volume under test is itself case-sensitive"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "gamelib-safety crate with Tri/Probe, safe_path, check_removal, a re-checking remove_tree and dispatch (OPS = [safety_check_removal, safety_remove_tree]), Tauri-free, no env or home reads"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-safety (25 unit tests: tri, safe_path, dispatch bad-args/unknown/panic, nested-installdir through the serde wire)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adversarial path table: nested installdir, dot segments, C:\\x, UNC, symlink and junction roots, links inside the tree and to a known install, case, NFC/NFD, protected roots, prefix, sideload, unknown, absent, twice, recheck, zero targets; each asserts an outside sentinel survives"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-safety --test adversarial (41 passed on macOS; mutation-checked by disabling check_known and link handling)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The same table passes on the windows and ubuntu CI legs (real junction and symlink_dir creation, Windows UNC, Linux case-sensitive volume)"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Only the macOS leg ran locally; D-18 makes CI the proof and plan 82-11 collects it. Windows-only rows (junction, UNC) were written but not compiled or run here."
  - id: D4
    description: "gamelib-testutil FakeHome (0700, eight variables, apply, register_capture, drop cleanup) plus make_dir_link/require_link"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-testutil (8 tests incl. mode 0700 and require_link panics on CI)"
        status: pass
    human_judgment: false
  - id: D5
    description: "TS wire mirror src/common/types/safety.ts equals the Rust serde names"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/safetyWireParity.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "rust-test.yml runs cargo test -p gamelib-safety -p gamelib-testutil as its own ungated step before the multi-crate step; lockfile names pinned"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "meta/__tests__/rustTestWorkflow.test.ts (positive, ordering and three mutation cases); src/backend/__tests__/cargoFeatures.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "README destructive-path rules section (2b) with the D-21 contrast and section 3 refreshed"
    requirement: FND-02
    verification:
      - kind: other
        ref: "grep -c '^## 2b. Destructive-path rules' src-tauri/crates/README.md; npx prettier --check src-tauri/crates/README.md"
        status: pass
    human_judgment: true
    rationale: "Wording quality of the rules section is a reading judgment; the grep only proves the required sentences are present."

duration: 16min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 03: Shared safety primitive (gamelib-safety) Summary

**One Tauri-free Rust crate now owns every destructive-path check (tri-state verdict, canonical NFC/case-aware containment, known-install nesting, link-aware guarded delete that re-checks inside the delete call), proven by a 41-row adversarial table and run first in CI on all three OS legs.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-20T07:18:56Z
- **Completed:** 2026-11-20T07:35Z
- **Tasks:** 3 (tracer, auto, auto)
- **Files modified:** 17 (11 created, 6 modified)

## Accomplishments

- `gamelib-safety` (rust-version 1.77.2, no tauri, no env/home reads, logs nothing) with `OPS = [safety_check_removal, safety_remove_tree]`, `CLI_ONLY_OPS = []`, and `dispatch` that errs only on bad args (`<op>:bad-args`), an unknown op or a panic (`<op>:panic`).
- Enforced in one place: D-17 (canonical component compare, NFC and case-fold on insensitive volumes, canonicalise failure is Unknown), D-16 (nested/inside known install with `otherKey`, `knownInstalls: null` is Unknown), D-15 (links unlinked, never followed), D-14 (delete re-checks every target, all-or-nothing), D-22 (sideload folder shared heuristic), prefix `drive_c`/`pfx` rule moved out of the TS heuristic.
- `gamelib-testutil` FakeHome plus `make_dir_link`/`require_link`; Windows junctions via `cmd /C mklink /J`, no `junction` crate.
- TS mirror `src/common/types/safety.ts` with `safetyWireParity.test.ts` (extractor has an anti-vacuity case); CI step pinned with ordering and mutation tests.

## Task Commits

1. **Task 1: Tracer, nested-installdir verdict through the serde wire, TS parity, lockfile pin, first CI step** - `97ccb6a2a` (feat)
2. **Task 2: Prefix/sideload rules, link-aware delete, adversarial table** - `8087f8084` (feat)
3. **Task 3: README rules section 2b and section 3 refresh** - `fa5b968f5` (docs)
4. **Follow-up: `@public` tags so the knip ratchet accepts the not-yet-consumed wire types** - `9699769f6` (fix)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

Tracer gate: the Task 1 `<verify>` chain (cargo test, clippy -D warnings, cargo fmt --check, jest for the three suites, `pnpm codecheck`, prettier file-info and check) was re-run green before expansion. Tracer verified end-to-end, expanded.

## Files Created/Modified

- `src-tauri/crates/gamelib-safety/src/{lib,tri,wire,safe_path,remove}.rs` - the primitive; `tests/adversarial.rs` - the table.
- `src-tauri/crates/gamelib-testutil/src/lib.rs` - FakeHome, LinkKind, make_dir_link, require_link.
- `src/common/types/safety.ts`, `src/backend/__tests__/safetyWireParity.test.ts` - wire mirror and its parity pin.
- `src-tauri/Cargo.toml`, `Cargo.lock`, `cargoFeatures.test.ts` - members, lock, `EXPECTED_LOCKFILE_CRATE_NAMES` (added `gamelib-safety`, `gamelib-testutil`, `unicode-normalization`; no other name appeared).
- `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts` - first-step pin.
- `src-tauri/crates/README.md` - section 2b, section 3.

## Decisions Made

See `key-decisions` above. The two worth repeating: the trailing-separator trim (a real D-15 hole, see Deviations) and the over-refusing exec-bit rule for sideload folders (spec-mandated, but it will refuse most native Linux game folders with helper scripts; plans 82-07/08 should word that refusal accordingly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Trailing separators trimmed before any lookup**
- **Found during:** Task 1 (designing `parse_absolute`)
- **Issue:** `symlink_metadata("<root>/link/")` follows the link on Unix, so a request path with a trailing `/` would classify a symlink root as a directory and delete its referent, defeating D-15.
- **Fix:** `parse_absolute` drops trailing `/` and `\`; a bare root is kept. Added the adversarial row `symlink_root_with_a_trailing_separator_is_still_unlinked_not_followed`.
- **Files modified:** `safe_path.rs`, `tests/adversarial.rs`
- **Committed in:** `97ccb6a2a`, `8087f8084`

**2. [Rule 3 - Blocking] knip dead-code ratchet failed on the new TS exports**
- **Found during:** plan-level verification (`pnpm find-deadcode`)
- **Issue:** 11 exported types in `safety.ts` have no non-test consumer until plan 82-05, so the ratchet reported new findings.
- **Fix:** tagged each `@public` with the justification the ratchet asks for. No baseline widened.
- **Files modified:** `src/common/types/safety.ts`
- **Committed in:** `9699769f6`

**3. [Plan staging] Task 1 carried more than the stated subset**
- `unicode-normalization` has to be in the lockfile in Task 1, so `fold_key`/`CaseMode`/`probe_case_insensitive` and the protected-root and trust-root rules landed in Task 1 instead of Task 2; Task 2 added the kind rules, link-aware delete and the table. Behaviour at the end of Task 2 is as planned.

**4. [Lockfile churn, informational]** `cargo` re-pointed ten existing dependents' `windows-sys` requirement to 0.61.2 when it added the two crates (`cargo update --workspace` produced the identical diff). Only the three expected crate names are new; `cargoFeatures.test.ts` passes.

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking), 2 informational
**Impact on plan:** None on scope; the trailing-separator fix closes a hole the plan's table did not list.

## Issues Encountered

- Only the macOS leg ran locally. Windows-only code (junction via `mklink /J`, reparse-point detection, `remove_dir` for directory links, real UNC resolution) and the Linux case-sensitive branches of the case/NFC rows were written to reason but not executed; the Windows UNC row asserts only "refuses" because a real share lookup can answer `Unknown` rather than `No`. Plan 82-11 collects the CI proof (D-18).
- The `STEAMPOLL`-style shell wiring is deliberately absent: `safety_dispatch.rs`, the `ipc_contract.rs` arm and `src-tauri/Cargo.toml [dependencies]` belong to plan 82-05.

## Known Stubs

None. The wire types are exported ahead of their first import (documented with `@public`), not stubbed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 82-05 can wrap `dispatch` in the shell arm and the TS adapter (`SAFETY_ADAPTER_REASONS` already reserved for it).
- The one CI-only unknown is whether `windows-latest` creates `symlink_dir` links without privilege trouble; `require_link` turns that into a red build rather than a silent pass.

## Self-Check: PASSED

All created files exist; commits `97ccb6a2a`, `8087f8084`, `fa5b968f5`, `9699769f6` are ancestors of HEAD; every task's acceptance criteria were re-run green (greps, 41 adversarial tests, jest x3, codecheck, find-deadcode, lint, prettier, cargo clippy/fmt).

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
