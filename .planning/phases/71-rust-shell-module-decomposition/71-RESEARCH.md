# Phase 71: Rust shell module decomposition - Research

**Researched:** 2026-11-08 (tree at `b74d85dee`; the tree was still moving while this was written, see Pitfall 14)
**Domain:** Mechanical decomposition of the Tauri Rust shell (`src-tauri/src/`) plus the source-text test infrastructure (jest/meta readers and Rust `SHELL_SOURCE` tests) that pins it
**Confidence:** HIGH on measurements, cluster maps and the source-text inventory (all from this session's grep/scripts). MEDIUM on Rust module-system behaviour that was not compiled here (flagged `[ASSUMED]`; the first wave-1 move is the compile proof).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sequencing and cross-platform coverage**
- **D-01: Hard-gate on Phase 67.** Phase 67's D-19 applies: 71 does not execute until 67's generated `rustInvoke` contract has landed. That contract replaces the dispatch arms' hand-written parsing and the `// transport-mirror:` consts in `sidecar.rs`. After it lands, 71 moves smaller arms and has no markers to preserve. If a marker survives 67, the 62-04 rule still holds: keep it with its const.
- **D-02: 71's first plan adds a Linux compile leg** to `.github/workflows/rust-test.yml`, running `cargo check` and `cargo test --bin gamelib-shell` on ubuntu with the webkit2gtk, appindicator and rsvg dev packages that `release-tauri.yml` installs. Skip this if Phase 72 has already landed the leg. Phase 72 then drops its Linux-leg item, so the ROADMAP note on 72 needs updating when this lands. The aim: every later move is compile-checked on macOS, Windows and Linux, including `linux_store_embed_layout` and the other `cfg(target_os = "linux")` sites, none of which any job compiles today.
  - **Superseded 2026-11-08 by Phase 72 D-14:** 72-01 landed the Linux leg in `rust-test.yml` (check and shell tests both hard gates, green on run 42432244587); Phase 71 skips its copy.
- **D-03: The CI gate runs once per wave.** Within a wave, each move is its own commit, and `cargo test --bin gamelib-shell` must be green on macOS before the next move. At the end of the wave, push and require the Windows and Linux CI legs to go green before the wave's live check and before the next wave starts.

**The rustInvoke dispatcher**
- **D-04: `dispatch_rust_channel` moves to its own `src-tauri/src/rust_dispatch.rs` as a thin, flat router.** It stays one `match` over every channel, so the full channel list stays in one place (Phase 67's generated enum maps straight onto it). Each arm becomes a one-line call into a handler fn that lives in the module owning that domain.
- **D-05: Each handler gets its arm body verbatim; only the signature is new.** Each body moves unchanged into `fn <handler>(args: &[Value], app: &AppHandle) -> Result<Value, String>`, or the narrower signature the body actually needs. An arm-level early `return` keeps its meaning, since it now returns from the handler. The move-proof diff may contain only these lines: the new signature, the call site, closing braces, and the indentation shift. Anything beyond that (deduplicating argument parsing, sharing helpers, changing error text) becomes a todo, not part of the move.
- **D-06: Oversized handlers are extracted whole.** `humble_login_open` (~676 lines), `humble_login_clear_cookies` (~600) and any other handler that ends up over the D-12 target each become one function in 71. Splitting them into sub-steps changes control flow on the login and cookie paths, so record one todo per oversized handler instead.
- **D-07: Arms with no existing home go into new small domain modules.**
  - Dialogs (`dialog_open`, `dialog_save`, `dialog_message` and its `error`/`warning` sub-arms) go to something like `dialogs.rs`.
  - `shell_open_path` and `shell_show_item_in_folder` go to something like `shell_open.rs`. Phase 72's open-path allow-list then has one obvious home.
  - `app_exit`, `app_relaunch`, `app_hide` and `main_window_raise` go to something like `app_lifecycle.rs`.
  - `notification_show` goes next to `notification_backend`.
  - `bridge_invite_picker_open` goes next to the invite-picker code.
  - The `scan_*` arms go next to the scanner calls they wrap.
  - Existing modules own their own arms: `keyring_dispatch` (the keyring_* arms), `clipboard`, `tray` (`tray_set_icon`), `wake_lock`, `login_window` (the humble_* arms), and `store_embed` (the store_embed_* arms).
  - Final module names are at Claude's discretion.

**main.rs's test module**
- **D-08: Single-module tests co-locate.** Each `// ---- <topic> ----` test block moves into a `#[cfg(test)] mod tests` at the bottom of the module whose code it tests, the pattern `macos_epic_embed.rs` already uses. The moved tests can then reach private items, and the `use super::*` scope changes to that module's.
- **D-09: Cross-cutting tests stay in `main.rs`.** A test stays in `main.rs`'s `mod tests`, next to the `SHELL_SOURCE_FILES` guard, if it reads `SHELL_SOURCE`/`SHELL_SOURCE_FILES` or asserts wiring across more than one module. Examples: the Phase 40 store-embed wire contract, abandoned-invoke attribution, and the `KEYRING_READ_TIMEOUT` vs `RUST_INVOKE_TIMEOUT_MS` ordering invariant.
- **D-10: Source-text readers strip each file's test module first.** Co-located tests break the idiom "production code = everything before the first `mod tests {`" in the concatenated source. The first module's tests would cut off every file after it, and absence assertions would then pass vacuously.
  - Add a production-only reader, e.g. `readTauriShellProductionSource()`, to `src/backend/testUtils/tauriShellSource.ts`. It cuts each file at its own trailing `#[cfg(test)] mod tests` before concatenating.
  - Migrate every caller that slices before the first `mod tests` to it.
  - Add a guard test that fails if any reader still slices the combined source on `mod tests {`.
  - Give the Rust `SHELL_SOURCE` users the same treatment.
  - **Before migrating, record each affected test's needle hit counts, and confirm the same counts afterwards**, so that no assertion loses coverage without anyone noticing. This is the roadmap's open question on "combined-source treatment", answered.
  - Phase 71 must finish this before any module gains a `mod tests` (see D-14, wave 0).
- **D-11: `macos_epic_embed` pieces stay excluded from the combined source.** It is on `PRE_SPLIT_SIBLING_MODULES`. After the split, the exclusion matches the `macos_epic_embed` module and its `macos_epic_embed/` directory, so the files split out of it stay excluded and no count or absence assertion changes. Widening coverage to include them is a separate, later decision.

**Module granularity and layout**
- **D-12: Each split file becomes a directory, in the non-`mod.rs` style.** `login_window.rs` keeps the submodule declarations and re-exports, and the pieces go in `login_window/` (for example `humble.rs`, `pristine_epic.rs`, `sheet.rs`, `cookies.rs`). The same goes for `store_embed/` and `macos_epic_embed/`. ab1's small flat modules (`clipboard.rs`, `sidecar.rs`, `tray.rs` and the rest) stay flat. The cluster map for each file decides the minimum module set, and Claude has discretion over the exact submodule names. This answers the roadmap's "minimum module set" question as: split along the cluster map's seams until D-13 holds.
- **D-13: Size target: a soft ~1,000 non-test lines per file.** Co-located tests don't count. A file may go over the target if its plan says why; for example, a file holding one D-06 handler that was extracted whole. With its tests moved out, `main.rs` should be down to wiring: macro, mod declarations, Builder/setup/`generate_handler!`, `fn main`, diag/panic hooks, and the cross-cutting tests from D-09.
- **D-14: One target per wave.** Each wave ends with a CI push (D-03) and a live check in `pnpm tauri:dev` (never `tauri:dev:run`). The live check covers an embedded store page, a sign-in for each store that uses the login window, and the Epic embed, each with the frameless title bar **off and on**.
  - Wave 0: ~~the Linux CI leg (D-02)~~ (landed by Phase 72 72-01, 2026-11-08; skip) and the production-source helper and its migration (D-10). These are test-and-CI only, so no live check is needed.
  - Wave 1: the dispatcher moves to `rust_dispatch.rs`, and the domain handlers go out to their modules (D-04 to D-07).
  - Wave 2: `login_window.rs` is split into `login_window/`.
  - Wave 3: what's left of `store_embed.rs` is split into `store_embed/`.
  - Wave 4: `macos_epic_embed.rs` is split into `macos_epic_embed/`.
  - Wave 5: `main.rs`'s tests co-locate (D-08, D-09).
  - Within a wave, the planner may move test blocks alongside the code they test, as long as D-10 has landed.
- **D-15: Parent modules re-export, so call sites don't change.** A parent such as `login_window.rs` declares its submodules and re-exports them with `pub(crate) use <sub>::*;`. `main.rs`'s `use login_window::*` and `generate_handler!` then keep working without edits. ab1's rule still applies: items become `pub(crate)` only where a move requires it, and no `pub(super)`/`super::super` chains are added unless they are unavoidable.

### Claude's Discretion
- Exact submodule names and the seam boundaries, taken from the per-file cluster map.
- Exact names of the new domain modules from D-07.
- Whether a small helper used by both the router and a handler lives with the handler or in `rust_dispatch.rs`.
- How the move-proof diff is scripted. ab1's sorted-lines-with-visibility-stripped comparison is the precedent; extend it so it tolerates the D-05 signature and indent lines.

### Deferred Ideas (OUT OF SCOPE)
- **Split the oversized handlers** (`humble_login_open`, `humble_login_clear_cookies`, and any other handler that ends up over ~1,000 lines) into named sub-steps. One todo each, created during 71.
- **Tidy the dispatcher's argument parsing and error text**, if anything is left after Phase 67's generated contract. Create todos as findings come up (D-05).
- **Include the `macos_epic_embed` files and the other pre-split siblings in the combined source-text coverage**, re-baselining the counts. This is a later decision (D-11).
- **Roadmap upkeep:** done 2026-11-08 - Phase 72 D-14 landed the Linux leg in 72-01, so the Linux-leg item in Phase 72's goal is annotated as landed and Phase 71 owns no copy.
- Reviewed todos not folded: all 19 keyword matches (UI, Steam, depot, launch, tooling) are out of scope; `2026-11-07-clippy-ratchet-windows-leg.md` stays separate.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (ROADMAP: `Requirements: TBD`). The planner covers D-01..D-15 instead.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Phase 67 gate | Satisfied. See "State changes since CONTEXT" (generated contract landed, 0 `transport-mirror:` markers) |
| D-02 | Linux CI leg | Superseded and landed by 72-01. Verified in `rust-test.yml` (matrix has `ubuntu-latest`, `cargo check --all-targets` Linux-only step) |
| D-03 | CI once per wave | Validation Architecture, "Per-wave gate" |
| D-04, D-05, D-06, D-07 | Router + verbatim handlers + new domain modules | "Dispatcher arm table", "Router and handler shapes", Pitfalls 1-5 |
| D-08, D-09 | Test co-location vs stay | "main.rs test-module topic map" |
| D-10, D-11 | Production-source reader, pre-split exclusion | "D-10 source-text inventory" |
| D-12, D-13, D-15 | Directory layout, size, re-exports | "Cluster maps", "Visibility map", Pitfalls 6-9 |
| D-14 | Wave order + live checks | "Validation Architecture" |
</phase_requirements>

## Summary

The phase is a pure move, but the cost is not in the Rust. It is in (a) roughly 25 source-text assertions that locate dispatcher arms by the literal text `RustInvokeChannel::X => {` and read the arm *body*, which will stop existing the moment D-04 turns arms into one-line router calls, and (b) three further families of text pins that bound a slice by a neighbouring marker (`indexOf('#[cfg(target_os = "macos")]', start)`, `// Native folder picker`, next arm opener) which silently change meaning when a function lands in a different file or at a file's end. CONTEXT.md sized the source-text work as "the `mod tests` slicing idiom" (3 sites). The real inventory is larger: see the D-10 inventory. Plan the arm-pin repoint as first-class work in Wave 1, not as a fix-up.

Phase 67 changed the dispatcher less than CONTEXT.md assumed but in a helpful way. `dispatch_rust_channel` is now `match ch { RustInvokeChannel::X => { ... } }`, exhaustive over the generated enum in `src-tauri/src/ipc_contract.rs` (`RustInvokeChannel`, `from_name`, `as_str`, and one `XArgs::from_args(args)` struct per channel). The arms still parse `args` themselves (`let a = KeyringGetArgs::from_args(args)?;`), so D-05's "body verbatim, `(args, app)` signature" is correct and the router stays an exhaustive match with no `_ =>` arm. There are 45 arms (quick 261108-kpc added `main_window_hide`), not 44.

Sizes at `b74d85dee`: `store_embed.rs` 4,546 (zero test lines; dispatcher is 1750-4545 = 2,796 lines, real store-embed code is 1-1749), `login_window.rs` 3,315 (zero test lines), `macos_epic_embed.rs` 2,089 (about 189 test lines, 5 inline test mods), `main.rs` 8,186 (production 1-1867, of which `fn main` alone is 1,175 lines; tests 1868-8186, 354 `#[test]`). Wave 1 moves 1,653 lines of Humble handlers plus 108 of invite-picker into the login-window area and about 120 lines of store-embed arms back into store_embed.

**Primary recommendation:** Land the production-source reader AND an arm-body reader (`readHandlerBody(wireName)` keyed on `fn rpc_<wire>(`) in Wave 0, prove Wave 0 by byte-identity of the new reader against the old `slice(0, indexOf('mod tests {'))` on the unmoved tree, name every handler `rpc_<wire_name>`, and put each wave's moved code in its final file in one move (Humble handlers go straight to `login_window/humble_*.rs` in Wave 1, not into the monolith first).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| rustInvoke channel routing (name -> handler) | Rust shell: `rust_dispatch.rs` | `ipc_contract.rs` (generated enum) | One exhaustive `match` is the table of contents (D-04); the generated enum makes a missing arm a compile error |
| Channel semantics (dialogs, keyring, clipboard, tray icon, wake lock, scan, app lifecycle) | Rust shell domain modules | Node sidecar (caller via `requestRustInvoke`) | The sidecar is the only caller; renderer gets no capability (see arm comments, D-02 of Phase 34.3) |
| Login window, cookies, reveal/clear-storage | Rust shell: `login_window/` | macOS AppKit/WKWebView (objc2), Windows WebView2 CDP | Window and cookie APIs only exist in the shell |
| In-app store embed (Tauri child webview) | Rust shell: `store_embed/` | `macos_epic_embed/` for the raw-WKWebView Epic surface | Phase 50 split: Epic alone has a second surface |
| Source-text guards over Rust text | jest/meta (`tauriShellSource.ts`) and Rust `SHELL_SOURCE` tests | CI `rust-test.yml` | CI has no Rust text lint; these tests are the only structural gate |
| Windows/Linux compile coverage | GitHub Actions `rust-test.yml` (3-OS matrix) | none locally | Only `aarch64-apple-darwin` is installed locally `[VERIFIED: rustup target list --installed]` |

## Standard Stack

No new libraries. This phase adds no dependency to `Cargo.toml` or `package.json`.

### Core (tools already present)
| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| rustc / cargo | 1.99.1 (stable, also pinned `1.99.1` for clippy) | build, test, clippy ratchet | `[VERIFIED: rustc -V, rustup toolchain list]` |
| jest | ^29.7.0 | shell source-text suites | `[VERIFIED: package.json]` |
| node / pnpm | 22.23.4 / 10.28.0 | jest, `meta/clippyRatchet.cjs`, `pnpm check:ipc-contract` | `[VERIFIED: node --version]` |
| python3 | 3.15.0 | move-proof script (stdlib only) | `[VERIFIED]` |
| gh | 2.103.3, authenticated | push and watch CI legs | `[VERIFIED: gh auth status]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| line-multiset move-proof | `syn`-based item hashing | Stronger (location/order aware) but adds a Rust dev tool and a dependency to vet. The recommended design adds a cheap arm-body-equality layer instead. |
| `rpc_<wire>` handler names | wire name verbatim | 14 of 45 wire names already exist as `fn` names (`store_embed_*`, `wake_lock_*`, `shell_*`), so a verbatim scheme collides `[VERIFIED: grep]` |

**Package Legitimacy Audit:** no external packages are installed or recommended by this phase. `slopcheck` not applicable. Packages removed: none. Packages flagged: none.

## Architecture Patterns

### System Architecture Diagram

```
sidecar stdout line {kind:"rustInvoke", channel, args, id}
        |
        v
sidecar.rs reader thread --(thread::spawn)--> dispatch_rust_channel(&channel, &args, &app)   [call site unchanged]
                                                    |
                                                    v
                                    rust_dispatch.rs  (NEW, thin flat router)
                          RustInvokeChannel::from_name(channel)  -- None --> Err("rustInvoke:unknown-channel:..")
                                                    |
                                       match ch { 45 one-line arms }   (exhaustive over generated enum)
      +--------+--------+--------+---------+---------+---------+---------+---------+
      v        v        v        v         v         v         v         v         v
 keyring_   dialogs   notification_ clipboard app_      tray    wake_lock scan_    login_window/*       store_embed/*
 dispatch   (new)     show (new)    .rs       lifecycle .rs     .rs       dispatch  humble_open          open/layout/controls
 .rs                                           (new)                       (new)    humble_cookies
                                                                                    humble_reveal
                                                                                    invite_picker
      \________ each handler: fn rpc_<wire>(args?, app?) -> Result<Value,String> (arm body verbatim) ________/
                                                    |
                                                    v
                                      Result<Value,String> --> sidecar.rs writes the response frame
```

### Recommended Project Structure (end state)

```
src-tauri/src/
├── main.rs                      # macro, mods, Builder/setup/generate_handler!, fn main, diag/panic hooks, D-09 tests
├── rust_dispatch.rs             # NEW  router only (~100 lines)
├── dialogs.rs                   # NEW  dialog_open/message/save + two_button_choice (~215)
├── app_lifecycle.rs             # NEW  app_exit/relaunch/hide, main_window_raise/hide (~130)
├── notification_show.rs         # NEW  notification_show (~45)   [NOT inside notification_backend.rs, see Pitfall 10]
├── scan_dispatch.rs             # NEW  six scan_* handlers (~40)
├── keyring_dispatch.rs          # + 4 keyring handlers; + keyring helpers/const moved from login_window (~410)
├── clipboard.rs, tray.rs, wake_lock.rs, shell_open.rs   # + their handler(s)
├── login_window.rs              # parent: label counter/events registry, mod decls, re-exports (~120)
├── login_window/{invite_picker,devtools,humble_helpers,humble_reveal,humble_open,humble_cookies,windows_cdp,pristine_epic,sheet,macos_cookies}.rs
├── store_embed.rs               # parent: mod decls, re-exports
├── store_embed/{state,policy,open,layout,controls}.rs
├── macos_epic_embed.rs          # parent: header, consts, challenge detection, re-exports
└── macos_epic_embed/{surface,nav_delegate}.rs
```

Naming rule for handlers: `rpc_<wire_name>` (e.g. `rpc_humble_login_open`). The mapping `RustInvokeChannel::HumbleLoginOpen` -> `fn rpc_humble_login_open` is mechanical, which is what lets the repointed jest helpers find a body by wire name. `grep -n "fn rpc_" src-tauri/src/*.rs` returns nothing today `[VERIFIED]`, so no collision.

### Pattern 1: Router (D-04)
```rust
// rust_dispatch.rs  -- one line per channel; DISPATCH_ARM_LINE_RE (/^ {8}RustInvokeChannel::\w+\s*=>/gm) still matches.
use super::*;

pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let Some(ch) = RustInvokeChannel::from_name(channel) else {
        return Err(format!("rustInvoke:unknown-channel:{channel}"));
    };
    match ch {
        RustInvokeChannel::KeyringGet => rpc_keyring_get(channel, args),
        RustInvokeChannel::KeyringSet => rpc_keyring_set(channel, args),
        RustInvokeChannel::DialogOpen => rpc_dialog_open(args, app),
        RustInvokeChannel::AppExit => rpc_app_exit(app),
        RustInvokeChannel::HumbleLoginTakeEvents => rpc_humble_login_take_events(args),
        // ... 45 arms, NO `_ =>`: the generated enum keeps the match exhaustive (67-11, D-13)
    }
}
```
`main.rs` gets `mod rust_dispatch; use rust_dispatch::*;` after the existing `use store_embed::*;` line so `sidecar.rs:585`'s `dispatch_rust_channel(&channel, &args, &worker_app)` is untouched. `[VERIFIED: sidecar.rs:585 call site; main.rs:126-142 glob pattern]`

### Pattern 2: Handler (D-05)
```rust
// keyring_dispatch.rs  (body = the arm's lines 1782-1817, dedented by 8 spaces, nothing else)
pub(crate) fn rpc_keyring_get(channel: &str, args: &[Value]) -> Result<Value, String> {
    let a = KeyringGetArgs::from_args(args)?;
    let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
    // ... verbatim ...
}
```
Parameters actually used per arm are in the arm table below. Only the four keyring arms use `channel`. Use the narrowest signature the compiler accepts without `unused_variables` (Pitfall 4).

### Pattern 3: Parent re-export (D-15, non-`mod.rs`)
```rust
// login_window.rs (parent) -- children declared here live in login_window/*.rs automatically
use super::*;
mod humble_open;
pub(crate) use humble_open::*;        // only for children that expose pub(crate) items used OUTSIDE the parent
#[cfg(target_os = "macos")]
mod sheet;
#[cfg(target_os = "macos")]
pub(crate) use sheet::*;
```
```rust
// login_window/humble_open.rs
use super::*;      // sees login_window.rs's private items AND (through its own `use super::*`) main.rs's imports/macros
```

### Pattern 4: Co-located tests (D-08)
```rust
#[cfg(test)]
mod tests {
    use super::*;
    // moved #[test] fns, verbatim
}
```
Existing precedent: `macos_epic_embed.rs` uses five named mods (`epic_embed_load_timed_out_tests` etc.), `shell_open.rs` uses `shell_open_tests`. Either `mod tests` or a topic name works for Rust; for the production-source reader (D-10) the cut rule must accept both (see Pitfall 11).

### Anti-Patterns to Avoid
- **Appending Humble handlers to `login_window.rs` in Wave 1 and moving them again in Wave 2.** Double move of 1,653 lines and an interim ~5,100-line file. Put each handler in its Wave-2 final file immediately (children of `login_window` can read the parent's private items, so no `pub(crate)` is needed yet).
- **Moving an arm into a pre-split sibling that is excluded from the combined source** (`notification_backend.rs`, `macos_*`, `epic_embed_*`). Every source-text pin and absence assertion over that code would go blind. See Pitfall 10.
- **`pub(crate) use sub::*;` for a sub whose items are all private or only used inside the parent.** Unused re-export warning, and the clippy ratchet is an equality ceiling (Pitfall 5).
- **Hand-editing `ipc_contract.rs`.** It is generated (`pnpm gen:ipc-contract`), and `pnpm check:ipc-contract` is a CI gate. Nothing in this phase should change it.

## State changes since CONTEXT.md (verified)

| Item | CONTEXT.md said | Now `[VERIFIED]` |
|------|-----------------|------------------|
| Phase 67 gate (D-01) | blocked | Complete. `grep -c "transport-mirror:" src-tauri/src/sidecar.rs` = 0; sidecar.rs header says transport constants come from the generated `ipc_contract.rs`. 67-VERIFICATION: 4/4 truths |
| What 67 generated on the Rust side | unknown | `src-tauri/src/ipc_contract.rs` (1,084 lines, `@generated by meta/genIpcContract.ts`, `#![allow(dead_code)]`): `READY_SENTINEL` etc., `enum RustInvokeChannel` (45 variants), `ALL`, `from_name`, `as_str`, `RENDERER_CHANNELS`, and 45 `pub(crate) struct <Variant>Args` with `from_args(args: &[Value]) -> Result<Self, String>` |
| How `dispatch_rust_channel` parses now | hand-written | `from_name(channel)` once, then `match ch` over enum variants, each arm calling its own `XArgs::from_args(args)?`. No parsing in the router, nothing to centralize |
| Arm count | 44 | 45 (`main_window_hide` added by quick 261108-kpc) |
| Linux CI leg (D-02) | to add | Landed by 72-01: `rust-test.yml` matrix `[windows-latest, macos-latest, ubuntu-latest]`, `cargo check --all-targets` (Linux only), `cargo test --bin gamelib-shell` (all legs), clippy ratchet on non-Linux |
| `shell_open_path` allow-list | future | Landed: `src-tauri/src/shell_open.rs` (185 lines, tests from line 99). The two shell arms are already one-line delegations (`shell_open::shell_open_path(app, args)`) |
| `cargo test --bin gamelib-shell` baseline | 420/2 (ab1), 442 (roadmap) | **441 passed, 0 failed, 2 ignored; 443 listed by `--list`** at `b74d85dee`. It read 438 earlier the same hour, before quick 261108-lav landed 3 tests. Re-take at the start of each wave |
| Clippy ratchet | n/a | New since CONTEXT: `meta/clippyRatchet.cjs` is a per-lint EQUALITY ceiling (darwin and win32 maps, toolchain `1.99.1`). Baseline PASS on darwin at `b74d85dee` (13 lints, 21 warnings) |
| jest baseline over the shell-source suites | "17 files, all green except WR-07" | 20 suites run, 18 pass, **2 pre-existing failures**: `tauriShellSource.test.ts` WR-07 (`.title(format!`) and `quitTeardownWiring.test.ts` C3 (`.spawn()` call-site count, from 72-12's Job Object work). Neither is caused by 71; record them as baseline, do not fix inside a move |

### Line counts (re-measured), production vs `#[cfg(test)]`

| File | Total | Production | Test | Notes |
|------|------:|-----------:|-----:|-------|
| `main.rs` | 8,186 | 1-1867 (1,867) | 1868-8186 (6,319) | `fn main` = lines 652-1826 (1,175 lines); 354 `#[test]` |
| `store_embed.rs` | 4,546 | 4,546 | 0 | dispatcher 1750-4545 (2,796); store-embed proper 1-1749 |
| `login_window.rs` | 3,315 | 3,315 | 0 | has `use objc2...` mid-file at 1304-1317 |
| `macos_epic_embed.rs` | 2,089 | about 1,900 | about 189 | test mods at 110-133, 176-243, 1245-1283, 1297-1324, 1326-1355 |
| Other shell files over ~1,000 non-test lines | | | | `single_instance.rs` 1,620 (no tests), `tray.rs` 1,099 (+58 after `tray_set_icon` lands), `ipc_contract.rs` 1,084 (generated, exempt). Outside the four named targets; see Open Question 1 |

## Cluster maps

Line numbers are at `b74d85dee` and include each item's leading doc/attr lines. Sizes are D-13 estimates after the move (non-test lines).

### store_embed.rs (4,546) -> router + handlers + `store_embed/`

Wave 1 removes lines 1750-4545 (2,796) and the 12-line `two_button_choice` (1730-1749). What stays (1-1729) splits as:

| Submodule | Source lines | Contents | Est. size |
|-----------|--------------|----------|-----------|
| `store_embed/state.rs` | 1-530 | label/UA/cap consts, `StoreEmbedHistoryChange`, `StoreEmbedState` + `impl` (80-475), `store_embed_nav_state_json`, `STORE_EMBED_STATE`, `store_embed_state()`, `store_embed_open_args` | about 530 |
| `store_embed/policy.rs` | 531-706 | `StoreEmbedNavigationDecision`, `store_embed_navigation_policy`, `store_embed_is_valve_host`, `HandoffThrottle`, link popup label + `store_embed_open_link_popup`, throttle statics, `store_embed_handoff_admitted` | about 180 |
| `store_embed/open.rs` | 707-1022 | `store_embed_open` (316 lines) + `rpc_store_embed_open` | about 325 |
| `store_embed/layout.rs` | 1023-1466 | `store_embed_set_bounds_args`, linux rect fns, `store_embed_set_bounds`, `store_embed_apply_rect`, `mod linux_store_embed_layout` (1240-1465, 226 lines) + `rpc_store_embed_set_bounds` | about 455 |
| `store_embed/controls.rs` | 1467-1729 | hide/show/close/take_nav_events/navigate_args/back/forward/reload/navigate + 8 store-embed handlers (about 90 lines) | about 355 |

The minimum set to satisfy D-13 is two files; five is recommended because every seam is already a cfg/section boundary and each file is under 600. The `#[cfg(target_os = "linux")] pub(crate) mod linux_store_embed_layout` (inline mod) moves whole into `layout.rs`; its path becomes `crate::store_embed::layout::linux_store_embed_layout` only through the re-export, so keep `pub(crate) use layout::*;` in the parent.

### login_window.rs (3,315) -> `login_window/` (+ keyring helpers out)

| Submodule | Source lines | Contents | Est. size |
|-----------|--------------|----------|-----------|
| `login_window.rs` (parent) | 1-47 | `LOGIN_WINDOW_LABEL_COUNTER`, `LOGIN_WINDOW_EVENTS`, `LOGIN_WINDOW_EVENTS_CAP`, `MAIN_WINDOW_LABEL`, hosts consts 1216-1228, mod decls | about 120 |
| `invite_picker.rs` | 39-126 | `BRIDGE_INVITE_WINDOW_LABEL`, `bridge_invite_picker_path`, `bridge_invite_nav_allowed`, `mod macos_invite_focus` + `rpc_bridge_invite_picker_open` (108-line body) | about 215 |
| `devtools.rs` | 128-584 | `should_auto_open_devtools`, `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` (432-line raw string) | about 457 |
| `humble_helpers.rs` | 585-722, 1088-1189 | `next_login_window_label`, `login_window_parse_url`, `login_window_title`, `cookie_domain_matches`, `website_data_record_matches_domain`, `verified_delete_count`, `login_event_value`, `push_login_window_event`, `login_chrome_css_script` | about 240 |
| `humble_reveal.rs` | 723-770, 906-1086 + handlers | reveal consts/args/script, clear-storage consts/args/script + `rpc_humble_reveal_post` (52), `rpc_humble_login_clear_storage` (50) | about 400 |
| `humble_open.rs` | handlers | `rpc_humble_login_open` (641-line body, D-06), `rpc_humble_login_close` (55), `rpc_humble_login_take_events` (10) | about 800 |
| `humble_cookies.rs` | handlers | `rpc_humble_login_cookies` (115), `rpc_humble_login_cookies_for_domain` (157), `rpc_humble_login_clear_cookies` (573, D-06) | about 880 |
| `windows_cdp.rs` | 747-903 | `CLEAR_COOKIES_TIMEOUT`, `CLEAR_COOKIES_SETTLE`, `webview2_cdp_call`, `webview2_cdp_delete_matching_cookies` (all `cfg(windows)` or `any(macos, windows)`) | about 150 |
| `pristine_epic.rs` | 1239-1901 | `EpicPristineNavDelegate*`, `present_native_js_*`, `open_pristine_epic_login_window` (macOS) | about 660 |
| `sheet.rs` | 1190-1214, 1230-1237, 1960-2870 | `request_login_sheet_cancel`, `NATIVE_LOGIN_BAR_HEIGHT`, ns-window resolvers, presented/pending sheet state, `present_login_window_as_sheet` (209), `dismiss_login_window_sheet` (117), `LoginSheetCancelTarget`, native login bar, `open_pristine_login_sheet` (macOS) | about 950 |
| `macos_cookies.rs` | 1873-1959, 2871-3214 | `EPIC_COOKIE_DOMAINS`, `epic_cookie_domain_matches`, `STORE_LOGOUT_COOKIE_DOMAINS`, `store_logout_cookie_domain_matches`, `clear_default_data_store_cookies_for_domain`, `default_data_store_cookies_for_domain` (macOS) | about 430 |
| **out to `keyring_dispatch.rs`** | 856-904, 3215-3315 | `KEYRING_READ_TIMEOUT`, `keyring_get_result`, `KeyringOutcome`, `keyring_outcome_message`, `keyring_get_outcome`, `bounded_keyring_read` | about 150 (plus 4 handlers about 185) |

Rationale for moving the keyring helpers: they are keyring code that ab1 left in `login_window.rs`; their tests are the `// ---- keyring_* ----` blocks. Moving them is a pure move and makes `keyring_dispatch.rs` the single keyring home. If the planner prefers not to widen scope, leave them in the parent (about 150 lines) and move later; nothing else depends on the choice.

Every `#[cfg(target_os = "macos")]` item stays macOS-gated; the child `mod` declarations carry the same cfg (Pitfall 8). `humble_open.rs` and `humble_cookies.rs` hold D-06 monolith handlers: `humble_cookies.rs` lands at about 880 and `humble_open.rs` at about 800, both under ~1,000.

### macos_epic_embed.rs (2,089) -> `macos_epic_embed/` (macOS-only module)

| Submodule | Source lines | Contents | Est. size |
|-----------|--------------|----------|-----------|
| `macos_epic_embed.rs` (parent) | 1-244 | module doc, imports, store-key/scheme/timeouts consts, `epic_embed_load_timed_out`, `epic_embed_response_is_challenged`, plus tests `epic_embed_load_timed_out_tests` (110-133) and `epic_embed_response_is_challenged_tests` (176-243) | about 240 incl. about 90 test |
| `macos_epic_embed/surface.rs` | 245-1355 | `SendPtr`, `EPIC_EMBED_SURFACE`, `surface()`, `is_selected`, insets, KVO observers, `nav_state_json`, `EpicEmbedSurface` impl, `spawn_load_timeout_monitor`, `open`, `set_bounds`, back/forward/reload/navigate, hide/show/close/deselect, `EpicEmbedSurfaceSelection`, `surface_for_store_key`, `take_nav_events`, and the 3 test mods at 1245-1355 | about 1,110 incl. about 107 test, so about 1,000 production |
| `macos_epic_embed/nav_delegate.rs` | 1356-2089 | `EpicEmbedNavDelegateIvars`, `define_class!` (482 lines), `epic_embed_handle_navigation_failure`, `epic_embed_record_launcher_scheme_block`, `epic_embed_route_download`, content-process-termination, JS-dialog gate, `epic_embed_begin_js_dialog_sheet`, `impl EpicEmbedNavDelegate` | about 735 |

This file is a standalone macOS module with explicit imports (no `use super::*`) and an inner `#![cfg(target_os = "macos")]`. Children need either their own explicit `use` lines (copy the relevant subset) or `use super::*;` to inherit the parent's private `use` items. Whichever is chosen, prune parent imports that become unused (clippy equality ceiling).

Windows and Linux never compile this module, so Wave 4's only compile gate beyond local macOS is the CI macOS leg.

### main.rs (8,186) after waves 1 and 5

Production 1-1867 stays: macro, mod decls, `INVOKE_TIMEOUT`/`LONG_RUNNING_CHANNELS`/abandoned-id ring/keyring consts (144-482, about 340 lines, not "wiring" but D-09 tests pin them in place), diag and panic hooks, `fn main` (1,175 lines). D-13 allows exceeding ~1,000 with a stated reason; the reason is `fn main` is one function and splitting `setup` changes control flow (record a todo, like D-06). Remaining tests after Wave 5: roughly 1,300-1,500 lines (see topic map).

## Dispatcher arm table (D-04 .. D-07)

Spans include each arm's leading comment block (they travel with the handler). `Params` is what the body references (from a word-match with comments stripped); the compiler is the authority. All handlers return `Result<Value, String>`.

| Arm (variant) | Handler | Lines | Body | Params | Destination |
|---|---|---|---:|---|---|
| KeyringGet | `rpc_keyring_get` | 1757-1818 | 36 | channel, args | `keyring_dispatch.rs` |
| KeyringSet | `rpc_keyring_set` | 1819-1846 | 26 | channel, args | `keyring_dispatch.rs` |
| KeyringDelete | `rpc_keyring_delete` | 1847-1881 | 33 | channel, args | `keyring_dispatch.rs` |
| KeyringAvailable | `rpc_keyring_available` | 1882-1940 | 39 | channel, args | `keyring_dispatch.rs` |
| DialogOpen | `rpc_dialog_open` | 1941-2028 | 55 | args, app | `dialogs.rs` (new) |
| DialogMessage | `rpc_dialog_message` | 2029-2104 | 48 | args, app | `dialogs.rs` |
| NotificationShow | `rpc_notification_show` | 2105-2145 | 29 | args, app | `notification_show.rs` (new) |
| ShellShowItemInFolder | (existing `shell_open::shell_show_item_in_folder`) | 2146-2159 | 1 | args, app | `shell_open.rs`; router calls it directly |
| ShellOpenPath | (existing `shell_open::shell_open_path`) | 2160-2165 | 1 | args, app | `shell_open.rs`; router calls it directly |
| ClipboardWriteText | `rpc_clipboard_write_text` | 2166-2178 | 5 | args, app | `clipboard.rs` |
| ClipboardReadText | `rpc_clipboard_read_text` | 2179-2191 | 1 | app | `clipboard.rs` |
| AppExit | `rpc_app_exit` | 2192-2202 | 5 | app | `app_lifecycle.rs` (new) |
| AppRelaunch | `rpc_app_relaunch` | 2203-2234 | 4 | app | `app_lifecycle.rs` |
| AppHide | `rpc_app_hide` | 2235-2269 | 13 | app (macOS only) | `app_lifecycle.rs`; `app` unused off macOS, see Pitfall 4 |
| MainWindowRaise | `rpc_main_window_raise` | 2270-2285 | 10 | app | `app_lifecycle.rs` |
| MainWindowHide | `rpc_main_window_hide` | 2286-2306 | 12 | app | `app_lifecycle.rs` |
| BridgeInvitePickerOpen | `rpc_bridge_invite_picker_open` | 2307-2421 | 108 | args, app | `login_window/invite_picker.rs` |
| TraySetIcon | `rpc_tray_set_icon` | 2422-2479 | 50 | args, app | `tray.rs` |
| DialogSave | `rpc_dialog_save` | 2480-2505 | 20 | args, app | `dialogs.rs` |
| HumbleLoginOpen | `rpc_humble_login_open` | 2506-3233 | 641 | args, app | `login_window/humble_open.rs` (D-06 whole) |
| HumbleLoginCookies | `rpc_humble_login_cookies` | 3234-3381 | 115 | args, app | `login_window/humble_cookies.rs` |
| HumbleLoginTakeEvents | `rpc_humble_login_take_events` | 3382-3396 | 10 | args | `login_window/humble_open.rs` |
| HumbleLoginClose | `rpc_humble_login_close` | 3397-3457 | 55 | args, app | `login_window/humble_open.rs` |
| HumbleLoginClearCookies | `rpc_humble_login_clear_cookies` | 3458-4059 | 573 | args, app | `login_window/humble_cookies.rs` (D-06 whole) |
| HumbleRevealPost | `rpc_humble_reveal_post` | 4060-4126 | 52 | args, app | `login_window/humble_reveal.rs` |
| HumbleLoginClearStorage | `rpc_humble_login_clear_storage` | 4127-4191 | 50 | args, app | `login_window/humble_reveal.rs` |
| HumbleLoginCookiesForDomain | `rpc_humble_login_cookies_for_domain` | 4192-4370 | 157 | args, app | `login_window/humble_cookies.rs` |
| WakeLockStart | `rpc_wake_lock_start` | 4371-4385 | 3 | args | `wake_lock.rs` |
| WakeLockStop | `rpc_wake_lock_stop` | 4386-4394 | 4 | args | `wake_lock.rs` |
| ScanSteamApiImports | `rpc_scan_steam_api_imports` | 4395-4402 | 2 | args | `scan_dispatch.rs` (new) |
| ScanSteamDrm | `rpc_scan_steam_drm` | 4403-4406 | 2 | args | `scan_dispatch.rs` |
| ScanSteamstubSection | `rpc_scan_steamstub_section` | 4407-4410 | 2 | args | `scan_dispatch.rs` |
| ScanPeImportedDlls | `rpc_scan_pe_imported_dlls` | 4411-4414 | 2 | args | `scan_dispatch.rs` |
| ScanContainedReal | `rpc_scan_contained_real` | 4415-4418 | 2 | args | `scan_dispatch.rs` |
| ScanWinemacMetalExports | `rpc_scan_winemac_metal_exports` | 4419-4422 | 2 | args | `scan_dispatch.rs` |
| StoreEmbedOpen | `rpc_store_embed_open` | 4423-4437 | 8 | args, app | `store_embed/open.rs` |
| StoreEmbedSetBounds | `rpc_store_embed_set_bounds` | 4438-4447 | 8 | args, app | `store_embed/layout.rs` |
| StoreEmbedHide / Show / Close / TakeNavEvents / Back / Forward / Reload / Navigate | `rpc_store_embed_<x>` | 4448-4543 | 8-9 each | args, app | `store_embed/controls.rs` |

Notes:
- `dialog_message`'s `error`/`warning` sub-arms are branches inside the one DialogMessage body, not separate arms `[VERIFIED: 45 openers in store_embed.rs]`.
- Arms are not in the enum's order and the router need not be either. Keep the current arm order in the router to keep `git diff`/review trivial; the generated `ALL` order is irrelevant to the match.
- `scan_*`: there is no scanner module in the shell (the calls go to the `gamelib-scan` crate), so `scan_dispatch.rs` is a new 40-line module. Keeping the six one-liners inside `rust_dispatch.rs` would also satisfy D-07's "next to the scanner calls"; a module is cleaner because `scanChannelParity.test.ts` reads these by text (Pitfall 1).
- Inside any arm, `return` and `?` keep their meaning in the handler because the `match` is the tail expression of `dispatch_rust_channel` `[VERIFIED: lines 1756-4545]`. Statement-position `#[cfg(...)]` blocks inside bodies (AppHide, StoreEmbed*) are valid in a fn body for the same reason they are valid in an arm block `[ASSUMED: language rule, proven by the first compile]`.

## Visibility map (`pub(crate)` changes)

Method (ab1): word-match every top-level item name across every shell `.rs`, comments excluded, so `cfg(windows)` and `cfg(target_os = "linux")` references are seen even though the Mac compiler cannot see them. Tool: the prototype in "Move-proof and audit scripts" below.

Rules that make most of this free `[ASSUMED: Rust privacy rules; confirmed by ab1's use of `use super::*`]`:
- A **child** module sees its parent's private items and imports. So a handler moved into a child can use anything still private in the parent without `pub(crate)`.
- **Siblings** cannot see each other's private items. Only items defined in one child and used by another child need `pub(crate)`.
- Arms moved out of `store_embed.rs` could only reference `pub(crate)` items of other files or private items of `store_embed.rs`. Items of other files are already `pub(crate)` (ab1 did this), so arm moves need no new visibility except for store-embed-private fns (below).

Audit run against the proposed clusters (private items referenced from another cluster):

| Source | Private item | Referenced from | Action |
|--------|--------------|-----------------|--------|
| login_window | `LOGIN_WINDOW_LABEL_COUNTER`, `LOGIN_WINDOW_EVENTS_CAP` | humble_helpers, sheet | none if they stay in the parent (children see them) |
| login_window | `NATIVE_LOGIN_BAR_HEIGHT` (1237) | `sheet` (same file after the move) | none if in `sheet.rs` |
| login_window | `open_pristine_epic_login_window` (1568, pristine) | `sheet` (2822) | `pub(crate)` |
| login_window | `set_native_login_bar_origin_on_main` (2633, sheet) | `pristine` (1408) | `pub(crate)` |
| login_window | `login_window_ns_window_retained` (2035) | sheet (4 uses) | none if kept in `sheet.rs` |
| store_embed | `STORE_EMBED_USER_AGENT` (34, state) | policy 675, open 800 | `pub(crate)` |
| store_embed | `store_embed_state()` (502, state) | open x4, controls x7 | `pub(crate)` |
| store_embed | `store_embed_open_link_popup` (664), `STORE_EMBED_STEAM_THROTTLE` (685), `STORE_EMBED_TOP_LEVEL_HOST` (695) (policy) | open | `pub(crate)` |
| store_embed | `store_embed_apply_rect` (1219, layout) | open 777 | `pub(crate)` |
| store_embed | `store_embed_hide/show/close/take_nav_events/back/forward/reload` (private, controls) | the 8 handlers | none if handlers live in `controls.rs` |
| macos_epic_embed | `EPIC_GAMES_LAUNCHER_SCHEME`, `epic_embed_response_is_challenged` (parent) | nav_delegate | none (child sees parent) |
| macos_epic_embed | `epic_embed_load_timed_out` (parent) | surface | none |
| macos_epic_embed | `surface()`, `apply_visibility`, `nav_state_json`, `epic_embed_kvo_context` (surface) | nav_delegate (19, 3, 7, 1 uses) | `pub(crate)` |

The word-match also reports names that are only coincidentally equal across files (`surface`, `SendPtr` exist in unrelated modules). Treat each hit as a candidate, then confirm with the compiler. Windows/Linux-only references are caught by the word-match but only confirmed by CI, so push the wave and read the Windows and Linux legs before trusting the audit.

Items that stay private are not touched. Struct fields and methods need compiler-driven fixes (ab1 did the same).

## D-10 source-text inventory

### A. The helper and its guards

- `src/backend/testUtils/tauriShellSource.ts` exports `PRE_SPLIT_SIBLING_MODULES` (8 files, exact-name list), `GENERATED_MODULES` (`['ipc_contract.rs']`), `listTauriShellSourceFiles()` (walk, filter by exact name, sort, `main.rs` LAST), `readTauriShellFile`, `readTauriShellSource`.
- Sorting is lexicographic on posix paths; `login_window.rs` sorts before `login_window/...` because `.` (0x2E) < `/` (0x2F) `[ASSUMED: JS default sort is UTF-16 code-unit order; trivially checked in Wave 0]`. Parent-before-children keeps a parent's header ahead of its children in the combined text.
- D-11 change: the exclusion filter must become prefix-aware: exclude `p === sibling` OR `p.startsWith(sibling.replace(/\.rs$/, '/'))`. Applies only to `macos_epic_embed` today (the only pre-split sibling that becomes a directory).
- `tauriShellSource.test.ts:4570-4642` guard describe "tauriShellSource helper scope" asserts: `main.rs` last; no pre-split sibling listed; every sibling exclusion exists on disk (a directory exclusion must be allowed to pass this); every `mod x;` in `main.rs` resolves to a listed file or sibling (new top-level mods `rust_dispatch`, `dialogs`, `app_lifecycle`, `notification_show`, `scan_dispatch` resolve automatically as `<name>.rs`); no TS/meta file names `main.rs` directly except an allowlist. The "no direct `main.rs` reader" scan is the pattern to copy for the D-10 guard (below).

### B. Files that slice on `mod tests {` (D-10 migration targets) `[VERIFIED: grep]`

| Site | Idiom | Needle subjects (current assertions) |
|------|-------|--------------------------------------|
| `src/backend/__tests__/loginChromeCssInjection.test.ts:41-45` `productionCode()` (used at 90, 98, 157, 177, 195; synthetic fixtures at 166-193 embed the literal `'mod tests {'` as input, which is fine) | `code.indexOf('mod tests {')`, `slice(0, idx)` | `fn login_chrome_css_script(` defined exactly 1; `(?<!fn )login_chrome_css_script(` called exactly 1, inside `humble_login_open`'s first `if visible {` block; brace depth 1; no `#[cfg(` on the line above |
| `src/backend/__tests__/tauriShellSource.test.ts:2247-2251` (local `productionCode`, used 2261, 2280) | same | `install_native_login_bar(` called exactly once inside the humble_login_open arm, before `present_login_window_as_sheet(`; arm has no `.on_navigation(`; `is_login_cancel_request`, `LOGIN_CANCEL_EXFIL_PATH` absent |
| `src/backend/__tests__/tauriShellSource.test.ts:2366-2370` (second local `productionCode`, used 2380, 2406) | same | `.makeKeyAndOrderFront(None)` appears 0 times; `register_presented_login_sheet(` call sites == 3 |

These are the only three real slicers. Their results must be byte-identical before and after (Wave 0 proof, below).

### C. Readers that need the FULL source (tests included), not production-only

Do NOT migrate these to the production reader; they assert on Rust test code:
- `longRunningChannels.test.ts:155-285` `locateCfgTestRegionRaw` takes `source.indexOf('#[cfg(test)]')` (first occurrence in the combined text, which is a COMMENT at `login_window.rs:10` today) and `slice(idx)`; correctness depends on `main.rs` being last so the region includes main's `timeout_for` loop test. Safe as long as `main.rs` stays last and those tests stay in `main.rs` (they test `timeout_for`, defined in `main.rs`, so D-08 keeps them there).
- `tauriShellSource.test.ts:957-979` `EXPECTED_CLIPBOARD_TEST_FN_NAMES` (10 Rust `#[test]` names, asserted via `fn <name>` in the combined source). After Wave 5 these live in `clipboard.rs`'s test mod, still inside the full combined source. Renaming a test breaks it; moving does not.
- Any test whose needle is a Rust test function or `#[cfg(test)]` attribute.

### D. Readers of arm bodies by the text `RustInvokeChannel::X => {` (BREAK IN WAVE 1)

| File | Refs | What it extracts |
|------|-----:|------------------|
| `src/backend/__tests__/tauriShellSource.test.ts` | 46 | `DISPATCH_ARM_LINE_RE`/`DISPATCH_ARM_NAME_RE` arm-name scrape (works on router lines at 8-space indent, no change), plus bodies of TraySetIcon (217, 320-326), ClipboardWriteText/ReadText (930, 936), AppRelaunch (988), HumbleLoginCookies/ForDomain/TakeEvents (1041-1065), `extractArmBody` (1027), `extractCensusArmBody` (1101), and five duplicated `extractHumbleLoginOpenArmBody` (1571, 1643, 1985, 2212, 2447) |
| `src/backend/__tests__/loginChromeCssInjection.test.ts` | 7 | HumbleLoginOpen body, end bounded by `RustInvokeChannel::HumbleLoginCookies => {` (78-81) |
| `src/backend/__tests__/keyringDiagPersistence.test.ts` | 12 | region from `RustInvokeChannel::KeyringGet => {` to `RustInvokeChannel::DialogOpen => {` (48-49) containing all four keyring arms (101-104); KeyringAvailable body (112, 127) |
| `src/backend/__tests__/dialogOptionForwarding.test.ts` | 3 | `RustInvokeChannel::${variant} => {` for the dialog variants (47) |
| `src/backend/__tests__/sidecarShutdownFlagSource.test.ts` | 4 | AppExit / AppRelaunch / AppHide bodies in `store_embed.rs` (47-63): this one reads a specific FILE, `readTauriShellFile('store_embed.rs')` |
| `src/backend/scanners/__tests__/scanChannelParity.test.ts` | 1 | reads `src-tauri/src/store_embed.rs` DIRECTLY (line 21) and scrapes `RustInvokeChannel::Scan.. => {` + body "validates via generated Args then `gamelib_scan::dispatch`" |
| Rust `main.rs` tests | | `the_keyring_available_arm_only_ever_READS_the_probe_account` (find arm by `concat!("RustInvokeChannel::KeyringAvailable", " => {")`, end bound by the next arm's leading comment `// Native folder picker`); `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (arm tracking via `dispatch_arm_opener_name`, breaks on `fn ` boundary); `epic_cold_jar_login_timeout_*` x2 (SHELL_SOURCE slices) |

Repoint plan (Wave 0 builds the tool, Wave 1 applies it): add to `tauriShellSource.ts`:
- `readHandlerBody(source, wireName)` -> brace-matched body of `fn rpc_<wireName>(`, for use in place of every `extract*ArmBody`. Keep the router-line scrape (`DISPATCH_ARM_LINE_RE`) as is.
- Update `dispatch_arm_opener_name` users in Rust to a `fn rpc_` tracker (the cookie-call-site pin tracks "current arm"; with handlers it tracks "current fn whose name starts `rpc_humble_login_`").
- Direct file reads (`scanChannelParity`, `sidecarShutdownFlagSource`) change file names or switch to `readTauriShellSource()` plus `readHandlerBody`.

### E. Order-sensitive bounds (change meaning when code lands in a different file or file tail)

Found by grep, none exhaustive; every wave must re-scan for them:
- `code.indexOf('#[cfg(target_os = "macos")]', start)` as a body end bound after `fn open_pristine_epic_login_window(`, `fn dismiss_login_window_sheet(` and others (`tauriShellSource.test.ts` ~2400-2470, 3935, 3966). If the fn becomes the last item of its file the bound is found in the NEXT file in concatenation order, so the slice silently grows; if it is the last item of the combined source the bound is `-1`.
- `code.lastIndexOf('WindowsSingleInstanceRole::Secondary')` (3564), `code.indexOf('mod macos_terminate_veto {')` (823).
- Marker-comment bounds: `// Native folder picker` (Rust keyring_available test), `// Two-button...` style comments that belong to the NEXT arm.
- Windowed slices `start..start+N` chars (e.g. `store_embed_handoff_policy.rs` `body_after(.., 4000)`, `(start+2500)`, `(start+1000)`): safe only if the function moves whole and nothing it depends on is cut off.

### F. Direct readers outside the combined-source helper (also break on a split)

| Reader | Reads | Wave | Fix |
|--------|-------|------|-----|
| `src/backend/__tests__/macosEpicEmbedSource.test.ts:32` | `macos_epic_embed.rs` (join of path, `fnBody` + `count`) | 4 | `readMacosEpicEmbedSource()` helper: concat parent + `macos_epic_embed/**` |
| `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts:38` | `macos_epic_embed.rs` | 4 | same helper |
| `src-tauri/src/epic_embed_js_dialog.rs:192` | `include_str!("macos_epic_embed.rs")`: `!source.contains("present_native_js_")` (absence), `.runModal(` absence, `epic_embed_js_dialog_admit(webview, frame, "{alert,confirm,prompt}")` presence, `beginSheetModalForWindow_completionHandler` | 4 | `concat!(include_str!("macos_epic_embed.rs"), "\n", include_str!("macos_epic_embed/surface.rs"), "\n", include_str!("macos_epic_embed/nav_delegate.rs"))`. Absence checks are only valid over ALL pieces |
| `src-tauri/src/store_embed_handoff_policy.rs:224` | `include_str!("macos_epic_embed.rs")`: `fn decide_policy_for_navigation_response(` + 1000-char window, `fn epic_embed_route_download(` + 2500-char window, `webViewWebContentProcessDidTerminate:` | 4 | concat as above, or point at `nav_delegate.rs` (all needles are in the delegate) |
| `store_embed_handoff_policy.rs:338, 367` | `include_str!("store_embed.rs")`: `.on_new_window({` +4000, `.on_download({` +2500 | 3 | repoint to `store_embed/open.rs` (both hooks are inside `store_embed_open`) |
| `store_embed_handoff_policy.rs:340` | `include_str!("macos_epic_embed.rs")`: `fn create_web_view_for_navigation_action(` +4000 | 4 | repoint to `macos_epic_embed/nav_delegate.rs` |
| `main.rs` tests ~7892-8050 | `include_str!("store_embed.rs")` x3 (Linux apply-bounds queues a resize, show-before-navigate, Epic arm hides Tauri embed) | 3 | repoint to `store_embed/layout.rs`, `open.rs` |
| `main.rs` test ~2501 | `include_str!("relay_commands.rs")` (open_external body) | 5 | leave in `main.rs` (single-file but self-match risk if co-located) |
| `src/backend/sidecar/__tests__/openPolicy.test.ts:153` | `readTauriShellFile('store_embed.rs')` | 3 | switch to a store_embed combined read or `store_embed/<file>.rs` |
| `src/backend/__tests__/dummyStoreHarnessContainment.test.ts:33` | walks `src-tauri/src` for a port string | any | no change (directory walk) |
| `meta/captureShellScrollback.ts` | `readTauriShellSource(REPO_ROOT)` (+ `assertRepoRoot` existence check on `main.rs`) | 0/1 | no change unless the production reader is wanted |
| `rendererAllowList.test.ts:78`, `dialogOptionForwarding.test.ts:100`, `steamFocusRefreshWire.test.ts:71` | `ipc_contract.rs` | none | generated; untouched |

### G. Rust-side `SHELL_SOURCE` / `SHELL_SOURCE_FILES` (main.rs tests, lines 1986-2070)

- `SHELL_SOURCE_FILES` (17 names) and `SHELL_SOURCE` (`concat!(include_str!(...))` of the same 17) put `main.rs` FIRST. The guard `shell_source_files_names_every_shell_module_file` walks `src/`, subtracts an exact-name `PRE_EXISTING_SIBLINGS` (8 files), and fails for any other `.rs` not in `SHELL_SOURCE_FILES`. Every new file (about 30 across waves) must be added to BOTH lists in the same commit as the file, and the exclusion must become directory-aware for `macos_epic_embed/` (`!f.starts_with("macos_epic_embed/")`).
- `SHELL_SOURCE` is a compile-time `const &str`, so it cannot be post-processed. D-10 for Rust means building a runtime string: `fn shell_production_source() -> String` that maps `[include_str!(..)]` through a cut at the first column-0 line `#[cfg(test)]` immediately followed by a column-0 line `mod tests {` or `mod <name> {`. A literal containing that two-line sequence is indented or escaped, so a column-0 match is not fooled by this very helper.
- Users: `the_keyring_available_arm_only_ever_READS_the_probe_account` (needs the router-or-handler-aware repoint), `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`, `epic_cold_jar_login_timeout_default_store...`, `epic_cold_jar_login_timeout_window_branch...`. All four today find their needles in production text because `main.rs` is first and tests use `concat!("...", " => {")` to avoid matching themselves. Co-located test mods multiply the places a literal needle can self-match, which is why the production-only reader matters for Rust too.

### H. Needle-count proof (answers D-10's "record counts, confirm afterwards")

1. **Wave 0 (strongest, cheapest):** on the unmoved tree, add a one-off test or script asserting `readTauriShellProductionSource() === old(slice before first 'mod tests {')`, allowing exactly one difference: the new reader drops the trailing `#[cfg(test)]` line that precedes `mod tests {` and the doc-comment block attached to it. If the texts are equal modulo that, every needle count in the three slicers is equal by construction. Record the exact diff (expected: the attribute line and attached doc lines, about 40 lines at `main.rs:1819-1867`).
2. Pin the explicit counts that matter as constants the migration must reproduce: `login_chrome_css_script(` defs 1 / calls 1; `install_native_login_bar(` calls 1; `.makeKeyAndOrderFront(None)` 0; `register_presented_login_sheet(` calls 3; `request_login_sheet_cancel(` calls 2 (file-wide, full source).
3. **Waves 1-5:** the move-proof line-multiset diff over the combined production text proves needle counts cannot change except where an arm-shape needle is rewritten by design (section D). For those, list before/after: old count of `RustInvokeChannel::X => {` is 1 per arm in `store_embed.rs`, after Wave 1 it is 0 and `RustInvokeChannel::X => rpc_x(` is 1 in `rust_dispatch.rs`.

## Move-proof and audit scripts (design)

### Layer 1: normalized line multiset (extends ab1)

Prototype (stdlib python, saved as `.planning/phases/71-rust-shell-module-decomposition/research-tools/moveproof.py`; run at `b74d85dee`; base=HEAD vs working tree returns `removed-not-allowed: 0  added-not-allowed: 0`, base=HEAD~12 returns hundreds, so it is sensitive):

```python
# moveproof.py <base-ref>   -- run from anywhere inside the repo
VIS   = re.compile(r'\bpub\((?:crate|super)\)\s+')       # visibility changes are free (D-15)
NOISE = re.compile(r'^[{}()\[\];,]*$')                    # brace-only lines absorb the arm->fn wrapper and indentation
def norm(files):                                          # {path: text} for base (git show) and for the working tree
    c = Counter()
    for t in files.values():
        for l in t.split('\n'):
            s = VIS.sub('', l.strip())                    # strip() absorbs the D-05 indentation shift
            if s and not NOISE.match(s): c[s] += 1
    return c
removed, added = +(base - now), +(now - base)             # multiset difference, counts preserved
ALLOW = [ r'^RustInvokeChannel::\w+ => \{$',                                   # old arm openers   (removed)
          r'^RustInvokeChannel::\w+ => (rpc_\w+|\w+::\w+)\(.*\),$',            # router lines      (added)
          r'^(pub\(crate\) )?fn rpc_\w+\(.*\) -> Result<Value, String> \{$',   # handler signatures(added)
          r'^(#\[cfg.*\]\s*)?(pub )?mod \w+;$', r'^pub use \w+::\*;$',
          r'^use super::\*;$', r'^use \w+::\*;$',
          r'^#\[cfg\(test\)\]$', r'^mod tests \{$' ]
# exit 1 if any removed/added line is not matched by ALLOW. ipc_contract.rs excluded (generated; pnpm check:ipc-contract covers it).
```

Properties: ignores location and order (that is the point of a move), but counts duplicates, so a dropped or duplicated line shows. It cannot see a line moved into the wrong function, nor reorder inside one. Layer 2 covers that for handlers.

Wave-specific ALLOW additions: Wave 1 router-direct lines for the two `shell_open::...` arms (`RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),`); Wave 1 `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]` on a handler if used (Pitfall 4); Waves 2-4 only mod/use lines; Wave 5 `mod tests {`/`use super::*;` per file plus any `use` lines the test preamble needed.

Comments are included in the multiset on purpose: doc comments travel with their item, and a lost comment is a lost line. `// ---- topic ----` banners that stay or move are all in the multiset, so Wave 5 must move banners with their blocks.

### Layer 2: arm body == handler body (new, untested sketch)

```python
# For each arm at BASE (store_embed.rs): body = lines between `RustInvokeChannel::X => {` and its closing `        }`, dedented by 8.
# For each handler at NOW: body = brace-matched interior of `fn rpc_<wire>(`, dedented by 4.
# assert normalize(arm_body) == normalize(handler_body)  where normalize = strip each line, drop blank lines, keep comments.
```
A string-literal-aware brace matcher is not needed if bodies are located by the base arm's known last line (the `        }` at column 8, which is unambiguous because arms are the only items at that indent) and, now, by `fn rpc_` to the next column-0 `}`.

Layer 3 (per-item, Waves 2-4): for each top-level `fn/const/static/struct/enum/impl/mod` key `(kind, name)`, compare whitespace-and-visibility-normalized text hashes base vs now. Same key set, same hashes. Cheap with the same line scanner (top-level items start at column 0, end at the next column-0 `}`), skip `mod tests`.

### Visibility audit script

The prototype `research-tools/vis.py <file> "<cluster>:<start>-<end>,..."` (run from `src-tauri/src`; output used in the Visibility map) lists every top-level item with a reference from a different cluster, flagging `(private)` ones. Cluster ranges come from the cluster maps above. Re-run it on the real file at the start of each wave because line numbers move.

## main.rs test-module topic map (D-08 / D-09)

Line ranges at `b74d85dee`. 354 `#[test]`; 3 `#[ignore]`d are live-gate or harness tests. "Stay" = D-09 (source-text over multiple modules, or pinned by jest through a fixture). Where one block mixes subjects, route per test by the defining file of the primary subject fn; the research found these specific mixes: block 2541-2687 (tray recent-games ids -> `tray.rs`, `send_writer_*` -> `relay_commands.rs`, `tray_quit_*` -> `terminate_veto.rs`/`tray.rs`), block 2990-3169 (`close_hides_*`/tray settings -> `tray.rs`; `exempt_channel_*`, `non_exempt_*`, `invoke_timeout_is_60_seconds`, `*_is_exempt` -> `timeout_for` in `main.rs`, so stay), block 6562-6738 (`find_on_path_var`, `shell_exe_env_value`, `app_root_env_value` -> `sidecar.rs`; `handle_protocol_url_channel_is_bounded_at_invoke_timeout` -> stays; `resolve_dev_app_root` -> `single_instance.rs`).

| Lines | Block | Tests | Home | Class |
|-------|-------|------:|------|-------|
| 1868-2071 | preamble: `on_sidecar_eof_*` (3), `kill_process_group_*` (3) + `spawn_orphaned_group` helper; `dispatch_arm_opener_name`; `SHELL_SOURCE_FILES`/`SHELL_SOURCE`; guard | 7 | sidecar tests -> `sidecar.rs`; the rest stays | D-08 / D-09 |
| 2072-2147 | bridge invite picker window | 3 | `login_window/invite_picker.rs` | D-08 |
| 2148-2258 | tri-state tray glyph (+ `TRAY_SET_ICON_WIRE_FIXTURE`, `include_str!("../../meta/fixtures/...")` path depth!) | 7 | `tray.rs` | D-08 |
| 2259-2414 | Phase 40 store-embed WIRE CONTRACT (+ `STORE_EMBED_WIRE_FIXTURE`, `wire_args`, `open_obj_with`) | 7 | stays | D-09 (named in CONTEXT; shared with jest `storeEmbedWireContract.test.ts`) |
| 2415-2540 | open_external scheme allow-list | 11 | `relay_commands.rs`, but `open_external_command_body_calls_the_scheme_check_before_opening` stays (include_str of its own file) | D-08 (10) / stay (1) |
| 2541-2687 | tray recent-games id parsing, send writer, tray quit | 7 | mixed, see above | D-08 |
| 2688-2836 | Cmd+Q / red X routing | 8 | `tray.rs` / `terminate_veto.rs` | D-08 |
| 2837-2989 | persisted runner vs legacy probe | 8 | `tray.rs` | D-08 |
| 2990-3169 | exitToTray at close time; `timeout_for` exemptions | 14 | tray.rs (close/tray settings) + stay (`timeout_for`) | mixed |
| 3170-3364 | abandoned-invoke attribution; invoke_abandoned_message | 13 | stays | D-09 (named) |
| 3365-3453 | clipboard args, `clipboard_read_value` | 10 | `clipboard.rs` | D-08 (jest pins the 10 names) |
| 3454-3631 | next_login_window_label, humble_login_open args, login_window_title | 11 | `login_window/humble_helpers.rs` (+ `humble_open.rs`) | D-08 |
| 3632-4071 | cookie_domain_matches, cookies_for_domain direction, epic/store-logout cookie domains, website_data_record_matches_domain, login_event_value | 30 | `humble_helpers.rs` / `humble_cookies.rs` / `macos_cookies.rs` | D-08 |
| 4072-4406 | reveal_post / clear_storage args and scripts | 23 | `humble_reveal.rs` | D-08 |
| 4407-4504 | login_chrome_css_script (+ `native_login_bar_band_pins...`) | 9 | `humble_helpers.rs` (+ `sheet.rs` for the bar test) | D-08 |
| 4505-4588 | shell_exe_env_value, app_root_env_value | 7 | `sidecar.rs` | D-08 |
| 4589-4904 | keyring_account, slot arg, get_result, outcome message, bounded_keyring_read | 26 | `keyring_dispatch.rs` (helpers moved there) | D-08 |
| 4905-4947 | KEYRING_READ_TIMEOUT vs RUST_INVOKE_TIMEOUT_MS ordering | 1 | stays | D-09 (named) |
| 4948-5154 | keyring_available arm source test (SHELL_SOURCE), LIVE gate (ignored), F-9 timing harness (ignored) | 3+1+1 | arm source test stays; the two `#[ignore]` tests co-locate in `keyring_dispatch.rs` | mixed |
| 5155-5195 | pending_login_entry_is_stale | 4 | `login_window/sheet.rs` | D-08 |
| 5196-5808 | F-34.4.2-12, epic cold-jar x2 regression pins (SHELL_SOURCE) | 3 | stay | D-09 |
| 5809-6065 | deep-link argv, OS deep-link decision | 19 | `single_instance.rs` | D-08 |
| 6066-6553 | Windows single-instance, HKCU self-heal, dev builds | 33 | `single_instance.rs` (many `cfg(windows)`; Windows CI leg compiles them) | D-08 |
| 6554-6738 | panic reporting; node resolution for the dev sidecar | 14 | `sidecar.rs` / stays / `single_instance.rs`, see above | mixed |
| 6739-6907 | wake lock | 12 | `wake_lock.rs` | D-08 |
| 6908-7288 | store_embed_navigation_policy, StoreEmbedState, drain queue | 19 | `store_embed/policy.rs`, `state.rs` | D-08 |
| 7289-7811 | `StoreEmbedState::observe_live_url` | 27 | `store_embed/state.rs` | D-08 |
| 7812-8000 | Linux GTK-box-native layout (pure helpers) | 11 | `store_embed/layout.rs` (cfg linux items; Linux CI leg) | D-08 |
| 8001-8109 | macOS show-before-navigate convergence (source text over `store_embed.rs`) | 1+ | stays | D-09 |
| 8110-8186 | Phase 50 review finding 1 (Epic arm hides Tauri embed), `scan_channels_are_gamelib_scan_app_ops` | 4 | stays | D-09 |

Helpers and fixtures defined in the test module that must move WITH their consumers or be duplicated: `spawn_orphaned_group` (1910), `valid_reveal_args`/`reveal_post_args_err` (4078/4092), `valid_clear_storage_args`/`clear_storage_args_err` (4260/4270), `WINDOWS_TEST_VALID_SID`/`WINDOWS_TEST_OTHER_VALID_SID` (6072/6073), `send_frame` (2558), `TRAY_SET_ICON_WIRE_FIXTURE` (2193). Everything else shared is `use super::*` + `use serde_json::json;`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proving a move is mechanical | eyeballing or `git diff -M` | Layers 1-3 above, in a committed script | ab1 proved the pattern; line-multiset catches dropped lines that review misses |
| Finding which private items need `pub(crate)` | trial-and-error with the Mac compiler | the word-match audit | The Mac cannot compile `cfg(windows)` or `cfg(target_os = "linux")` code |
| Cutting `mod tests` out of Rust text in jest | a new regex per test | one shared `readTauriShellProductionSource()` + guard | Three tests already carry three copies of the idiom |
| Locating an arm/handler body in jest | per-file brace matchers (five copies of `extractHumbleLoginOpenArmBody` exist) | one `readHandlerBody(wire)` helper | Wave 1 must touch each caller anyway; collapse them |
| Generating the router | macros or codegen | a plain hand-written 45-line `match` | The generated enum already makes it exhaustive; macros would hide the table of contents (specifics) |
| Keeping Windows/Linux honest | local cross-compile | the `rust-test.yml` matrix | No Windows/Linux Rust targets installed locally |

**Key insight:** the guarantee in this phase is "no text lost, no assertion blinded", not "it compiles". Compiling is easy; a text pin that passes vacuously after the code it guarded moved to a file the reader does not look at is the failure mode that costs a security regression nobody sees.

## Common Pitfalls

### Pitfall 1: Arm-body pins stop existing at the first router commit
**What goes wrong:** about 25 jest assertions and 4 Rust tests locate `RustInvokeChannel::X => {` and read until the next arm or a marker. After D-04 the arm is a one-liner; `extractHumbleLoginOpenArmBody` finds a one-line body and every `toContain` fails (or, worse, absence assertions pass vacuously on an empty body).
**Why:** CONTEXT sized source-text work around `mod tests` slicing only.
**How to avoid:** Wave 0 adds `readHandlerBody(wire)` and the Wave-1 plan lists every site in section D with before/after; do not split the router commit from the test repoint (one commit per arm group: router line + handler move + pin repoint).
**Warning signs:** a jest test that passed before and now fails with "not found"; or one that passes while its extracted body is under 3 lines (add a minimum-length anti-vacuity assertion in `readHandlerBody`).

### Pitfall 2: Absence assertions go vacuous when code leaves the reader's scope
**What goes wrong:** the `cookies_for_url` ban, `is_login_cancel_request` absence, `.makeKeyAndOrderFront(None)` == 0, `present_native_js_` absence etc. scan the combined source. If code moves into a pre-split sibling (excluded) or a new file the walker misses, they pass without checking.
**How to avoid:** never move live code into `PRE_SPLIT_SIBLING_MODULES`; keep the walker recursive; the Wave-1 move-proof proves every production line is still in the combined set; add a `listTauriShellSourceFiles()` golden count per wave.

### Pitfall 3: `RustInvokeChannel` match must stay exhaustive
Do not add `_ =>`. A new channel in `ipc_contract.rs` must be a compile error in `rust_dispatch.rs`. `[CITED: store_embed.rs:1751-1752 comment, 67-11 D-13]`

### Pitfall 4: `unused_variables` on handler parameters breaks the Windows clippy ceiling
**What goes wrong:** the arm used `app`/`args` from the dispatcher scope. A handler declared `(args, app)` but not using one warns. `clippy` is an EQUALITY ceiling per lint on darwin AND win32 `[CITED: meta/clippyRatchet.cjs]`; a new `unused_variables` fails CI, and a warning that exists only under `cfg(not(target_os = "macos"))` only shows on the Windows leg (Linux has no clippy step).
**Known case:** `AppHide`: `app` is used only in the macOS branch. Also `MainWindowRaise` uses `app` unconditionally but `request_user_attention` is macOS-only (fine).
**How to avoid:** narrow signatures per the arm table; for cfg-conditional use put `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]` on the handler (the existing `HumbleLoginOpen` arm already uses exactly this attribute inside its body, so it is an established idiom) and add that line to the ALLOW set. Do not rename to `_app` when the macOS branch uses it.

### Pitfall 5: Unused-import and unused-re-export warnings
**What goes wrong:** (a) `pub(crate) use sub::*;` for a child with nothing used outside the parent trips `unused_imports` `[ASSUMED]`; (b) a parent's `use ...` lines (esp. `macos_epic_embed.rs`'s 20 explicit imports, `login_window.rs`'s mid-file `use objc2...` at 1304-1317) become unused when their code moves; (c) a child's `use super::*;` with nothing resolved through it warns.
**How to avoid:** re-export only children whose `pub(crate)` items are referenced outside the parent; move each `use objc2...` with the code that needs it (several macOS children each need their own subset); run `cargo clippy` (ratchet) locally per move, not only per wave. Baseline PASS today, so any non-PASS is yours.

### Pitfall 6: `#[tauri::command]` `__cmd__` macros (D-15)
**Not triggered in this phase.** The four target files contain no `#[tauri::command]`; the 4 commands are in `relay_commands.rs` (`grep -n "#\[tauri::command" src-tauri/src/*.rs`) and `generate_handler!` (main.rs:1769) reaches them via `use relay_commands::*;`. Only if a plan moves a command does `pub(crate) use sub::*;` need to carry the hidden `__cmd__<name>` macro; the glob does that. Keep as a check item, not work.

### Pitfall 7: Glob-import ambiguity
Two globs exporting the same name compile until the name is used, then fail with E0659. New children each `use super::*;` and the parent re-exports `pub(crate) use sub::*;`, so the same item can arrive via two paths (fine, same definition) but two *different* items with one name cannot. Candidates: `surface` (macos_epic_embed and unrelated), `store_embed_state` vs handler names. The `rpc_` prefix avoids handler collisions.

### Pitfall 8: cfg-gated modules and re-exports
macOS-only children need `#[cfg(target_os = "macos")]` on BOTH the `mod x;` and the `pub(crate) use x::*;`. Windows-only (`windows_cdp.rs`) needs `#[cfg(any(target_os = "macos", windows))]` for the shared timeout const; the file's items are split by cfg already, so keep each item's own attribute (do not hoist to the `mod`) to avoid changing which platforms see which const. `linux_store_embed_layout` is a Linux-only inline mod; moving it whole into `layout.rs` is a pure move.

### Pitfall 9: `#[path]` and inline-mod relocation
`wake_lock.rs` uses `#[path = "wake_lock/x.rs"] mod <name>;` to keep inline-mod names (ab1). `macos_invite_focus` and `linux_store_embed_layout` are inline mods whose paths (`login_window::macos_invite_focus`) appear in code and tests. Moving them into a child changes their path to `login_window::invite_picker::macos_invite_focus` unless the parent re-exports; the glob re-export keeps `use login_window::*` callers working, but a fully-qualified path in a test or comment does not. Grep for `::macos_invite_focus` and `::linux_store_embed_layout` before moving `[VERIFIED: both are reached through glob imports today]`.

### Pitfall 10: `notification_show` must not land in `notification_backend.rs`
`notification_backend.rs` is deliberately pure, cfg-free, `AppHandle`-free (module doc) and is on `PRE_SPLIT_SIBLING_MODULES` (excluded from the combined source). D-07's "next to `notification_backend`" is satisfied by a NEW flat sibling `notification_show.rs` (`use super::*;`, needs `NotificationExt`). Putting the handler inside `notification_backend.rs` would drop its text out of every source-text pin and break the file's "no Tauri" design.

### Pitfall 11: Mod-name variability in the production-source cutter
`macos_epic_embed.rs` and `shell_open.rs` use topic-named test mods (`shell_open_tests`, `epic_embed_*_tests`), and several are mid-file (`macos_epic_embed.rs` has five, between production items). A cutter that only matches the TRAILING `#[cfg(test)]\nmod tests {` strips nothing from those and, if it cuts at the first `#[cfg(test)]`, would delete production code after it. Rule: cut a `#[cfg(test)]` item only when it is a whole `mod <name> { ... }` block, matched by brace depth to its end, and only remove that block. `macos_epic_embed*` is excluded from the combined source (D-11) so the mid-file case is mostly academic, but `shell_open.rs` is in the combined set and its test mod is trailing. Decide and unit-test the cutter on both shapes.

### Pitfall 12: `include_str!` path depth in co-located tests
`include_str!("../../meta/fixtures/tray-set-icon-wire-args.json")` is relative to the file containing the macro. A flat sibling (`tray.rs`) keeps the same path; a test moved into `src/login_window/x.rs` would need `../../../`. Fixtures used by D-09 stay-tests are unaffected.

### Pitfall 13: Self-matching literals in co-located source-text tests
Tests that `include_str!` their own file (`open_external_command_body...` reads `relay_commands.rs`) would find their needles inside their own test literals once co-located. Leave these in `main.rs` or read through the production-only cutter.

### Pitfall 14: The tree moves under the phase
Between two measurements in this research session `cargo test` went 438 -> 441 and `main.rs` 8,116 -> 8,186 because quick tasks (e.g. 261108-lav, 261108-kpc) keep landing on `main`. Every line number in this document is at `b74d85dee`. Wave 0 task 1 must re-run the measurement scripts and re-take the baseline; the move-proof compares against the base ref of the wave's FIRST commit, not a fixed SHA. A quick task that edits an arm mid-phase must be rebased into the handler.

### Pitfall 15: Name-path changes in test IDs
Moving a test changes its path (`tests::foo` -> `sidecar::tests::foo`). CI and cargo filters match substrings, so this is safe, but any script or doc quoting `tests::<name>` verbatim is stale. Prove no test is lost by diffing `cargo test --bin gamelib-shell -- --list` with the module path stripped (Validation Architecture).

## Code Examples

### Production-only reader (D-10), jest side
```ts
// src/backend/testUtils/tauriShellSource.ts  (additions)
/** Cut each file's `#[cfg(test)] mod <name> { ... }` blocks (brace-matched), then concatenate. */
export function stripRustTestModules(src: string): string { /* whole-block cut, Pitfall 11 */ }
export function readTauriShellProductionSource(repoRoot = DEFAULT_REPO_ROOT): string {
  return listTauriShellSourceFiles(repoRoot)
    .map((p) => stripRustTestModules(readTauriShellFile(p, repoRoot)))
    .join('\n')
}
/** Body of `fn rpc_<wire>(` or null: replaces every `extract*ArmBody`. Asserts length >= 3 lines (anti-vacuity). */
export function readHandlerBody(source: string, wireName: string): string { /* ... */ }
```
Guard (copy the "no direct main.rs reader" scan from `tauriShellSource.test.ts:4609-4640`): walk `src` and `meta` `.ts/.tsx`, fail when a file matches `/indexOf\((['"\x60])mod tests \{\1\)|split\((['"\x60])mod tests \{/` outside an allowlist of the helper, the guard itself and files that only use the string inside synthetic fixtures (`loginChromeCssInjection.test.ts`, `longRunningChannels.test.ts`). After migration the allowlist should contain only the helper and the guard.

### Rust production-source builder (D-10), test side
```rust
// main.rs tests -- SHELL_SOURCE_PARTS replaces the one big const concat!
const SHELL_SOURCE_PARTS: &[&str] = &[include_str!("main.rs"), include_str!("clipboard.rs"), /* ... every file ... */];
fn shell_production_source() -> String {
    SHELL_SOURCE_PARTS.iter().map(|s| cut_test_modules(s)).collect::<Vec<_>>().join("\n")
}
```
`SHELL_SOURCE_FILES` stays a `&[&str]` of names for the walk guard.

## Runtime State Inventory

Omitted per the format rule: this is a code-structure move, not a rename of a runtime-visible string. One check done anyway: wire channel names, `tauri::generate_handler!` command names, window labels (`login-*`, `store-embed`, `store-embed-link-popup`, `bridge-invite`), the `Entry` keychain service/account strings and `shell_diag` log prefixes are all string values that are NOT touched by moving functions between files; `[VERIFIED: grep of rust_dispatch-adjacent consts]`. Nothing stored, registered or cached depends on a Rust module path. Module paths do appear in `cargo test` IDs (Pitfall 15) and in `module_path!()`/`file!()` if any macro uses them: `grep -n "module_path!\|file!()\|line!()" src-tauri/src` should be run in Wave 0 (not run here); a hit would make log text path-dependent.

## State of the Art

| Old | Current | When | Impact |
|-----|---------|------|--------|
| 20,324-line `main.rs` | 11 sibling modules + 8,186-line `main.rs` | ab1, 2026-11-06 | Phase 71 continues the same method |
| Hand-written arm parsing + `transport-mirror` markers | Generated `ipc_contract.rs` (`RustInvokeChannel`, `XArgs::from_args`) | Phase 67, 2026-11-08 | Router is a pure table; no markers to preserve |
| No Linux Rust CI | `ubuntu-latest` in the `rust-test.yml` matrix, `cargo check --all-targets` | 72-01, 2026-11-08 | Linux-gated code is compile-checked per push |
| No clippy gate | Equality-ceiling ratchet on darwin and win32 | quick 261107-8yq / uh4 | Every wave must keep lint counts exactly equal |

**Deprecated/outdated assumptions in CONTEXT.md:** "table of contents router with hand-parsed arms", "17 jest/meta files read the helper" (20 suites touch shell source; 6 read arm bodies; 5 read files directly), "`cargo test` 420/2" (441/2 now).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A `pub(crate) use sub::*;` whose items are unused outside the parent raises `unused_imports` | Pitfall 5 | An extra warning, or an unnecessary `mod`-only declaration; caught by the first clippy run |
| A2 | `use super::*;` in a child sees the parent's private items AND the parent's own glob-imported names (main.rs imports, macros are textual) | Patterns 3, Visibility | Wave-2 first move fails to compile; trivial to detect (ab1 relied on the same behaviour one level up) |
| A3 | Statement-position `#[cfg]` blocks that form the tail of an arm compile identically as the tail of a fn body | Arm table notes | Handlers for AppHide/StoreEmbed* need a small wrapper; would violate D-05 and need a decision |
| A4 | JS default `.sort()` puts `login_window.rs` before `login_window/x.rs` | Inventory A | Parent text appears after children in the combined source; harmless for counts, matters only for order-bounded slices (Pitfall E) |
| A5 | No macro in the shell uses `module_path!()`/`file!()`/`line!()` in a way tests or logs depend on | Runtime State Inventory | Log text or tests change with module path; one grep in Wave 0 resolves it |
| A6 | `cargo test --bin gamelib-shell` Windows/Linux counts equal macOS minus/plus cfg tests; planner only needs macOS count for the "passed must not drop" rule, with CI legs as pass/fail | Validation | CI legs show different counts; acceptable since only green/red gates |

## Open Questions

1. **`single_instance.rs` (1,620 lines, no tests) and `tray.rs` (1,099, +58 after Wave 1) exceed D-13's ~1,000 line target but are not among the four named files.**
   - What we know: CONTEXT scopes four files; D-13 is a target "per file".
   - Recommendation: out of scope for 71; add a todo (`severity: minor`, `platform: any`, `ready: code`). Wave 5 moves about 52 + 33 tests into `single_instance.rs` and makes its test mass larger, not its production size.
2. **Wave 1 placement of Humble handlers (final files immediately vs append then re-split).**
   - Recommendation: final files immediately (anti-pattern above). Children read the parent's privates, so no visibility churn until Wave 2 moves helpers. This is within Claude's discretion (D-07 gives the module, D-12 the layout).
3. **Move the keyring helpers out of `login_window.rs` into `keyring_dispatch.rs`?** Recommended yes (150 lines, one home); optional.
4. **Should `fn main` (1,175 lines) be split?** No: record a todo, as with D-06.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| cargo/rustc stable | tests, check | yes | 1.99.1 | - |
| cargo `+1.99.1` clippy | ratchet | yes | 1.99.1 | - |
| Windows/Linux Rust target | local cross-compile | no (only `aarch64-apple-darwin`) | - | CI matrix legs (the only coverage) |
| jest / node / pnpm | source-text suites | yes | 29.7 / 22.23.4 / 10.28.0 | - |
| python3 | move-proof, audit | yes | 3.15.0 | - |
| gh (authenticated) | push + `gh run watch` | yes | 2.103.3 | - |
| `pnpm tauri:dev` on this Mac | live checks | yes (per project memory) | - | none; live checks are operator-run |
| operator's Windows box | native clippy measurement if the win32 ceiling must move | operator-owned | - | CI Windows leg reports the count |
| `graphify` CLI | post-wave `graphify update .` | yes (graph exists) | - | - |

**Missing with no fallback:** none blocking. **Reminder:** `tauri dev` does not rebuild the sidecar (project memory), but no sidecar change is made here, so a live check needs only the Rust rebuild `pnpm tauri:dev` performs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (bin `gamelib-shell`), jest 29.7 (`Backend` and `Meta` projects), `python3` scripts |
| Config | `src-tauri/Cargo.toml`; repo `jest.config` (6 projects); `.github/workflows/rust-test.yml` |
| Quick run (per move) | `cd src-tauri && cargo test --bin gamelib-shell` |
| Source-text suites | `npx jest --silent --runTestsByPath $(cat <suite-list>)` (see below; `--runTestsByPath` is required, a bare path list finds 0 files in zsh) |
| Full suite | `pnpm test` (jest) + the cargo commands |

### Phase Requirements -> Test Map

| Decision | Behavior | Test type | Automated command | Exists? |
|----------|----------|-----------|-------------------|---------|
| D-04/D-05 | Router lines + handler bodies verbatim | script | `python3 moveproof.py <wave-base-ref>` (Layers 1-2) | Wave 0 creates (prototype validated) |
| D-04 | Exhaustive match, unknown channel error | cargo | `cargo test --bin gamelib-shell` (existing `tests::*` for unknown-channel) + compile | yes |
| D-05 | No lint count change | clippy | `cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > $T/c.json && node ../meta/clippyRatchet.cjs $T/c.json --list` | yes (baseline PASS) |
| D-08/D-09 | No test lost or renamed | cargo list diff | `cargo test --bin gamelib-shell -- --list \| grep ': test$' \| sed 's/: test$//; s/^.*:://' \| sort > after.txt; diff before.txt after.txt` | Wave 0 captures `before.txt` (443 names today; a copy is in `research-tools/cargo-test-names-b74d85dee.txt`) |
| D-10 | Production reader == old slice | jest | new assertion in `tauriShellSource.test.ts` (Wave 0) | Wave 0 creates |
| D-10 | No reader slices on `mod tests {` | jest guard | new describe in `tauriShellSource.test.ts` | Wave 0 creates |
| D-10 | Arm-pin repoint keeps coverage | jest | the 7 suites in inventory D | existing, rewritten in Wave 1 |
| D-11 | `macos_epic_embed/` excluded; absence counts unchanged | jest | `tauriShellSource.test.ts` "helper scope" + `macosEpicEmbed*` suites | existing; extend in Wave 4 |
| D-12/D-13 | Sizes | script | `wc -l` per file plus a non-test line count (`awk` that stops at `#[cfg(test)]`) | Wave N plan |
| D-15 | Call sites unchanged | compile | `cargo check` + `git diff` shows no edits to `main.rs` outside `mod`/`use` lines | yes |
| Windows/Linux | cfg-gated code compiles and tests pass | CI | `git push`, `gh run watch` on `rust-test.yml` (win/mac/ubuntu) | yes |

Source-text suite list (20 baseline suites plus the direct readers; take from the grep so it stays current):
```bash
{ grep -rlE "testUtils/tauriShellSource|src-tauri/src/(store_embed|ipc_contract|macos_epic_embed)" src meta --include='*.test.ts'; \
  echo src/backend/__tests__/macosEpicEmbedSource.test.ts; echo src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts; \
  echo src/backend/__tests__/dummyStoreHarnessContainment.test.ts; echo meta/__tests__/captureShellScrollback.test.ts; } | sort -u > $T/suites.txt
```
Baseline at `b74d85dee`: 20 suites, 658 passed, 2 failed (the two pre-existing failures named above). A wave's jest result must equal that set: same 2 failures, no new failure, passed count not lower.

### Sampling Rate
- **Per commit (one move):** `cargo test --bin gamelib-shell` green AND passed count not lower than the wave's recorded baseline AND `cargo +1.99.1 clippy ... | clippyRatchet --list` PASS AND `python3 moveproof.py <base>` clean.
- **Per wave end:** all of the above + the jest suite list + `--list` name diff + `pnpm check:ipc-contract` + scoped prettier (below) + `graphify update .` + push, then require the Windows and Linux legs of `rust-test.yml` green (D-03) before the live check.
- **Phase gate:** full jest suite and full cargo suite green (modulo the 2 recorded failures), `pnpm planning-gates` green (todos created by D-05/D-06 carry `severity:`/`platform:`/`ready:`).

### Prettier rule for `<verify>` blocks (gamelib-conventions)
Run `npx prettier --check <exact paths>` over the TS files a task wrote, scoped, never `.`. Checked with `--file-info` in this session: `src/backend/testUtils/tauriShellSource.ts` and `src/backend/__tests__/tauriShellSource.test.ts` are formatted TS (`inferredParser: typescript`, not ignored), so they are checked. `src-tauri/src/*.rs` report `inferredParser: null` (prettier cannot parse Rust), so OMIT the prettier check for `.rs` paths and say so rather than carry a green that proves nothing. `.planning/**` is prettier-ignored (`ignored: true`): omit it too. Also run ESLint and `tsc --noEmit` for TS edits (ab1 did).

### Live-check list (per wave from Wave 1, in `pnpm tauri:dev`, never `tauri:dev:run`)
Run with frameless title bar **OFF then ON** (project memory: OFF once put the embed 28 px high over the controls row):
1. An embedded store page (Tauri child webview): open, resize, back/forward/reload/navigate, hide and show on tab switch.
2. A sign-in for each store that uses the login window: Humble (`humble_login_open`, cookies poll, disconnect/clear cookies and storage, reveal), GOG and Amazon (store-logout cookie domains), and Epic (default-store cookie clear on macOS). The DummyStore local OAuth provider (spike-findings `oauth-login-test-harness`, port 17940) can stand in for a store account when a real login is impractical.
3. The Epic embed (macOS raw WKWebView): open, bounds, hide/show, close, deselect on switching to GOG, a download hand-off.
4. Wave 1 only, additionally: a notification, an `app_hide`/`main_window_hide` game launch path, a dialog (open/save/message), the tray icon change, a keyring read after relaunch, the bridge invite picker window. These are the arms that leave `store_embed.rs`.
Wave 0 needs no live check (D-14). Wave 5 moves tests only, so a smoke launch of `pnpm tauri:dev` is enough.

### Wave 0 Gaps
- [ ] `tauriShellSource.ts`: `readTauriShellProductionSource`, `readHandlerBody`, prefix-aware pre-split exclusion, `readMacosEpicEmbedSource`
- [ ] `tauriShellSource.test.ts`: byte-identity assertion, "no slicing on `mod tests {`" guard, extended helper-scope guard (directory exclusions)
- [ ] migrate the three `productionCode()` slicers (loginChromeCssInjection, tauriShellSource x2)
- [ ] `main.rs` tests: `shell_production_source()` builder; `SHELL_SOURCE_FILES` guard directory-aware
- [ ] `moveproof.py` (+ allow-list), `vis.py` promoted from `.planning/phases/71-rust-shell-module-decomposition/research-tools/` (also `items.py`, the item-span lister behind the cluster maps) to wherever the plan wants them; none is wired into CI
- [ ] baselines: `cargo test -- --list` names, passed/ignored counts, clippy `--list` output, jest suite results, `grep -n "module_path!\|file!()\|line!()" src-tauri/src` (A5)
- [ ] confirm the two jest baseline failures are still the only two

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section applies. The phase adds no runtime behaviour; the security work is *preserving* controls that are pinned by text.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirect | login-window and keyring flows move but do not change; keyring slot allow-list (`keyring_account`) and reachability probe stay byte-identical |
| V3 Session Management | indirect | cookie read/clear paths (D-06 monoliths) move whole; the `cookies_for_url` ban and macOS-gated wry `.cookies()` pins must keep seeing the code |
| V4 Access Control | yes | `shell_open.rs` allow-list (Phase 72), `open_external` scheme allow-list in `relay_commands.rs`, capabilities `default.json`, renderer allow-list: all pinned by source-text tests that Waves 1-5 must not blind |
| V5 Input Validation | yes | generated `XArgs::from_args` in `ipc_contract.rs` is the arg boundary and is not touched |
| V6 Cryptography | no | none in scope |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A security guard silently stops checking after a move (absence assertions pass vacuously) | Tampering / Elevation | Pitfall 2 controls: recursive walker, no moves into excluded siblings, move-proof line multiset, anti-vacuity length check in `readHandlerBody` |
| A moved handler widens a path-open or URL-open capability | Elevation | Router passes args straight to the same bodies; `shell_open_path`/`shell_show_item_in_folder` already delegate to the policy module; `openPolicy.test.ts` reads three files and must keep passing |
| `pub(crate)` widening exposes an internal item | Information disclosure | Crate is a binary; `pub(crate)` is crate-internal. Still apply "only where a move requires it" (D-15) |
| Platform-gated security code (`#[cfg(not(target_os = "macos"))]` cookie reads) dropped or ungated by a hoisted `cfg` | Tampering | Keep each item's own cfg (Pitfall 8); `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` must be repointed, not deleted |

## Sources

### Primary (HIGH confidence) - this session, direct measurement
- `src-tauri/src/{main,store_embed,login_window,macos_epic_embed,sidecar,ipc_contract,shell_open,notification_backend,epic_embed_js_dialog,store_embed_handoff_policy}.rs` at `b74d85dee` (grep, line spans, item maps)
- `.github/workflows/rust-test.yml`, `meta/clippyRatchet.cjs`, `src/backend/testUtils/tauriShellSource.ts`
- `src/backend/__tests__/{tauriShellSource,loginChromeCssInjection,longRunningChannels,keyringDiagPersistence,dialogOptionForwarding,sidecarShutdownFlagSource,macosEpicEmbedSource}.test.ts`, `src/backend/scanners/__tests__/scanChannelParity.test.ts`
- `cargo test --bin gamelib-shell` (441 passed, 2 ignored, 443 listed), `cargo +1.99.1 clippy ... | clippyRatchet --list` (PASS), `npx jest --runTestsByPath` over 20 suites (658 passed, 2 failed)
- `.planning/quick/261106-ab1-split-src-tauri-main-rs-into-modules/261106-ab1-SUMMARY.md`, `.planning/phases/67-.../67-VERIFICATION.md`, `71-CONTEXT.md`
- `.claude/skills/gamelib-conventions/SKILL.md` (verify-block prettier rule, todo frontmatter), `.claude/skills/spike-findings-gamelib/SKILL.md` (cookie API and login-window gotchas for the live check)

### Secondary / Tertiary
- None. No web research was needed; no external library is involved. Rust privacy and glob-import semantics are language rules recalled from training and listed as `[ASSUMED]` (A1-A3) pending the first compile.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new packages; tools verified present)
- Cluster maps and arm table: HIGH (line spans produced by script from the files at one SHA); submodule boundaries are recommendations within Claude's discretion
- Source-text inventory: HIGH for what was found; MEDIUM for completeness of section E (order-sensitive bounds were found by grep patterns, not an exhaustive read of 4,642 + 1,033 lines of tests). Wave plans must re-scan after each move
- Visibility map: MEDIUM (word-match, includes coincidental-name false positives; compiler and CI are the authority)
- Pitfalls 1-5, 10: HIGH (each demonstrated in the code); Pitfalls 7-9, 11 are language-rule MEDIUM

**Research date:** 2026-11-08
**Valid until:** until the next commit touching `src-tauri/src/**` or the 20 suites; re-measure at Wave 0 start (quick tasks land daily)
