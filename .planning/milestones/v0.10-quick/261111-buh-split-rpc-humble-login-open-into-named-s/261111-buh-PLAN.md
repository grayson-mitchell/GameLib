---
phase: quick-261111-buh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/login_window/humble_open.rs
  - src/backend/testUtils/tauriShellSource.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/loginChromeCssInjection.test.ts
  - .planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md
  - .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/
autonomous: true
requirements: [TODO-2026-11-08-split-rpc-humble-login-open-into-named-steps]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`rpc_humble_login_open` calls five named steps in this order: `arm_visible_login_latch_macos` (macOS), `build_login_window`, `install_native_bar_for_sheet_macos` (macOS), `present_visible_login_window_macos` (macOS), `install_login_window_close_hook`. Argument parsing, the pristine Epic/GOG route, the non-macOS `sheet_presented = false`, the presentation-record print, the title seed and the devtools block stay inline in the handler."
    - "The non-macOS owner (quick-261111-d7o) stays local to `build_login_window`. That covers the `login_owner` declaration, the `attach_login_owner` match in the first `if visible {` block, and the `present_owned_login_window` block, which now closes the build step. Its return type stays `Result<tauri::WebviewWindow, String>` on every platform. Off macOS, only `let sheet_presented = false;` ran between `.build()` and the owner present, so the side-effect order is unchanged."
    - "Every non-comment line of the HEAD handler (humble_open.rs L90-748 at 26facda22) is accounted for: `baseline/verbatim_moves.cjs full` finds each HEAD range as one byte-identical contiguous run inside its expected fn, the ranges tile L90-748 with no gap, and the only lines that are not part of a matched run are the listed glue lines (signatures, call sites, tails). Error strings, `shell_eprintln!` strings and cfg gates are therefore unchanged."
    - "The jest pins that read this handler (`humbleLoginOpenHandlerBody`, `extractHumbleLoginOpenArmBody`) read it with each step's body spliced in at its call line. A linkage test fails if a step is renamed, left uncalled, called twice, called from anywhere else, or called out of order. No existing `expect(` line in either test file changed."
    - "Mutation runs, each reverted from a saved copy: removing the close-hook call, gutting the spliced close-hook body, widening the build step's sheet size to 900, moving the latch call below the pristine route, swapping the native-bar and presentation calls, and putting a `#[cfg(` line above the CSS call. Each one turned its named pins red."
    - "`cargo test --bin gamelib-shell` result line equals the baseline. The win32 clippy per-lint counts and location-stripped site list are identical. humble_open.rs rustfmt hunks did not rise above 4. Scoped prettier, codecheck and find-deadcode are clean. The failing set across every Rust-source jest suite equals the baseline."
    - "The todo stays in `pending/` with byte-identical frontmatter and a new **Status (2026-11-11):** paragraph naming the commits and steps. The SUMMARY lists the owed live gates (macOS sheet sign-in, Windows owned-modal sign-in) and says the macOS-only steps are first compiled by the macos-latest rust-test leg."
  artifacts:
    - path: "src-tauri/src/login_window/humble_open.rs"
      provides: "slimmed rpc_humble_login_open plus five column-0 step fns placed right after it in call order"
      contains: "fn build_login_window("
    - path: "src/backend/testUtils/tauriShellSource.ts"
      provides: "HUMBLE_LOGIN_OPEN_STEPS, readTopLevelFnStatements, readHandlerBodyWithSteps, listStepLinkageProblems"
      contains: "HUMBLE_LOGIN_OPEN_STEPS"
    - path: "src/backend/__tests__/tauriShellSource.test.ts"
      provides: "humbleLoginOpenHandlerBody repointed to the splicer; linkage describe with RED proofs"
      contains: "listStepLinkageProblems"
    - path: "src/backend/__tests__/loginChromeCssInjection.test.ts"
      provides: "extractHumbleLoginOpenArmBody repointed to the splicer"
      contains: "readHandlerBodyWithSteps"
    - path: ".planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/verbatim_moves.cjs"
      provides: "byte-identical move proof plus glue-line report for the macOS-uncompilable code"
  key_links:
    - from: "rpc_humble_login_open"
      to: "the five step fns"
      via: "direct calls; the three macOS steps' call statements carry #[cfg(target_os = \"macos\")]"
      pattern: "build_login_window\\(|install_login_window_close_hook\\("
    - from: "humbleLoginOpenHandlerBody / extractHumbleLoginOpenArmBody"
      to: "readHandlerBodyWithSteps(code, 'humble_login_open', HUMBLE_LOGIN_OPEN_STEPS)"
      via: "shared testUtils export, so both pin files read the same spliced arm text"
      pattern: "readHandlerBodyWithSteps\\("
    - from: "build_login_window (non-macOS)"
      to: "attach_login_owner / present_owned_login_window (owned_modal.rs)"
      via: "login_owner stays a local of the build step; the owner present block is the step's last statement before Ok(window)"
      pattern: "present_owned_login_window\\(app, &window, owner, &label\\)"
---

<objective>
Resolve the code half of todo `2026-11-08-split-rpc-humble-login-open-into-named-steps.md`.
`rpc_humble_login_open` (humble_open.rs L90-748 at 26facda22, 659 lines) gets split into five named step
fns. This is a pure structural refactor. Moved code keeps its cfg gates, error and log strings, early
returns and awaits/timeouts, and the side-effect order stays the same on every platform. The only
control-flow change is the new call boundaries. The jest source pins that read this handler body are
repointed in the same commit as each part of the split, so no commit has stale pins.

Purpose: the largest handler in the shell carries an admission latch, a 300-line builder, two macOS
presentation phases and a close hook in one body. Named steps make each phase readable and
pin-addressable.

Output: two refactor commits (a tracer, then the expansion), one docs commit, a baseline dir with a
verbatim-move proof, and a SUMMARY that lists the outstanding live gates. The todo is
`ready: live-gate` and is NOT closed by this plan.

Steps chosen from the real body. The todo suggested "argument parsing, window build, presentation,
native bar install". Window build, native bar install and presentation are steps here. The
single-flight latch and the close hook are added as steps because each is a cohesive block. Argument
parsing stays inline: it is 17 lines that produce 9 locals threaded to every later step. A parsing
step would need a return struct, which would turn every later use into a field access, and that
includes macOS-only lines that cannot be compiled on this machine.

How the quick-261111-d7o owner is threaded. The `present_owned_login_window` block (HEAD L600-603)
moves verbatim to the end of `build_login_window`, after `.build()` and before `Ok(window)`.
`login_owner` is created, assigned and read only off macOS. On every non-macOS path, the only
statement that ran between `.build()` and that block was `let sheet_presented = false;`, which has no
side effect, so moving the block leaves the order of side effects unchanged. On macOS the block never
existed. This keeps all three `login_owner` sites inside one fn, keeps every line byte-verbatim, and
keeps one uniform signature.

Rejected alternatives:
- Returning the owner to the handler, as a tuple or struct, so the present call could stay next to
  `let sheet_presented = false;`. That needs either a cfg-split return type or a macOS half that is
  always empty. An always-empty half needs new macOS-only glue (`let owner = ();` trips clippy
  `let_unit_value`; an unused binding trips `unused_variables`), and the darwin equality ratchet would
  catch those only in CI, because this box cannot lint macOS code.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md
@.planning/quick/261110-h8k-split-rpc-humble-login-clear-cookies-int/261110-h8k-SUMMARY.md (sibling split; same discipline)
@src-tauri/src/login_window/humble_open.rs (read L1-748; L749-826 are the take_events/close handlers and stay untouched)
src-tauri/src/login_window/owned_modal.rs: read L78-130 only (`attach_login_owner`, `present_owned_login_window` signatures; the module is `#[cfg(not(target_os = "macos"))]` at its `mod` line).
src/backend/testUtils/tauriShellSource.ts: read L225-275 (`readTopLevelFnBody`, `readHandlerBody`).
src/backend/__tests__/tauriShellSource.test.ts: read L1-112, L1455-1760, L1955-2025, L2195-2230, L2405-2500, L4686-4720.
src/backend/__tests__/loginChromeCssInjection.test.ts: read L1-215.
Skill("gamelib-conventions"): the `<verify>` prettier rule.

<interfaces>
B=.planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline (repo-relative; every
command runs from the repo root unless it does `cd src-tauri` in a subshell).

HEAD layout of humble_open.rs at 26facda22. The verbatim proof uses these ranges:
- L1-89 handler doc comment (stays). L90 `pub(crate) fn rpc_humble_login_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {`
- head L90-116: args, `url`, `origin: String`, `is_epic_login`/`is_gog_login` (with `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]`), `visible: bool`, `user_agent: &str`, `label: String`, `event_label: String`, then the pristine-route comment L108-116. STAYS in the handler.
- latch L117-188: comment L117-150, then `#[cfg(target_os = "macos")]` L151 + `if visible == true { ... }` L152-188 (has `?`, `return Err("humble_login_open:login-already-in-progress"...)`, `Some((label.clone(), now))`). Moves to `arm_visible_login_latch_macos`.
- route L189-196: `#[cfg(target_os = "macos")] if is_epic_login || is_gog_login { ... return open_pristine_login_sheet(app, &label, url, visible, user_agent, store); }`. STAYS.
- build L197-496. It starts with `current_origin` (L202) and the `initial_visible` cfg pair, then the d7o non-macOS `let mut login_owner: Option<tauri::WebviewWindow> = None;` (L223-224) and the builder (L225). The first `if visible {` block is L229-394; it contains the d7o non-macOS `{ let (owned_builder, owner) = attach_login_owner(app, builder); ... match owner { Some(main_window) => login_owner = Some(main_window), None => builder = builder.center().focused(true), } }` (L298-306). Then the debug diag block, `page_load_origin` (L428), the macOS `app_for_origin = app.clone()` / `label_for_origin = label.clone()`, and `let window = builder.on_page_load(...).build().map_err(|e| format!("humble_login_open:build-failed:{e}"))?;` (L436-496). Moves to `build_login_window`.
- barcomment L497-514 (comment only, including d7o's `present_owned_login_window` sentence; STAYS at the native-bar call site).
- bar L515-557: `#[cfg(macos)] let native_bar_installed = if visible { ...with_webview + mpsc... } else { false };` and the `#[cfg(macos)] if visible && !native_bar_installed { WARN }`. Moves to `install_native_bar_for_sheet_macos`.
- present-a L558-597: `#[cfg(macos)] let sheet_presented = if visible && native_bar_installed { ...thread::spawn + watchdog... } else { false };`. Moves to `present_visible_login_window_macos`.
- nonmac L598-599: `#[cfg(not(target_os = "macos"))] let sheet_presented = false;`. STAYS.
- owner L600-603 (d7o): `#[cfg(not(target_os = "macos"))] if let Some(owner) = login_owner.as_ref() { present_owned_login_window(app, &window, owner, &label); }`. Moves to the END of `build_login_window`, after HEAD L496 and before `Ok(window)`. See `<objective>` for why.
- present-b L604-641: clear-on-presented, the CR-01 visible fallback (`window.show()`, `window.set_focus()`, clear). Moves to `present_visible_login_window_macos`.
- record L642-651: `if visible { shell_eprintln!(... sheet_presented={sheet_presented}) }`. STAYS.
- close L652-715: close-detection comment, `close_event_label`, macOS `app_for_dismiss`, `window.on_window_event(move |event| { ... })`. Untouched by d7o. Moves to `install_login_window_close_hook`.
- tail L716-748: title seed, devtools block, `Ok(Value::String(label))`, `}`. STAYS.
All moved regions are top-level handler statements at 4-space indent and land as top-level statements of
a step fn. No dedent happens anywhere, so each moved line stays byte-identical.

Step signatures (types match the handler locals each param replaces, so moved bodies compile unchanged).
Format each one in rustfmt's style: one line if it is 100 columns or less, else one param per line with
a trailing comma and `) -> T {` at column 0:
- `#[cfg(target_os = "macos")] fn arm_visible_login_latch_macos(label: String, visible: bool) -> Result<(), String>`. Body: HEAD L117-188, then the tail `Ok(())`.
- `fn build_login_window(app: &AppHandle, label: String, url: tauri::Url, origin: String, visible: bool, user_agent: &str, event_label: String) -> Result<tauri::WebviewWindow, String>`. This is 7 params; clippy `too_many_arguments` fires at 8. Body: HEAD L197-496 unchanged (the `let window = ...?;` stays), then HEAD L600-603 unchanged, then the tail `Ok(window)`. The owner block's `app`, `&window` (the local `let window`), `owner` and `&label` (`&String`) resolve to the same types they had in the handler.
- `#[cfg(target_os = "macos")] fn install_native_bar_for_sheet_macos(app: &AppHandle, window: &tauri::WebviewWindow, label: String, origin: String, visible: bool) -> bool`. Body: HEAD L515-557, then the tail `native_bar_installed`.
- `#[cfg(target_os = "macos")] fn present_visible_login_window_macos(app: &AppHandle, window: &tauri::WebviewWindow, label: String, visible: bool, native_bar_installed: bool) -> bool`. Body: HEAD L558-597, then L604-641, then the tail `sheet_presented`.
- `fn install_login_window_close_hook(#[cfg_attr(not(target_os = "macos"), allow(unused_variables))] app: &AppHandle, window: &tauri::WebviewWindow, label: String)`. Body: HEAD L652-715. `app` is read only on macOS, hence the cfg_attr. That pattern is the file's own (L97/L102).
Why owned `String` for label/origin (the call sites pass `label.clone()` / `origin.clone()`):
- With `&str`, `label.clone()` yields `&str`. That breaks `Some((label.clone(), now))` (the `Mutex<Option<(String, Instant)>>`), the `'static` captures of `thread::spawn`/`with_webview`/`on_page_load`, and `WebviewWindowBuilder::new(app, &label, ..)` (`&&str` is not `Into<String>`).
- `&String` trips clippy `ptr_arg`.
The extra clone per open is the price of not editing macOS-only lines that cannot be compiled here.
`window: &tauri::WebviewWindow` is safe because the moved bodies only call `window.method()` (`with_webview`,
`show`, `set_focus`, `on_window_event`). Every step uses `super::*` through the file's existing `use super::*;`.
`attach_login_owner`/`present_owned_login_window` arrive via `login_window.rs`'s non-macOS `pub(crate) use owned_modal::*;`. No new imports.

Pins that read this handler. All are jest pins over comment-stripped production source. Re-measured at
26facda22: no cargo test scopes this handler. F-34.4.2-12 targets only the three cookie arms, and the
`concat!("fn ...")` locators are keyring + clear-cookies. main.rs ~L1982 names `rpc_humble_login_open`
only as a doc example, so main.rs is NOT edited. No jest or cargo pin names any d7o identifier
(`login_owner`, `attach_login_owner`, `present_owned_login_window`, `owned_modal`).
- tauriShellSource.test.ts, via `humbleLoginOpenHandlerBody` (~L110):
  - D-29-05 ~L1510: first `if visible {` and `.title(login_window_title(&origin, None))` within 4000 chars. The title call still opens the block, before d7o's lines.
  - ~L1522: `.inner_size(`, `.center()`, `.focused(true)` and `on_document_title_changed` occur inside that first block only. d7o moved `.center().focused(true)` into the `None =>` arm of its `match owner`, which is still inside the block. It passes at 26facda22, and the owner block landing at the build tail adds none of these tokens.
  - Guard 1 ~L1582: `.inner_size(464.0, 592.0)`.
  - ~L1663/1693: the `.on_page_load(`...`.build()` slice holds `set_title(`, `page_load_origin.lock()`, `update_native_login_bar_origin(` and the `if is_started {` guard.
  - ~L1721/2223: no `.on_navigation(`.
  - ~L1731: `Arc::new(Mutex::new(origin.clone()))` before the first `.build()`.
  - ~L1745: `.theme(Some(tauri::Theme::Light))`.
  - ~L1961: exactly 1 `present_login_window_as_sheet(` in the arm.
  - ~L1985: the `if matches!(event, tauri::WindowEvent::Destroyed) {` block holds `dismiss_login_window_sheet(`.
  - ~L2204: exactly 1 `install_native_login_bar(`, with `let native_bar_installed = if visible {` < `install_native_login_bar(` < `present_login_window_as_sheet(`, and the arm holds `let sheet_presented = if visible && native_bar_installed {`.
  - ~L2419: `PENDING_VISIBLE_LOGIN_WINDOW` < `open_pristine_login_sheet(` < `tauri::WebviewWindowBuilder::new(`.
  - ~L2439/2488: the `if visible == true {` block holds `PENDING_VISIBLE_LOGIN_WINDOW`, `visible` and `pending_login_entry_is_stale`.
  - ~L2471: `if visible == true {` < `if is_epic_login || is_gog_login {`.
  - ~L2017 reads WHOLE code, not the arm: the `let sheet_presented = if visible && native_bar_installed {` block holds `present_login_window_as_sheet(`. That stays true because the line moves verbatim.
  - The WR-07 chain scan (`tauri::WebviewWindowBuilder::new(` to the next `.build()`) now spans d7o's attach lines, which carry no `.title(`. Its one failure is the unrelated store-embed popup chain.
- loginChromeCssInjection.test.ts, via `extractHumbleLoginOpenArmBody` (~L80):
  - The first `if visible {` block holds `login_chrome_css_script(`.
  - D-2: the CSS call sits at brace depth 1 and the line above it has no `#[cfg(`. d7o's non-macOS block closes before the CSS call, and the suite passes at 26facda22.
- Synthetic RED proofs (~L160/180 in loginChromeCss, ~L1594 in tauriShellSource) feed a lone handler with no step fns. They must keep passing.
- Whole-source counts are unchanged by moving within the file (`clear_pending_visible_login_window(` = 6, `install_native_login_bar(` = 2, `.open_devtools()` = 2, ...).
- `meta/captureShellScrollback.ts` anchors the `login chrome CSS injected for '` log text. The verbatim move keeps it.
Splicing each step's statements in at its call line makes every ordering pin above hold across the
call sequence. That is why no needle or expectation has to change. Measured at 26facda22: the two pin
suites run 289 tests, of which 288 pass and 1 fails, the unrelated WR-07 store-embed popup check.

Lint and compile reality:
- `.github/workflows/rust-test.yml` runs `cargo test --bin gamelib-shell` plus the clippy ratchet on windows-latest AND macos-latest.
- The ratchet (`meta/clippyRatchet.cjs`) is per-lint EQUALITY, keyed `darwin`/`win32`, so a lint that appears OR disappears turns it red.
- darwin's `'clippy::bool_comparison': 1` is this handler's `if visible == true {`. It moves verbatim and is never "fixed". Its own comment (L139-150) explains why the `== true` exists.
- Only `x86_64-pc-windows-msvc` is installed. Do NOT add rustup targets. macOS-gated code is not compiled or linted locally. d7o's owner code is non-macOS, so it IS compiled and linted here.
- `cargo fmt --check` parses cfg'd-out code. It is the one local check that sees the macOS steps (syntax and formatting).
- Clippy invocation: `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` in src-tauri, then `node meta/clippyRatchet.cjs <json> --list` from the root. The `--list` output prints `lint: N (ceiling C)` lines, then `file:line:col code message` sites, then PASS/FAIL.

Tooling reality on this box:
- rustfmt: `cargo fmt --check` is red repo-wide. humble_open.rs has 4 pre-existing hunks at 26facda22: L369 and L480 (build), L529 (bar) and L736 (tail). NEVER run `cargo fmt`/`rustfmt` in write mode. That would rewrite those 4 verbatim lines and break the move proof. Hand-format the new glue lines.
- `python3` is not on the Git Bash PATH, so helper scripts are Node (`.cjs`).
- Writing backslashes through Bash heredoc/sed is unreliable, so create or edit every file with the Write/Edit tools.
- NEVER `git checkout -- <file>` (husky post-checkout runs `pnpm install`). To revert a mutation, `cp` back a saved copy, then `cmp`.
- Jest: ~40 suites fail on this box regardless of the change. Gate on failing-set equality, never all-green.
- Prettier (`--file-info`, measured): the three `.ts` files report `ignored: false, inferredParser: typescript` and pass `--check` today. humble_open.rs reports `inferredParser: null`, so `--check` has no parser; the rustfmt hunk count is its formatter gate. Every `.planning/` path reports `ignored: true`.
- The working tree at 26facda22 already holds unrelated changes: the modified clear-cookies todo, `.planning/debug/rust-test-ci-missing-sidecar.md`, `.planning/debug/test-workflow-red-since-1026.md` and `.planning/milestone.lock`. Stage explicit paths only. Never `git add -A`/`.`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer — capture baselines, then extract `install_login_window_close_hook` end to end with spliced pins</name>
  <files>src-tauri/src/login_window/humble_open.rs, src/backend/testUtils/tauriShellSource.ts, src/backend/__tests__/tauriShellSource.test.ts, src/backend/__tests__/loginChromeCssInjection.test.ts, .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/</files>
  <precondition>`git diff --quiet 26facda22 -- src-tauri/src/login_window/humble_open.rs src-tauri/src/login_window/owned_modal.rs src/backend/testUtils/tauriShellSource.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts` exits 0. The HEAD line ranges in `<interfaces>` were re-measured at that commit. If it fails, stop and re-derive them.</precondition>
  <action>
This task proves the whole mechanism on ONE step before 500 more lines move. The mechanism is a step fn with a type-faithful signature, a handler call, the jest splicer and linkage test, a byte-identical move proof and mutation runs.

A. Baselines. Capture these BEFORE any source edit. `mkdir -p $B/raw` first. `raw/` holds large outputs and is never committed.
(a) `git rev-parse HEAD > $B/base-ref`.
(b) In src-tauri, take the `^test result` line of `cargo test --bin gamelib-shell` with `; finished in ...` stripped (`sed -E 's/; finished in .*//'`) and write it to `$B/cargo-before.txt`.
(c) Write the count of `^Diff in` lines from `cargo fmt --check` that mention `humble_open.rs` to `$B/fmt-before.txt`. Expect 4.
(d) Run clippy, per `<interfaces>`, to `$B/raw/clippy-before.json`, then `node meta/clippyRatchet.cjs $B/raw/clippy-before.json --list > $B/clippy-before.txt`. Record whether it printed PASS. If it is already red, record that. From then on the gate is per-lint-count identity, not green.
(e) Build `$B/jest-suites.txt` with `grep -rlE "testUtils/tauriShellSource|loadMainRsCode|src-tauri/src/" src meta --include='*.test.ts' | sort -u`. Run `npx jest --silent --json --outputFile=$B/raw/jest-before.json --runTestsByPath` over that list. Also run the two pin suites alone to `$B/raw/pins-before.json`.
(f) Write `$B/cargo-pin-scan.txt` from `grep -n 'rpc_fn_name(\|is_top_level_fn_line(\|concat!("fn ' src-tauri/src/main.rs` plus `grep -rn 'humble_open.rs' src-tauri/src`. The expected result: only the F-34.4.2-12 arm tracker, the keyring and clear-cookies locators, and the two `SHELL_SOURCE_FILES`/`SHELL_SOURCE_PARTS` entries. If any cargo test locates `rpc_humble_login_open`'s body, stop and report. The plan's no-main.rs-edit premise would be wrong.

B. Helper scripts. Create both with the Write tool. They are Node, stdlib only, run as `node <script>`.
- `$B/jest_failing.cjs <json>`. It prints sorted unique lines of `<suite basename> :: <assertion fullName>` for every failed assertion, and `<suite basename> :: SUITE-ERROR` for a failed suite with no failed assertions. Split paths on both `/` and `\`. Write `$B/jest-failing-before.txt` and `$B/jest-pins-failing-before.txt` from the two (e) JSONs. The pins file must hold exactly the one WR-07 line. If it holds more, stop and report.
- `$B/verbatim_moves.cjs <tracer|full>`. It reads the base ref from `base-ref` next to itself and gets the HEAD file via `child_process.execFileSync('git', ['show', ref + ':src-tauri/src/login_window/humble_open.rs'])`, with no shell. It reads the working file. On both sides, drop blank lines and lines whose trimmed text starts with `//`. That lets comments move or take the permitted positional edits.
  - Fn spans: a span runs from a line matching `^(pub\(crate\) )?fn (\w+)` to the next line exactly `}`.
  - The script hard-codes the `<interfaces>` ranges (head, latch, route, build, barcomment, bar, present-a, nonmac, owner, present-b, record, close, tail) with an owner fn per mode. In `tracer` mode, close goes to `install_login_window_close_hook` and everything else to `rpc_humble_login_open`. In `full` mode, latch, build, owner, bar, present-a and present-b go to their steps from `<interfaces>` (owner goes to `build_login_window`), close goes to the close hook, and head, route, nonmac, record and tail go to the handler.
  - It asserts the ranges tile 90..748 exactly and that barcomment has zero code lines.
  - For each other range, the filtered HEAD lines must occur as one contiguous run in the filtered working lines exactly once, and the run must lie inside its owner's span. It prints `OK <range> -> <owner> L<a>-<b>` or `FAIL ...`.
  - In `full` mode it also asserts that within `build_login_window` the owner run starts after the build run ends. That proves the owner block is the step's tail statement, not dropped somewhere earlier.
  - Then it prints `GLUE L<n>: <text>` for every filtered line inside the handler or a step span that no run covers.
  - It exits 1 on any FAIL.
  - Run it once now in `tracer` mode against the unedited file. It must FAIL only on `close` (owner mismatch). That proves it can fail.

C. Rust (behaviour-preserving: same order, cfg gates and strings). Insert `install_login_window_close_hook` directly after the handler's closing `}`, before `rpc_humble_login_take_events`'s comment. Use the `<interfaces>` signature in rustfmt vertical form, with the cfg_attr on the `app` param line. Precede it with a one-line `//` comment saying it is a step of `rpc_humble_login_open`. Its body is HEAD L652-715 moved byte-identically: the comment block first, then code. The function returns unit.
- In the handler, replace L652-715 with a one-line pointer comment and `install_login_window_close_hook(app, &window, label.clone());`. It sits between the presentation-record `if visible { ... }` and the title seed, exactly where the block was.
- Positional comment rule, for this task and Task 2: when a moved or staying comment points with above/below/further down/later/earlier at code that now lives in a DIFFERENT fn AND that direction no longer holds in file order, substitute that fn's name in backticks. Leave "this arm": the steps are part of the arm. Leave references that were already false before the move. List every edit for the SUMMARY.

D. testUtils/tauriShellSource.ts. Add these exports with JSDoc in the file's style:
- `HUMBLE_LOGIN_OPEN_STEPS: readonly string[]` = `['install_login_window_close_hook']`. Its JSDoc says this is the step fns `rpc_humble_login_open` calls, in call order. The list is re-derived from the handler and never widened to make a pin pass.
- `readTopLevelFnStatements(source, fnName)`. It calls `readTopLevelFnBody` for its throws. When the fn's own `fn` line does not end with `{`, it drops leading body lines through the first line whose trimmed text starts with `)` and ends with `{`. That is the rustfmt vertical-signature close.
- `readHandlerBodyWithSteps(source, wireName, steps, minLines = 3)`. It returns `readHandlerBody(source, wireName, minLines)`. After each body line that calls a listed step, it inserts that step's statements. A call is a match of `(?<![\w])NAME\(` not preceded by `fn `. A step the handler does not call is not inserted, so synthetic single-handler sources keep working. The linkage check is what fails on an uncalled step.
- `listStepLinkageProblems(source, wireName, steps): string[]`. It reports one problem string per breach:
  - a step whose definition is missing or duplicated (catch the `readTopLevelFnBody` throw);
  - a call count in the raw handler body other than 1;
  - a call count across the whole `source` other than 1 (a second caller);
  - handler call positions that are not in list order.
  It returns `[]` when clean.

E. Tests.
- tauriShellSource.test.ts: `humbleLoginOpenHandlerBody` returns `readHandlerBodyWithSteps(code, 'humble_login_open', HUMBLE_LOGIN_OPEN_STEPS)`. Update its docstring: the arm is the handler with each named step's statements spliced in at its call, so ordering pins read across the call sequence.
- loginChromeCssInjection.test.ts: `extractHumbleLoginOpenArmBody` does the same, with the matching docstring.
- Do not change any existing `expect(` line in either file.
- Add a describe `rpc_humble_login_open named steps (quick 261111-buh)` to tauriShellSource.test.ts, next to the helper or in the Phase 71 section. It holds:
  1. `listStepLinkageProblems(loadMainRsCode(), 'humble_login_open', HUMBLE_LOGIN_OPEN_STEPS)` equals `[]`, and the list is non-empty.
  2. Every step's statements appear in `humbleLoginOpenHandlerBody(loadMainRsCode())`.
  3. RED proofs over synthetic sources built with the file's existing `rust(...)` helper or an equivalent. Each must yield a non-empty problem list naming the step: calls out of list order; a step defined but never called; a step called twice; a step also called from another fn; a step not defined.
  4. A splicer self-test. Use a synthetic handler `a(); step_one(); c();` with `step_one` defined using a vertical signature (`fn step_one(` / `    x: u8,` / `) {` / three body lines / `}`). The spliced text must have `a();` before the step body lines and both before `c();`, with no `x: u8`.

F. Mutation self-tests. Copy the edited humble_open.rs to `$B/raw/humble_open.rs.pre-mutation` first. After each mutation, `cp` the copy back and `cmp` it. Run the two pin suites each time with `--json --outputFile=$B/raw/m-<id>.json` and read the failures with `jest_failing.cjs`.
- M-orphan: delete the handler's `install_login_window_close_hook(` call line. Expect the new linkage test and "Test 2 (INVERTED 2026-08-04..." (the Destroyed block) to FAIL.
- M-body: in the close hook, delete the `dismiss_login_window_sheet(&app_for_dismiss, &close_event_label);` line. Expect the same Test 2 to FAIL. That proves the pin reads the spliced step body.
Record both outcomes and the restore `cmp` for the SUMMARY.

G. Gates before the commit, then the commit.
- `cargo check --bin gamelib-shell` and the full cargo test must give the same result line as before.
- The pin-suite failing set must equal the before set.
- Re-run the ratchet into `$B/raw/clippy-t1.json`/`.txt`. The count lines must be identical. The location-stripped (`sed -E 's/^[^ ]+ //'`) sorted site list must also be identical, ignoring the PASS/FAIL line. A new lint in the close hook means fixing the code, never a ceiling.
- The fmt count must be at most 4.
- Prettier `--check` on the three `.ts` files. If needed, `npx prettier --write` those exact three paths only.
- `pnpm codecheck`.
- `node $B/verbatim_moves.cjs tracer` must pass. Save its output to `$B/verbatim-tracer.txt`.
- Commit ONLY these paths: humble_open.rs, the three `.ts` files, and `$B` minus `raw/`. Message: `refactor(quick-261111-buh): extract install_login_window_close_hook from rpc_humble_login_open`. The pins are repointed in this same commit.
  </action>
  <verify>
    <automated>B=.planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline && test "$(wc -l < $B/jest-pins-failing-before.txt | tr -d ' ')" = 1 && node $B/verbatim_moves.cjs tracer && grep -q '^fn install_login_window_close_hook(' src-tauri/src/login_window/humble_open.rs && (cd src-tauri && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result' | sed -E 's/; finished in .*//') | diff - $B/cargo-before.txt && (npx jest --silent --json --outputFile=$B/raw/pins-t1.json --runTestsByPath src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts >/dev/null 2>&1 || true) && node $B/jest_failing.cjs $B/raw/pins-t1.json | diff - $B/jest-pins-failing-before.txt && grep -q 'listStepLinkageProblems' src/backend/__tests__/tauriShellSource.test.ts && test "$( (cd src-tauri && cargo fmt --check 2>&1) | grep '^Diff in' | grep -c 'humble_open.rs')" -le 4 && diff <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/clippy-before.txt) <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/raw/clippy-t1.txt) && npx prettier --check src/backend/testUtils/tauriShellSource.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts && git diff --quiet HEAD -- src-tauri/src/login_window/humble_open.rs src/backend/testUtils/tauriShellSource.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts && S="$(git log -1 --format=%s)" && [[ "$S" == "refactor(quick-261111-buh): extract install_login_window_close_hook"* ]]</automated>
    Prettier: `--check` runs over the three `.ts` paths written (each `--file-info` reports `ignored: false`, parser typescript). It is omitted for humble_open.rs (`inferredParser: null`; the rustfmt hunk count is its formatter gate) and for `$B` (`.planning/` is prettier-ignored).
  </verify>
  <done>Baselines are captured, and the pin-suite baseline is exactly the one unrelated WR-07 failure. `install_login_window_close_hook` exists at column 0 right after the handler, holds HEAD L652-715 byte-identically, and is called once from the handler at the original position. Both pin helpers read the spliced arm. The linkage test and its five RED proofs pass, as does the splicer self-test. M-orphan and M-body each turned the named pins red and were reverted (`cmp` clean). The cargo test line, clippy counts, fmt count (at most 4), prettier and codecheck all match their baselines or pass. Committed as one commit.</done>
</task>

<task type="auto">
  <name>Task 2: Expansion — extract the latch, build (with the d7o owner), native-bar and presentation steps; prove the moves byte-identical</name>
  <files>src-tauri/src/login_window/humble_open.rs, src/backend/testUtils/tauriShellSource.ts, .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/</files>
  <action>
A. Rust (behaviour-preserving, as in Task 1). Insert four step fns between the handler's closing `}` and `install_login_window_close_hook`, in call order. Each uses its `<interfaces>` signature and has a one-line `//` role comment above it. Each macOS step's `#[cfg(target_os = "macos")]` goes on its own line above that comment's `fn`.
1. `arm_visible_login_latch_macos`: body is HEAD L117-188 byte-identical (comment block first, then the `#[cfg]` + `if visible == true {` block), then `Ok(())`. Keep the inner `#[cfg(target_os = "macos")]` attribute verbatim even though the fn is gated. That keeps the darwin `bool_comparison` site and the move proof exact. Do not "fix" `== true`. Handler: in place of L117-188, a one-line pointer comment, `#[cfg(target_os = "macos")]`, `arm_visible_login_latch_macos(label.clone(), visible)?;`. It sits after the pristine-route comment L108-116 and before the route L189-196. That order is the T-34.4.2-39 contract (a refused login builds no window).
2. `build_login_window`: body is HEAD L197-496 byte-identical (d7o's `login_owner` declaration and `attach_login_owner` match included; the `let window = ... .map_err(...)?;` stays), then HEAD L600-603 byte-identical (the non-macOS `if let Some(owner) = login_owner.as_ref() { present_owned_login_window(app, &window, owner, &label); }`), then `Ok(window)`. The role comment says the step builds the window and, off macOS, presents it owned by main (quick-261111-d7o). Handler: in place of L197-496, `let window = build_login_window(app, label.clone(), url, origin.clone(), visible, user_agent, event_label)?;` in rustfmt form (vertical args, `)?;`). `url` and `event_label` move in. Both were already used only by the builder. Delete L600-603 from the handler. The non-macOS `let sheet_presented = false;` (L598-599) stays where it is.
3. `install_native_bar_for_sheet_macos`: body is HEAD L515-557 byte-identical, then `native_bar_installed`. Handler: the L497-514 comment stays in place, followed by `#[cfg(target_os = "macos")]` and `let native_bar_installed = install_native_bar_for_sheet_macos(app, &window, label.clone(), origin.clone(), visible);` in rustfmt form.
4. `present_visible_login_window_macos`: body is HEAD L558-597, then L604-641, both byte-identical, then `sheet_presented`. Handler: `#[cfg(target_os = "macos")]` + `let sheet_presented = present_visible_login_window_macos(app, &window, label.clone(), visible, native_bar_installed);` (rustfmt form), immediately followed by the unchanged L598-599 non-macOS `let sheet_presented = false;`, then the record print L642-651.
Apply the Task 1 positional-comment rule. Candidates were checked against the planned file order: handler, latch, build, bar, present, close hook.
- EDIT these, because their direction is now false in file order:
  - L122-123, in the latch: "the pristine-route variables above and BEFORE the pristine route and the builder below". The route is in the handler, above the latch step. Rewrite as "called from `rpc_humble_login_open` after the pristine-route variables and before the route and `build_login_window`".
  - L393, in build: "see the print call after `window` exists, below". The print is in the handler, above. It becomes "in `rpc_humble_login_open`, after `build_login_window` returns".
  - L401-402, in build: "this arm's `open_devtools()` call below". The call is in the handler, above.
  - L644, in the handler's record print: "see this arm's builder-setup block above". The builder is now `build_login_window`, below.
- LEAVE these, because their direction still holds:
  - L205, L213-214, L290, L509, L512, L567, L616, L622, L672, L695.
  - L683, which was already stale before this split.
Confirm each, look for others, and never change a code line inside a moved range. Expected result: the handler is about 105-120 lines.

B. Extend `HUMBLE_LOGIN_OPEN_STEPS` to `['arm_visible_login_latch_macos', 'build_login_window', 'install_native_bar_for_sheet_macos', 'present_visible_login_window_macos', 'install_login_window_close_hook']`. This is a measured list in call order, not widened.

C. macOS manual review. This is the ONLY check on the three macOS-only steps before CI, because this box cannot compile them.
- Run `node $B/verbatim_moves.cjs full > $B/verbatim-full.txt`. It must pass with every range OK, including the owner-after-build order check. Then walk each `GLUE` line against this checklist and record a verdict per item for the SUMMARY:
  (a) Each macOS step param has the name of the handler local it replaces and the `<interfaces>` type: owned `String` for label/origin, `&tauri::WebviewWindow`, `&AppHandle`, `bool`.
  (b) The step return types fit the moved bodies. The latch's `?` and `return Err(...)` need `Result<(), String>`. The bar and presentation bodies contain no `?`; their `return false`s sit inside closures.
  (c) Each tail expression is correct: `Ok(())`, `Ok(window)`, `native_bar_installed`, `sheet_presented`.
  (d) The call statements carry exactly the cfg gates the moved code had: the latch call, `let native_bar_installed` and the macOS `let sheet_presented` are `#[cfg(target_os = "macos")]`, and the non-macOS `let sheet_presented = false;` is untouched. The owner block keeps its own `#[cfg(not(target_os = "macos"))]`.
  (e) darwin lint parity. `if visible == true` occurs exactly once. No step has more than 7 params. No new `#[allow]` beyond the close hook's cfg_attr. No `&x` passed to a generic fn whose referent is unused afterwards inside the step. The one generic borrow in moved code, `WebviewWindowBuilder::new(app, &label, ...)`, still has later `label` uses in `build_login_window`, including the owner block's `&label` off macOS.
  (f) Every identifier in the moved macOS bodies resolves through `use super::*;` as before.
- `cargo fmt --check` must show no new hunk. Any hunk on a glue line must be hand-fixed. Because rustfmt parses cfg'd-out code, this also syntax-checks the macOS steps.
- The owner path is non-macOS, so `cargo check` and Windows clippy compile and lint it here. A new `unused_mut`/`unused_variables` on `login_owner` would mean the block did not land inside `build_login_window`.

D. Mutation self-tests. Same procedure as Task 1 F: save a copy first, `cp` back and `cmp` after each.
- M-build: in `build_login_window`, change `.inner_size(464.0, 592.0)` to `.inner_size(900.0, 700.0)`. Expect "Guard 1 (D-3)" to FAIL.
- M-order: move the two-line latch call (cfg + call) to just after the route's closing `}`. Expect "Test 1 (ORDERING, updated quick-261029-utr)", "Test 3b" and the linkage test to FAIL.
- M-swap: swap the native-bar and presentation call statements. Expect "Test 1: install_native_login_bar( is called inside..." and the linkage test to FAIL.
- M-css: insert `#[cfg(target_os = "macos")]` on its own line directly above `builder = builder.initialization_script(&login_chrome_css_script());` in `build_login_window`. Expect loginChromeCssInjection's "the real source: the CSS call sits at brace depth 1..." to FAIL.
Record the outcomes and the `cmp` results.

E. Gates, then the commit.
- `cargo check --bin gamelib-shell`; the full cargo test result line equals `$B/cargo-before.txt`.
- The pin-suite failing set equals `$B/jest-pins-failing-before.txt`.
- The ratchet goes into `$B/raw/clippy-t2.*`. Counts must be identical and the location-stripped site list identical.
- The fmt count must be at most 4.
- Prettier `--check` on `src/backend/testUtils/tauriShellSource.ts`.
- Commit ONLY humble_open.rs, testUtils/tauriShellSource.ts and `$B/verbatim-full.txt`. Message: `refactor(quick-261111-buh): split the rest of rpc_humble_login_open into named steps`.
  </action>
  <verify>
    <automated>B=.planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline && node $B/verbatim_moves.cjs full && test "$(grep -oE '^fn (arm_visible_login_latch_macos|build_login_window|install_native_bar_for_sheet_macos|present_visible_login_window_macos|install_login_window_close_hook)\(' src-tauri/src/login_window/humble_open.rs | sort -u | wc -l | tr -d ' ')" = 5 && test "$(grep -v '^[[:space:]]*//' src-tauri/src/login_window/humble_open.rs | grep -o 'if visible == true {' | wc -l | tr -d ' ')" = 1 && (cd src-tauri && cargo check --bin gamelib-shell && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result' | sed -E 's/; finished in .*//') | tail -1 | diff - $B/cargo-before.txt && (npx jest --silent --json --outputFile=$B/raw/pins-t2.json --runTestsByPath src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts >/dev/null 2>&1 || true) && node $B/jest_failing.cjs $B/raw/pins-t2.json | diff - $B/jest-pins-failing-before.txt && test "$( (cd src-tauri && cargo fmt --check 2>&1) | grep '^Diff in' | grep -c 'humble_open.rs')" -le 4 && diff <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/clippy-before.txt) <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/raw/clippy-t2.txt) && npx prettier --check src/backend/testUtils/tauriShellSource.ts && git diff --quiet HEAD -- src-tauri/src/login_window/humble_open.rs src/backend/testUtils/tauriShellSource.ts && S="$(git log -1 --format=%s)" && [[ "$S" == "refactor(quick-261111-buh): split the rest"* ]]</automated>
    Prettier: `--check` runs over `src/backend/testUtils/tauriShellSource.ts`, the only prettier-handled path this task writes. It is omitted for humble_open.rs (`inferredParser: null`; the rustfmt hunk count is its gate) and for `$B` (prettier-ignored).
  </verify>
  <done>The handler calls the five steps in order and holds only args, the latch call, the route, step calls, the non-macOS `sheet_presented`, the record print, the title seed, devtools and `Ok`. The d7o owner lives entirely in `build_login_window`, with its present block last before `Ok(window)`. `verbatim_moves.cjs full` passes: every HEAD range is byte-identical inside its owner fn, the ranges tile L90-748, the owner run follows the build run, and the GLUE list is reviewed item by item against checklist (a)-(f). M-build, M-order, M-swap and M-css each turned their named pins red and were reverted. Cargo test line, clippy counts and site list, fmt count, the pin failing set and prettier all match their baselines or pass. Committed as one commit.</done>
</task>

<task type="auto">
  <name>Task 3: Broad gates, graph refresh, todo status, SUMMARY with the owed live gates</name>
  <files>.planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md, .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline/</files>
  <action>
1. Jest, broad. Re-run every suite in `$B/jest-suites.txt` to `$B/raw/jest-after.json`. Write `node $B/jest_failing.cjs` of it to `$B/jest-failing-after.txt`. It must equal `$B/jest-failing-before.txt`. A newly failing suite means a source-shape assumption this plan missed. Report it, and fix only if the fix is in this task's own code (never by editing an existing `expect(`).
2. `pnpm codecheck`, `pnpm find-deadcode` and `pnpm lint`.
- If `pnpm lint` is over a ceiling, delete `.eslintcache-src` and re-run cold before judging. If it is still red, it counts only if the findings are in the three `.ts` files this plan wrote.
- Any fix lands in a follow-up commit that names the gate. The `<verify>` prettier rule applies to any `.ts` path that fix touches.
3. Write `$B/clippy-after.txt` (copy `$B/raw/clippy-t2.txt`) and `$B/fmt-after.txt` (recount).
4. Run `graphify update .` (AST-only, per CLAUDE.md). graphify-out/ is gitignored, so do not stage it.
5. Add a dated paragraph to the todo. Append it after the existing body, separated by a blank line. Hand-wrap it at about 97-100 columns to match the file. Do NOT touch the frontmatter or move the file. The paragraph reads: `**Status (2026-11-11):**` the split landed in `<Task 1 hash>` and `<Task 2 hash>` (quick 261111-buh). Then fill in:
- the handler's new line count;
- the five step names;
- that the quick-261111-d7o owner wiring now lives in `build_login_window`;
- that every moved code line is byte-identical, per the quick dir's `baseline/verbatim-full.txt`;
- that the jest pins now read the handler with each step spliced in at its call, plus a linkage test, in the same commits.
Then the live gates:
- macOS: still owed. Also say the three macOS-only steps were never compiled on the planning machine, so the first macos-latest rust-test run carrying these commits is their compile and clippy check. The pass condition: a live sign-in presented as a sheet with the native bar; a second visible login refused while the first is pending; x/Esc resolving it; Epic and GOG pristine sheets unchanged.
- Windows: owed. Pass: a visible login window owned by main and centred over it, main disabled while it is up and re-enabled on close, titled `origin — document title`, where closing it resolves the sign-in.
- Close this todo once both pass.
6. Run `pnpm planning-gates`.
7. Commit ONLY the todo plus `$B/jest-failing-after.txt`, `$B/clippy-after.txt` and `$B/fmt-after.txt`. Message: `docs(quick-261111-buh): post-split gate baselines and todo status`. Then `rm -rf $B/raw`. The SUMMARY is committed by the quick workflow's own docs commit.
8. Write the SUMMARY (`261111-buh-SUMMARY.md` beside this plan). Include:
- the handler line count before (659) and after;
- each step fn with its line range;
- the owner-threading decision and why;
- the GLUE list with the checklist verdicts (a)-(f);
- every comment edit;
- all six mutation outcomes;
- the cargo test line;
- clippy before/after counts;
- the fmt count;
- the jest failing sets before and after;
- the codecheck, find-deadcode and lint results.
State plainly that main.rs was not edited, with the reason from `$B/cargo-pin-scan.txt`. Also state that no source pin covers the d7o owner wiring (d7o added none); its guard is the move proof plus the Windows live gate. Add a `## Human verification required (live-gate)` section:
(a) macOS live sign-in through Humble or Amazon. In order, the log must show:
- `login chrome CSS injected for '`;
- `login-window sheet: present_login_window_as_sheet entered for '`;
- `presentation requested visible=true ... sheet_presented=true`;
- `title change applied len=N`;
- `origin banner updated len=N` on navigation.
A second visible login while the first is pending must log `REFUSED visible login window` and fail with `login-already-in-progress`. x/Esc must resolve the flow as cancelled and log the latch clear, and a new sign-in after that must be accepted. Epic and GOG must still present their pristine sheets. Also: the macos-latest leg of rust-test.yml must be green (cargo test plus the darwin equality ratchet) on the first push carrying these commits.
(b) Windows live sign-in on this box. The login window opens owned by main and centred over it, with no taskbar button. Main is disabled while it is up, and is re-enabled and re-focused when it closes. The title reads `origin — document title`, and the CSS-injected log line fires. Closing the window resolves the sign-in as cancelled. With main minimised, the login window still opens free-floating, centred and focused, logging `owner not attached`.
Linux: compile and unit tests on the CI ubuntu leg only. No live run.
State that the todo stays in pending/ (`ready: live-gate`) until (a) and (b) pass.
  </action>
  <verify>
    <automated>B=.planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/baseline && T=.planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md && diff $B/jest-failing-before.txt $B/jest-failing-after.txt && test "$(cat $B/fmt-after.txt)" -le 4 && diff <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/clippy-before.txt) <(grep -E '^[^ ]+: [0-9]+ \(ceiling' $B/clippy-after.txt) && pnpm codecheck && pnpm find-deadcode && pnpm planning-gates && F="$(git show "$(cat $B/base-ref):$T")" && diff <(printf '%s\n' "$F" | sed -n 1,8p) <(sed -n 1,8p $T) && grep -q '^\*\*Status (2026-11-11):\*\*' $T && test ! -e .planning/todos/completed/2026-11-08-split-rpc-humble-login-open-into-named-steps.md && test ! -e $B/raw && test -f .planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/261111-buh-SUMMARY.md && git diff --quiet HEAD -- $T</automated>
    Prettier: omitted. This task writes only `.planning/` paths, which `--file-info` reports as `ignored: true`, so `--check` would be a green that proves nothing. If a gate fix in step 2 touches a `.ts` file, that follow-up commit's verify runs `npx prettier --check` over exactly those paths.
  </verify>
  <done>The failing set across every Rust-source jest suite is unchanged. codecheck, find-deadcode, lint and planning-gates are clean. The after-baselines are recorded and the graph is refreshed. The todo carries a Status paragraph with byte-identical frontmatter and is still in pending/. The SUMMARY records every measurement, the owner-threading decision, the GLUE review, all six mutations, and the owed macOS and Windows live gates plus the macos-latest CI leg.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> Rust `rustInvoke` (`humble_login_open` [url, visible, userAgent]) | args validated by `HumbleLoginOpenArgs::from_args` + `login_window_parse_url`; both stay inline in the handler, unchanged |
| remote login page -> shell (title, page loads) | document title and navigations are untrusted; the origin/title composition and log-length-only rules live in the moved build body |
| worker thread -> AppKit main thread (`with_webview`, sheet watchdog) | the moved macOS bodies keep their bounded `recv_timeout` waits verbatim |
| login window -> main window (Windows/Linux owner, d7o) | main is disabled while an owned login is up; release runs on every close path inside `owned_modal.rs`, which this plan does not touch |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-buh-01 | Denial of service | macOS-only steps (latch, native bar, presentation) cannot be compiled or linted here. A type, lifetime or new darwin lint would break the Mac build or the macos-latest equality ratchet. | high | mitigate | `verbatim_moves.cjs full` proves every moved code line byte-identical inside its owner fn, with full L90-748 coverage. Params are type-faithful (owned `String`, at most 7 params). `cargo fmt --check` parses the cfg'd-out code. The GLUE checklist (a)-(f) is reviewed. The macos-latest rust-test leg is named as the compile authority and the live macOS gate stays owed. |
| T-buh-02 | Spoofing | T-34.4.2-39 single-flight latch: it must run before the pristine route and the builder, or one store's password can land in another store's sheet | high | mitigate | The latch call stays before the route. The ORDERING / Test 3b pins now read the latch at its call. M-order proves they go red if it moves. |
| T-buh-03 | Spoofing | Anti-phishing origin title (T-34.5-G6-23/39): origin seeded from the validated URL and refreshed only from main-frame `on_page_load` | medium | mitigate | The build body is moved verbatim. The o3h and G6-04 pins read the spliced `build_login_window`, and M-build proves the pins read that body. |
| T-buh-04 | Tampering | D-2: the login chrome CSS injection must stay outside any cfg gate | low | mitigate | The loginChromeCss pins read the spliced body. M-css proves the D-2 gate still fires. |
| T-buh-05 | Information disclosure | Log lines must carry lengths only, never page titles or origins (T-34.4.1-106) | medium | mitigate | Every `shell_eprintln!` line sits inside a byte-identical range, so no log text changes. |
| T-buh-06 | Tampering | The guarding pins could be weakened while being repointed | medium | mitigate | No existing `expect(` changes. The linkage test has five RED proofs. Failing sets are compared before and after. All six mutations go red and revert with `cmp` clean. |
| T-buh-07 | Denial of service | d7o owner path: main left disabled, or the login left un-owned, if the owner present block were dropped or reordered | medium | mitigate | The block moves byte-identically to `build_login_window`'s tail, and the proof checks that it follows the build run. Off macOS, nothing with a side effect ran between `.build()` and it. `cargo check` and Windows clippy compile this path here (an `unused_mut` would flag a misplaced block). The Windows live gate checks main is re-enabled on close. |
| T-buh-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no package, toolchain or rustup target. |
</threat_model>

<verification>
- `verbatim_moves.cjs full` passes: every HEAD range is byte-identical in its owner fn, the ranges tile L90-748, the owner block follows the build run in `build_login_window`, and the GLUE list is reviewed against checklist (a)-(f).
- The full `cargo test --bin gamelib-shell` result line equals the baseline. `cargo check` passes (non-macOS cfg only, which includes the d7o owner path).
- The win32 clippy ratchet per-lint counts and location-stripped site list are identical. darwin parity is argued by construction and the CI macos-latest leg is named as the authority.
- humble_open.rs rustfmt hunks are at most 4, and `cargo fmt` was never run in write mode.
- The two pin suites' failing set (the 1 unrelated WR-07 failure) is unchanged. The failing set across all Rust-source suites is unchanged. All six mutations each failed their named pins and were reverted.
- Prettier `--check` passes on the three `.ts` paths written. codecheck, find-deadcode, lint and planning-gates are clean.
- The todo is still in pending/ with frontmatter unchanged and a Status paragraph. The SUMMARY lists the macOS and Windows live gates.
</verification>

<success_criteria>
`rpc_humble_login_open` reads as: parse args -> single-flight latch -> pristine route -> build window
(off macOS: own it by main and present it) -> install native bar -> present (sheet or fallback) ->
record -> close hook -> seed title -> devtools. The latch, build, native bar, presentation and close
hook live in named steps. Each moved code line is byte-identical and proven so. Behaviour, strings,
cfg gates, side-effect order, test count and lint counts are unchanged. The jest pins read the handler
with its steps spliced in at their calls, fail closed on a renamed, orphaned, duplicated or reordered
step, and were repointed in the same commits as the split. The live macOS and Windows sign-ins are
explicitly outstanding.
</success_criteria>

<output>
Create `.planning/quick/261111-buh-split-rpc-humble-login-open-into-named-s/261111-buh-SUMMARY.md` when done
</output>
