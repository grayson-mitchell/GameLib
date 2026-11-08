---
phase: 71-rust-shell-module-decomposition
reviewed: 2026-11-09T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - meta/clippyRatchet.cjs
  - src-tauri/src/app_lifecycle.rs
  - src-tauri/src/clipboard.rs
  - src-tauri/src/dialogs.rs
  - src-tauri/src/epic_embed_js_dialog.rs
  - src-tauri/src/keyring_dispatch.rs
  - src-tauri/src/login_window.rs
  - src-tauri/src/login_window/devtools.rs
  - src-tauri/src/login_window/humble_cookies.rs
  - src-tauri/src/login_window/humble_helpers.rs
  - src-tauri/src/login_window/humble_open.rs
  - src-tauri/src/login_window/humble_reveal.rs
  - src-tauri/src/login_window/invite_picker.rs
  - src-tauri/src/login_window/macos_cookies.rs
  - src-tauri/src/login_window/pristine_epic.rs
  - src-tauri/src/login_window/sheet.rs
  - src-tauri/src/login_window/windows_cdp.rs
  - src-tauri/src/macos_epic_embed.rs
  - src-tauri/src/macos_epic_embed/nav_delegate.rs
  - src-tauri/src/macos_epic_embed/surface.rs
  - src-tauri/src/main.rs
  - src-tauri/src/notification_show.rs
  - src-tauri/src/relay_commands.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/scan_dispatch.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/single_instance.rs
  - src-tauri/src/store_embed.rs
  - src-tauri/src/store_embed/controls.rs
  - src-tauri/src/store_embed/layout.rs
  - src-tauri/src/store_embed/open.rs
  - src-tauri/src/store_embed/policy.rs
  - src-tauri/src/store_embed/state.rs
  - src-tauri/src/store_embed_handoff_policy.rs
  - src-tauri/src/terminate_veto.rs
  - src-tauri/src/tray.rs
  - src-tauri/src/wake_lock.rs
  - src/backend/__tests__/dialogOptionForwarding.test.ts
  - src/backend/__tests__/keyringDiagPersistence.test.ts
  - src/backend/__tests__/loginChromeCssInjection.test.ts
  - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
  - src/backend/__tests__/macosEpicEmbedSource.test.ts
  - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/scanners/__tests__/scanChannelParity.test.ts
  - src/backend/sidecar/__tests__/appRootResolution.test.ts
  - src/backend/sidecar/__tests__/openPolicy.test.ts
  - src/backend/sidecar/shellFilesFlowRegistration.ts
  - src/backend/testUtils/tauriShellSource.ts
  - src/common/types/ipc/shellFiles.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 71: Code Review Report

**Reviewed:** 2026-11-09
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

Scope: what Phase 71 changed (`git diff b9daa654a^..HEAD`), not the code it moved verbatim.

**Production behaviour: no defect found.** I checked these mechanically rather than by reading:

- **Dispatcher.** Every one of the 45 original `dispatch_rust_channel` arm bodies (from `b9daa654a^:store_embed.rs`), dedented by 8, is byte-identical to the body of its `rpc_<wire>` handler. `ShellShowItemInFolder` and `ShellOpenPath` were already one-line delegates and are unchanged. In `rust_dispatch.rs` the router passes the right arguments to each handler: `channel` goes to the four keyring handlers, `args`/`app` match each signature, and the unknown-channel guard and the exhaustive match (no `_ =>`) are preserved. No arm is missing or reordered in a way that matters.
- **Test bodies.** I compared every nested `fn` from the old tree against the new tree with whitespace normalised. The only differences are:
  - visibility widening (`as_str`, `enqueue_nav_event`, `nav_flags`, `new`)
  - the intentional pin repoints listed below
  - `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]` on `rpc_app_hide`, which is benign and required
- **cfg gating.** `pristine_epic`, `sheet` and `macos_cookies` are now whole-module `#[cfg(target_os = "macos")]`. Every item in them already carried its own macOS cfg, and every test that moved into them already had `#[cfg(target_os = "macos")]` in old `main.rs`. No test lost a platform.
- **Name collisions.** No two `pub(crate)` top-level items collide across the glob re-exports. `read_system_uses_light_theme` appears twice, but as cfg-exclusive variants.
- **`readTopLevelFnBody` / `fnEndAfter`.** For every column-0 `fn` in the shell, the first column-0 `}` after it is the real closing brace; no raw string truncates a body. Likewise, every `#[cfg(test)] mod` block's first column-0 `}` is its real end.
- **Removed imports.** `absolutePathArg` and `join` are genuinely unused.
- **clippy ratchet.** The win32 `unused_imports` entry deletion is consistent with the ratchet's equality semantics.

**Findings are all in the test scaffolding.** One pin became vacuous because tests were co-located into the file it reads. The D-10 production reader has a gap for `cfg(all(test, …))` modules. The D-10 "no slicing" guards are narrower than their names claim.

## Warnings

### WR-01: `sidecar.rs` EOF-ordering pin became vacuous when `on_sidecar_eof` tests were co-located into `sidecar.rs`

**File:** `src/backend/__tests__/sidecarShutdownFlagSource.test.ts:85-91` (pin), `src-tauri/src/sidecar.rs:691-718` (new `mod tests`)

**Issue:** The test reads `code('sidecar.rs')`, which is the whole file including tests. It then asserts:

```ts
const drain = src.indexOf('drain_pending_invokes(&state.pending')
expect(src.indexOf('on_sidecar_eof(', drain)).toBeGreaterThan(drain)
```

Before Phase 71, `sidecar.rs` had no test module, so the only `on_sidecar_eof(` after the drain was the production call at line 645. Plan 71-16 moved the three `on_sidecar_eof_*` tests into `sidecar.rs`'s new `mod tests`, which calls `on_sidecar_eof(` at lines 698, 707, 716 and 717. If the production call at line 645 were deleted or moved before the drain (exactly the D-01 regression this pin exists for), `indexOf('on_sidecar_eof(', drain)` would land on line 698 and the test would still pass.

The plan-71-16 sweep repointed two other pins that began seeing co-located tests (the tray `unwrap()` pin and the `app_root_env_value` pin), but missed this one. It does not slice between two markers, so nothing failed.

**Fix:** Read production text only, and bound the search to the reader function:

```ts
import { stripRustTestModules } from 'backend/testUtils/tauriShellSource'
// ...
const src = strip(stripRustTestModules(readTauriShellFile('sidecar.rs')))
const drain = src.indexOf('drain_pending_invokes(&state.pending')
expect(drain).toBeGreaterThanOrEqual(0)
const eof = src.indexOf('on_sidecar_eof(', drain)
expect(eof).toBeGreaterThan(drain)
expect(src.indexOf('\n}\n', drain)).toBeGreaterThan(eof) // same fn body
```

Then audit every other `readTauriShellFile(<file>)` and `include_str!("<file>")` caller whose target gained a `mod tests` in 71-16/17. Those targets are `sidecar.rs`, `relay_commands.rs`, `tray.rs`, `keyring_dispatch.rs`, `wake_lock.rs`, `clipboard.rs`, `terminate_veto.rs`, `single_instance.rs`, `login_window/*` and `store_embed/*`. Look for any `indexOf(x, from)` presence or ordering assertion that a test call could now satisfy.

### WR-02: The D-10 production reader does not strip `#[cfg(all(test, …))]` test modules; `terminate_reply_tests` is counted as production

**File:** `src/backend/testUtils/tauriShellSource.ts:108-136`, `src-tauri/src/main.rs:1990-2017`, `src-tauri/src/terminate_veto.rs:323-341`

**Issue:** Both cutters (`listRustTestModuleBlocks`/`stripRustTestModules` in jest, `cut_test_modules` in Rust) recognise a test module only when the line is exactly `#[cfg(test)]` and the next line is `mod <ident> {`. `terminate_veto.rs:323` is `#[cfg(all(test, target_os = "macos"))]` followed by `mod terminate_reply_tests {`, so both `readTauriShellProductionSource()` and `shell_production_source()` keep its body as "production".

This undercuts the D-10 promise ("each file's own test modules cut"). The proof test cannot catch it: `per file: strip removes exactly the enumerated test-mod line ranges` (`tauriShellSource.test.ts:4667`) enumerates blocks with the same narrow rule, and `EXPECTED_TEST_MOD_NAMES` is compared only against what that rule finds. The same applies to any future `#[cfg(test)]` + `#[cfg(windows)]` stacked-attribute module, which is a likely shape now that Windows-only tests are being co-located.

**Fix:** Make the rule fail closed in both cutters. Accept any column-0 attribute line whose cfg predicate contains `test` (`#[cfg(test)]`, `#[cfg(all(test, …))]`), including stacked attributes before the `mod <ident> {` line. Add a guard that fails when a column-0 `mod <ident> {` is preceded by a `cfg` mentioning `test` and the cutter did not cut it. Add `terminate_reply_tests` to the fixtures of both the jest and Rust self-tests.

### WR-03: The D-10 "nothing slices on `mod tests {`" guards cover much less than they claim

**File:** `src/backend/__tests__/tauriShellSource.test.ts:4737-4770`, `src-tauri/src/main.rs:2104-2123`

**Issue:** There are two guards, one per side, and both are narrow.

- **Jest guard.** It is titled "no test or meta script slices…", but:
  - It scans only `.ts`/`.tsx` files. `meta/` scripts are `.cjs`/`.mjs`, so none of them is scanned.
  - It matches only the exact forms `indexOf('mod tests {')` and `split('mod tests {')`.
  - It does not see `lastIndexOf`, `search(/mod tests \{/)`, a prefixed needle such as `'#[cfg(test)]\nmod tests {'`, or a constant or template-literal needle.
  - It does not see the sibling idiom `source.indexOf('#[cfg(test)]')` used to locate "the test region" in the combined source. `longRunningChannels.test.ts:172-178` (`locateCfgTestRegionRaw`) does exactly that over `readTauriShellSource()`. Since 71-16 put a test module into most files that sort before `main.rs`, that "region" spans almost all production code. Its `timeoutForRefs.length >= 2` condition is now satisfied by production `timeout_for` alone, and only the loop-body check still has teeth.
- **Rust guard.** `no_shell_source_test_slices_on_mod_tests` scans only `main.rs`'s own test text. Source-text tests now also live in co-located modules, such as `store_embed_handoff_policy.rs` and `epic_embed_js_dialog.rs`, and none of those is checked. `assert!(!needles.is_empty())` on a literal array is not a real non-vacuity check.

**Fix:**
- Jest guard: widen it to `\.(c|m)?[jt]sx?$`, and match any string literal containing `mod tests {` or `#[cfg(test)]` passed to `indexOf`/`lastIndexOf`/`split`/`search`/`find`.
- Rust guard: iterate over every `SHELL_SOURCE_PARTS` entry's test text, plus the non-combined siblings, instead of `main.rs` alone.
- `longRunningChannels`: move it to a per-file read of `main.rs`'s `mod tests`, or to `stripRustTestModules`'s complement.

## Info

### IN-01: The "flat router" pin does not actually require one-line arms

**File:** `src/backend/__tests__/tauriShellSource.test.ts:346-350`

**Issue:** `DISPATCH_ARM_LINE_RE` matches `^ {8}RustInvokeChannel::X\s*=>`. That also matches a re-inflated block arm (`… => {`), so the "45 one-line arms" title overstates what is asserted.

**Fix:** Also assert that every matched line ends in `),` and that no line in `rust_dispatch.rs` matches `=> \{$`.

### IN-02: The Epic dialog absence pin hardcodes the `macos_epic_embed/` children

**File:** `src-tauri/src/epic_embed_js_dialog.rs:192-198`

**Issue:** The `concat!(include_str!(…parent), include_str!(…surface), include_str!(…nav_delegate))` list is fixed. A third child added later escapes the `.runModal(` and `present_native_js_` absence assertions without anything failing. The jest side (`readMacosEpicEmbedSource`) walks the directory instead.

**Fix:** At test time, read the directory with `std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/src/macos_epic_embed"))`. Alternatively, add an assertion that the directory holds exactly two `.rs` files.

### IN-03: Stale docs in the shared reader

**File:** `src/backend/testUtils/tauriShellSource.ts:72-75`, `src/backend/testUtils/tauriShellSource.ts:213-216`

**Issue:**
- `listTauriShellSourceFiles`'s doc still justifies "`main.rs` last" with the idiom "everything before the first `mod tests {`". D-10 retired that idiom, and it is now wrong for the combined text.
- `readMacosEpicEmbedSource` says "Today that is exactly the single file", but there are now three files.

**Fix:** Point the first doc at `readTauriShellProductionSource` and drop the second sentence.

### IN-04: Dangling cross-file references in moved comments and messages

**File:** `src-tauri/src/rust_dispatch.rs:33,38`; `src-tauri/src/app_lifecycle.rs:66`; `src-tauri/src/main.rs:2279,3763,3827,3886,3930`; `meta/fixtures/tray-set-icon-wire-args.json:5`

**Issue:** Several comments and messages no longer point at the right place:
- `rust_dispatch.rs` says "`macos_finder_reselect_workaround` below" and "`shell_show_item_in_folder` above". Both now live in `shell_open.rs`.
- `app_lifecycle.rs` refers to "`clipboard_read_text`'s comment above", which is now in `clipboard.rs`.
- Repointed `expect` messages still say "not found in main.rs" while reading `relay_commands.rs`, `store_embed/layout.rs` and `store_embed/open.rs`.
- The tray wire fixture still names `main.rs mod tests (tray_variant_wire_contract_*)`. Those tests now live in `tray.rs` (line 1214).

**Fix:** Update the file names in these strings. Per D-05 this could become a todo rather than a move-commit edit.

### IN-05: The Rust and jest cutters diverge on an unterminated test module

**File:** `src-tauri/src/main.rs:2004-2010` vs `src/backend/testUtils/tauriShellSource.ts:131`

**Issue:** The two cutters treat an unterminated test module differently:
- jest `listRustTestModuleBlocks` throws `unterminated test module`.
- Rust `cut_test_modules` silently drops everything to EOF.

The doc comment claims "Same rule as the jest reader". The Rust behaviour would also silently remove production text after a malformed block, or after a test-module raw string containing a bare column-0 `}`. Neither case exists today: I checked every block.

**Fix:** In `cut_test_modules`, `panic!("unterminated test module at line {}", start + 1)` when the scan reaches EOF without a closing `}`.

---

_Reviewed: 2026-11-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
