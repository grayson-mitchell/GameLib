# Phase 71: Rust shell module decomposition - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning, but blocked on Phase 67 (D-01)

<domain>
## Phase Boundary

Split the Rust shell's four oversized files into cohesive modules. Every move is mechanical, and no
behaviour changes. The four files:

- `src-tauri/src/store_embed.rs` (4,645 lines)
- `src-tauri/src/login_window.rs` (3,339)
- `src-tauri/src/macos_epic_embed.rs` (2,089)
- `src-tauri/src/main.rs` (7,905)

The work builds on the layout that quick task 261106-ab1 set. Anything found along the way that is
not a pure move becomes a todo. It is not fixed in this phase.

Scout findings that shape the phase (measured 2026-11-07):

- **`main.rs` is mostly tests.** Production code is lines 1–1852. The remaining ~6,050 lines are one
  `#[cfg(test)] mod tests` with 348 `#[test]` fns, and most of them test code that ab1 moved into
  sibling modules (login_window, keyring, clipboard, tray, cookie matching, reveal/clear-storage
  scripts).
- **Most of `store_embed.rs` is not store-embed code.** Lines 1810–4645 are `dispatch_rust_channel`,
  the central `rustInvoke` dispatcher. It is 2,835 lines and has 44 arms covering keyring, dialogs,
  notification, shell open, clipboard, app lifecycle, main-window raise, bridge invite picker, tray
  icon, Humble login/cookies/reveal/clear-storage, wake lock, six `scan_*` arms, and the ten
  `store_embed_*` arms. Some arm bodies are monoliths: `humble_login_open` is ~676 lines and
  `humble_login_clear_cookies` is ~600.
- The real store-embed code (state, the Valve handoff throttle, the link popup, the rect and
  visibility helpers, and `linux_store_embed_layout`) is about 1,800 lines.

</domain>

<decisions>
## Implementation Decisions

### Sequencing and cross-platform coverage
- **D-01: Hard-gate on Phase 67.** Phase 67's D-19 applies: 71 does not execute until 67's generated
  `rustInvoke` contract has landed. That contract replaces the dispatch arms' hand-written
  parsing and the `// transport-mirror:` consts in `sidecar.rs`. After it lands, 71 moves smaller
  arms and has no markers to preserve. If a marker survives 67, the 62-04 rule still holds: keep it
  with its const.
- **D-02: 71's first plan adds a Linux compile leg** to `.github/workflows/rust-test.yml`, running
  `cargo check` and `cargo test --bin gamelib-shell` on ubuntu with the webkit2gtk, appindicator
  and rsvg dev packages that `release-tauri.yml` installs. Skip this if Phase 72 has already landed
  the leg. Phase 72 then drops its Linux-leg item, so the ROADMAP note on 72 needs updating when
  this lands. The aim: every later move is compile-checked on macOS, Windows and Linux, including
  `linux_store_embed_layout` and the other `cfg(target_os = "linux")` sites, none of which any job
  compiles today.
  - **Superseded 2026-11-08 by Phase 72 D-14:** 72-01 landed the Linux leg in `rust-test.yml` (check and
    shell tests both hard gates, green on run 42432244587); Phase 71 skips its copy.
- **D-03: The CI gate runs once per wave.** Within a wave, each move is its own commit, and
  `cargo test --bin gamelib-shell` must be green on macOS before the next move. At the end of the
  wave, push and require the Windows and Linux CI legs to go green before the wave's live check and
  before the next wave starts.

### The rustInvoke dispatcher
- **D-04: `dispatch_rust_channel` moves to its own `src-tauri/src/rust_dispatch.rs` as a thin,
  flat router.** It stays one `match` over every channel, so the full channel list stays in one
  place (Phase 67's generated enum maps straight onto it). Each arm becomes a one-line call into a
  handler fn that lives in the module owning that domain.
- **D-05: Each handler gets its arm body verbatim; only the signature is new.** Each body moves
  unchanged into `fn <handler>(args: &[Value], app: &AppHandle) -> Result<Value, String>`, or the
  narrower signature the body actually needs. An arm-level early `return` keeps its meaning, since
  it now returns from the handler. The move-proof diff may contain only these lines: the new
  signature, the call site, closing braces, and the indentation shift. Anything beyond that
  (deduplicating argument parsing, sharing helpers, changing error text) becomes a todo, not part
  of the move.
- **D-06: Oversized handlers are extracted whole.** `humble_login_open` (~676 lines),
  `humble_login_clear_cookies` (~600) and any other handler that ends up over the D-12 target each
  become one function in 71. Splitting them into sub-steps changes control flow on the
  login and cookie paths, so record one todo per oversized handler instead.
- **D-07: Arms with no existing home go into new small domain modules.**
  - Dialogs (`dialog_open`, `dialog_save`, `dialog_message` and its `error`/`warning` sub-arms) go to
    something like `dialogs.rs`.
  - `shell_open_path` and `shell_show_item_in_folder` go to something like `shell_open.rs`. Phase
    72's open-path allow-list then has one obvious home.
  - `app_exit`, `app_relaunch`, `app_hide` and `main_window_raise` go to something like
    `app_lifecycle.rs`.
  - `notification_show` goes next to `notification_backend`.
  - `bridge_invite_picker_open` goes next to the invite-picker code.
  - The `scan_*` arms go next to the scanner calls they wrap.
  - Existing modules own their own arms: `keyring_dispatch` (the keyring_* arms), `clipboard`,
    `tray` (`tray_set_icon`), `wake_lock`, `login_window` (the humble_* arms), and `store_embed`
    (the store_embed_* arms).
  - Final module names are at Claude's discretion.

### main.rs's test module
- **D-08: Single-module tests co-locate.** Each `// ---- <topic> ----` test block moves into a
  `#[cfg(test)] mod tests` at the bottom of the module whose code it tests, the pattern
  `macos_epic_embed.rs` already uses. The moved tests can then reach private items, and the
  `use super::*` scope changes to that module's.
- **D-09: Cross-cutting tests stay in `main.rs`.** A test stays in `main.rs`'s `mod tests`, next to
  the `SHELL_SOURCE_FILES` guard, if it reads `SHELL_SOURCE`/`SHELL_SOURCE_FILES` or asserts wiring
  across more than one module. Examples: the Phase 40 store-embed wire contract, abandoned-invoke
  attribution, and the `KEYRING_READ_TIMEOUT` vs `RUST_INVOKE_TIMEOUT_MS` ordering invariant.
- **D-10: Source-text readers strip each file's test module first.** Co-located tests break the
  idiom "production code = everything before the first `mod tests {`" in the concatenated source.
  The first module's tests would cut off every file after it, and absence assertions would then
  pass vacuously.
  - Add a production-only reader, e.g. `readTauriShellProductionSource()`, to
    `src/backend/testUtils/tauriShellSource.ts`. It cuts each file at its own trailing
    `#[cfg(test)] mod tests` before concatenating.
  - Migrate every caller that slices before the first `mod tests` to it.
  - Add a guard test that fails if any reader still slices the combined source on `mod tests {`.
  - Give the Rust `SHELL_SOURCE` users the same treatment.
  - **Before migrating, record each affected test's needle hit counts, and confirm the same counts
    afterwards**, so that no assertion loses coverage without anyone noticing. This is the
    roadmap's open question on "combined-source treatment", answered.
  - Phase 71 must finish this before any module gains a `mod tests` (see D-14, wave 0).
- **D-11: `macos_epic_embed` pieces stay excluded from the combined source.** It is on
  `PRE_SPLIT_SIBLING_MODULES`. After the split, the exclusion matches the `macos_epic_embed`
  module and its `macos_epic_embed/` directory, so the files split out of it stay excluded and
  no count or absence assertion changes. Widening coverage to include them is a separate, later
  decision.

### Module granularity and layout
- **D-12: Each split file becomes a directory, in the non-`mod.rs` style.**
  `login_window.rs` keeps the submodule declarations and re-exports, and the pieces go in
  `login_window/` (for example `humble.rs`, `pristine_epic.rs`, `sheet.rs`, `cookies.rs`). The same
  goes for `store_embed/` and `macos_epic_embed/`. ab1's small flat modules (`clipboard.rs`,
  `sidecar.rs`, `tray.rs` and the rest) stay flat. The cluster map for each file decides the
  minimum module set, and Claude has discretion over the exact submodule names. This answers the
  roadmap's "minimum module set" question as: split along the cluster map's seams until D-13 holds.
- **D-13: Size target: a soft ~1,000 non-test lines per file.** Co-located tests don't count. A
  file may go over the target if its plan says why; for example, a file holding one D-06
  handler that was extracted whole. With its tests moved out, `main.rs` should be down to
  wiring: macro, mod declarations, Builder/setup/`generate_handler!`, `fn main`, diag/panic hooks,
  and the cross-cutting tests from D-09.
- **D-14: One target per wave.** Each wave ends with a CI push (D-03) and a live check in
  `pnpm tauri:dev` (never `tauri:dev:run`). The live check covers an embedded store page, a sign-in
  for each store that uses the login window, and the Epic embed, each with the frameless title bar
  **off and on**.
  - Wave 0: ~~the Linux CI leg (D-02)~~ (landed by Phase 72 72-01, 2026-11-08; skip) and the production-source helper and its migration (D-10).
    These are test-and-CI only, so no live check is needed.
  - Wave 1: the dispatcher moves to `rust_dispatch.rs`, and the domain handlers go out to their
    modules (D-04 to D-07).
  - Wave 2: `login_window.rs` is split into `login_window/`.
  - Wave 3: what's left of `store_embed.rs` is split into `store_embed/`.
  - Wave 4: `macos_epic_embed.rs` is split into `macos_epic_embed/`.
  - Wave 5: `main.rs`'s tests co-locate (D-08, D-09).
  - Within a wave, the planner may move test blocks alongside the code they test, as long as D-10
    has landed.
- **D-15: Parent modules re-export, so call sites don't change.** A parent such as
  `login_window.rs` declares its submodules and re-exports them with
  `pub(crate) use <sub>::*;`. `main.rs`'s `use login_window::*` and `generate_handler!` then keep
  working without edits. ab1's rule still applies: items become `pub(crate)` only where a move
  requires it, and no `pub(super)`/`super::super` chains are added unless they are unavoidable.

### Claude's Discretion
- Exact submodule names and the seam boundaries, taken from the per-file cluster map.
- Exact names of the new domain modules from D-07.
- Whether a small helper used by both the router and a handler lives with the handler or in
  `rust_dispatch.rs`.
- How the move-proof diff is scripted. ab1's sorted-lines-with-visibility-stripped comparison is the
  precedent; extend it so it tolerates the D-05 signature and indent lines.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Precedent and method
- `.planning/quick/261106-ab1-split-src-tauri-main-rs-into-modules/261106-ab1-SUMMARY.md`: the main.rs split that set the layout; covers the `pub(crate)` visibility audit (grep-matched across cfg-gated code), the move-proof diff, why `main.rs` is listed last, the `store_embed_handoff_policy.rs` `include_str!` repoint, and the coverage limits.
- `.planning/quick/261106-ab1-split-src-tauri-main-rs-into-modules/261106-ab1-PLAN.md`: ab1's task structure and fix categories (a) to (c) for source-text tests.
- `.planning/ROADMAP.md` § "Phase 71: Rust shell module decomposition": the goal, the targets, and the live-check list.

### Ordering dependencies
- `.planning/phases/67-schema-validation-at-the-sidecar-ipc-boundary/67-CONTEXT.md` D-13, D-17/D-18 (generated Rust contract, marker consts deleted), and D-19 (67 before 71).
- `.planning/ROADMAP.md` § "Phase 72": the Linux CI leg item that D-02 takes over, and the `shell_open_path` allow-list that will land in D-07's shell-open module.
- `.planning/codebase/CONCERNS.md`: where the 2026-11-07 concerns map lists the shell findings.

### Test and source-text infrastructure
- `src/backend/testUtils/tauriShellSource.ts`: the combined-source helper; covers `PRE_SPLIT_SIBLING_MODULES` and why `main.rs` is listed last.
- `src-tauri/src/main.rs` around lines 1853–1935: `SHELL_SOURCE_FILES`, `SHELL_SOURCE` and the guard test that requires every shell `.rs` file to be listed.
- `src-tauri/src/sidecar.rs` lines 1–25: the `transport-mirror:` marker contract, read by `transportParity.test.ts`.
- `src-tauri/src/store_embed_handoff_policy.rs`: reads shell files via `include_str!`, and ab1 had to repoint it.
- `.github/workflows/rust-test.yml`: the current macOS and Windows legs. Its header comment (a) records why there is no Linux leg and which packages Linux needs.

### Repo conventions
- `Skill("gamelib-conventions")`: the `<verify>` prettier check (scoped paths) and the todo frontmatter rules (`severity:`/`platform:`/`ready:`) for the todos D-05 and D-06 create.
- Memory: macOS embeds must be live-checked with the frameless title bar both OFF and ON; dev launch is `pnpm tauri:dev`; `tauri dev` does not rebuild the sidecar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tauriShellSource.ts` (`listTauriShellSourceFiles`, `readTauriShellFile`, `readTauriShellSource`). The new production-only reader extends it. It walks directories recursively, so new `login_window/` and `store_embed/` files are picked up automatically.
- ab1's visibility-audit script (word-match each item name across every shell `.rs`, comments excluded). This is how cfg-gated Windows and Linux references get covered before CI.
- `macos_epic_embed.rs` already uses co-located `#[cfg(test)] mod <topic>_tests`, which is the model for D-08.

### Established Patterns
- Moves are flat siblings plus `mod x; use x::*;` in `main.rs`, and the glob import carries the `#[tauri::command]` `__cmd__` macros, so `generate_handler!` needs no path changes. D-15 keeps that true.
- `#[path = "wake_lock/x.rs"] mod <name>;` was used for inline mods that had to keep their original names.
- The `cargo test --bin gamelib-shell` baseline was 420 passed / 2 ignored after ab1, and the roadmap cites 442. Re-measure it at the start of wave 0; the passed count must not drop across any move.

### Integration Points
- `generate_handler![...]` and the `setup` closure in `main.rs`.
- `sidecar.rs` → `dispatch_rust_channel` (the call site becomes `rust_dispatch::dispatch_rust_channel`, or a re-export keeps the call site as it is).
- 17 jest/meta files read shell source through the helper. Each one is checked against D-10.

</code_context>

<specifics>
## Specific Ideas

- The router should read as a table of contents for `rustInvoke`: one line per channel.
- Prove the moves with a diff, not by inspection, as ab1 did.

</specifics>

<deferred>
## Deferred Ideas

- **Split the oversized handlers** (`humble_login_open`, `humble_login_clear_cookies`, and any
  other handler that ends up over ~1,000 lines) into named sub-steps. One todo each, created
  during 71.
- **Tidy the dispatcher's argument parsing and error text**, if anything is left after Phase 67's
  generated contract. Create todos as findings come up (D-05).
- **Include the `macos_epic_embed` files and the other pre-split siblings in the combined
  source-text coverage**, re-baselining the counts. This is a later decision (D-11).
- **Roadmap upkeep:** done 2026-11-08 - Phase 72 D-14 landed the Linux leg in 72-01, so the Linux-leg item in Phase 72's goal is annotated as landed and Phase 71 owns no copy.

### Reviewed Todos (not folded)
`todo.match-phase 71` returned 19 keyword matches. None is in scope: all 19 are UI, Steam,
depot, launch or tooling items that matched on generic words. The closest is
`2026-11-07-clippy-ratchet-windows-leg.md`, which covers CI lint coverage rather than module
decomposition, so it stays separate.

</deferred>

---

*Phase: 71-rust-shell-module-decomposition*
*Context gathered: 2026-11-07*
