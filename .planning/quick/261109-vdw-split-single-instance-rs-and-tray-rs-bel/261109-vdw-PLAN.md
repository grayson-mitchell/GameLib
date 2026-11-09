---
phase: quick-261109-vdw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/single_instance.rs
  - src-tauri/src/single_instance/windows_protocol.rs
  - src-tauri/src/single_instance/windows_pipe.rs
  - src-tauri/src/tray.rs
  - src-tauri/src/tray/icon.rs
  - src-tauri/src/tray/recent.rs
  - src-tauri/src/main.rs
  - .planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline/
  - .planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md
  - .planning/todos/completed/2026-11-08-single-instance-and-tray-exceed-module-size-target.md
autonomous: true
requirements: [TODO-2026-11-08-single-instance-and-tray-exceed-module-size-target, D-12, D-13, D-15]

must_haves:
  truths:
    - "`python3 .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py` reports no OVER for any `single_instance*` or `tray*` path (each file at or under 1,000 non-test lines)"
    - "`cargo test --bin gamelib-shell` passes with exactly the same passed count as before the split (no test lost, none added)"
    - "moveproof reports MOVEPROOF PASS for stems single_instance and tray against the pre-split commit (every item body moved verbatim)"
    - "The clippy ratchet (`meta/clippyRatchet.cjs`, pinned 1.99.1, darwin ceilings) is green: no new lint, no lint count change"
    - "The rustfmt diff-hunk count over the crate equals the pre-split baseline (118 at planning time)"
    - "Every jest suite that reads Rust shell source has the same pass/fail set before and after"
    - "main.rs and every other caller compile unchanged against the moved names, via the parents' `pub(crate) use <sub>::*;` re-exports"
  artifacts:
    - path: "src-tauri/src/single_instance.rs"
      provides: "argv/deep-link helpers, Windows pure name/SDDL helpers, app-root resolution, Unix guard, submodule decls + re-exports, the existing #[cfg(test)] mod tests"
      contains: "pub(crate) use windows_protocol::*;"
    - path: "src-tauri/src/single_instance/windows_protocol.rs"
      provides: "Windows gamelib:// self-heal: decision half + repair_windows_gamelib_protocol_registration"
      contains: "fn gamelib_protocol_repair_needed("
    - path: "src-tauri/src/single_instance/windows_pipe.rs"
      provides: "Windows single-instance FFI tier: mutex + named pipe acquire/deliver/accept loop"
      contains: "fn run_windows_single_instance_accept_loop("
    - path: "src-tauri/src/tray.rs"
      provides: "tray menu build/refresh/launch/about/rpc_tray_set_icon, submodule decls + re-exports, the existing #[cfg(test)] mod tests"
      contains: "pub(crate) use recent::*;"
    - path: "src-tauri/src/tray/icon.rs"
      provides: "tray glyph image, TrayIconMode, system theme reading, Windows taskbar theme watcher"
      contains: "fn tray_image("
    - path: "src-tauri/src/tray/recent.rs"
      provides: "recent-games / tray-settings snapshot surface and disk loading"
      contains: "mod tray_settings_lock"
  key_links:
    - from: "src-tauri/src/main.rs"
      to: "single_instance/ and tray/ submodule items"
      via: "existing `use single_instance::*;` / `use tray::*;` through the parents' glob re-exports (D-15)"
      pattern: "pub\\(crate\\) use (windows_protocol|windows_pipe|icon|recent)::\\*;"
    - from: "src-tauri/src/main.rs test module SHELL_SOURCE_FILES / SHELL_SOURCE_PARTS"
      to: "the four new .rs files"
      via: "path entries + include_str! at matching indices; guard test shell_source_files_names_every_shell_module_file"
      pattern: "single_instance/windows_pipe.rs"
---

<objective>
Resolve todo `2026-11-08-single-instance-and-tray-exceed-module-size-target.md`: split
`src-tauri/src/single_instance.rs` (1,620 non-test lines) and `src-tauri/src/tray.rs` (1,159
non-test) along their existing section banners into submodules, so every resulting file meets
Phase 71 D-13 (soft ~1,000 non-test lines). Pure move refactor: no behaviour change, no item-body
edits, no comment edits.

Purpose: Phase 71 recorded both files as over target but outside its scope; this closes that.
Output: two slimmed parents (declarations + retained sections + their existing test modules), four
new submodule files, main.rs's combined-source test lists updated, todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md
@src-tauri/src/store_embed.rs (layout precedent; read only its first 17 lines)
71-CONTEXT.md D-12/D-13/D-15 are summarised below; no need to open it.

<conventions>
Layout precedent (D-12 non-`mod.rs` style, D-15 parent re-exports), verified in the tree:
`store_embed.rs` + `store_embed/*.rs`. The parent opens with `use super::*;`, then per submodule a
pair `mod controls;` / `pub(crate) use controls::*;` separated by blank lines, then its own
remaining code. Each submodule file opens with `use super::*;`, a blank line, then its items.
Copy this exactly.

`main.rs` already has `use tray::*;` (~L141) and `use single_instance::*;` (~L146), and no file
names `single_instance::X` or `crate::tray::X` by path (the only `tray::` hits are `tauri::tray::`,
the tauri crate, untouched). So the parents' glob re-exports keep every caller compiling with no
call-site edits.

Visibility (D-15): an item becomes `pub(crate)` only if a move forces it. With the seams below,
no private item crosses a file boundary: `wide_nul` stays with its only callers in icon.rs;
`is_plain_app_name`, `gamelib_app_folder`, `read_json_file`, `mod tray_settings_lock` stay with
their only callers in recent.rs; `refresh_tray_menu` stays in tray.rs;
`create_single_instance_pipe_instance` stays with its callers in windows_pipe.rs. If the compiler
disagrees, widen that item to `pub(crate)` and list it in the SUMMARY (moveproof normalizes
`pub(crate)`/`pub(super)` away, so widening does not fail it).

Tests: BOTH existing `#[cfg(test)] mod tests` blocks stay in their parent file, unmoved. Their
`use super::*;` reaches every moved item through the parent's glob re-export. This keeps tray's
`include_str!("../../meta/fixtures/tray-set-icon-wire-args.json")` path valid and leaves every
source-text needle count unchanged. If a test cannot resolve a moved item, widen the item — do
not move test blocks.

Do NOT edit any comment or doc text, even positional words like "above"/"below" that now point
across files: moveproof Layer 1 compares comment lines, and verbatim moves are what it proves.
Move every item WITH its full contiguous doc comment and attributes (`#[cfg(...)]`,
`#[cfg_attr(...)]`). Section banner comments (`// ---- ... ----` blocks) move with the section
they head.

Windows-only code cannot be compiled on this Mac (only `aarch64-apple-darwin` is installed);
the `windows-latest` leg of `.github/workflows/rust-test.yml` is the authority. That is why the
moves must be verbatim and moveproof-proven.

Formatter / lint reality (measured at planning time — do not "fix"):
- `cargo fmt --check` is ALREADY red repo-wide (118 `Diff in` hunks: main.rs 23,
  single_instance.rs 1, tray.rs 5, others), and CI does not run it. Do NOT run `cargo fmt` or
  `rustfmt` in write mode (it would rewrite moved lines and break moveproof). Gate: the hunk count
  stays equal to the baseline.
- CI does not use `clippy -D warnings` (23 pre-existing warnings would fail it); it uses the
  shrink-only per-lint ratchet `meta/clippyRatchet.cjs` on pinned toolchain 1.99.1 (installed
  locally). Gate: ratchet green.
- Prettier (`<verify>` convention, checked with `--file-info`): the `.rs` paths report
  `ignored:false, inferredParser:null` and `npx prettier --check src-tauri/src/tray.rs` exits 2
  "No parser could be inferred"; every `.planning/` path is prettier-ignored. No path this plan
  writes is prettier-handled, so per the convention the prettier check is omitted rather than run
  as a check that proves nothing.

Baseline dir: `B=.planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline`
(repo-relative; commit it with the plan's artifacts). All commands below run from the repo root
`/Users/graysonmitchell/Projects/GameLib` unless they `cd src-tauri`.
</conventions>

<interfaces>
Seams in single_instance.rs (HEAD line numbers at planning time; item names are authoritative):
- L3-156 `// ---- Deep-link / single-instance argv helpers` -> STAYS in parent
- L157-349 `// ---- Windows single-instance guard: pure helpers (Phase 46 plan 46-01)` incl.
  `resolve_dev_app_root`, `resolve_packaged_app_root` -> STAYS in parent
- L350-425 `// ---- Single-instance guard (Phase 34.5 ...)`: `SingleInstanceRole`,
  `acquire_single_instance` (`#[cfg(unix)]`) -> STAYS in parent
- L426-638 `// ---- Windows \`gamelib://\` self-heal: the DECISION half`: the 8
  `gamelib_protocol_*` fns -> single_instance/windows_protocol.rs
- L639-1620 `// ---- Windows single-instance guard: FFI (Phase 46 plan 46-02)` banner,
  `WindowsPrimaryPipe`, `WindowsSingleInstanceRole`, `current_user_identity`,
  `create_single_instance_pipe_instance` (private), `acquire_single_instance_windows`,
  `deliver_to_running_instance_windows`, `run_windows_single_instance_accept_loop`
  -> single_instance/windows_pipe.rs
  EXCEPT `repair_windows_gamelib_protocol_registration` (fn at L807; its doc comment begins right
  after `current_user_identity`'s closing brace and the fn ends before
  `create_single_instance_pipe_instance`'s doc comment, ~L1000) -> single_instance/windows_protocol.rs,
  appended after the decision half. It is the I/O half of the same self-heal, and the decision
  half's banner names it.
- L1621-end `#[cfg(test)] mod tests` -> STAYS in parent
Estimated non-test sizes: parent ~430, windows_protocol ~460, windows_pipe ~740.

Seams in tray.rs:
- L3-351 `// ---- Tray icon (Phase 34.1 Plan 06 ...)`: `TRAY_ICON_ID`, `tray_is_template`,
  `tray_image`, `TrayIconMode`, `parse_tray_icon_mode`, `tray_set_icon_variant_str`,
  `tray_set_icon_mode_from_args`, `tray_glyph_dark_for_system_uses_light_theme`,
  `resolve_tray_icon_dark`, `TRAY_ICON_MODE`, `store_tray_icon_mode`, `current_tray_icon_mode`,
  `resolve_current_tray_icon_dark`, the `#[cfg(windows)]` registry consts + `wide_nul`,
  `read_system_uses_light_theme` (both cfg arms), `spawn_taskbar_theme_watcher` -> tray/icon.rs
- L352-~808 `// ---- Tray recent-games / settings surface (Phase 35 Plan 06 ...)`: `TRAY_RECENT_*`
  consts, `RECENT_GAMES_CHANGED_CHANNEL`, `TRAY_RUNNERS`, `TrayRecentGame`, `TraySettingsSnapshot`,
  `mod tray_settings_lock`, `tray_recent_games`, `tray_settings`, `tray_recent_runner_for`,
  `recent_runner_in`, `is_plain_app_name`, `tray_recent_menu_id`, `tray_recent_app_name`,
  `tray_recent_title`, `tray_recent_limit`, `tray_recent_games_from_value`,
  `tray_settings_from_config`, `gamelib_app_folder`, `read_json_file`, `load_tray_settings`,
  `should_hide_on_close`, `CloseRequestAction`, `close_request_action`,
  `load_recent_games_from_disk` -> tray/recent.rs
- From `build_tray_menu`'s doc comment (~L809) to before tests: `build_tray_menu`,
  `refresh_tray_menu`, `update_tray_recent_games`, `open_about_window_from_tray`,
  `dispatch_tray_launch`, `rpc_tray_set_icon` -> STAYS in parent
- L1160-end `#[cfg(test)] mod tests` -> STAYS in parent
Estimated non-test sizes: parent ~360, icon ~350, recent ~460.

main.rs test module (~L2008-2090): parallel arrays `const SHELL_SOURCE_FILES: &[&str]` (paths)
and `const SHELL_SOURCE_PARTS: &[&str]` (`include_str!`s). An index-equality test (~L2206) and the
dir-walk guard `shell_source_files_names_every_shell_module_file` (~L2260) fail if a new `.rs`
file is missing or misaligned. Precedent: `"login_window.rs"` followed by its `"login_window/..."`
entries.

Move-proof tool (trial-run at planning time on the unchanged tree, exit 0):
`python3 .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py --base <REF> --wave 3 --stem single_instance --stem tray`
prints `LAYER 1 ... removed-not-allowed 0 added-not-allowed 0`, `LAYER 3 (single_instance+tray):
items removed/changed 0 added/changed 0`, `MOVEPROOF PASS`. Layer 3 compares per-item
(kind, name, body-hash) across all files of the named stems; Layer 1 the normalized line multiset
(declaration lines filtered).

Jest readers of Rust source: `readTauriShellProductionSource()` in
`src/backend/testUtils/tauriShellSource.ts` walks `src-tauri/src/**/*.rs` recursively, so new files
are picked up automatically (sorted, parent `x.rs` before `x/...`). Token pins in
`tauriShellSource.test.ts` (e.g. `'fn create_single_instance_pipe_instance('`, region pins on
`create_single_instance_pipe_instance` and `repair_windows_gamelib_protocol_registration`) stay
satisfied because each fn moves whole.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Record baselines, then split single_instance.rs into single_instance/{windows_protocol,windows_pipe}.rs</name>
  <files>src-tauri/src/single_instance.rs, src-tauri/src/single_instance/windows_protocol.rs, src-tauri/src/single_instance/windows_pipe.rs, src-tauri/src/main.rs, .planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline/</files>
  <action>
BASELINES FIRST, before any source edit (mkdir -p $B):
(a) `git rev-parse HEAD > $B/base-ref` — the moveproof `--base` for both tasks.
(b) `(cd src-tauri && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result') > $B/cargo-before.txt`.
(c) `(cd src-tauri && cargo fmt --check 2>&1 | grep -c '^Diff in') > $B/fmt-before.txt` (expect 118).
(d) `(cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > ../$B/clippy-before.json); node meta/clippyRatchet.cjs $B/clippy-before.json --list` — must be green before you start; if it is already red, stop and report.
(e) `npx jest $(grep -rl 'readTauriShell' src | grep '\.test\.ts$') src/backend/__tests__/windowsDeepLinkSuppression.test.ts --json --outputFile=$B/jest-before.json` — pre-existing failures are allowed; the after-set must match.

SPLIT, following the single_instance seam table in <interfaces> (layout per D-12, re-exports per
D-15, target per D-13):
1. Create `src-tauri/src/single_instance/windows_protocol.rs`: `use super::*;`, a blank line, then
cut-and-paste VERBATIM the whole decision-half section (from its
`// ---- Windows \`gamelib://\` self-heal: the DECISION half` banner through the end of
`gamelib_protocol_exe_is_dev_build`), a blank line, then VERBATIM
`repair_windows_gamelib_protocol_registration` with its full doc comment and `#[cfg(windows)]`.
2. Create `src-tauri/src/single_instance/windows_pipe.rs`: `use super::*;`, a blank line, then
VERBATIM everything that remains from the `// ---- Windows single-instance guard: FFI` banner up to
(not including) the `#[cfg(test)]` line of `mod tests`.
3. In `single_instance.rs`, directly under the existing `use super::*;` line, insert the two
submodule pairs in store_embed.rs style:
   - `windows_pipe`: `#[cfg(windows)]` on BOTH `mod windows_pipe;` and
     `pub(crate) use windows_pipe::*;`. Every item in it is already `#[cfg(windows)]`, so on
     macOS/Linux an ungated glob re-export of an empty module would raise a new `unused_imports`
     and turn the clippy ratchet red.
   - `windows_protocol`: `mod windows_protocol;` then
     `#[cfg_attr(not(windows), allow(unused_imports))]` on `pub(crate) use windows_protocol::*;`.
     This mirrors the `#[cfg_attr(not(windows), allow(dead_code))]` every decision helper already
     carries. On non-Windows non-test builds nothing outside the module uses its names: main.rs's
     only caller, `repair_windows_gamelib_protocol_registration`, is cfg(windows). The parent's
     tests use them on every host. If the ratchet shows no `unused_imports` without the attribute,
     still keep it: the test target and the bin target differ, and the attribute is harmless.
4. In `main.rs`'s test module, add `"single_instance/windows_pipe.rs"` and
`"single_instance/windows_protocol.rs"` to `SHELL_SOURCE_FILES` immediately after
`"single_instance.rs"`. Add `include_str!("single_instance/windows_pipe.rs")` and
`include_str!("single_instance/windows_protocol.rs")` at the same indices in `SHELL_SOURCE_PARTS`.
Make no other main.rs edit.
5. Do not touch the parent's `#[cfg(test)] mod tests`, any comment text, or any item body.

Best-effort only, not a gate, and do not spend long on it: `rustup target add
x86_64-pc-windows-msvc && (cd src-tauri && cargo check --bin gamelib-shell --target
x86_64-pc-windows-msvc)`. Record in the SUMMARY whether it ran or was blocked (for example by a
tauri build script). Either way, state that the CI windows-latest leg is the authority for the
cfg(windows) code.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && B=.planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline && (cd src-tauri && cargo build --bin gamelib-shell && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result') | diff - $B/cargo-before.txt && python3 .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py --base "$(cat $B/base-ref)" --wave 3 --stem single_instance && python3 .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py | grep single_instance && ! python3 .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py | grep -E 'single_instance.*OVER'</automated>
  </verify>
  <done>Baselines exist in $B. The three single_instance files exist; sizes.py prints no OVER on any single_instance path. `cargo test --bin gamelib-shell` result line is byte-identical to the baseline (same passed count, same ignored count, 0 failed). moveproof prints MOVEPROOF PASS for stem single_instance. Committed as one atomic commit.</done>
</task>

<task type="auto">
  <name>Task 2: Split tray.rs into tray/{icon,recent}.rs</name>
  <files>src-tauri/src/tray.rs, src-tauri/src/tray/icon.rs, src-tauri/src/tray/recent.rs, src-tauri/src/main.rs</files>
  <action>
Following the tray seam table in <interfaces> (D-12 layout, D-15 re-exports, D-13 target):
1. Create `src-tauri/src/tray/icon.rs`: `use super::*;`, a blank line, then VERBATIM the whole
`// ---- Tray icon (Phase 34.1 Plan 06 ...)` section: from that banner up to (not including) the
`// ---- Tray recent-games / settings surface` banner. This includes the `#[cfg(target_os = "macos")]`
item at ~L53, the `#[cfg(windows)]` registry consts and `wide_nul`, both
`read_system_uses_light_theme` arms, and `spawn_taskbar_theme_watcher`.
2. Create `src-tauri/src/tray/recent.rs`: `use super::*;`, a blank line, then VERBATIM from the
`// ---- Tray recent-games / settings surface` banner through the end of
`load_recent_games_from_disk`. Stop at `build_tray_menu`'s doc comment, which stays.
3. In `tray.rs`, directly under the existing `use super::*;`, insert `mod icon;` /
`pub(crate) use icon::*;` and `mod recent;` / `pub(crate) use recent::*;`, store_embed.rs style,
with no cfg gating: both modules have items used on every platform (`tray_image`,
`load_tray_settings`, and others).
4. In `main.rs`'s test module, add `"tray/icon.rs"` and `"tray/recent.rs"` to `SHELL_SOURCE_FILES`
immediately after `"tray.rs"`. Add `include_str!("tray/icon.rs")` and
`include_str!("tray/recent.rs")` at the same indices in `SHELL_SOURCE_PARTS`.
5. Do not touch tray.rs's `#[cfg(test)] mod tests` (its `include_str!("../../meta/fixtures/...")`
stays valid only because it stays in `tray.rs`), any comment text, or any item body. A private
item that fails to resolve across files gets widened to `pub(crate)` (D-15) and is listed in the
SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && B=.planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline && (cd src-tauri && cargo build --bin gamelib-shell && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result') | diff - $B/cargo-before.txt && python3 .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py --base "$(cat $B/base-ref)" --wave 3 --stem single_instance --stem tray && python3 .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py | grep -E 'tray|single_instance' && ! python3 .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py | grep -E '(tray|single_instance).*OVER'</automated>
  </verify>
  <done>The three tray files exist. sizes.py prints no OVER on any tray or single_instance path. The cargo test result line is identical to the baseline. moveproof prints MOVEPROOF PASS for both stems together. Committed as one atomic commit.</done>
</task>

<task type="auto">
  <name>Task 3: Full gates (clippy ratchet, fmt hunk count, jest source readers, graphify) and close the todo</name>
  <files>.planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md, .planning/todos/completed/2026-11-08-single-instance-and-tray-exceed-module-size-target.md</files>
  <action>
1. Clippy ratchet: `(cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > ../$B/clippy-after.json); node meta/clippyRatchet.cjs $B/clippy-after.json --list`. It must be green. If it reports a new `unused_imports` or `dead_code` tied to a new `pub(crate) use` line, fix it with a cfg gate or `cfg_attr(..., allow(...))` on that re-export line, the same pattern as Task 1 step 3. Never raise a ceiling in `meta/clippyRatchet.cjs`.
2. fmt: `(cd src-tauri && cargo fmt --check 2>&1 | grep -c '^Diff in')` must equal `$B/fmt-before.txt`. If it differs, the cause is almost always a new parent `mod`/`use` line. Re-shape that one line by hand to rustfmt's form, never by running the formatter in write mode, and say so in the SUMMARY.
3. Jest: rerun the Task 1 (e) command with `--outputFile=$B/jest-after.json`. Compare the failing-test-name sets of before and after (for example with a small `node -e` over both JSON files' `testResults[].assertionResults` where `status=='failed'`). They must be identical. If a pin newly fails, it is an ordering pin that spans the new file boundary. Report it and stop; do not edit the pin.
4. `graphify update .` (CLAUDE.md: after modifying code; AST-only, no API cost). Do not commit `graphify-out/` unless it is already tracked.
5. `git mv .planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md .planning/todos/completed/`, then run `pnpm planning-gates` (it must stay green; the completed/ dir is exempt from the triage-frontmatter gate).
6. In the SUMMARY: the before/after sizes.py lines for every single_instance* and tray* path, the cargo test result line, the moveproof output, the ratchet result, the fmt counts, the jest before/after failing sets, any item widened to `pub(crate)`, and the Windows cross-check outcome from Task 1. Also note that `cargo fmt --check` and `clippy -D warnings` were red before this task and are replaced here by the no-new-hunks and ratchet gates.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && B=.planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/baseline && node meta/clippyRatchet.cjs $B/clippy-after.json --list && test "$(cd src-tauri && cargo fmt --check 2>&1 | grep -c '^Diff in')" = "$(cat $B/fmt-before.txt)" && test -f .planning/todos/completed/2026-11-08-single-instance-and-tray-exceed-module-size-target.md && test ! -e .planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md && pnpm planning-gates</automated>
  </verify>
  <done>Ratchet green, fmt hunk count equals baseline, jest failing sets identical, graph updated, todo in completed/ via git mv, planning-gates green. The SUMMARY records every measurement listed in step 6.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| second launch -> primary (Unix socket / Windows named pipe) | untrusted argv/deep-link payload crosses here; code moves, logic does not |
| HKCU `gamelib://` registry value -> repair fn | attacker-controlled stored command; T-UOK-01 log discipline lives in the moved fn body |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vdw-01 | Tampering | single_instance/windows_pipe.rs (pipe DACL, FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_REJECT_REMOTE_CLIENTS) | mitigate | verbatim move proven by moveproof Layer 3 body hashes; tauriShellSource.test.ts region pins (T-46-01) rerun in Task 3 with an identical pass set |
| T-vdw-02 | Information disclosure | repair_windows_gamelib_protocol_registration (never logs the stored value) | mitigate | same verbatim-move proof; the jest region pin forbidding unwrap/expect/panic/? in its body is rerun |
| T-vdw-03 | Denial of service | cfg(windows) code not compiled locally | accept | moveproof proves the bodies are unchanged; the CI windows-latest leg compiles and tests it; best-effort local cross-check recorded |
</threat_model>

<verification>
- sizes.py: no OVER on single_instance.rs, single_instance/*.rs, tray.rs, tray/*.rs. Pre-existing OVERs on main.rs and macos_epic_embed/surface.rs are out of scope, and sizes.py's exit code is non-zero because of them, so the gate greps by path.
- `cargo build --bin gamelib-shell` and `cargo test --bin gamelib-shell` pass, and the result line matches the baseline.
- moveproof `--stem single_instance --stem tray`: MOVEPROOF PASS.
- clippy ratchet green; fmt hunk count unchanged; jest Rust-source readers unchanged.
- Todo moved to `.planning/todos/completed/`.
- Prettier: omitted by convention. No written path is prettier-handled (`.rs` has no inferred parser; `.planning/` is ignored).
</verification>

<success_criteria>
Every single_instance and tray file is at or under 1,000 non-test lines. No behaviour, test count, lint count or formatting-hunk count changes. Callers compile untouched through the parents' glob re-exports. The todo is closed.
</success_criteria>

<output>
Create `.planning/quick/261109-vdw-split-single-instance-rs-and-tray-rs-bel/261109-vdw-SUMMARY.md` when done
</output>
