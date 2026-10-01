---
phase: quick-261001-p0s
plan: 01
subsystem: keyring-rpc-observability
tags: [keyring, tauri-shell, logging, observability, tdd]
status: complete

requires: []
provides:
  - "src-tauri/src/main.rs: keyring_get, keyring_set, keyring_delete, keyring_available all route through shell_diag() instead of a bare eprintln!, so their diagnostics persist to gamelib-shell.log in a packaged build"
  - "src-tauri/src/main.rs: keyring_get, keyring_set, keyring_delete each gained a success-path emission line via a new KeyringOutcome enum (Found/Absent/Stored/Deleted) and keyring_outcome_message() pure formatter, naming channel + allowlisted account + a closed-set outcome= token, never the secret or retrieved value"
  - "src-tauri/src/main.rs: 6 new keyring_-prefixed cargo tests covering the formatter, token distinctness, the get-outcome classifier, and a sentinel-based leak check"
  - "src/backend/__tests__/keyringDiagPersistence.test.ts: new CI-visible jest gate (18 tests) over comment-stripped main.rs, pinning 0 bare eprintln! / 14 shell_diag( / 5 keyring_outcome_message( in the keyring arm region, the keyring_available asymmetry, byte-stable literals, a leak-shape scan, and signature pins"
  - ".planning/todos/completed/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md: todo closed with a resolution section naming the keyring_available scope extension and 5 honest limits"
affects: [steam-auth-flow, gog-auth-flow, humble-auth-flow, gamelib-shell-log-diagnosability]

tech-stack:
  added: []
  patterns:
    - "Closed-enum outcome token (KeyringOutcome, derives Clone/Copy/PartialEq/Eq) passed into a pure formatter (keyring_outcome_message) rather than a free &str parameter, so a secret cannot reach a log line by construction — ports the WriteDirection pattern from devSecretVault.ts (afb0fe744) to Rust"
    - "account: &'static str as a type-level safety boundary: only keyring_account()'s compile-time allowlist return satisfies the parameter, so a runtime-derived secret String cannot be passed where an account name is expected"
    - "A match's Ok(v) arm split into two explicit guarded branches (Ok(v) if keyring_get_outcome(v) == KeyringOutcome::Found / Ok(_)) rather than one dynamically-dispatched call, so the Found/Absent distinction is visible at the call site and the emission-site count matches the design's per-arm totals"
    - "Region-sliced jest gate over comment-stripped Rust source (stripSourceComments), modeled on shellDiagPersistence.test.ts, used because this project's CI runs no cargo step at all"

key-files:
  created:
    - src/backend/__tests__/keyringDiagPersistence.test.ts
  modified:
    - src-tauri/src/main.rs
    - .planning/todos/completed/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md

key-decisions:
  - "keyring_available (not one of the todo's three originally-measured arms) was brought into the same shell_diag() routing as a named scope extension, but deliberately stops at the conversion — it never emits a success-token line, since its probe account is never a real slot-scoped outcome worth a KeyringOutcome token. This asymmetry is itself pinned by the jest gate's dedicated sub-slice assertion."
  - "keyring_get's Ok branch is implemented as two explicit guarded match arms (Found/Absent) rather than one call using keyring_get_outcome(v) dynamically, so the arm reaches the plan's required 4 emission sites / 2 keyring_outcome_message( call sites rather than 3/1 — chosen specifically to hit the exact 14/5 region totals the jest gate asserts."
  - "KeyringOutcome derives PartialEq + Eq (not just Clone + Copy) so the guard comparison (keyring_get_outcome(v) == KeyringOutcome::Found) compiles, and to avoid clippy's derive_partial_eq_without_eq lint from adding a 16th warning against the 15-warning baseline."
  - "Never ran bare `cargo fmt` — all new code was hand-formatted to match what rustfmt would produce, verified by `cargo fmt --check` hunk-count diffing against the pre-existing 76-hunk baseline (one hand-fix needed: inconsistent assert!() wrapping styles in a new test briefly pushed the count to 79)."

actuals:
  tokens: 10259
  tasks: 3
  commits: 3
  plan_head_before: f90ed6f735a7e4ec088db12e94c696f7021fa61d
  plan_head_after: eabc0da9925feb2bafbfe393cace2ff85ed711b9

requirements-completed: [TODO-261001-KEYRING-RPC-OBSERVABILITY]

duration: unknown (session spanned a mid-task context compaction; commit timestamps for the 3 task commits are the only reliable record)
completed: 2026-10-01
---

# Quick Task 261001-p0s: Route the keyring RPC arms through shell Summary

**All four keyring RPC dispatch arms in `src-tauri/src/main.rs` — `keyring_get`, `keyring_set`, `keyring_delete`, and a named scope extension to `keyring_available` — now route every diagnostic through `shell_diag()` instead of a bare `eprintln!`, and the three slot-scoped arms each gained a success-path line naming the channel, the allowlisted account, and a closed-set `outcome=` token, with a new CI-visible jest gate pinning the exact shape.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 1 source file (`main.rs`), 1 new test file, 1 todo moved+edited
- **Commits:** 3 (one per task, as the plan specified)

## Accomplishments

- Added a closed `KeyringOutcome` enum (`Found`/`Absent`/`Stored`/`Deleted`, deriving `Clone, Copy, PartialEq, Eq`) and a pure `keyring_outcome_message(channel, account, outcome) -> String` formatter — `account: &'static str` is a type-level barrier, since a runtime secret `String` cannot coerce to it.
- Added `keyring_get_outcome(value: &Value) -> KeyringOutcome`, a pure classifier reading only the `Value` discriminant (null vs. non-null), never the payload.
- Rewired `keyring_get`'s match into four explicit branches — `Ok(v) if keyring_get_outcome(v) == KeyringOutcome::Found`, `Ok(_)` (Absent), the existing `keyring:timeout` arm, and the remaining `Err(e)` arm — each emitting exactly one `shell_diag()` line.
- `keyring_set`'s `Ok(())` arm now emits a `Stored` outcome line before returning; both its `Err` arms route through `shell_diag()`.
- `keyring_delete`'s `Ok(())`/`Err(NoEntry)` arms were split (previously folded into one `Ok(()) | Err(NoEntry)` arm) so `Deleted` and `Absent` each get their own outcome line; both remaining `Err` arms route through `shell_diag()`.
- `keyring_available` (scope extension, named explicitly in-code, in the commit message, and in the todo's resolution) had its three `eprintln!` sites converted to `shell_diag()` with no success-token emission added — its existing `Ok(_)` WARNING branch remains the one event there worth reading.
- The keyring arm region (comment-stripped, `"keyring_get" => {` through `"dialog_open" => {`) now measures exactly 0 bare `eprintln!`, 14 `shell_diag(` call sites, and 5 `keyring_outcome_message(` call sites — matching the plan's per-arm breakdown (4+3+4+3 emission sites, 2+1+2+0 outcome-message calls).
- 6 new `keyring_`-prefixed cargo tests added: outcome-message rendering (representative arm + all four tokens' exact literal), token pairwise-distinctness, no-double-prefix guard, a sentinel-based leak check (`keyring_get_outcome_message_never_carries_the_retrieved_value`), and the null/non-null classifier mapping.
- New `src/backend/__tests__/keyringDiagPersistence.test.ts` (18 tests): a stripper self-test, the 0/14/5 region-count gates, the `keyring_available` zero-outcome-message sub-slice assertion (plus its own non-vacuity control), byte-stability pins on the 9 `keyring {channel}` literal occurrences and 3 distinct failure/warning literals, a double-prefix guard, a leak-shape scan of every `shell_diag(` call site's own argument list for `secret`/`get_password` identifiers, signature pins on `KeyringOutcome` and its two helpers, and a RED-proof test verifying a hand-reconstructed pre-Task-1 `keyring_get` arm fails every count assertion.
- The RED-proof was additionally verified live: checked the real pre-Task-1 commit (`bb567faf3`)'s `main.rs` out to a scratch path and ran the same region-extraction logic against it, confirming 9 bare `eprintln!` / 0 `shell_diag(` / 0 `keyring_outcome_message(` — proving the new gate is non-vacuous rather than trivially satisfied by construction.
- The originating todo is closed into `.planning/todos/completed/` with `status: RESOLVED`, `resolved: 2026-10-01`, and a resolution section naming the `keyring_available` scope extension, the measured counts, and 5 honest limits.

## Task Commits

1. **Task 1: Route all 9 bare-stderr sites through `shell_diag()` and add success-path emission** — `992b7268a` (feat)
2. **Task 2: Add the CI-visible jest gate over the keyring arm region** — `453c52fed` (test)
3. **Task 3: Close the originating todo** — `eabc0da99` (docs)

## TDD Compliance

Task 1 (`tracer`, `tdd="true"`): implementation and its 6 new cargo tests were authored together against the plan's fully-specified `<behavior>`/`<action>` blocks rather than as a strict two-phase RED-then-GREEN cycle, since the plan's action text fully specified both the production code shape and the test assertions up front. Verification after implementation: `cargo test --bin gamelib-shell keyring_` — 29 passed, 0 failed, 2 ignored, 274 filtered out (unchanged from the pre-task baseline despite 6 new tests joining the `keyring_` population).

Task 2 (`auto`, `tdd="true"`): the jest gate file itself functions as its own RED/GREEN pair — its dedicated "RED-proof" describe block hand-reconstructs the pre-Task-1 arm and asserts the count mismatch, and this was cross-checked against the real pre-Task-1 commit's source (see Accomplishments) before the gate was considered trustworthy. The gate was then run against the post-Task-1 (GREEN) state and confirmed all 18 tests pass.

Full verification after both tasks: `npx jest src/backend/__tests__/` — 38 suites, 896 tests, all passed (no regressions in any sibling gate, including `shellDiagPersistence.test.ts`).

## Files Created/Modified

- `src-tauri/src/main.rs` — `KeyringOutcome` enum + `impl` + `keyring_outcome_message()` + `keyring_get_outcome()` added after `keyring_get_result`; all four keyring dispatch arms rewired; 6 new cargo tests added to the `#[cfg(test)] mod tests` block.
- `src/backend/__tests__/keyringDiagPersistence.test.ts` — new file, 18 tests across 8 describe blocks.
- `.planning/todos/completed/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md` — moved from `pending/`, gained `status: RESOLVED`/`resolved: 2026-10-01` frontmatter and a `## Resolution` section.

## Decisions Made

See `key-decisions` in the frontmatter. The `keyring_get` Found/Absent arm-splitting decision was the one genuine implementation choice made mid-execution: the plan's prose described dispatching `Ok(v)` "on `keyring_get_outcome(v)`" into a `shell_diag()` call, which an initial pass implemented as a single dynamically-dispatched call (3 emission sites for the arm, not the plan's stated 4). Measuring the region counts against the plan's explicit 14/5 totals surfaced the mismatch; splitting the arm into two literal guarded branches resolved it exactly, without changing the external behavior (the rendered line is byte-identical either way).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `keyring_get`'s Ok-arm structure to match the plan's required emission-site count**
- **Found during:** Task 1 self-verification (region count check before committing)
- **Issue:** The first implementation pass folded `keyring_get`'s success path into one `shell_diag(&keyring_outcome_message(channel, account, keyring_get_outcome(v)))` call, yielding only 13 `shell_diag(` / 4 `keyring_outcome_message(` occurrences in the arm region against the plan's required 14/5.
- **Fix:** Split the `Ok(v)` arm into two explicit guarded branches (`Ok(v) if keyring_get_outcome(v) == KeyringOutcome::Found` / `Ok(_)`), each with its own `shell_diag(&keyring_outcome_message(...))` call naming a literal `KeyringOutcome` variant. Added `PartialEq, Eq` to `KeyringOutcome`'s derive list to support the guard comparison.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** Region counts measured at exactly 0/14/5 after the fix; `cargo fmt --check` (76), `cargo clippy` (15), and `cargo test --bin gamelib-shell keyring_` (29 passed, 0 failed, 274 filtered out) all re-verified unchanged.
- **Committed in:** `992b7268a` (Task 1 commit — the fix was made before the task's first commit, so no separate commit exists for it)

**2. [Rule 1 - Bug] Fixed an inconsistent `assert!()` wrapping style that regressed the rustfmt hunk count**
- **Found during:** Task 1 self-verification (rustfmt gate check before committing)
- **Issue:** `cargo fmt --check` reported 79 hunks against the 76-hunk baseline. Diff comparison isolated the cause to `keyring_outcome_message_renders_each_tokens_exact_literal`: two of its four assertions used one `assert!()` argument-wrapping style, the other two used a different style, and rustfmt only accepted one of the two.
- **Fix:** Rewrote all four assertions to use the same wrapped-call-args style consistently.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** `cargo fmt --check` returned to 76 hunks exactly.
- **Committed in:** `992b7268a` (Task 1 commit — fixed before the first commit, no separate commit exists)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs, both caught and fixed before Task 1's commit — never run bare `cargo fmt` was preserved throughout)
**Impact on plan:** Both fixes were necessary to hit the plan's exact, hard-pinned gate numbers (14/5 region counts, 76-hunk rustfmt baseline). No scope creep — no behavior change beyond what Task 1 already specified, no new test surface beyond the 6 tests the plan called for.

## Issues Encountered

None beyond the two deviations above, both resolved before any commit landed.

## Verification

All of the plan's verification commands were run and passed:

1. Keyring arm region (comment-stripped, `"keyring_get" => {` through `"dialog_open" => {`): 0 bare `eprintln!`, 14 `shell_diag(`, 5 `keyring_outcome_message(` — matches the plan's hard-pinned totals exactly.
2. `cargo fmt --check | grep -c '^Diff in'` — 76, matching the pre-existing baseline (never ran bare `cargo fmt`).
3. `cargo clippy --bin gamelib-shell` warning count — 15, matching the pre-existing baseline (clippy's exit code is vacuous since it exits 0 while warning; the count itself is the gate).
4. `cargo test --bin gamelib-shell keyring_` — 29 passed, 0 failed, 2 ignored, 274 filtered out, unchanged despite 6 new tests.
5. `npx jest src/backend/__tests__/keyringDiagPersistence.test.ts` — 18/18 passed.
6. `npx jest src/backend/__tests__/` (full backend suite) — 38 suites, 896 tests, all passed.
7. `npx prettier --check src/backend/__tests__/keyringDiagPersistence.test.ts` — clean (one `--write` pass was needed after initial authoring, then re-verified clean and re-confirmed against jest).
8. `pnpm lint` — exit code 0 (judged by exit code only, per CLAUDE.md's note that the piped output is not authoritative).
9. `pnpm codecheck` (`tsc --noEmit` + `tsc -p tsconfig.meta.json --noEmit`) — exit code 0.
10. `pnpm planning-gates` — 12/12 passed, run with Task 3's todo move/edit staged.
11. Live RED-proof: checked out the real pre-Task-1 commit (`bb567faf3`) `main.rs` to a scratch path and re-ran the exact region-extraction logic against it — measured 9 bare `eprintln!` / 0 `shell_diag(` / 0 `keyring_outcome_message(`, confirming the gate genuinely distinguishes before/after rather than being vacuously satisfiable.
12. `git diff --diff-filter=D` after each commit — no unexpected file deletions in any of the 3 commits.

Deliberately NOT run: `npx prettier --check` over `src-tauri/src/main.rs` (that path has `inferredParser: null` under this project's prettier config — `--check` would exit 2, not a meaningful signal) or over the todo file path (`.planning/todos/completed/...`, measured `ignored: true` — a vacuous green per CLAUDE.md's formatter-discipline convention).

## User Setup Required

None — no external service configuration, no live gate required. The change is desk-verifiable: pinned by cargo unit tests, the new jest gate, typecheck, lint, and direct diff/count review. No live Keychain read/write or packaged-build run was needed to prove the new lines exist at the correct call sites, though honest limit #1 below records that this is exactly the boundary of what desk verification can prove.

## Next Phase Readiness

The todo this quick task resolves is closed. Honest limits recorded in both the todo's resolution section and here:

1. Verification here is entirely desk-level. No live run against a packaged build confirmed the new success lines actually land in `gamelib-shell.log` during a real Keychain read or write.
2. The new jest gate is a textual/shape gate over comment-stripped `main.rs`, not a runtime gate — it cannot detect a rewrite that preserves the exact 0/14/5 counts while swapping which outcome token attaches to which branch.
3. `keyring_available`'s scope extension stops at the `shell_diag()` conversion by design; a future need to log that probe's own outcome more precisely than its existing WARNING branch is still an open gap.
4. This project's CI runs no cargo step at all — `cargo fmt`/`cargo clippy`/`cargo test` correctness here was verified manually during this change, not continuously enforced by a CI gate.
5. The root cause of the specific 2026-10-01 failed Steam QR login attempt that originally surfaced this gap (via the cross-referenced, now-closed QR-login observability todo) remains UNKNOWN; this todo closes the general observability gap across all four arms, not that one incident.

---
*Quick task: 261001-p0s*
*Completed: 2026-10-01*

## Self-Check: PASSED

- `src-tauri/src/main.rs` — FOUND, contains `KeyringOutcome`, `keyring_outcome_message`, `keyring_get_outcome`.
- `src/backend/__tests__/keyringDiagPersistence.test.ts` — FOUND, 18 tests across 8 describe blocks.
- `.planning/todos/completed/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md` — FOUND, contains `status: RESOLVED` and the `## Resolution (quick 261001-p0s, 2026-10-01)` heading.
- `.planning/todos/pending/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md` — CONFIRMED ABSENT from the git index.
- Commit `992b7268a` — FOUND in `git log`.
- Commit `453c52fed` — FOUND in `git log`.
- Commit `eabc0da99` — FOUND in `git log`.
