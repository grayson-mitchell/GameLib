---
phase: 71-rust-shell-module-decomposition
reviewed: 2026-11-08T19:29:57Z
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

## Gap-closure re-review (71-19, 71-20)

**Reviewed:** 2026-11-08T19:29:57Z
**Depth:** standard
**Scope:** `git diff cb69de3e4..HEAD -- src src-tauri meta`, 20 files, all test-only. The `src-tauri/src/main.rs` hunks are all inside `#[cfg(test)] mod tests`.
**Status:** issues_found

### What I verified

**Test runs.**
- The 14 migrated jest suites: 527 of 528 tests pass. The one failure is the known WR-07 `.title(` string-literal test, which is out of scope.
- `cargo test cut_test_modules`: 4 of 4 pass. The two build warnings (`non_snake_case` in `wake_lock.rs` and `main.rs`) are pre-existing.

**Every migrated pin.**
- `loadMainRsCode` defaults now read `readTauriShellProductionSource()`; `code()` and the router pins read `readTauriShellProductionFile()`.
- No migrated presence, order or count pin can be satisfied by a test module any more.
- The re-pointed clipboard pin `ClipboardWriteTextArgs::from_args` is satisfied by production `clipboard.rs:32`, and not only by the test calls at lines 66-109.
- The two `NON-VACUITY` raw-witness tests (lines 4102 and 4363) and the `COMMENT_ONLY_PHRASE` precondition still find their phrases in production comments.

**`D-10 raw` labels.** I checked all eight labels. None hides a production pin:
- clipboard cargo-test names
- the per-file strip proof
- the `terminate_veto.rs` survival proof
- the cutter cross-check
- the `main.rs` strip proof
- the sidecar mutation self-test
- the `loginChromeCssInjection` cargo-test survival pin
- `longRunningChannels`' own-test-module reader

Each one targets Rust test text by intent.

**`eofAfterDrainInReader` (sidecar.rs).**
- `drain_pending_invokes(&state.pending` occurs exactly once in production, at line 640 inside `start_reader`.
- `on_sidecar_eof(` follows it at line 645.
- The first `\n}\n` after the drain is `start_reader`'s own closing brace at line 649. No column-0 `}` or raw string sits in between.
- The fn definition `on_sidecar_eof<` cannot match the `on_sidecar_eof(` needle.
- Both mutation tests genuinely flip the result.

The bound is robust for today's file (see GC-IN-02 for a hardening).

**Cutter parity.**
- jest `classifyCfgTestAttr` and Rust `classify_cfg_test_attr` are token-for-token equivalent: the same `test` word-boundary rule, the same top-level `all(..)` argument split, and the same quote toggle.
- `listRustTestModuleBlocks` and `cut_test_modules` use the same rule for the attribute run and the block end.
- **No over-cut.** A cut can only start at a contiguous attribute run directly above a column-0 `mod <ident> {` that carries a recognised test cfg. Every attribute in that run belongs to that module.

**Every column-0 test-cfg line in `src-tauri/src` today.** All are exactly `#[cfg(test)]` except `terminate_veto.rs:323`, and none is separated from its `mod` line. `login_window/devtools.rs:23`'s `#[cfg(any(debug_assertions, test))]` sits on a fn, so it is never classified. No nested, `pub` or out-of-line test module exists.

### Status of the original warnings

| ID | Status | Notes |
|----|--------|-------|
| WR-01 | **Resolved** | `sidecarShutdownFlagSource.test.ts:105-112` reads production text and bounds the search to the reader body. The mutation tests at lines 115-147 prove that the old pin was vacuous and the new one is not. The audit the review asked for was done: 12 combined-source readers and the per-file readers were migrated. The one reader the audit missed is `readMacosEpicEmbedSource` (GC-WR-02). |
| WR-02 | **Resolved for the reported instance; fail-closed only partly delivered** | `terminate_reply_tests` is now cut on both sides, with fixtures and a real-tree assertion on each side. Two parts did not deliver what WR-02 asked for: the "cutter did not cut it" guard is tautological, and several legal Rust shapes still fail open silently (GC-WR-01). |
| WR-03 | **Partially resolved** | `longRunningChannels` now reads only `main.rs`'s own test blocks: fixed. On the jest side the slicing guard itself was not widened (still `.ts`/`.tsx` only, exact `indexOf`/`split` forms). It is largely superseded by the new raw-reader allow-list, since slicing production text is harmless, but that allow-list has bypasses (GC-WR-02). The Rust half is **not addressed**: `no_shell_source_test_slices_on_mod_tests` (`main.rs:2204-2221`) is unchanged, and Rust has no raw-reader guard (GC-WR-03). |

### Warnings

#### GC-WR-01: The cutter cross-check guard is tautological, and several legal test-module shapes still fail open

**File:** `src/backend/__tests__/tauriShellSource.test.ts:4786-4815`, `src/backend/testUtils/tauriShellSource.ts:108` (`TEST_MOD_OPEN`) and `:161-167`, `src-tauri/src/main.rs` (`is_mod_open` at 2040, `cut_test_modules` at 2052-2093)

**Issue:** WR-02 asked for a guard that fails when a test-gated module is not cut. The guard that was added detects "gated" modules with exactly the cutter's own rule:
- a `^mod X \{$` line
- a contiguous column-0 `#[` run above it
- a `#[cfg(` line in that run mentioning `\btest\b`

That condition is precisely "the cutter classifies it `test` or `ambiguous`", so the cutter cuts it or throws by construction. The guard can never go red independently of `listRustTestModuleBlocks`. It also cannot see any module the cutter's pattern misses.

Each of these legal shapes is silently kept as production text by both cutters and by the guard. All are invisible today, but they are exactly how the next co-located test module can re-open WR-01:

- **Doc comment or blank line between the attribute and the module.** For example `#[cfg(test)]`, then `/// Fixture-backed tests.`, then `mod tests {`. The `///` line breaks the attribute run.
- **rustfmt-wrapped cfg.** A long cfg such as `#[cfg(all(test, target_os = "macos", …))]` past `max_width` becomes `#[cfg(all(` / `    test,` / `))]`. The line directly above `mod` is `))]`, which does not start with `#[`, so the run is empty.
- **Visibility.** `#[cfg(test)]` followed by `pub(crate) mod test_support {` fails `^mod `.
- **Indentation.** An indented test module nested in a production `mod` is not matched.
- **Out-of-line modules.**
  - `#[cfg(test)] mod tests;` backed by a `tests.rs` file: `listTauriShellSourceFiles` walks every `.rs` file and concatenates `tests.rs` whole into "production".
  - A file starting `#![cfg(test)]` is treated the same way.

The plan's "Unchanged: commented, indented … are not cut" decision covers commented-out attributes. It does not cover the live shapes above.

**Fix:** Make the guard independent of the cutter. Scan every shell file for any line matching `/^\s*#!?\[cfg\(.*\btest\b/`, any line `/^\s*test,?$/` inside a `#[cfg(all(` that spans several lines, and any `mod \w+;` whose attributes mention `test`. Require each hit to be either:
- inside a block returned by `listRustTestModuleBlocks`, or
- on an explicit, reasoned allow-list (e.g. `login_window/devtools.rs:23`, the `fn should_auto_open_devtools` item).

Make both cutters throw/panic on a test-cfg attribute separated from its `mod` by comment or blank lines, and on a non-`^mod` module opener (`pub…mod`, indented). Add a Rust twin that scans `SHELL_SOURCE_PARTS`.

#### GC-WR-02: The raw-reader allow-list is bypassed by helper-internal readers, direct `readFileSync`, and import aliasing; one live unlisted raw reader exists

**File:** `src/backend/__tests__/tauriShellSource.test.ts:4895-4990`, `src/backend/testUtils/tauriShellSource.ts:313-325`, `src/backend/__tests__/macosEpicEmbedSource.test.ts:18-25`, `src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts:24-32`

**Issue:** `countRawShellReads` only matches the literal tokens `readTauriShellSource(` and `readTauriShellFile(`, and it skips the definitions file outright. That misses three cases:

1. **`readMacosEpicEmbedSource()` is a raw reader that is not on the list.** Its doc says "Full text (tests included)". It concatenates `macos_epic_embed.rs` (2 test modules, at lines 110 and 176) and `macos_epic_embed/surface.rs` (3 test modules, at lines 1006, 1058 and 1087). It is called from two suites that pin presence and counts (`fnBody(...).toContain`, `count(code, 'crate::shell_diag(')`). The call inside the helper is exempt because it lives in `DEFINITIONS`, and the callers use a name the regex does not know. This is the same class of reader as WR-01, and nothing flags it.
   - I checked every literal needle in both suites against the test-module text. Today only `enqueue_nav_event(` occurs there, and it is scoped through `fnBody`, so **no current pin is vacuous**.
   - However, a future `toContain` over `code`, or a test that calls `crate::shell_diag(`, would be silently satisfied or skewed.
2. **Direct reads.** `readFileSync(join(SHELL_SRC, f))` of a shell `.rs` file is not counted. The guard's own cross-check, at line 4795, does exactly this unflagged.
3. **Aliasing.** Both of these defeat the regex:
   - `import { readTauriShellFile as rd }`
   - `const { readTauriShellFile: rd } = require(...)`

This means the plan's done criterion ("Any new unstripped shell-source read in src/ or meta/ turns jest red") is not met.

**Fix:**
- Split the helper into `readMacosEpicEmbedProductionSource()`, which strips each part with `stripRustTestModules`, and migrate both suites to it.
- Add `readMacosEpicEmbedSource\(` to the scanner regex, and allow-list any remaining raw caller.
- Count `readFileSync\([^)]*(SHELL_SRC|src-tauri\/src)` and any read whose argument ends in `.rs` as raw reads.
- Fail on any `as`/`:` alias of the three reader names in import and destructure lines.
- Scan the definitions file too, with an expected count, so a new helper-internal raw reader is a reviewed change.

#### GC-WR-03: WR-03's Rust half is unaddressed: Rust source-text tests still have no production reader discipline outside `main.rs`

**File:** `src-tauri/src/main.rs:2200-2221`, `src-tauri/src/store_embed_handoff_policy.rs:224,338-341,367`, `src-tauri/src/epic_embed_js_dialog.rs:192-198`

**Issue:** Several things on the Rust side are unchanged:
- `no_shell_source_test_slices_on_mod_tests` still scans only `main.rs`'s test text, and still uses the literal-array `assert!(!needles.is_empty())` "non-vacuity" check.
- Co-located Rust source-text tests read sibling files raw through `include_str!`, and nothing in Rust inventories them. Those readers are:
  - `store_embed_handoff_policy.rs`, which reads `macos_epic_embed/nav_delegate.rs` and `store_embed/open.rs`
  - `epic_embed_js_dialog.rs`, which reads all three `macos_epic_embed` files, including `surface.rs` with its 3 test modules

None of their positive targets carries a test module today, and the `epic_embed_js_dialog` pins are absence pins, which raw text only makes stricter. So nothing is vacuous now. But the moment `nav_delegate.rs` or `store_embed/open.rs` gains a co-located `mod tests` that names `store_embed_browser_handoff_policy(` or `.on_download({`, the `find(...)` ordering pins can resolve inside the test module. That is exactly the WR-01 failure mode, on the side where CI does not run (`cargo test` is manual).

**Fix:**
- Expose `cut_test_modules` as a crate-level `#[cfg(test)] pub(crate) fn` and route these `include_str!` reads through it.
- Widen `no_shell_source_test_slices_on_mod_tests` to iterate every `SHELL_SOURCE_PARTS` entry plus the non-combined siblings.
- Add a Rust inventory test: count `include_str!("*.rs")` sites per file against an expected map, mirroring `RAW_SHELL_READ_ALLOWLIST`.

### Info

#### GC-IN-01: The `D-10 raw` label check is file-wide and self-satisfying

**File:** `src/backend/__tests__/tauriShellSource.test.ts:4981-4988`

**Issue:** The check counts `D-10 raw` occurrences anywhere in the file and requires them to be at least the allow-list count. That is weak in two ways:
- In `tauriShellSource.test.ts` there are 7 occurrences for 4 counted sites. Two are the guard's own test title and its `split('D-10 raw')`, and one (line 4794) labels an uncounted `readFileSync`.
- A new unlabelled raw site in that file therefore passes once its count is bumped to 5.

**Fix:** For each counted match, require `D-10 raw` on the same line or within the two preceding lines. Exclude the guard's own literal from the count.

#### GC-IN-02: The D-01 bound is "next column-0 `}` after the drain", not "inside `start_reader`"

**File:** `src/backend/__tests__/sidecarShutdownFlagSource.test.ts:34-40`

**Issue:** The bound is correct today. Two future changes would loosen it:
- If the drain moved into a helper fn, the pin would follow it.
- If `start_reader` moved into an `impl` or `mod`, its closing `}` would be indented, and the bound would extend to the enclosing block's end.

**Fix:** Use `readTopLevelFnBody(src, 'start_reader', 50)` and assert `drain >= 0 && eof > drain` within that body. The existing mutation tests keep their meaning.

#### GC-IN-03: IN-05 is still open after the `cut_test_modules` rewrite

**File:** `src-tauri/src/main.rs` (`cut_test_modules`, line 2078: the `while end < lines.len() && lines[end] != "}"` loop followed by `take((end + 1).min(lines.len()))`)

**Issue:**
- An unterminated test-gated module still silently drops every line to EOF in Rust, while jest throws `unterminated test module`.
- The doc comment claims "Same rule as the jest `stripRustTestModules`".
- The rewrite was the natural point to close this.

**Fix:** `if end == lines.len() { panic!("unterminated test module at line {}", i + 1) }`. Add a `#[should_panic]` fixture.

#### GC-IN-04: `cfg(not(test))` modules throw, although they are by definition production text

**File:** `src/backend/testUtils/tauriShellSource.ts:118-145`, and the Rust `classify_cfg_test_attr`

**Issue:** Failing closed on `any(test, …)` is right, because such a module is both test and production. A `#[cfg(not(test))] mod real_impl {` is never compiled under test, so it is unambiguously production. Today it throws `ambiguous test cfg` from `readTauriShellProductionSource()`, and that error surfaces in roughly 25 unrelated suites at once.

**Fix:** Classify a top-level `not(test)` as `'other'`. Keep `any(..test..)` and nested shapes as `'ambiguous'`, and add the fixture on both sides.

#### GC-IN-05: Minor redundancy in `loadMainRsRaw`

**File:** `src/backend/__tests__/longRunningChannels.test.ts:168-173`

**Issue:** `listRustTestModuleBlocks(lines.join('\n'))` rebuilds the string it just split.

**Fix:** Read the file once into `raw`, then call `listRustTestModuleBlocks(raw)` and split `raw` for slicing.

---

_Gap-closure re-review: 2026-11-08T19:29:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
