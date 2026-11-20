---
phase: quick-261108-ved
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
  - .planning/quick/261108-ved-move-the-keyring-helpers-from-login-wind/BASE_REF
  - src-tauri/src/login_window.rs
  - src-tauri/src/keyring_dispatch.rs
  - .planning/phases/71-rust-shell-module-decomposition/71-16-PLAN.md
  - .planning/todos/pending/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md
  - .planning/todos/completed/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md
autonomous: true
requirements: [TODO-2026-11-08-keyring-helpers]

must_haves:
  truths:
    - "The six keyring items (KEYRING_READ_TIMEOUT, keyring_get_result, KeyringOutcome enum + impl, keyring_outcome_message, keyring_get_outcome, bounded_keyring_read) are defined in keyring_dispatch.rs and nowhere in login_window.rs"
    - "Every moved item is byte-identical to its pre-move text, proven by moveproof Layer 3 over the union of login_window* and keyring_dispatch.rs (0 removed/changed, 0 added/changed), with Layer 1 clean"
    - "The same moveproof run WITHOUT the keyring_dispatch stem FAILS and lists exactly the 7 moved entries (the non-vacuity control: Layer 3 really sees the items leave login_window)"
    - "cargo test --bin gamelib-shell passes with at least the wave-2-end count (445) and an unchanged test-name list; clippy ratchet passes; the Phase 71 source-text jest pins pass with only the known failures"
    - "71-16-PLAN.md routes the keyring-helper tests to keyring_dispatch.rs, not login_window.rs; the todo sits in todos/completed/"
  artifacts:
    - path: "src-tauri/src/keyring_dispatch.rs"
      provides: "the six keyring helpers, appended after the existing dispatcher handlers"
      contains: "pub(crate) fn bounded_keyring_read<F>"
    - path: ".planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py"
      provides: "repeatable --stem override for the Layer 3 target set"
      contains: "--stem"
  key_links:
    - from: "src-tauri/src/keyring_dispatch.rs rpc_keyring_* handlers"
      to: "KEYRING_READ_TIMEOUT / bounded_keyring_read / keyring_get_outcome / KeyringOutcome"
      via: "same-file reference (was a cross-module reference through main.rs's glob of login_window)"
      pattern: "bounded_keyring_read\\(KEYRING_READ_TIMEOUT"
    - from: "src-tauri/src/main.rs #[cfg(test)] mod tests"
      to: "keyring_get_result / keyring_outcome_message / keyring_get_outcome / bounded_keyring_read / KEYRING_READ_TIMEOUT"
      via: "use super::* reaching main.rs's existing `use keyring_dispatch::*;` (line ~137)"
      pattern: "use keyring_dispatch::\\*;"
---

<objective>
Move the six keyring helpers out of the `login_window.rs` parent (where Phase 71 D-05 left them,
71-10 todo) into `keyring_dispatch.rs`, the module whose `rpc_keyring_*` handlers are their only
production callers. It is a pure move: every item stays byte-identical, and the Phase 71 `moveproof`
tool (Layer 1 + Layer 3) proves that.

Output: the helpers in keyring_dispatch.rs; a small `--stem` flag on moveproof.py so Layer 3 can
cover a move that crosses module stems; 71-16-PLAN.md corrected; the todo closed.

**Spec correction the executor must know (verified while planning, 2026-11-08):** the todo says the
helpers' unit tests are "co-located in `login_window.rs`'s test module". They are not.
`login_window.rs` has no `#[cfg(test)]` module. The tests live in **main.rs's** test module
(about lines 4867-5040: `keyring_get_result_*`, `keyring_outcome_message_*`, `keyring_get_outcome_*`,
`bounded_keyring_read_*`). The todo's own phrase "scheduled to move with the helpers in Wave 5"
refers to 71-16 (Wave 5, not yet executed). 71-16 routes every main.rs test "by the defining file
of its subject fn". So this plan does **not** move any test. Moving them now would get ahead of
71-16's wave-5-start baseline and its `--include-tests` moveproof run. This plan only re-points
71-16's routing note so the tests follow the helpers to keyring_dispatch.rs. The tests still compile
unchanged because main.rs already has `use keyring_dispatch::*;` and every moved item keeps its
`pub(crate)`.

**SHELL_SOURCE_FILES / SHELL_SOURCE_PARTS (main.rs ~2002-2070):** no new file is created and
both `keyring_dispatch.rs` and `login_window.rs` are already listed, so neither list changes. The
jest reader (`src/backend/testUtils/tauriShellSource.ts`) discovers files by walking the directory,
so it needs no edit either. The moved text lands earlier in the combined source (keyring_dispatch.rs
sorts before login_window.rs). That is why Task 2 runs the order-sensitive jest pins.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md
@.planning/phases/71-rust-shell-module-decomposition/71-10-SUMMARY.md

<interfaces>
Current layout (HEAD 1bfdafa5c; re-grep before cutting, do not trust line numbers blindly):

src-tauri/src/login_window.rs (231 lines, no test module):
- 1-29 `use super::*;` + child `mod`/`pub(crate) use` decls (stay)
- 30-64 login-window header comment, LOGIN_WINDOW_LABEL_COUNTER, LOGIN_WINDOW_EVENTS, LOGIN_WINDOW_EVENTS_CAP, MAIN_WINDOW_LABEL (stay)
- RANGE A = 66-115: the doc comment starting `/// Bound on how long \`keyring_get\` waits` through `pub(crate) const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);` (MOVE)
- 117-130: EPIC_LOGIN_HOST, GOG_LOGIN_HOST with their doc comments (stay: they are login hosts)
- RANGE B = 132-231 (EOF): the doc comment starting `/// Classifies a raw \`keyring\` crate outcome` + keyring_get_result, KeyringOutcome (`#[derive(Clone, Copy, PartialEq, Eq)]` + enum), `impl KeyringOutcome`, keyring_outcome_message, keyring_get_outcome, bounded_keyring_read (MOVE)

src-tauri/src/keyring_dispatch.rs (262 lines): `use super::*;` at line 1, ends with the closing `}` of
the keyring_available handler. No test module. It already uses KEYRING_READ_TIMEOUT,
bounded_keyring_read, keyring_get_outcome, KeyringOutcome and keyring_outcome_message through the glob.
All the names the helpers need (Duration, Value, mpsc_channel, thread, keyring::Error) arrive through
`use super::*;` from main.rs lines 27-39. No import edits are expected.

moveproof.py facts that drive Task 1:
- `split_items` attaches every contiguous `///`, `//` and `#[` line directly above an item to that
  item's hashed body. Blank lines are dropped before hashing. So the move must carry each item's full
  doc comment and attributes. Adding ANY comment line (for example a new `// ---- keyring helpers ----`
  banner) would change a hash (Layer 3) or appear as added-not-allowed (Layer 1). Do not add one.
- `layer3` uses `target_files(files, WAVE_STEM[wave])`, and WAVE_STEM[2] is `'login_window'`. A move
  from login_window.rs into keyring_dispatch.rs therefore looks like 7 removed items unless the target
  set also includes keyring_dispatch. That is the gap the `--stem` flag closes.
- `permove.sh LABEL WAVE [args]` runs cargo test (passed >= the baseline's count), the clippy ratchet,
  then `moveproof.py --base $(cat baselines/LABEL/BASE_REF) --wave WAVE "$@"`. Extra args pass through
  to moveproof.
- baselines/wave-2-end/BASE_REF = 752d8dbfe; cargo baseline passed=445. At planning time no commit
  since 752d8dbfe touches src-tauri/src.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture BASE_REF and add a repeatable --stem override to moveproof Layer 3</name>
  <files>.planning/quick/261108-ved-move-the-keyring-helpers-from-login-wind/BASE_REF, .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py</files>
  <read_first>
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py (lines 283-310 target_files/layer3, 311-355 run, 357-436 self_test, 437-455 main)
  </read_first>
  <action>
    First, before touching any src-tauri file, write `git rev-parse HEAD` into the quick dir's
    BASE_REF file (one line, the SHA). This is the move's base if the wave-2-end label turns out to be stale.

    Then make a backward-compatible change to moveproof.py:
    (1) `target_files(files, stem)` accepts a list of stems and keeps a file when its rel path equals
    `<stem>.rs` or starts with `<stem>/` for ANY stem.
    (2) `layer3(b_files, n_files, wave, stems=None)` uses `stems or [WAVE_STEM[wave]]`.
    (3) `run(..., stems=None)` passes stems through and prints the Layer 3 label as `'+'.join(stems)`
    (unchanged single-stem output when the flag is absent).
    (4) `main` parses a repeatable `--stem NAME` into a list. `--stem` only affects Layer 3, which still
    runs only for waves in WAVE_STEM.
    (5) Update the docstring usage line and the Layer 3 description line to mention `[--stem NAME ...]`.
    (6) Add one self-test case after the existing layer-3 cases. The base has `fn kh()` with a `/// doc`
    line in src-tauri/src/login_window.rs. Now has it moved to src-tauri/src/keyring_dispatch.rs. Assert
    that it FAILS with no stems (`go(..., 2) == 1`) and PASSES with `stems=['login_window', 'keyring_dispatch']`.
    Leave the ALLOW table and Layers 1/2 alone. This is the minimum needed for a cross-stem move proof,
    and it keeps the tool usable unchanged by the remaining Phase 71 plans.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && P=.planning/phases/71-rust-shell-module-decomposition && python3 $P/tools/moveproof.py --self-test && python3 $P/tools/moveproof.py --base HEAD --wave 2 | tail -1 | grep -qx "MOVEPROOF PASS" && python3 $P/tools/moveproof.py --base HEAD --wave 2 --stem login_window --stem keyring_dispatch | grep -E "^LAYER 3 \(login_window\+keyring_dispatch\): items removed/changed 0  added/changed 0$" && test -s .planning/quick/261108-ved-move-the-keyring-helpers-from-login-wind/BASE_REF; echo "prettier: moveproof.py and BASE_REF report ignored:true / inferredParser:null under --file-info, so no prettier check is run"</automated>
  </verify>
  <done>Self-test prints SELF-TEST PASS, including the new cross-stem case. Against an unchanged tree, moveproof passes both with and without --stem, and the --stem run labels Layer 3 `login_window+keyring_dispatch`. BASE_REF holds the pre-move SHA. Committed as `chore(quick-261108-ved): moveproof --stem override for cross-module Layer 3`.</done>
</task>

<task type="auto">
  <name>Task 2: Move the six keyring items verbatim into keyring_dispatch.rs and prove it</name>
  <files>src-tauri/src/login_window.rs, src-tauri/src/keyring_dispatch.rs</files>
  <read_first>
    - src-tauri/src/login_window.rs (lines 60-231)
    - src-tauri/src/keyring_dispatch.rs (last 20 lines only, to see the append point)
  </read_first>
  <action>
    Do a pure cut-and-paste move. Change no characters inside a moved range: no visibility edits (keep
    every `pub(crate)`, since main.rs's test module reaches these through `use keyring_dispatch::*;`), no
    doc-comment edits, no new comments or banners. Leave stale wording alone too, for example
    KEYRING_READ_TIMEOUT's "this file's own `#[cfg(test)]` assertion" and bounded_keyring_read's "see ...
    below". Editing it would break the Layer 3 hash. List it in SUMMARY as an observation for 71-16.

    Cut RANGE A (the whole KEYRING_READ_TIMEOUT doc comment + const) and RANGE B (the keyring_get_result
    doc comment through the end of bounded_keyring_read at EOF) out of login_window.rs. Confirm each
    range boundary by grep before cutting. RANGE A must start at the `/// Bound on how long` line and
    must NOT take MAIN_WINDOW_LABEL or EPIC_LOGIN_HOST. Leave exactly one blank line between
    MAIN_WINDOW_LABEL and EPIC_LOGIN_HOST's doc comment. login_window.rs must end with GOG_LOGIN_HOST's
    line followed by a single trailing newline.

    Append both ranges, in source order (A then B), to the end of keyring_dispatch.rs. Put one blank line
    after its final `}` and one blank line between A and B. The file ends with a single trailing newline.
    No edits to main.rs or to the SHELL_SOURCE_FILES / SHELL_SOURCE_PARTS lists: both files are already
    listed and no file is added. Do NOT run `cargo fmt`/`rustfmt` over these files: at planning time
    `rustfmt --check` already fails on login_window.rs/keyring_dispatch.rs (pre-existing), and reformatting
    would break the Layer 3 byte-identity proof.

    Gates, in this order:
    (a) Check `git log --oneline 752d8dbfe..HEAD -- src-tauri/src`, excluding this task's own commit.
    If it is empty, run `permove.sh wave-2-end 2 --stem login_window --stem keyring_dispatch`. If not,
    another src-tauri commit has landed since wave-2-end. In that case run the cargo test and clippy
    ratchet halves from permove.sh by hand, and run moveproof with `--base $(cat <quick dir>/BASE_REF)`
    instead.
    (b) Non-vacuity control: run the same moveproof WITHOUT `--stem`. It must print MOVEPROOF FAIL, and
    its Layer 3 "items removed/changed" must be exactly 7, namely const KEYRING_READ_TIMEOUT,
    fn keyring_get_result, enum KeyringOutcome, impl KeyringOutcome, fn keyring_outcome_message,
    fn keyring_get_outcome and fn bounded_keyring_read. Paste both outputs into SUMMARY.
    (c) Diff the test-name list against baselines/wave-2-end/cargo-names.txt. It must be identical.
    (d) Run jestpins.sh over baselines/wave-2-end/jest-suites.txt. It already includes
    keyringDiagPersistence.test.ts, whose `KeyringOutcome` contract and `keyring {channel}` literal-count
    pins read the combined source.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && P=.planning/phases/71-rust-shell-module-decomposition && test "$(grep -cE 'KEYRING_READ_TIMEOUT: Duration|fn keyring_get_result|enum KeyringOutcome|impl KeyringOutcome|fn keyring_outcome_message|fn keyring_get_outcome|fn bounded_keyring_read' src-tauri/src/login_window.rs)" = 0 && test "$(grep -cE 'KEYRING_READ_TIMEOUT: Duration|fn keyring_get_result|enum KeyringOutcome|impl KeyringOutcome|fn keyring_outcome_message|fn keyring_get_outcome|fn bounded_keyring_read' src-tauri/src/keyring_dispatch.rs)" = 7 && bash $P/tools/permove.sh wave-2-end 2 --stem login_window --stem keyring_dispatch && (cd src-tauri && cargo test --bin gamelib-shell -- --list | grep ': test$' | sed 's/: test$//; s/^.*:://' | sort) | diff $P/baselines/wave-2-end/cargo-names.txt - && bash $P/tools/jestpins.sh $(cat $P/baselines/wave-2-end/jest-suites.txt) && ! python3 $P/tools/moveproof.py --base $(cat $P/baselines/wave-2-end/BASE_REF) --wave 2 >/dev/null; echo "prettier: both .rs paths report ignored:false but inferredParser:null under --file-info (no Rust parser), so prettier --check would prove nothing and is omitted; rustfmt is not used either (pre-existing drift), moveproof Layer 3 is the text-identity gate"</automated>
  </verify>
  <done>login_window.rs holds none of the seven definitions and keyring_dispatch.rs holds all seven. permove reports PERMOVE PASS with Layer 1 0/0 and Layer 3 (login_window+keyring_dispatch) 0/0. The run without --stem FAILS with exactly the 7 expected entries. cargo passes at least 445 with an identical name list. The clippy ratchet passes. jestpins shows no unknown failures. Committed as `refactor(quick-261108-ved): move keyring helpers from login_window.rs to keyring_dispatch.rs`, and `graphify update .` has been run.</done>
</task>

<task type="auto">
  <name>Task 3: Re-point 71-16's test routing and close the todo</name>
  <files>.planning/phases/71-rust-shell-module-decomposition/71-16-PLAN.md, .planning/todos/pending/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md, .planning/todos/completed/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md</files>
  <read_first>
    - .planning/phases/71-rust-shell-module-decomposition/71-16-PLAN.md (grep `login_window` for every occurrence: frontmatter files_modified, must_haves truth ~line 24, the 4589-4904 routing bullet ~line 75, Task 1 name/files ~92-93, action destination order ~104-105, acceptance ~119)
  </read_first>
  <action>
    Edit 71-16-PLAN.md so its routing matches the new home. In the 4589-4904 keyring bullet, replace
    "`keyring_get_result`, outcome message, `bounded_keyring_read` -> login_window.rs (helpers stayed
    there, 71-10 todo)" with a note that they go to keyring_dispatch.rs because the helpers moved there
    in quick 261108-ved. Keep "route each test by the defining file of its subject fn". Then remove
    login_window.rs as a wave-5 test destination everywhere it appears only for the keyring-helper
    tests: the frontmatter files_modified entry, the must_haves truth list, Task 1's name, `<files>`,
    the action's destination order and the acceptance list. Add a short parenthetical at the first
    removed spot naming quick 261108-ved as the reason. Touch no other 71-16 content.

    Then `git mv` the todo from .planning/todos/pending/ to .planning/todos/completed/ with the same
    filename and no frontmatter edits, matching existing completed todos. Run `pnpm planning-gates`.
    Commit both edits as `docs(quick-261108-ved): re-point 71-16 keyring test routing; close keyring-helpers todo`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md && test -f .planning/todos/completed/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md && test "$(grep -c 'helpers stayed there, 71-10 todo' .planning/phases/71-rust-shell-module-decomposition/71-16-PLAN.md)" = 0 && grep -q '261108-ved' .planning/phases/71-rust-shell-module-decomposition/71-16-PLAN.md && pnpm planning-gates; echo "prettier: 71-16-PLAN.md and the todo report ignored:true under --file-info, so no prettier check is run"</automated>
  </verify>
  <done>71-16 routes the keyring-helper tests to keyring_dispatch.rs and no longer lists login_window.rs as a wave-5 destination for them. The todo is in completed/ via git mv. planning-gates is green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> Rust rustInvoke keyring arms | The sidecar selects a keyring slot. The helpers bound the Keychain read and classify the outcome without carrying any secret. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261108-01 | Tampering | moved helper bodies (bounded_keyring_read timeout, keyring_get_result NoEntry->Null) | mitigate | moveproof Layer 3 per-item body hash over login_window+keyring_dispatch must be 0/0, with a without-stem negative control proving the check sees the 7 items |
| T-261108-02 | Information disclosure | keyring_outcome_message `&'static str` account / KeyringOutcome closed set | mitigate | byte-identical move (Layer 3), and keyringDiagPersistence.test.ts contract pins run in jestpins |
| T-261108-03 | Denial of service | KEYRING_READ_TIMEOUT 45s bound under the 60s invoke bound | mitigate | main.rs's KEYRING_READ_TIMEOUT ordering test stays in place and runs in cargo test (permove) |
</threat_model>

<verification>
- `moveproof.py --self-test` passes, including the cross-stem case.
- permove.sh wave-2-end 2 --stem login_window --stem keyring_dispatch: PERMOVE PASS (cargo >= 445, clippy ratchet, Layer 1 0/0, Layer 3 0/0).
- The without-stem moveproof fails with exactly the 7 moved entries (non-vacuity).
- The cargo test-name list is unchanged, and jestpins over the wave-2-end suites shows no unknown failures.
- `pnpm planning-gates` is green after the todo move.
</verification>

<success_criteria>
The keyring helpers live in keyring_dispatch.rs, each proven byte-identical. login_window.rs is login
code only. The shell crate builds and tests unchanged. 71-16 will route the helper tests to their
new home. The todo is closed.
</success_criteria>

<output>
Create `.planning/quick/261108-ved-move-the-keyring-helpers-from-login-wind/261108-ved-SUMMARY.md` when done
</output>
