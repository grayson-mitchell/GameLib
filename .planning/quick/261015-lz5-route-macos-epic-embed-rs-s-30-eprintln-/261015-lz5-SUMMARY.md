---
phase: quick-261015-lz5
plan: 01
subsystem: tauri-shell/epic-embed
tags: [macos, tauri, rust, logging, shell_diag, observability, packaged-build, uat, todos]

requires: []
provides:
  - All 30 `macos_epic_embed.rs` diagnostics route through `crate::shell_diag`, persisting to `~/Library/Logs/GameLib/gamelib-shell.log` on a packaged launch instead of being discarded with stderr
  - A jest source-reading gate (`macosEpicEmbedDiagPersistence.test.ts`) pinning the zero-eprintln!/30-shell_diag/no-double-prefix shape on every push, since this project's CI runs no cargo step at all
  - Two dated corrections in `50-UAT.md` reconciling the sink claim with the measured 30 sites, without touching any `result:` line
  - The source todo resolved into `completed/` with a `## Resolution` recording the 25-vs-30 undercount and the full-swap rationale
  - One follow-up `ready: live-gate` todo for confirming persistence on an actual packaged launch, carrying forward the unrotated-log open observation
affects: [50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv]

actuals:
  tokens: 10253    # 41010 chars / 4, over the realized diff for the 5 files_modified paths, measured via `git diff 154cd5bd0..HEAD -- <paths> | wc -c`
  tasks: 3
  commits: 3        # measured: `git rev-list --count 154cd5bd0..HEAD`

tech-stack:
  added: []
  patterns:
    - "crate::shell_diag(...) / crate::shell_diag(&format!(...)) in place of eprintln! for any src-tauri/src/*.rs diagnostic that must survive a packaged (LaunchServices-stderr-discarding) launch"
    - "Paren-balanced mechanical literal-extraction comparison (not eyeballed) to prove N hand-edited string literals are byte-identical across a mechanical macro swap"

key-files:
  created:
    - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
    - .planning/todos/pending/2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md
  modified:
    - src-tauri/src/macos_epic_embed.rs
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
    - .planning/todos/completed/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md

key-decisions:
  - "D-LZ5-01: full swap of all 30 sites, not a partial D-05/D-07/D-08/D-09/D-12/D-14 subset — no site is hot (each fires at most once per navigation, on a user gesture, or on a near-dead path), and a full swap lets the gate pin an absolute zero instead of a fragile per-site allowlist"
  - "D-LZ5-02: drop exactly the 8-character `[shell] ` prefix from every converted literal, because shell_diag re-adds it itself — keeps stderr byte-identical so 50-UAT.md's five previously-scored arms are not invalidated"
  - "D-LZ5-04: 50-UAT.md edited in exactly two places (the fact-table cell + one appended correction block; Item 17's expected: parenthetical) — the stale ~304-306 paragraph is named as superseded rather than edited, to hold the edit count at two"

requirements-completed: [TODO-lz5-1, TODO-lz5-2, TODO-lz5-3, TODO-lz5-4]

coverage:
  - id: D1
    description: "All 30 macos_epic_embed.rs eprintln! sites route through crate::shell_diag, with stderr byte-identical to pre-task"
    requirement: TODO-lz5-1
    verification:
      - kind: unit
        ref: "command: grep -c 'eprintln!'/'crate::shell_diag(' src-tauri/src/macos_epic_embed.rs -> 0 / 30; cargo check/fmt --check/test all green"
        status: pass
      - kind: other
        ref: "scratchpad/compare_literals.py: paren-balanced comparison of all 30 pre-swap eprintln! literals against all 30 post-swap shell_diag literals (prefix stripped) -> 0 mismatches"
        status: pass
    human_judgment: false
  - id: D2
    description: "One jest source-reading gate pins the swap on every push (CI runs no cargo step)"
    requirement: TODO-lz5-2
    verification:
      - kind: unit
        ref: "src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts (combined with macosEpicEmbedSource.test.ts: 22 passed, 22 total)"
        status: pass
    human_judgment: false
  - id: D3
    description: "50-UAT.md corrected in exactly two places; no result: line touched; source todo resolved; follow-up live-gate todo filed"
    requirement: TODO-lz5-3
    verification:
      - kind: other
        ref: "command: pnpm planning-gates -> 12/12 passed; grep checks on triage keys, Resolution heading, old-pending-path absence, CORRECTED marker, Item 17 heading/result shape"
        status: pass
    human_judgment: false
  - id: D4
    description: "The live-gate-only claim (persistence on an actual packaged launch) is handed to a follow-up todo rather than asserted at desk"
    requirement: TODO-lz5-4
    verification: []
    human_judgment: true
    rationale: "Whether LaunchServices actually discards this process's stderr in a packaged build, and whether the shell_diag write survives a packaged app's exit path, cannot be observed by cargo test, jest, or any other desk-run command — it requires an actual packaged --debug launch on this Mac, which this quick task's scope deliberately excludes (D-LZ5-06)."

duration: 10m (measured span between Task 1's and Task 3's commit timestamps, 2026-10-15T16:14:09+13:00 to 2026-10-15T16:24:03+13:00; does not include pre-commit investigation/measurement time, which was not independently timestamped)
completed: 2026-10-15
status: complete
---

# Quick Task 261015-lz5: Route macos_epic_embed.rs's 30 eprintln! diagnostics through shell_diag Summary

**All 30 of `macos_epic_embed.rs`'s diagnostics now route through `crate::shell_diag`, so a packaged launch persists them to `gamelib-shell.log` instead of discarding them with stderr — pinned by a new jest source-reading gate, since this project's CI runs no cargo step at all.**

## Performance

- **Duration:** 10m, commit-to-commit (`9fa43de5e` at 16:14:09 to `c3f124019` at 16:24:03, both 2026-10-15, +13:00) — the pre-commit investigation/measurement work in this session was not independently timestamped, so this is a lower bound, not the whole session's wall-clock cost.
- **Tasks:** 3/3 completed
- **Files modified:** 5 (`files_modified` in the plan's frontmatter), across 3 atomic commits

## Accomplishments

- Swapped all 30 `eprintln!` call sites in `src-tauri/src/macos_epic_embed.rs` to `crate::shell_diag(...)` / `crate::shell_diag(&format!(...))`, in tracer-first order (the hardest shape, the D-14 launcher-scheme block, converted and `cargo check`-verified first; the other 29 followed as one commit).
- Proved the stderr text is byte-identical modulo the dropped 8-character `[shell] ` prefix via a mechanical (not eyeballed) paren-balanced comparison script over all 30 call sites — 0 mismatches.
- Added `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts`: zero-count, 30-count, double-prefix guard (both plain-literal and `&format!(...)` forms), a stripper self-test, and a committed RED-proof mutation arm reconstructing the pre-fix shape.
- Corrected `50-UAT.md` in exactly the two places the plan specified — the fact-table evidence cell and a new dated correction block after the "Consequences" list — naming the now-stale ~304-306 paragraph as superseded without editing it, and amended Item 17's `expected:` parenthetical to stop asserting stderr-only. No `result:` line was touched.
- Resolved the source todo into `completed/` with a `## Resolution` section recording the measured 30 (vs. the todo's own claimed 25), the full-swap rationale, and the closed census (`epic_embed_js_dialog.rs`, `epic_embed_state.rs`, `store_embed_handoff_policy.rs` have neither emitter; `main.rs` mixes both deliberately, out of scope).
- Filed one new `ready: live-gate` follow-up todo for packaged-launch confirmation, carrying forward the unrotated-`gamelib-shell.log` open observation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Route all 30 Epic-embed diagnostics through crate::shell_diag** - `9fa43de5e` (fix)
2. **Task 2: Pin the swap with a source-reading jest gate** - `0a19fa4f1` (test)
3. **Task 3: Correct 50-UAT.md, resolve the source todo, file the live-gate follow-up** - `c3f124019` (docs)

_No plan-metadata commit is included here — per this task's explicit instructions, SUMMARY.md, PLAN.md and STATE.md are not committed by this executor; the orchestrator handles the docs commit._

## Measurements (verbatim, this session)

All numbers below were produced by a command run in this session; none are restated from the plan or from a prior session.

**Current HEAD, `src-tauri/src/macos_epic_embed.rs`:**
```
$ grep -c 'eprintln!' src-tauri/src/macos_epic_embed.rs
0
$ grep -c 'crate::shell_diag(' src-tauri/src/macos_epic_embed.rs
30
$ grep -c '\[shell\]' src-tauri/src/macos_epic_embed.rs
0
```

**Pre-swap file, fetched via `git show 9fa43de5e~1:src-tauri/src/macos_epic_embed.rs` into a scratchpad path (never via `git checkout --`):**
```
$ grep -c 'eprintln!' <scratchpad>/pre-task1-macos_epic_embed.rs
30
$ grep -c 'crate::shell_diag(' <scratchpad>/pre-task1-macos_epic_embed.rs
0
```
This is Task 2's one-time observed-red measurement over the real pre-swap file: 30 for the forbidden-macro count, 0 for the call-site count — exactly what the jest gate's committed mutation arm (a hand-written snippet, not a `git show`, so it cannot rot when HEAD moves) also asserts.

**Mechanical (not eyeballed) literal-equality comparison**, a paren-balanced Python script comparing all 30 pre-swap `eprintln!` call arguments against all 30 post-swap `crate::shell_diag(...)` call arguments, normalizing whitespace and stripping the `[shell] ` prefix from the pre-swap side:
```
$ python3 compare_literals.py <pre-swap-path> <post-swap-path>
pre (eprintln!) call count: 30
post (crate::shell_diag) call count: 30
Total sites compared: 30
Mismatches: 0
RESULT: ALL MATCH
```

**Cargo, this session:**
```
$ cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c '^warning'
0
$ cargo fmt --manifest-path src-tauri/Cargo.toml --check
(exit 0)
$ cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c '^src/macos_epic_embed.rs'
0
$ cargo clippy ... 2>&1 | grep 'generated .* warnings'
warning: `gamelib-shell` (bin "gamelib-shell") generated 21 warnings (run `cargo clippy --fix ...` ... 10 suggestions)
```
All 21 clippy warnings are in `main.rs`; 0 are in `macos_epic_embed.rs` (the file this task touched).

```
$ cargo test --manifest-path src-tauri/Cargo.toml macos_epic_embed
test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 384 filtered out
```
Matches the plan's baseline exactly (16 passed, 384 filtered out).

```
$ cargo test --manifest-path src-tauri/Cargo.toml    # whole-crate, for context — not the plan's scoped command
test result: ok. 398 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

**Jest, this session:**
```
$ npx jest src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts src/backend/__tests__/macosEpicEmbedSource.test.ts
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
```
Positive test count confirmed (> 0), per the plan's explicit requirement.

**TypeScript:**
```
$ npx tsc --noEmit
(exit 0, no output)
```

**Prettier — which paths were checked, and which were deliberately excluded, and why:**

| path | `--file-info` result | checked with `--check`? |
| --- | --- | --- |
| `src-tauri/src/macos_epic_embed.rs` | `{"ignored":false,"inferredParser":null}` | **No** — not ignored, but no Rust parser; `--check` errors with "No parser could be inferred". `cargo fmt --check` is this file's real formatter gate. |
| `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts` | `{"ignored":false,"inferredParser":"typescript"}` | **Yes** — `All matched files use Prettier code style!` |
| `.planning/phases/50-.../50-UAT.md` | `{"ignored":true,"inferredParser":null}` | No — ignored; `--check` would be vacuous |
| `.planning/todos/completed/2026-10-13-....md` | `{"ignored":true,"inferredParser":null}` | No — ignored; `--check` would be vacuous |
| `.planning/todos/pending/2026-10-15-....md` | `{"ignored":true,"inferredParser":null}` | No — ignored; `--check` would be vacuous |

**`pnpm planning-gates`:**
```
12/12 planning gates passed.
```

**`grep -q '"live-gate"' .planning/todos/todo-frontmatter-gate.py`:** matched line 93 — `"ready": ("code", "live-gate", "human", "blocked")`. `live-gate` is in the gate's existing vocabulary, not invented by this task.

**Census (closing the source todo's first "Not yet established" item):**
```
epic_embed_js_dialog.rs:          eprintln!=0  shell_diag=0
epic_embed_state.rs:               eprintln!=0  shell_diag=0
store_embed_handoff_policy.rs:     eprintln!=0  shell_diag=0
main.rs:                           eprintln!=223 shell_diag=71
```
No other `src-tauri/src/*.rs` file contains any `eprintln!` occurrence.

**`graphify update .`:** ran after Task 3's edits — `57861 nodes, 66803 edges, 5024 communities`.

## Files Created/Modified

- `src-tauri/src/macos_epic_embed.rs` - all 30 diagnostics swapped from `eprintln!` to `crate::shell_diag`
- `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts` - new jest gate pinning the swap
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md` - fact-table cell superseded, dated correction appended, Item 17's `expected:` amended
- `.planning/todos/completed/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md` - moved from `pending/`, `## Resolution` appended
- `.planning/todos/pending/2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md` - new follow-up todo

## Decisions Made

- D-LZ5-01 (full swap, not partial), D-LZ5-02 (drop the prefix, let `shell_diag` re-add it), and D-LZ5-04 (exactly two `50-UAT.md` edit sites) were the plan's own locked decisions; this execution did not revisit them — see `key-decisions` in the frontmatter above for the rationale as applied.
- No new architectural decisions were made during execution; Rules 1-3 deviations below are tooling-conformance fixes, not design changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - tooling conformance] prettier reformatted the new test file's double-prefix non-vacuity control**

- **Found during:** Task 2 (`macosEpicEmbedDiagPersistence.test.ts` creation)
- **Issue:** `npx prettier --check` reported "Code style issues found" against the newly created file — one assertion line (the `&format!(...)` non-vacuity control) exceeded the project's line-width rule.
- **Fix:** Ran `npx prettier --write src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts`, which wrapped that one assertion onto two lines. No assertion content changed.
- **Files modified:** `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts`
- **Verification:** Re-ran `npx prettier --check` -> "All matched files use Prettier code style!"; re-ran the jest suite -> still 22 passed, 0 failed (no behavior change).
- **Committed in:** `0a19fa4f1` (Task 2 commit — the file was not committed in its pre-format state, so there is no separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1/tooling conformance)
**Impact on plan:** Cosmetic formatting only; no behavior or assertion changed. No scope creep.

## Issues Encountered

- During Task 1's mechanical before/after literal comparison, an earlier regex-based extraction attempt produced spurious mismatches because it (a) captured every string literal in a call's argument list rather than just the format string, and (b) did not account for the `&format!(...)` wrapper on the new side. This was purely internal verification tooling (a scratchpad script), never committed and never a deliverable — fixed by rewriting the extraction with proper paren-balance counting and `&format!(...)` unwrapping before comparison, confirmed 0 mismatches across all 30 sites (see Measurements above for the final script's output).

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this task.

## Threat Flags

None beyond what the plan's own `<threat_model>` already registers (T-261015-LZ5-01 through -05, T-261015-LZ5-SC — all `medium`/`low`/`accept`/`mitigate`, nothing `high`). No new network endpoint, auth path, or schema change was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The fix is desk-verified (source text, `cargo check`/`fmt`/`clippy`/`test`, jest, `tsc`) but **not yet confirmed on an actual packaged launch** — that confirmation is the new follow-up todo (`2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md`, `ready: live-gate`), naming the two cheapest inducible literals and the correct grep target.
- `gamelib-shell.log`'s lack of rotation/bound is an open observation carried in that same follow-up todo, not fixed here (out of scope by D-LZ5-07).
- No blockers for any other phase or quick task; this task touched no shared interface beyond the one private `crate::shell_diag` helper, which it did not modify.

## Self-Check: PASSED

- `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts` — FOUND
- `.planning/todos/completed/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md` — FOUND
- `.planning/todos/pending/2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md` — FOUND
- `src-tauri/src/macos_epic_embed.rs` — FOUND
- old pending-path `.planning/todos/pending/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md` — MISSING (correct, moved)
- Commit `9fa43de5e` — FOUND in `git log --oneline --all`
- Commit `0a19fa4f1` — FOUND in `git log --oneline --all`
- Commit `c3f124019` — FOUND in `git log --oneline --all`

---
*Phase: quick-261015-lz5*
*Completed: 2026-10-15*
