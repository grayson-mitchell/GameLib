---
phase: quick-260925-uok
verified: 2026-09-25T00:00:00Z
status: human_needed
score: 7/7 must-haves verified (desk-side); 1 item requires a live Windows session
overrides_applied: 0
human_verification:
  - test: "Live Windows HKCU self-heal gate: hijack the gamelib:// key, then launch GameLib and re-open a gamelib:// link"
    expected: >
      Steps from the completed todo's `## Resolution` section:
      (1) install via NSIS, confirm the key names gamelib-shell.exe;
      (2) with GameLib not running, overwrite
      HKCU\Software\Classes\gamelib\shell\open\command to point at a nonexistent thief.exe;
      (3) launch GameLib, re-read the key -- it must name the running gamelib-shell.exe again,
      and gamelib-shell.log must carry one "repaired the gamelib:// HKCU registration
      (prior value: points-elsewhere) -- 4/4 ..." line;
      (4) with GameLib running, open gamelib://library externally and confirm it reaches the
      running instance;
      (5) restart GameLib with the key already correct and confirm NO new repair line is
      appended (anti-churn);
      (6) delete the whole HKCU\Software\Classes\gamelib subtree, launch, and confirm all four
      values are recreated.
    why_human: >
      The #[cfg(windows)] FFI function (RegOpenKeyExW/RegQueryValueExW/RegCreateKeyExW/
      RegSetValueExW) is compiled by this Windows host's `cargo test`/`cargo check` but is
      executed by NO automated test -- it follows the acquire_single_instance precedent
      (main.rs:8409-8413) of being live-gated only. No step in this verification, nor any step
      the executor ran, read or wrote a real registry key or opened a real gamelib:// URL. This
      is a real user-registry mutation with real side effects (it would rewrite the operator's
      already-hand-restored HKCU value), so it cannot be safely or meaningfully discharged
      desk-side. The todo itself records this gate as its own explicit unresolved item.
---

# Quick 260925-uok: Windows `gamelib://` self-heal on launch — Verification Report

**Task Goal:** At Windows startup, read `HKCU\Software\Classes\gamelib\shell\open\command`; if it
is missing, dangling, or points at anything other than the current exe, rewrite it to the current
exe. Closes the todo `2026-09-25-windows-gamelib-registration-is-install-time-only.md`.

**Verified:** 2026-09-25
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from PLAN frontmatter `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Windows launch whose HKCU key is missing/dangling/pointing elsewhere rewrites it to the running exe | VERIFIED (code-correct; NOT live-executed) | `repair_windows_gamelib_protocol_registration` (`src-tauri/src/main.rs:8677-8857`) reads `Software\Classes\gamelib\shell\open\command`, treats any non-`ERROR_SUCCESS` read (including `ERROR_FILE_NOT_FOUND`) as `None`, and on `gamelib_protocol_repair_needed` returning true writes all four installer-shaped values (`:8798-8848`). Traced parameter order and byte-counting against the `windows-sys` Win32 signatures; correct. |
| 2 | A launch whose key already matches performs no write (anti-churn) | VERIFIED | `gamelib_protocol_repair_needed` (`:8488-8493`) returns `false` when the stored exe, case-insensitively and prefix-normalised, equals the current exe. Round-trip unit test `gamelib_protocol_repair_output_satisfies_its_own_detector` (`:14497-14503`) feeds the WRITER's own `gamelib_protocol_open_command(exe)` output back into the detector and asserts no-repair -- confirmed this genuinely closes the loop: the FFI writer at `:8792`/`:8802` calls the identical `gamelib_protocol_open_command(exe)` function the unit test calls, so the registry value and the test string cannot diverge. Re-ran: `cargo test --bin gamelib-shell gamelib_protocol` → 7 passed, 0 failed. |
| 3 | Every registry failure logs a warning and returns; startup never aborts | VERIFIED | Read the full function body (`:8677-8857`) and grepped it directly: zero occurrences of `.unwrap()`, `.expect(`, `panic!`, `unreachable!`, or `?` in statement position (the one `?` character in that span is inside a comment, "what did it decide?"). Every fallible Win32 call is checked and degrades to a `WARN` + continue/return. |
| 4 | `CI=e2e` performs no registry read and no registry write | VERIFIED | The guard (`:8692-8697`) is the FIRST statement in the function body, before `current_exe()` and before any `Reg*` call, and returns unconditionally. |
| 5 | `register_all()` still has exactly one call site under `#[cfg(target_os = "linux")]`; REQ-46-06 pins green | VERIFIED | `grep -c register_all()` in comment-stripped source = 1 (confirmed by both the original Phase-35 describe and the new quick-260925-uok describe's adjacent re-assertion); call site is still inside the pre-existing `#[cfg(target_os = "linux")]` block at `:10473`, and the new `#[cfg(windows)]` call sits AFTER it, closing at `:10511`. Already confirmed by orchestrator (cargo test 241/0/2, jest trio green); independently re-ran the new describe (`npx jest ... -t quick-260925-uok`) → 16 passed. |
| 6 | Written values are byte-identical in shape to the NSIS installer | VERIFIED | `gamelib_protocol_open_command`/`_default_value`/`_default_icon` (`:8498-8514`) produce exactly the four F1-table shapes (`"<exe>" "%1"`, `URL:<id> protocol`, `"<exe>",0`, empty `URL Protocol`), matched by unit test `gamelib_protocol_written_values_are_byte_identical_in_shape_to_the_nsis_installer` (`:14480-14494`), which passed. |
| 7 | main.rs decision-point (a), tauriShellSource.test.ts header/REQ-46-06 note, and REQUIREMENTS.md decision point (a)/REQ-46-06 all describe the new self-heal path | VERIFIED | Read `main.rs:10391-10472` in full: rewritten with all five required bullets (self-heal now exists, narrower-than-register_all rationale, the 2026-09-25 incident, last-launch-wins, CI=e2e load-bearing note). Read `tauriShellSource.test.ts:2268-2296` (header item 3) and `:2392-2409` (REQ-46-06 note): both updated. Read `.planning/REQUIREMENTS.md:2217-2230` and `:2291-2300`: both updated; `grep -c "NSIS installer alone"` = 0. |

**Score:** 7/7 truths verified at the code level. All are backed by re-run tests or direct code inspection, not SUMMARY claims.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/main.rs` | pure helpers + `#[cfg(windows)]` repair fn + call site + prose | VERIFIED | All present, all substantive (not stubs), all wired -- traced end to end. |
| `src-tauri/Cargo.toml` | `Win32_System_Registry` feature with inline comment | VERIFIED | Present at `:263`, plus an added rationale paragraph (`:268-282`) confirming F2/F3 were checked, not assumed. |
| `src/backend/__tests__/tauriShellSource.test.ts` | source gates + RED self-tests | VERIFIED | New describe at `:2455-2642`; four gates, each with a genuine RED self-test (traced logic manually: each synthetic source is constructed to violate exactly the property being gated, and the assertions correctly fail to match the positive expectation against it). |
| `.planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md` | closed todo with `## Resolution` | VERIFIED | Present, git-mv'd, names option 1, states plainly the live gate has NOT been run, gives 6 concrete future steps. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `.setup()` closure | `repair_windows_gamelib_protocol_registration` | `#[cfg(windows)]` block immediately after the Linux `register_all()` block | WIRED | Confirmed at `main.rs:10510-10511`; the nearest `#[cfg]` above the sole `register_all()` occurrence is still `#[cfg(target_os = "linux")]` (grep-verified). |
| `repair_windows_gamelib_protocol_registration` | `gamelib_protocol_repair_needed` | direct call on the read result | WIRED | `main.rs:8778`. |
| `Cargo.toml` `Win32_System_Registry` | `RegOpenKeyExW` etc. | cargo feature gate | WIRED | The five named symbols are all imported and used in the repair function (`:8679-8682`); `cargo check --bin gamelib-shell` compiles (orchestrator-confirmed). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pure decision-helper unit tests | `cargo test --bin gamelib-shell gamelib_protocol` (re-run independently) | 7 passed, 0 failed | PASS |
| Source gates for the new describe | `npx jest tauriShellSource.test.ts -t quick-260925-uok` (re-run independently) | 16 passed, 0 failed | PASS |
| `.rs`/`.toml` prettier deviation reproduced | `npx prettier --check src-tauri/src/main.rs` then `git show :main.rs \| npx prettier --check --stdin-filepath <abs path>` | plain check exits 2 ("No parser could be inferred"); stdin-filepath check exits 0 for both `main.rs` and `Cargo.toml` | PASS — deviation 1 independently reproduced exactly as reported |
| rustfmt sanity check on the added code, edition 2024 (matches on-disk style per F4) | `rustfmt --edition 2024` against a scratch copy, diffed | Zero hunks touch lines 8407-8873 (pure helpers + FFI repair fn) or 10390-10511 (call site + prose); ~956 pre-existing hunks remain elsewhere, consistent with F4's "already red repo-wide" | PASS — confirms deviation 1's "net new formatting debt: none" claim independently, not merely accepted on trust |
| Live Windows registry read/write and `gamelib://` reachability | none available desk-side | not run | SKIP — routed to human verification below |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REQ-46-06 | 260925-uok-PLAN.md | Runtime `register_all()` decision for Windows recorded/pinned; rationale updated, requirement unchanged | SATISFIED | `.planning/REQUIREMENTS.md:2291-2300` — `[x]`, table row unchanged, rationale updated to name the self-heal. |

No orphaned requirements found for this quick task (single requirement, correctly claimed).

### Anti-Patterns Found

None. Scanned the full diff range (`main.rs:8407-8857`, `:10391-10511`; `Cargo.toml:250-282`; the new `tauriShellSource.test.ts` describe; the completed todo) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`, empty-implementation patterns, and hardcoded-empty-data patterns. None present. The one place a `?` character appears inside the FFI function body is inside a comment, not code.

### Executor Deviations — Adjudicated

**Deviation 1 (prettier has no Rust/TOML parser).** ACCEPTED. Independently reproduced both halves:
`npx prettier --check src-tauri/src/main.rs` exits 2 with "No parser could be inferred" (not a
formatting failure), and the repo's own `.husky/pre-commit` mechanism
(`git show :$file | prettier --check --stdin-filepath <abs path>`) exits 0 for both `main.rs` and
`Cargo.toml`, exactly as `.husky/pre-commit`'s own header comment states it should. Additionally
ran `rustfmt --edition 2024` (matching F4's "style actually on disk") against a scratch copy and
diffed: zero hunks touch any line in the new pure-helper block, the new FFI function, or the new
call site/prose block. This independently confirms the "net new formatting debt: none" claim
rather than accepting it on the executor's word alone.

**Deviation 2 (`#[cfg_attr(not(windows), allow(dead_code))]` on the six pure helpers).** ACCEPTED.
Confirmed this is a conditional LINT attribute (`cfg_attr` conditionally applies `allow(dead_code)`
based on `not(windows)`) and NOT conditional compilation (`cfg`) -- the six functions compile
unconditionally on every host regardless of the attribute, satisfying the plan's stated intent
("they compile and are tested on macOS and Linux CI legs too"). Confirmed the identical attribute
already exists on 7 neighbouring pure `windows_*` helpers (`main.rs:8164-8286`, pre-existing,
untouched by this task) for the identical reason, so this is precedented house style, not a
deviation invented for this task.

## What Remains Unverifiable Desk-Side (not a gap in this verification)

The live Windows registry gate genuinely cannot be discharged here, and every layer of this work
says so plainly rather than concealing it: the FFI-tier banner comment (`main.rs:8409-8413`), the
new jest describe's own doc comment (`tauriShellSource.test.ts:2441-2453`), the SUMMARY's "NOT
DONE" section, and the completed todo's "NOT DONE -- what remains unverified" section all
independently state the same thing: `repair_windows_gamelib_protocol_registration` is compiled by
this Windows host's `cargo test`/`cargo check` but executed by NO automated test, and no step
anywhere in this work has read or written a real registry key or opened a real `gamelib://` URL.
This is correctly disclosed as UNPROVEN, not as WRONG -- the code review above found the
implementation logically sound (correct FFI parameter order and byte-counting, correct fail-open
shape, a round-trip test that genuinely closes the loop against the writer's own output, correct
comparison normalisation), but "logically sound on inspection" is not the same claim as "observed
working on a real Windows registry," and this report does not conflate the two.

## Gaps Summary

None found at the code level. The single open item is the live-gate execution, which this task's
own plan explicitly scoped as future operator work (not a task-3 deliverable) and which the
completed todo records honestly as outstanding with six concrete steps. Routing this to human
verification rather than marking it a gap, because the plan's own `<verification>` section states
the live gate "remains undischarged and must be recorded as such" -- which it is -- rather than
requiring it to be run within this task.

---

_Verified: 2026-09-25_
_Verifier: Claude (gsd-verifier)_
