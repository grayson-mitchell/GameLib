---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 17
subsystem: safety
tags: [rust, gamelib-safety, trust-root, destructive-guard, contract-test]
requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: gamelib-safety crate (check_removal, remove_tree, safe_path) and the adversarial table
provides:
  - safe_path::resolve_trust_root (existing root canonical with links followed, absent root at its nearest existing ancestor, anything else canonicalize-failed)
  - check_trust_root answers yes/absent for a target under an absent trust root (CR-01, WR-01)
  - an empty trustRoot is unknown/no-trust-root (WR-04)
  - tests/fixtures/trust-root-contract.json, the shared contract (12 rows) run against the real crate, for 82-19 to run against the TS fake
  - lexical_rows can no longer pass on zero rows (WR-08)
affects: [82-19, gog-uninstall, steam-cancel-cleanup]
actuals:
  tokens: 5518
  tasks: 3
  commits: 3
plan_head_before: 395f75aaea882fc4d6f590a13dda8b2f154af133
plan_head_after: 894e3601ecb3e043c7e585636bdbbefe7c46f893
tech-stack:
  added: []
  patterns:
    - "a trust root is resolved by three cases: exists (links followed), genuinely absent (nearest existing ancestor plus missing names), else unresolvable"
    - "one JSON contract fixture read by both the crate test and the TS fake's test"
key-files:
  created:
    - src-tauri/crates/gamelib-safety/tests/trust_root_contract.rs
    - src-tauri/crates/gamelib-safety/tests/fixtures/trust-root-contract.json
  modified:
    - src-tauri/crates/gamelib-safety/src/safe_path.rs
    - src-tauri/crates/gamelib-safety/src/remove.rs
    - src-tauri/crates/gamelib-safety/src/wire.rs
    - src-tauri/crates/gamelib-safety/tests/adversarial.rs
    - src-tauri/crates/README.md
key-decisions:
  - "An existing trust root is resolved with dunce::canonicalize, never canonical_location, so a symlinked steamapps/common keeps its games removable (T-82-46)"
  - "An absent trust root admits only absent targets, which remove_tree skips, so the fix never authorises deleting anything that exists (T-82-45)"
  - "The empty trustRoot string is matched before the may-skip arm and answers unknown/no-trust-root (T-82-47)"
requirements-completed: [FND-02, FND-01]
duration: 35min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 17: Trust-root resolution in gamelib-safety Summary

**An absent trust root (GOG `gog-support`, Steam `steamapps/common` before first write) now resolves at its nearest existing ancestor instead of answering unknown, an empty `trustRoot` is refused, and a shared 12-row contract fixture pins both against the real crate.**

## Performance

- **Duration:** about 35 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 7 (2 created, 5 modified)

## Accomplishments

- `resolve_trust_root` in `safe_path.rs` with unit tests (existing, absent two names deep, through a regular file, and on unix a symlinked and a dangling root).
- `check_trust_root` uses it, so a normal GOG uninstall and a Steam cancel before `steamapps/common` exists are no longer refused by the crate. A root that exists but cannot be resolved is still unknown.
- Empty `trustRoot` answers unknown/no-trust-root for every kind, including game-install, prefix and sideload-folder with protected roots supplied. An omitted root behaves as before.
- Contract fixture `trust-root-contract.json` (12 rows) and `trust_root_contract.rs` (floor 12), run under `cargo test -p gamelib-safety`, which the existing first `rust-test.yml` step already runs on three OSes (no workflow change).
- Adversarial table: the old over-refusal pin replaced, plus an absent root never admitting an existing target, exists-but-unresolvable roots (regular file; dangling symlink and junction), symlinked and junctioned roots followed, empty-root rows, and the `lexical_rows` match assertion with a `should_panic` probe.
- README section 2b trust-root rule; `Target.trust_root` doc in `wire.rs`.

## Task Commits

1. **Task 1 (tracer): absent trust root resolved at its nearest existing ancestor** - `f132c3687`
2. **Task 2: empty trustRoot is unknown/no-trust-root, row 12, README rule** - `bdf15193c`
3. **Task 3: adversarial rows and the lexical_rows match assertion** - `894e3601e`

## Red runs (before each fix)

Task 1, contract test against the unfixed crate (`cargo test -p gamelib-safety --test trust_root_contract`):

```
root absent, target absent under it (GOG gog-support shape): verdict Unknown, want Yes (reason CanonicalizeFailed)
root absent, target absent under it (cancel before the first write): verdict Unknown, want Yes (reason CanonicalizeFailed)
root and several ancestors absent: verdict Unknown, want Yes (reason CanonicalizeFailed)
root absent, existing target outside it: verdict Unknown, want No (reason CanonicalizeFailed)
root absent, target equal to it: verdict Unknown, want No (reason CanonicalizeFailed)
```

All three absent-root rows answered unknown/canonicalize-failed. Rows 6 and 7 (absent root, existing target outside it; target equal to it) failed the same way, which is the over-refusal collapsing the `no` verdicts too.

Task 2, row 12 before the fix:

```
empty root with a protected root supplied: verdict Yes, want Unknown (reason Ok)
empty root with a protected root supplied: remove_tree outcome Removed, want Refused
empty root with a protected root supplied: a refused target was deleted
```

## Mutation evidence (Task 3, not committed)

- Restoring the bare `dunce::canonicalize` of the trust root in `check_trust_root`: `--test adversarial` went red on `trust_root_absent_and_target_absent_is_yes_and_nothing_is_touched` (as the plan required) and also on `an_absent_trust_root_never_admits_an_existing_target` (43 passed, 2 failed).
- Restoring the `.filter(|s| !s.is_empty())` empty-string fold: red on `unknown_an_empty_trust_root_refuses_even_with_protected_roots` (44 passed, 1 failed).
- `remove.rs` was put back from a file copy and the fixed run is green (45 passed).

## Verification

- `cargo test -p gamelib-safety -p gamelib-testutil`: lib 24, adversarial 45, trust_root_contract 2, testutil 6, all passed (adversarial was 40 at HEAD, +5 as planned: 4 new tests plus the lexical probe, with the replaced pin net zero).
- `cargo clippy -p gamelib-safety -p gamelib-testutil --all-targets -- -D warnings` clean; `cargo fmt --check` clean.
- `npx prettier --file-info` not ignored and `--check` passed on the JSON fixture and `src-tauri/crates/README.md`.
- No link row was skipped on this Windows box: `--nocapture` printed no `SKIPPED`, so the junction and directory-symlink variants of the dangling-root and linked-root rows both ran.
- Acceptance greps: `resolve_trust_root` defined (1) and used in remove.rs (1); `CONTRACT_FLOOR` is 12; "An absent trust root" in the README (1); all four new adversarial tests and the `should_panic` probe present (1 each).
- The unix-only `resolve_trust_root` unit tests (`#[cfg(unix)]` symlink and dangling-symlink) could not run on this Windows host. They run on the ubuntu/macos legs of `rust-test.yml` after push.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] clippy `type_complexity` on the shapes tuple**
- **Found during:** Task 1 verify
- **Issue:** the 5-tuple array in `trust_root_absent_and_target_absent_is_yes_and_nothing_is_touched` tripped `-D clippy::type-complexity`.
- **Fix:** replaced it with a small local `Shape` struct; behaviour unchanged.
- **Files modified:** `src-tauri/crates/gamelib-safety/tests/adversarial.rs`
- **Commit:** `f132c3687` (fixed before the commit)

**2. [Rule 3 - Blocking] prettier reformatted the JSON fixture**
- **Found during:** Task 1 verify
- **Issue:** `prettier --check` rejected the hand-written long `expect` objects.
- **Fix:** `prettier --write` on the fixture only; content unchanged.
- **Commit:** `f132c3687`

**Total deviations:** 2 auto-fixed (both formatting/lint). **Impact:** none on behaviour or scope.

Process note: the first dispatch halted because the orchestrator's `pin.sh` had its unbound-sentinel arm overwritten by the path substitution. The orchestrator regenerated it and this run resumed from the start with the guard passing.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary surface was introduced; the change narrows an over-refusal and adds a refusal.

## Self-Check: PASSED

- Created files exist: `trust_root_contract.rs`, `fixtures/trust-root-contract.json`.
- Commits `f132c3687`, `bdf15193c`, `894e3601e` found in `git log`; measured count from the ledger (`395f75aae..HEAD`) is 3.
- No unexpected deletions in any task commit.
