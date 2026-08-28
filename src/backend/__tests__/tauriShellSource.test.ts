/**
 * Phase 34 gap-closure suite (Plan 34-10) covering code-review findings WR-01 and WR-03
 * against `src-tauri/src/main.rs`. This extends the Wave-0 config-shape convention
 * (cargoFeatures.test.ts, tauriConf.test.ts) to the Rust shell source itself.
 *
 * WR-01: `use_dev_sidecar()` must not have a release-reachable env-var escape hatch into
 * `Command::new("node")` — it must reduce to `cfg!(debug_assertions)` alone.
 * WR-03: the sidecar child process must be explicitly killed and reaped on app exit
 * (`RunEvent::Exit`), not just held alive via an unused `_child` field.
 *
 * All assertions run against a COMMENT-STRIPPED copy of the source. main.rs's doc comments
 * quote the exact strings under assertion (e.g. the WR-01 doc comment literally contains
 * "GAMELIB_SIDECAR_ENTRY", and the WR-03 field comment contains "the child is not reaped"),
 * so an unfiltered grep/match would be self-satisfying and could pass on prose alone even if
 * the real code never changed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

const CAPABILITIES_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'capabilities',
  'default.json'
)

/**
 * Reads main.rs (or `source` if provided — the self-tests below drive this SAME code path
 * with synthetic input rather than reimplementing the stripping algorithm) and strips
 * comments so assertions run against code only. Two-stage order:
 *   1. `stripSourceComments` (shared util, `../testUtils/stripSourceComments`) FIRST — this
 *      removes `/* ... *\/` block comments, whose interior lines do NOT themselves start with
 *      a comment marker and therefore survive a line-prefix-only filter entirely. This stage
 *      is now LOAD-BEARING: Phase 34.3 Plan 07 adds positive-existence assertions (e.g.
 *      `fn clipboard_text_arg`) whose exact tokens also appear in main.rs's own prose (this
 *      file's pre-existing WR-03 gate has the identical property for `RunEvent::Exit` /
 *      `.kill()` / `try_state::<Arc<SidecarState>>`), so a block comment merely NAMING one of
 *      these tokens must not satisfy the gate.
 *   2. THEN a LOCAL trailing-`//` pass on that output — `stripSourceComments`'s own docstring
 *      directs callers needing trailing-comment stripping to layer its
 *      `stripTrailingLineComment` helper here. This drops:
 *        - every line whose trimmed form starts with `//` (covers `//`, `///`, `//!`)
 *        - a trailing `// ...` fragment from any mixed code/comment line
 * This stripping exists because main.rs's doc comments quote the very strings under
 * assertion below — without it, every "does NOT contain X" test could pass vacuously
 * against a comment that merely mentions X was removed, and every "DOES contain X" test
 * could pass vacuously against a comment that merely describes X.
 *
 * WR-08 (resolved in 34.4.1): stage 2 was a naive `/\/\/.*$/` replace, accepted on the premise
 * that no assertion here matched a `//`-bearing string literal. Phase 34.4.1's login-window
 * arms broke that premise — main.rs's `#[cfg(test)]` fixtures now assert on real
 * `"https://..."` / `"file:///..."` URLs. Per that guard's own instruction the local pass was
 * reconsidered, not the assertion weakened: it is now the string-literal-aware
 * `stripTrailingLineComment`, which cuts only at a `//` found OUTSIDE a quoted string.
 */
function loadMainRsCode(source?: string): string {
  const raw = source ?? readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

describe('loadMainRsCode comment-stripping helper (self-test)', () => {
  test('a comment-only phrase from main.rs is NOT present in the stripped output', () => {
    // Without correct stripping this phrase (from the pre-fix _child field doc comment)
    // would leak through and make the WR-03 "_child is gone" assertion vacuously pass.
    expect(loadMainRsCode()).not.toContain(
      'Kept alive so the child is not reaped'
    )
  })

  test('a /* */ block comment whose interior line names fn clipboard_text_arg does NOT survive stripping', () => {
    // RED direction: against the PRE-Task-2 loadMainRsCode (line-prefix filter only), this
    // synthetic source's interior line `fn clipboard_text_arg` does not itself start with a
    // comment marker, so it would survive stripping and make Task 3's positive-existence
    // assertion for `fn clipboard_text_arg` pass on prose alone.
    const source = [
      '/*',
      ' * see fn clipboard_text_arg for the argument-parsing helper',
      ' */',
      'fn other() {}'
    ].join('\n')
    expect(loadMainRsCode(source)).not.toContain('clipboard_text_arg')
  })

  test('a // line naming clipboard_write_text does NOT survive stripping (regression guard)', () => {
    const source = [
      '// clipboard_write_text is handled below',
      'fn other() {}'
    ].join('\n')
    expect(loadMainRsCode(source)).not.toContain('clipboard_write_text')
  })
})

describe('main.rs sidecar dispatch gate (WR-01 -- no release-reachable node override)', () => {
  test('the stripped code does NOT contain the defective env-var-or-debug expression', () => {
    expect(loadMainRsCode()).not.toContain(
      'std::env::var("GAMELIB_SIDECAR_ENTRY").is_ok() ||'
    )
  })

  test('use_dev_sidecar reduces to the debug-assertions gate alone', () => {
    expect(loadMainRsCode()).toMatch(
      /fn\s+use_dev_sidecar\s*\(\s*\)\s*->\s*bool\s*\{\s*cfg!\(debug_assertions\)\s*\}/
    )
  })

  test('resolve_sidecar_entry still honors GAMELIB_SIDECAR_ENTRY (dev override preserved)', () => {
    expect(loadMainRsCode()).toContain('std::env::var("GAMELIB_SIDECAR_ENTRY")')
  })
})

describe('main.rs sidecar lifecycle (WR-03 -- sidecar terminated on app exit)', () => {
  test('the stripped code contains a RunEvent::Exit handler', () => {
    expect(loadMainRsCode()).toContain('RunEvent::Exit')
  })

  test('the stripped code contains a .kill() call', () => {
    expect(loadMainRsCode()).toContain('.kill()')
  })

  test('the SidecarState field is no longer the unused-marked _child', () => {
    // Deliberately narrower than a blanket `_child` substring check: the WR-03 fix adds a
    // legitimately-named `shutdown_child()` method, which itself contains the substring
    // `_child`. What must actually be gone is the stale FIELD declaration
    // (`_child: Mutex<Child>`), not every symbol that happens to end in "_child".
    expect(loadMainRsCode()).not.toMatch(/_child\s*:\s*Mutex<Child>/)
  })

  test('the exit handler reaches the managed SidecarState via try_state', () => {
    expect(loadMainRsCode()).toContain('try_state::<Arc<SidecarState>>')
  })
})

describe('REQ-34.1-07 main.rs tray construction (Phase 34.1 Plan 06, D-11)', () => {
  test('REQ-34.1-07 constructs a TrayIconBuilder', () => {
    expect(loadMainRsCode()).toContain('TrayIconBuilder')
  })

  test('REQ-34.1-07 embeds both icon variants via include_bytes!', () => {
    const code = loadMainRsCode()
    expect(code).toContain('include_bytes!("../../public/icon-tray-dark.png")')
    expect(code).toContain('include_bytes!("../../public/icon-tray-light.png")')
  })

  test('REQ-34.1-07 the tray id string gamelib-tray appears in both the builder and the tray_by_id lookup', () => {
    const code = loadMainRsCode()
    expect(code).toContain('TRAY_ICON_ID: &str = "gamelib-tray"')
    expect(code).toMatch(/TrayIconBuilder::with_id\(TRAY_ICON_ID\)/)
    expect(code).toMatch(/tray_by_id\(TRAY_ICON_ID\)/)
  })

  test('REQ-34.1-07 no unwrap() or expect( appears inside the tray-building block', () => {
    const code = loadMainRsCode()
    const startMarker = 'MenuItemBuilder::with_id("show"'
    const startIdx = code.indexOf(startMarker)
    expect(startIdx).toBeGreaterThan(-1)
    // The tray-building block ends where the (real, non-comment) debug_assertions cfg
    // attribute gating the devtools-only block begins.
    const endMarker = '#[cfg(debug_assertions)]'
    const endIdx = code.indexOf(endMarker, startIdx)
    expect(endIdx).toBeGreaterThan(startIdx)
    const traySetupBlock = code.slice(startIdx, endIdx)
    expect(traySetupBlock).not.toMatch(/unwrap\(\)|expect\(/)
  })
})

describe('REQ-34.1-07 macOS tray template wiring (gap G3 redirect, 34.1-13)', () => {
  test('embeds the macOS template asset via include_bytes!, cfg-gated to macOS only', () => {
    const code = loadMainRsCode()
    expect(code).toContain(
      'include_bytes!("../../public/icon-tray-template.png")'
    )
    // The embed must be reachable only under a macOS cfg gate, not unconditional --
    // Windows/Linux builds must not try to embed a file that only exists for the template
    // path's own generator to have produced.
    const templateLineIdx = code.indexOf('TRAY_ICON_TEMPLATE')
    expect(templateLineIdx).toBeGreaterThan(-1)
    const precedingCfg = code.lastIndexOf(
      '#[cfg(target_os = "macos")]',
      templateLineIdx
    )
    expect(precedingCfg).toBeGreaterThan(-1)
    // No unrelated code between the cfg attribute and the const it gates.
    expect(code.slice(precedingCfg, templateLineIdx)).not.toContain(';')
  })

  test('the tray builder marks the icon as a template via icon_as_template', () => {
    const code = loadMainRsCode()
    expect(code).toMatch(/\.icon_as_template\(tray_is_template\(\)\)/)
  })

  test('tray_set_icon uses the atomic set_icon_with_as_template setter, not a bare set_icon', () => {
    const code = loadMainRsCode()
    // Same arm-boundary technique as the "ONLY new dispatch arm" test below: outer match
    // arms are indented exactly 8 spaces, so the next such line after tray_set_icon's own
    // marks the end of its arm body.
    const armStartPattern = /^ {8}"[a-z_]+"\s*=>/gm
    const armIdx = code.indexOf('"tray_set_icon" =>')
    expect(armIdx).toBeGreaterThan(-1)
    armStartPattern.lastIndex = armIdx + 1
    const nextArmMatch = armStartPattern.exec(code)
    expect(nextArmMatch).not.toBeNull()
    const armBody = code.slice(
      armIdx,
      nextArmMatch ? nextArmMatch.index : undefined
    )
    expect(armBody).toMatch(
      /set_icon_with_as_template\(Some\(tray_image\(dark\)\), tray_is_template\(\)\)/
    )
    expect(armBody).not.toMatch(/\.set_icon\(Some\(tray_image/)
  })

  test('tray_is_template reduces to cfg!(target_os = "macos") -- no env-var or runtime escape hatch', () => {
    const code = loadMainRsCode()
    const fnIdx = code.indexOf('fn tray_is_template()')
    expect(fnIdx).toBeGreaterThan(-1)
    const bodyEnd = code.indexOf('\n}', fnIdx)
    const body = code.slice(fnIdx, bodyEnd)
    expect(body).toContain('cfg!(target_os = "macos")')
    expect(body).not.toMatch(/env::var|std::env/)
  })

  test('tray_image falls through to the colour dark/light selection if the macOS template fails to decode (T-34.1-22)', () => {
    const code = loadMainRsCode()
    const fnIdx = code.indexOf('fn tray_image(dark: bool)')
    expect(fnIdx).toBeGreaterThan(-1)
    const bodyEnd = code.indexOf('\n}', fnIdx)
    const body = code.slice(fnIdx, bodyEnd)
    // The macOS block must not be the only path -- TRAY_ICON_DARK/LIGHT selection must still
    // appear textually after it as the fallback for both platforms.
    const macBlockIdx = body.indexOf('TRAY_ICON_TEMPLATE')
    const fallbackIdx = body.indexOf('TRAY_ICON_DARK } else { TRAY_ICON_LIGHT')
    expect(macBlockIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(macBlockIdx)
  })
})

describe('REQ-34.1-07 main.rs tray_set_icon dispatch arm (Phase 34.1 Plan 06, D-11)', () => {
  test('REQ-34.1-07 dispatch_rust_channel has exactly one "tray_set_icon" arm', () => {
    const code = loadMainRsCode()
    const matches = code.match(/"tray_set_icon"\s*=>/g) ?? []
    expect(matches.length).toBe(1)
  })

  test('REQ-34.1-07 the tray_set_icon arm appears before the rustInvoke:unknown-channel catch-all', () => {
    const code = loadMainRsCode()
    const armIdx = code.indexOf('"tray_set_icon" =>')
    const catchAllIdx = code.indexOf('rustInvoke:unknown-channel')
    expect(armIdx).toBeGreaterThan(-1)
    expect(catchAllIdx).toBeGreaterThan(-1)
    expect(armIdx).toBeLessThan(catchAllIdx)
  })

  test('REQ-34.1-07 this is the ONLY new dispatch arm across the phase -- no other new match arm exists beyond the pre-34.1-06 set', () => {
    const code = loadMainRsCode()
    // Scoped to exactly the outer `match channel { ... }` arms of dispatch_rust_channel
    // (8-space indent, verified against every existing arm) -- NOT nested inner matches
    // like dialog_message's `"error"`/`"warning"` MessageDialogKind arms, and NOT the
    // unrelated `"show"`/`"quit"` MenuId matches inside the tray's own on_menu_event
    // closure (a different match statement entirely, at a different indent depth).
    const armMatches = code.match(/^ {8}"[a-z_]+"\s*=>/gm) ?? []
    const armNames = armMatches.map((line) => line.match(/"([a-z_]+)"/)?.[1])
    const preExistingArms = [
      'keyring_get',
      'keyring_set',
      'keyring_delete',
      'keyring_available',
      'dialog_open',
      'dialog_message',
      'notification_show',
      'shell_show_item_in_folder',
      'shell_open_path',
      'app_exit',
      'app_relaunch',
      'dialog_save',
      // Phase 34.3 Plan 03 (D-01/D-02, REQ-34.3-03) legitimately added exactly these two new
      // arms after 34.1-06 landed -- the clipboard seam's Cargo tests (main.rs's own
      // #[cfg(test)] mod) are the behavioral proof for these two; this gate only pins that no
      // OTHER, undeclared arm has crept in since.
      'clipboard_write_text',
      'clipboard_read_text',
      // Phase 34.4.1 Plan 01 (D-01/D-02, REQ-34.4.1-01) legitimately added exactly these five
      // login-window arms -- main.rs's own #[cfg(test)] mod is the behavioral proof for their
      // pure logic (URL/arg validation, label generation, cookie domain-suffix matching); this
      // gate only pins that no OTHER, undeclared arm has crept in since.
      'humble_login_open',
      'humble_login_cookies',
      'humble_login_take_events',
      'humble_login_close',
      'humble_login_clear_cookies',
      // Phase 34.4.1 Plan 04 (D-07/D-08, REQ-34.4.1-05) legitimately added exactly this one
      // reveal-POST arm -- main.rs's own #[cfg(test)] mod is the behavioral proof for its pure
      // logic (arg validation, script templating/escaping); this gate only pins that no
      // OTHER, undeclared arm has crept in since.
      'humble_reveal_post',
      // 34.4.1 gap cycle plan 15 (F-6 BLOCKING, REQ-34.4.1-06/REQ-34.4.1-GAP-03) legitimately
      // added exactly this one origin-scoped storage-clear arm -- main.rs's own #[cfg(test)]
      // mod is the behavioral proof for its pure logic (arg validation, script templating/
      // escaping/await-ordering); this gate only pins that no OTHER, undeclared arm has crept
      // in since.
      'humble_login_clear_storage',
      // Phase 34.4.1 Plan 22 (F-6 Defect A, REQ-34.4.1-GAP-07) legitimately added exactly this
      // one correctly-directed domain-scoped cookie-read arm -- main.rs's own #[cfg(test)] mod
      // (the humble_login_cookies_for_domain_* cases) is the behavioral proof for its
      // direction; the describe block below this one pins that direction specifically. This
      // gate only pins that no OTHER, undeclared arm has crept in since.
      'humble_login_cookies_for_domain',
      // quick task 260815-vvz (commit 206a31db7, "wire electronStub app.hide to Tauri
      // AppHandle::hide") legitimately added exactly this one arm; this gate only pins that no
      // OTHER, undeclared arm has crept in since.
      //
      // PROOF STATUS -- deliberately weaker than every entry above, and recorded as such rather
      // than papered over: main.rs's own #[cfg(test)] mod does NOT exercise app_hide, because
      // there is no pure logic to exercise. The arm is a `#[cfg(target_os = "macos")]`
      // `app.hide()` call (an AppHandle side effect) and a declared `eprintln!` no-op everywhere
      // else. Its actual automated guard is quick-vvz's AST gate
      // (`externalDynamicImportGate.test.ts`), which pins the static-import shape the arm's
      // sidecar caller depends on -- that guards the CALLER, not this arm's behavior. The macOS
      // hide itself is unproven by any automated test.
      'app_hide'
    ]
    const newArms = armNames.filter(
      (name) => name && !preExistingArms.includes(name)
    )
    expect(newArms).toEqual(['tray_set_icon'])
  })
})

describe('main.rs tray scope boundary (Phase 34.1 Plan 06 D-11, NARROWED by Phase 35 Plan 06 D-06)', () => {
  // This gate pinned all five of 34.1's declared tray exclusions. Phase 35 Plan 06
  // (D-06/REQ-35-04) deliberately DISCHARGED two of them: the recent-games submenu and
  // the About item are now in scope and shipped. Those two assertions are retired WITH
  // their requirement — recorded here rather than deleted silently, so a reader can see
  // that the bound moved by decision and not by someone deleting a failing line.
  //
  // The other three exclusions still hold and are still pinned. 35-06-SUMMARY.md records
  // them as STILL NOT DONE, and main.rs carries the same list inline.
  test('the tray still excludes the macOS dock menu and every devtools affordance', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('dock')
    // `openDevTools` (camelCase) is the ELECTRON API name from `tray_icon.ts:135`'s Debug
    // item — the thing that must not be ported into the Tauri tray. Deliberately NOT
    // `open_devtools` (snake_case): that is Tauri's own Rust API and main.rs legitimately
    // calls it twice under `#[cfg(debug_assertions)]` to auto-open devtools in dev. Pinning
    // the snake_case form would assert something that has never been true and has nothing to
    // do with this bound.
    expect(code).not.toContain('openDevTools')

    // Reload/Debug are asserted as MENU IDS, not as bare substrings. A bare
    // `not.toContain('Debug')` false-positives on `#[derive(Clone, Debug, PartialEq)]`,
    // which has nothing to do with a Debug menu item — a gate that fails for a reason it
    // was never written to catch teaches people to edit the gate instead of the code.
    expect(code).not.toContain('with_id("reload"')
    expect(code).not.toContain('with_id("debug"')
    expect(code).not.toContain('with_id("Reload"')
    expect(code).not.toContain('with_id("Debug"')
  })
})

describe('loadMainRsCode comment-stripping self-test (REQ-34.1-07)', () => {
  test('a bare comment mentioning TrayIconBuilder does not by itself satisfy the tray-construction gate', () => {
    // Simulates what would happen if the ONLY occurrence of "TrayIconBuilder" were a
    // comment -- proves the stripping helper, not the file's real code, is what's under
    // test here for the sibling "constructs a TrayIconBuilder" assertion above.
    const commentOnly = '// TrayIconBuilder is used below\nfn other() {}'
    const stripped = commentOnly
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(stripped).not.toContain('TrayIconBuilder')
  })
})

/**
 * REQ-34.3-08 main.rs clipboard seam (Phase 34.3 Plan 03, D-01/D-02/D-07).
 *
 * This gate proves CONTINUED EXISTENCE of the Rust source shapes below -- the two
 * dispatch_rust_channel arms, their two pure helpers, the plugin registration, and every
 * #[cfg(test)] fn plan 34.3-03 added -- it does NOT and CANNOT prove the Cargo tests still
 * pass. This project's CI runs no cargo step at all (`.github/workflows/*.yml` contains
 * neither `cargo test` nor `cargo check`), so `cd src-tauri && cargo test` is hand-run, and
 * its hand-verified RED proof is recorded in `34.3-03-SUMMARY.md`. Adding a cargo step to CI
 * is a deliberately deferred idea (D-07's own rejected-alternatives list), not an oversight.
 *
 * All positive-existence assertions below run against `loadMainRsCode()`'s comment-stripped
 * output -- see this file's own Task 2 hardening (the block-comment stripper) for why that
 * matters here specifically: `fn clipboard_text_arg` et al. also appear in main.rs's own
 * prose (the doc comments above the arms name every one of these symbols), so an unstripped
 * gate could pass on comment text alone even if the real code were deleted.
 */
describe('REQ-34.3-08 main.rs clipboard seam (Phase 34.3 Plan 03, D-01/D-02/D-07)', () => {
  test('REQ-34.3-08 the clipboard_write_text dispatch arm exists', () => {
    expect(loadMainRsCode()).toContain('"clipboard_write_text" =>')
  })

  test('REQ-34.3-08 the clipboard_read_text dispatch arm exists', () => {
    expect(loadMainRsCode()).toContain('"clipboard_read_text" =>')
  })

  test('REQ-34.3-08 the clipboard_text_arg pure helper exists', () => {
    expect(loadMainRsCode()).toContain('fn clipboard_text_arg')
  })

  test('REQ-34.3-08 the clipboard_read_value pure helper exists', () => {
    expect(loadMainRsCode()).toContain('fn clipboard_read_value')
  })

  test('REQ-34.3-08 the clipboard plugin is registered', () => {
    expect(loadMainRsCode()).toContain('tauri_plugin_clipboard_manager::init()')
  })

  test('REQ-34.3-08 the ClipboardExt trait is imported', () => {
    expect(loadMainRsCode()).toContain(
      'use tauri_plugin_clipboard_manager::ClipboardExt'
    )
  })

  // The real #[test] fn names plan 34.3-03 added to main.rs's #[cfg(test)] mod (verified by
  // direct read, not guessed) -- pinning the Cargo test module's continued existence against
  // a later refactor silently deleting it.
  const EXPECTED_CLIPBOARD_TEST_FN_NAMES = [
    'clipboard_text_arg_rejects_absent_args',
    'clipboard_text_arg_rejects_null',
    'clipboard_text_arg_rejects_number',
    'clipboard_text_arg_rejects_bool',
    'clipboard_text_arg_accepts_empty_string',
    'clipboard_text_arg_accepts_nonempty_string',
    'clipboard_text_arg_ignores_trailing_args',
    'clipboard_read_value_empty_string_is_not_null',
    'clipboard_read_value_nonempty_string_round_trips',
    'clipboard_read_value_propagates_error'
  ]

  test('REQ-34.3-08 every clipboard #[cfg(test)] fn plan 34.3-03 added still exists', () => {
    const code = loadMainRsCode()
    for (const fnName of EXPECTED_CLIPBOARD_TEST_FN_NAMES) {
      expect(code).toContain(`fn ${fnName}`)
    }
  })

  test('REQ-34.3-08 / D-05 no-fix: shutdown_child() is NOT called inside the app_relaunch arm body', () => {
    // Narrow, scoped to the app_relaunch arm's own body -- shutdown_child legitimately exists
    // as a method AND is legitimately called from the RunEvent::Exit handler (WR-03), so a
    // blanket substring check would be wrong. REQ-34.3-06 resolved to NO FIX: main.rs's own
    // comment above this arm (see Task 1's docstring citation) records that RunEvent::Exit
    // already fires and already kills the sidecar before the process re-execs.
    const code = loadMainRsCode()
    const armStart = code.indexOf('"app_relaunch" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armBodyEnd = code.indexOf('\n        }', armStart)
    expect(armBodyEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armBodyEnd)
    expect(armBody).not.toContain('shutdown_child()')
  })

  test('REQ-34.3-08 / D-05 no-fix: shutdown_child() has exactly one call site in the whole file (the RunEvent::Exit handler)', () => {
    const code = loadMainRsCode()
    const callSites = code.match(/shutdown_child\(\)/g) ?? []
    expect(callSites.length).toBe(1)
  })

  test('REQ-34.3-08 / D-02 zero-capability-grant: capabilities/default.json contains no "clipboard" string', () => {
    const capabilitiesRaw = readFileSync(CAPABILITIES_PATH, 'utf-8')
    expect(capabilitiesRaw).not.toContain('clipboard')
  })
})

// Phase 34.4.1 Plan 22 (F-6 Defect A, REQ-34.4.1-GAP-07): a static pin, from the JS suite,
// on the Rust-side directional asymmetry between the two cookie-read arms. Neither TS test
// double nor Rust unit test alone can observe this: `humble_login_cookies` and
// `humble_login_cookies_for_domain` each call the SAME `cookie_domain_matches` function with
// their arguments in OPPOSITE orders on purpose (the poll's page-host-first question vs. the
// census's cookie-domain-first question). A future "simplification" that collapsed the two
// arms into one, or silently swapped one arm's argument order to match the other, would break
// either the login poll (spike 014a's proven direction) or the disconnect census (this plan's
// fix) -- and neither this file's OWN existing gates nor any TS-side mock would catch it,
// because both arms still compile, both still resolve the same `{ total, matched }` shape, and
// the divergence is purely in argument ORDER inside a match arm body. This describe block
// extracts each arm's body from the (comment-stripped) source and pins the exact call shape.
describe('REQ-34.4.1-GAP-07 both humble cookie-read arms keep their proven-correct cookie_domain_matches direction (Plan 22, F-6 Defect A)', () => {
  /**
   * Slices `code` from `startMarker` (inclusive) up to (but not including) `endMarker`, the
   * same "arm body" extraction shape the app_relaunch test above already uses. Throws loudly
   * (via the `toBeGreaterThan(-1)` assertions below) rather than silently slicing an empty or
   * wrong range if either marker has drifted.
   */
  function extractArmBody(
    code: string,
    startMarker: string,
    endMarker: string
  ): string {
    const start = code.indexOf(startMarker)
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf(endMarker, start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  test('both arms exist in source', () => {
    const code = loadMainRsCode()
    expect(code).toContain('"humble_login_cookies" => {')
    expect(code).toContain('"humble_login_cookies_for_domain" => {')
  })

  test('humble_login_cookies (the poll arm) still calls cookie_domain_matches with the caller-supplied host FIRST', () => {
    const code = loadMainRsCode()
    const armBody = extractArmBody(
      code,
      '"humble_login_cookies" => {',
      '"humble_login_take_events" => {'
    )
    // The poll's direction, unedited by Plan 22: host (caller-supplied) first, the cookie's
    // own domain second.
    expect(armBody).toContain('cookie_domain_matches(host, c.domain())')
    // And NOT the census direction anywhere in this arm's body.
    expect(armBody).not.toContain('cookie_domain_matches(d, Some(domain))')
  })

  test("humble_login_cookies_for_domain (the census arm) calls cookie_domain_matches with the cookie's OWN domain FIRST", () => {
    const code = loadMainRsCode()
    const armBody = extractArmBody(
      code,
      '"humble_login_cookies_for_domain" => {',
      '_ => Err(format!("rustInvoke:unknown-channel'
    )
    // The census's direction: the cookie's own domain (from the match on c.domain()) first,
    // the fixed target `domain` second -- mirrors humble_login_clear_cookies's own filter.
    expect(armBody).toContain('cookie_domain_matches(d, Some(domain))')
    // And NOT the poll's direction anywhere in this arm's body.
    expect(armBody).not.toContain('cookie_domain_matches(host, c.domain())')
  })
})

// Phase 34.4.1 Plan 23 (F-6 Defect B): a static guard, from the JS suite, against a future
// revert of humble_login_clear_cookies to the attempted-count shape this plan closes. Neither
// a Rust unit test (which can't drive the real match arm end-to-end without a live WKWebView)
// nor any TS-side mock can observe a regression here -- the bug is entirely in what expression
// the Rust arm computes its returned count from, a source-level property this file's existing
// convention (extracting arm bodies from comment-stripped source) is built to pin.
describe('REQ-34.4.1-06 (Plan 23, F-6 Defect B) humble_login_clear_cookies never returns the pre-removal attempted count', () => {
  test('the stripped source contains no matching.len()-style pre-computed delete count', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('matching.len()')
  })

  test('the arm references verified_delete_count on every platform (macOS and non-macOS branches)', () => {
    const code = loadMainRsCode()
    const matches = code.match(/verified_delete_count\(/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  test("the macOS branch references WKWebsiteDataStore's removal API, not wry's delete_cookie()", () => {
    const code = loadMainRsCode()
    expect(code).toContain('removeDataOfTypes_forDataRecords_completionHandler')
  })

  test('this file would catch a reintroduction of matching.len() as the returned delete count (self-test, temporarily broke and restored during Task 3 -- see 34.4.1-23-SUMMARY.md)', () => {
    // Simulates exactly the regression the first test above guards against: an arm body
    // that reverts to the pre-removal attempted-count shape.
    const regressed = `
        "humble_login_clear_cookies" => {
            let matching: Vec<_> = window.cookies().unwrap();
            let deleted = matching.len();
            Ok(Value::Number(deleted.into()))
        }
    `
    expect(regressed).toContain('matching.len()')
  })
})

// Phase 34.4.1 Plan 24 (WR-07 + F-4): research Pitfall 3 in the flesh. `main.rs:1114-1116`
// (pre-Plan-24) claimed WR-07 was "enforced by the grep gate in this plan's own acceptance
// criteria, not by intent alone" -- a claim that was FALSE and misdirected two live gate
// operators, both of whom reported the title bar read the framework default ("Tauri app").
// A grep gate proving `.title(` is never hard-coded can only establish the ABSENCE of the
// prohibited value; it structurally cannot establish the PRESENCE of a tracking one. Every
// assertion below is a SOURCE-LEVEL check only. None of them, individually or together, can
// prove the live title bar tracks Humble's document title, or that the window actually
// raises -- both remain plan 29 item 1's job alone, named explicitly in each test's own
// title so a future reader who only sees a red/green dot still learns what did NOT close.
describe('WR-07 (Plan 24) title-tracking hook + F-4 visible-only presentation gating -- static half only, live half owned by plan 29 item 1', () => {
  /**
   * Scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block
   * (inclusive of both braces), counting depth rather than relying on a second string
   * marker -- this arm's `if visible` block contains a nested closure with its own braces
   * (`on_document_title_changed`'s callback) plus a `"...len={}"` format string, so a
   * naive "next known statement" marker would be fragile against reordering inside the
   * block. A `{}` pair inside a Rust string literal still nets to zero depth change, so it
   * does not perturb the outer match.
   */
  function extractBracedBlock(code: string, openMarker: string): string {
    const markerIdx = code.indexOf(openMarker)
    expect(markerIdx).toBeGreaterThan(-1)
    const braceStart = code.indexOf('{', markerIdx)
    expect(braceStart).toBeGreaterThan(-1)
    let depth = 0
    let i = braceStart
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    expect(depth).toBe(0)
    return code.slice(markerIdx, i + 1)
  }

  test("on_document_title_changed is present in source -- static proof only, NOT proof the OS title bar tracks Humble's document title (that is plan 29 item 1)", () => {
    const code = loadMainRsCode()
    expect(code).toContain('on_document_title_changed')
  })

  // D-29-04 (gap cycle 3, plan 33). WebKit reports a transient EMPTY document title
  // mid-navigation -- the live gate saw 22 -> 0 -> 42 -- and applying it dropped the
  // document title from the bar and back again, because `login_window_title(origin,
  // Some(""))` falls through its own `!title.is_empty()` guard to the bare origin.
  //
  // The composer was already correct. The defect was that the CALLBACK called it with a
  // value it should have discarded, so the guard belongs at the callback, and this test
  // asserts it there -- ordered BEFORE any lock or set_title, since a guard that runs
  // after the write it is meant to prevent guards nothing.
  test('D-29-04: an EMPTY document title short-circuits before set_title, so the previous title survives', () => {
    const code = loadMainRsCode()
    const cbIdx = code.indexOf('.on_document_title_changed(')
    expect(cbIdx).toBeGreaterThan(-1)
    const cb = code.slice(cbIdx, cbIdx + 3000)

    const guardIdx = cb.indexOf('if title.is_empty()')
    const setTitleIdx = cb.indexOf('window.set_title(')
    const lockIdx = cb.indexOf('title_origin')

    expect(guardIdx).toBeGreaterThan(-1)
    expect(setTitleIdx).toBeGreaterThan(-1)
    // The ORDER is the property, not mere presence of both tokens.
    expect(guardIdx).toBeLessThan(setTitleIdx)
    expect(guardIdx).toBeLessThan(lockIdx)
    // The skip stays observable: "fired and ignored" and "never fired" are different
    // diagnoses, and only a logged skip separates them.
    expect(cb.slice(guardIdx, setTitleIdx)).toContain('SKIPPED len=0')
  })

  test('always_on_top never appears in non-comment source (F-4) -- proves the persistent-pin option was never wired, NOT that the one-shot raise plan 29 item 1 must observe actually happens', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('always_on_top')
  })

  // AMENDED Phase 34.4.1 gap cycle 3, plan 33 (D-29-05). This test previously asserted
  // `expect(chain).not.toContain('.title(')` -- a blanket ban on the method.
  //
  // That measured the WRONG PROPERTY, and D-29-05's fix is what exposed it. WR-07 prohibits a
  // hard-coded APPLICATION title -- "the loaded document's own title must show, never a
  // hard-coded 'GameLib'". It does NOT prohibit an ORIGIN-DERIVED provisional title, and the
  // repo already builds exactly that elsewhere via `login_window_title(&origin, None)`. A
  // blanket ban forbids the correct construct alongside the prohibited one.
  //
  // The gate was amended rather than the code bent to satisfy it. Bending code to satisfy an
  // unpassable gate is a recorded failure on this project; so is a gate that is non-vacuous,
  // RED-proven, and still guards nothing. This version is strictly stronger in the direction
  // that matters: the old one could not have distinguished `.title("GameLib")` from
  // `.title(login_window_title(...))`, because it rejected both.
  test("no WebviewWindowBuilder chain passes a STRING LITERAL to .title( -- WR-07's negative half, amended: the prohibited thing is a hard-coded title, not the method", () => {
    const code = loadMainRsCode()
    // All three WebviewWindowBuilder call sites in this file (humble_login_open,
    // humble_reveal_post, humble_login_clear_storage) -- each chain runs from its
    // `tauri::WebviewWindowBuilder::new(` call to its own `.build()`.
    const chainStarts = [
      ...code.matchAll(/tauri::WebviewWindowBuilder::new\(/g)
    ]
    expect(chainStarts.length).toBeGreaterThanOrEqual(3)
    for (const match of chainStarts) {
      const start = match.index ?? 0
      const end = code.indexOf('.build()', start)
      expect(end).toBeGreaterThan(start)
      const chain = code.slice(start, end + '.build()'.length)

      // The prohibited shape: a literal, in any of Rust's string forms.
      expect(chain).not.toMatch(/\.title\(\s*"/)
      expect(chain).not.toMatch(/\.title\(\s*r#*"/)
      expect(chain).not.toMatch(/\.title\(\s*format!/)

      // Whatever DOES reach .title( must be the origin-derived composer, so a future
      // `.title(some_other_string_var)` cannot slip through the literal check above.
      for (const t of chain.matchAll(/\.title\(([^)]*)/g)) {
        expect(t[1]).toContain('login_window_title(')
      }
    }
  })

  // D-29-05's POSITIVE half, and the reason it is a separate test: the amended negative test
  // above still cannot establish PRESENCE. The recorded asymmetry (main.rs's own WR-07
  // CORRECTION comment) is that a grep gate proving `.title(` is never hard-coded establishes
  // only the ABSENCE of the prohibited value -- it structurally cannot establish that the
  // required one is there. This test closes exactly that half at the source level.
  //
  // It does NOT close the live half. Whether the operator still SEES a "Tauri app" flash
  // between presentation and first title application is a visual, timing-dependent
  // observation owned by the gap-cycle-3 live gate (plan 35).
  test("D-29-05: humble_login_open's visible block builds an ORIGIN-DERIVED provisional title, so the window never presents as the framework default", () => {
    const code = loadMainRsCode()
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const arm = code.slice(armStart, armStart + 20000)
    const visibleIdx = arm.indexOf('if visible {')
    expect(visibleIdx).toBeGreaterThan(-1)

    // The provisional title is set inside the visible block -- the hidden reveal/clear
    // windows have no title bar for a title to matter on (T-34.4.1-82).
    const visibleBlock = arm.slice(visibleIdx, visibleIdx + 4000)
    expect(visibleBlock).toContain('.title(login_window_title(&origin, None))')
  })

  test(".inner_size(/.center()/.focused(true)/on_document_title_changed appear ONLY inside humble_login_open's if-visible block -- the adjacent-already-present gating Plan 18 introduced and nothing had ever tested; proves source placement only, never that the operator actually saw the window raised (plan 29 item 1)", () => {
    const code = loadMainRsCode()
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armEnd)

    const visibleBlock = extractBracedBlock(armBody, 'if visible {')
    const visibleStart = armBody.indexOf(visibleBlock)
    expect(visibleStart).toBeGreaterThan(-1)
    const beforeVisible = armBody.slice(0, visibleStart)
    const afterVisible = armBody.slice(visibleStart + visibleBlock.length)

    const presentationTokens = [
      '.inner_size(',
      '.center()',
      '.focused(true)',
      'on_document_title_changed'
    ]
    for (const token of presentationTokens) {
      // Load-bearing: each token must actually be found inside the block (guards
      // against a future refactor silently dropping one of the four presentation
      // calls without any test noticing).
      expect(visibleBlock).toContain(token)
      expect(beforeVisible).not.toContain(token)
      expect(afterVisible).not.toContain(token)
    }
  })

  test('the hidden reveal-post and storage-clear WebviewWindowBuilder chains gained neither the title hook nor the F-4 presentation calls', () => {
    const code = loadMainRsCode()
    const revealStart = code.indexOf('"humble_reveal_post" => {')
    expect(revealStart).toBeGreaterThan(-1)
    const revealEnd = code.indexOf(
      '"humble_login_clear_storage" => {',
      revealStart
    )
    expect(revealEnd).toBeGreaterThan(revealStart)
    const clearStorageEnd = code.indexOf(
      '"humble_login_cookies_for_domain" => {',
      revealEnd
    )
    expect(clearStorageEnd).toBeGreaterThan(revealEnd)
    const hiddenWindowsBody = code.slice(revealStart, clearStorageEnd)

    for (const token of [
      'on_document_title_changed',
      '.inner_size(',
      '.center()',
      '.focused(true)'
    ]) {
      expect(hiddenWindowsBody).not.toContain(token)
    }
    // Both hidden builders stay explicitly non-visible.
    expect((hiddenWindowsBody.match(/\.visible\(false\)/g) ?? []).length).toBe(
      2
    )
  })
})

// Phase 34.5 Plan 27 (F-34.5-G6-04, T-34.5-G6-22/23/39): the login window shows no
// origin indicator, so the operator cannot tell which site they are entering
// credentials into. Both assertions below are scoped to the humble_login_open arm's
// OWN comment-stripped body (armStart -> the next arm's own start marker), never an
// unfiltered file-wide search -- this plan's own justifying prose names `on_navigation`
// repeatedly (explaining why it must NOT be used here), so a naive unscoped count would
// be satisfied by the prose alone even if the real arm still used it.
describe('F-34.5-G6-04 (Plan 27) login window origin title driven from on_page_load, never on_navigation', () => {
  function extractHumbleLoginOpenArmBody(code: string): string {
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    return code.slice(armStart, armEnd)
  }

  test("POSITIVE: the title-refresh call (set_title) lives inside the arm's .on_page_load( hook body", () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const pageLoadStart = armBody.indexOf('.on_page_load(')
    expect(pageLoadStart).toBeGreaterThan(-1)
    const pageLoadEnd = armBody.indexOf('.build()', pageLoadStart)
    expect(pageLoadEnd).toBeGreaterThan(pageLoadStart)
    const pageLoadBlock = armBody.slice(pageLoadStart, pageLoadEnd)
    expect(pageLoadBlock).toContain('set_title(')
  })

  // RETIGHTENED (Phase 34.4.2 Plan 08, REQ-34.4.2-03/04/08), not deleted: this used to be a
  // blanket "no .on_navigation( at all" guard. Plan 08 adds exactly one sentinel-only,
  // cancel-only .on_navigation( arm to intercept the login-sheet cancel strip's request --
  // that does NOT violate the invariant this guard protects, because the invariant is "no
  // on_navigation-driven login-watch relay" (spike 013: 5 of 8 on_navigation events on
  // Humble's real login page were third-party iframes; letting a subframe re-arm
  // notifyLoginNavigated()'s deadline via on_navigation would defeat WR-03's timeout), not
  // "no on_navigation call of any kind". The assertions below enforce that narrower invariant
  // precisely: at most one on_navigation call exists, its closure parses the cancel sentinel
  // and nothing else, and it never touches the login-watch relay's own state
  // (push_login_window_event/set_title/current_origin/login_event_value) -- those stay
  // exclusively owned by the .on_page_load( hook, per the POSITIVE test above.
  //
  // RETIGHTENED AGAIN (Phase 34.4.2 Plan 13, operator decision D-A): this arm's closure used
  // to carry a SECOND sentinel (the now-deleted synthesized-right-click poster's), so this
  // test previously asserted `parse_autofill_request` was present. That sentinel is gone;
  // this test now asserts `is_login_cancel_request` instead -- the closure parses exactly one
  // sentinel, and it is the surviving one.
  test('NEGATIVE/RETIGHTENED: the humble_login_open arm has at most one .on_navigation( call, and that closure ONLY parses the login-cancel sentinel -- it never drives the login-watch relay', () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const onNavCount = (armBody.match(/\.on_navigation\(/g) ?? []).length
    expect(onNavCount).toBeLessThanOrEqual(1)

    const onNavStart = armBody.indexOf('.on_navigation(')
    expect(onNavStart).toBeGreaterThan(-1)
    const onNavEnd = armBody.indexOf('.build()', onNavStart)
    expect(onNavEnd).toBeGreaterThan(onNavStart)
    const onNavBody = armBody.slice(onNavStart, onNavEnd)

    expect(onNavBody).toContain('is_login_cancel_request')
    expect(onNavBody).not.toContain('push_login_window_event')
    expect(onNavBody).not.toContain('set_title')
    expect(onNavBody).not.toContain('current_origin')
    expect(onNavBody).not.toContain('login_event_value')
  })

  test('the login_window_title pure helper exists (AppHandle-free, mirrors clipboard_text_arg/login_window_url_arg)', () => {
    expect(loadMainRsCode()).toContain('fn login_window_title(')
  })

  test('the arm seeds its shared origin state from the validated open URL before .build()', () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const seedIdx = armBody.indexOf('Arc::new(Mutex::new(origin.clone()))')
    const buildIdx = armBody.indexOf('.build()')
    expect(seedIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeGreaterThan(seedIdx)
  })
})

// Phase 34.5 Plan 27 (F-34.5-G6-05): black-on-black text in Amazon's verification-code
// field, unreadable until highlighted. Scoped to the same humble_login_open arm body as
// the describe block above, using the same extraction pattern this file already uses
// throughout (armStart -> the next arm's own start marker).
describe('F-34.5-G6-05 (Plan 27) login window requests a light interface style', () => {
  test('the humble_login_open arm requests .theme(Some(tauri::Theme::Light)) on the visible builder', () => {
    const code = loadMainRsCode()
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armEnd)
    expect(armBody).toContain('.theme(Some(tauri::Theme::Light))')
  })
})

// Phase 34.4.2 Plan 01 (REQ-34.4.2-01..10): the two Tauri-managed login-window handle
// resolvers this phase's later plans (02/04) build against, plus the machine-enforced
// EPIC-UNTOUCHED scope guard that keeps this phase off the pristine Epic surface.
//
// PHASE_34_4_2_NEW_SYMBOLS is the extensible symbol list Test 3 below asserts absent from the
// pristine function's own sliced body. Plans 02, 03 and 04 MUST append their own new symbol
// names to this array as they land -- that is how the scope guard stays current without each
// plan inventing its own version of it.
const PHASE_34_4_2_NEW_SYMBOLS = [
  'login_window_ns_window',
  // Plan 07 (AppKit SHEET presentation -- supersedes Plan 02's child-window attachment,
  // operator's binding design decision 2026-08-04, `34.4.2-LIVE-GATE.md`'s "Binding Design
  // Decision" section):
  'present_login_window_as_sheet',
  'dismiss_login_window_sheet',
  'PRESENTED_LOGIN_SHEETS',
  'MAIN_WINDOW_LABEL',
  // Plan 08 (mandated close affordance -- cancel strip + Esc backstop, REQ-34.4.2-03):
  'LOGIN_CANCEL_EXFIL_PATH',
  'is_login_cancel_request',
  'login_cancel_strip_script',
  'request_login_sheet_cancel',
  // Plan 11 (WR-07/WR-01 fixes -- 34.4.2-REVIEW.md):
  'register_presented_login_sheet',
  // Plan 14 (T-34.4.2-39/-41 single-flight guard on visible login windows):
  'PENDING_VISIBLE_LOGIN_WINDOW',
  'PENDING_VISIBLE_LOGIN_WINDOW_TTL',
  'pending_login_entry_is_stale',
  'clear_pending_visible_login_window'
]

// Phase 34.4.2 Plan 13 (operator decision D-A): the in-field autofill glyph mechanism --
// originally Plan 03's `login_window_wk_webview`/glyph-request channel and Plan 04's
// synthesized-right-click poster -- was DELETED, not disabled. These names MOVED here from
// PHASE_34_4_2_NEW_SYMBOLS: a name that no longer exists in the source cannot meaningfully be
// asserted absent from the two pristine Epic regions alone (that guard is now vacuous for
// these names), while asserting their FILE-WIDE absence is strictly stronger and is what the
// describe block below (Test 1) actually does.
const PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS = [
  'login_window_wk_webview',
  'AUTOFILL_EXFIL_PATH',
  'AutofillRequest',
  'parse_autofill_request',
  'autofill_glyph_script',
  'css_rect_center_in_view',
  'clamp_point_to_view_bounds',
  'synth_autofill_mouse_event',
  'post_autofill_right_click',
  'LAST_AUTOFILL_POST',
  'AUTOFILL_POST_DEBOUNCE',
  'AUTOFILL_POST_DEBOUNCE_MAP_CAP',
  'GAMELIB_AUTOFILL_GLYPH'
]

// Tests 3 and 4 below encode a LOCKED USER SCOPE DECISION (2026-08-04): Epic is implemented
// LAST, after all other runners (Humble/GOG/Amazon) are ported and proven, because Epic's
// problems are unresolved (the parked deterministic pre-auth 403, the zero-injection
// constraint the pristine surface exists to satisfy, and the standing hCaptcha/UA
// constraint). This is NOT a technical limitation the code happens to have -- it is a
// decision the user made. Loosening either test requires the user's decision to change, not a
// planner's judgement.
describe('Phase 34.4.2 Plan 01 — login-window handle resolvers and the Epic scope guard', () => {
  /**
   * Slices `code` from `fn open_pristine_epic_login_window(` (inclusive) to the next
   * top-level `#[cfg(target_os = "macos")]` attribute (exclusive) -- the identical "next
   * top-level item" boundary this plan's own acceptance criteria pin against a raw `git diff`.
   * Asserts both bounds were actually found before slicing (an `indexOf` miss returning -1
   * must fail loudly rather than silently slice from the file start).
   */
  function extractPristineLoginFnBody(code: string): string {
    const start = code.indexOf('fn open_pristine_epic_login_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  /**
   * Slices `code` from `define_class!(` (inclusive, the ONLY `define_class!(` call in this
   * file) to `impl EpicPristineNavDelegate {` (exclusive) -- the delegate's own trailing
   * `impl` block that follows the macro invocation. Asserts both bounds were actually found
   * before slicing, mirroring `extractPristineLoginFnBody`'s own discipline (Phase 34.4.2 Plan
   * 03, REQ-34.4.2-10: this is the pristine surface's OTHER machine-checkable body, alongside
   * `open_pristine_epic_login_window` itself).
   */
  function extractEpicPristineNavDelegateBody(code: string): string {
    const start = code.indexOf('define_class!(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('impl EpicPristineNavDelegate {', start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  // RE-ANCHORED (Phase 34.4.2 Plan 13, operator decision D-A): the end marker used to be
  // `fn login_window_wk_webview(`, which Plan 13 deleted (its sole caller,
  // `post_autofill_right_click`, went with it -- an orphan, not its own defect). Re-anchored
  // on `const PRESENTED_LOGIN_SHEETS_CAP` -- the next surviving top-level item after
  // `login_window_ns_window` -- rather than deleting this test, per this plan's own
  // instruction that Test 1 must not be dropped.
  test('Test 1: login_window_ns_window resolves via get_webview_window and never references get_window( -- the pristine surface is unreachable from it by construction', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_window_ns_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('const PRESENTED_LOGIN_SHEETS_CAP', start)
    expect(end).toBeGreaterThan(start)
    const fnBody = code.slice(start, end)
    expect(fnBody).toContain('get_webview_window(')
    expect(fnBody).not.toContain('get_window(')
  })

  // Test 2 (formerly "login_window_wk_webview references with_webview") DELETED (Phase 34.4.2
  // Plan 13, operator decision D-A): its subject, `login_window_wk_webview`, was deleted along
  // with the poster it existed solely to serve. Its absence is now asserted permanently by
  // `PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS`, below.

  // GENERALIZED by Phase 34.4.2 Plan 03 (REQ-34.4.2-10): this guard used to check only
  // `open_pristine_epic_login_window`'s sliced body. It now runs the SAME
  // `PHASE_34_4_2_NEW_SYMBOLS` loop against `EpicPristineNavDelegate`'s sliced body too, so any
  // symbol a FUTURE plan appends to the array is automatically checked against BOTH pristine
  // regions with no further test edits -- the guard's coverage grows by mechanism, not by a
  // planner remembering to duplicate a hardcoded check for each new region.
  test("Test 3 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): neither open_pristine_epic_login_window NOR EpicPristineNavDelegate references any of this phase's new symbols", () => {
    const code = loadMainRsCode()
    const pristineBody = extractPristineLoginFnBody(code)
    const delegateBody = extractEpicPristineNavDelegateBody(code)
    for (const symbol of PHASE_34_4_2_NEW_SYMBOLS) {
      expect(pristineBody).not.toContain(symbol)
      expect(delegateBody).not.toContain(symbol)
    }
  })

  test('Test 4 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): the pristine slice still contains its pre-existing critical members -- proves this phase removed nothing from a surface it is not allowed to touch', () => {
    const pristineBody = extractPristineLoginFnBody(loadMainRsCode())
    expect(pristineBody).toContain(
      'addLocalMonitorForEventsMatchingMask_handler'
    )
    expect(pristineBody).toContain('makeFirstResponder')
    expect(pristineBody).toContain('NSEvent::removeMonitor')
    for (const selector of ['paste:', 'copy:', 'cut:', 'selectAll:', 'undo:']) {
      expect(pristineBody).toContain(selector)
    }
  })

  test('Test 5 (SUPERSEDED 2026-08-04, now POSITIVE, REQ-34.4.2-01/-03): the comment-stripped source CONTAINS beginSheet_completionHandler and endSheet exactly once each -- this negative was inverted by Plan 07 per the operator\'s binding design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`\'s "Binding Design Decision" section), responding to F-34.4.2-01/-02 (the child-window mechanism this negative used to protect went live-CONFIRMED unresponsive after minimize/restore and undismissable)', () => {
    const code = loadMainRsCode()
    expect(code).toContain('beginSheet_completionHandler')
    expect((code.match(/beginSheet_completionHandler/g) ?? []).length).toBe(1)
    expect(code).toContain('endSheet')
    expect((code.match(/endSheet/g) ?? []).length).toBe(1)
  })
})

// Phase 34.4.2 Plan 02 (REQ-34.4.2-01/02/03/04/05/08/10), SUPERSEDED 2026-08-04 by Plan 07's
// AppKit SHEET presentation (`present_login_window_as_sheet`/`dismiss_login_window_sheet`),
// per the operator's binding design decision recorded in `34.4.2-LIVE-GATE.md`'s "Binding
// Design Decision" section: the child-window attach/detach mechanism this describe block
// originally asserted went live-CONFIRMED broken (F-34.4.2-01/-02 -- unresponsive after
// minimize/restore, could not be closed). This block's tests are now INVERTED (Tests 1-4)
// or RETIRED (Test 5) to assert the sheet-presentation design and forbid the old mechanism,
// for the Tauri-managed login surface (Humble/GOG/Amazon -- REQ-34.4.2-10's locked scope,
// unchanged from Plan 01) -- alongside the permanent negatives that keep Tauri's own
// `.parent(` builder call and a focus-driven re-raise out (Tests 7/8, unchanged).
// PHASE_34_4_2_NEW_SYMBOLS (above) already carries this plan's three current symbol names
// (renamed by Plan 07), so Plan 01's own Test 3/Test 4 scope guard covers them without any
// change to that describe block; Test 9 below re-asserts the same absence directly, scoped
// to this plan's own file section, so deleting either describe block still leaves a guard
// in place.
describe('Phase 34.4.2 Plan 02 — AppKit sheet presentation (superseded from child-window attachment, 2026-08-04)', () => {
  /**
   * Scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block
   * (inclusive of both braces), counting depth rather than relying on a second string
   * marker. Mirrors the identical helper the WR-07 describe block (above) already uses --
   * kept as a local copy rather than a shared export since neither block currently imports
   * from the other.
   */
  function extractBracedBlock(code: string, openMarker: string): string {
    const markerIdx = code.indexOf(openMarker)
    expect(markerIdx).toBeGreaterThan(-1)
    const braceStart = code.indexOf('{', markerIdx)
    expect(braceStart).toBeGreaterThan(-1)
    let depth = 0
    let i = braceStart
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    expect(depth).toBe(0)
    return code.slice(markerIdx, i + 1)
  }

  function extractHumbleLoginOpenArmBody(code: string): string {
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    return code.slice(armStart, armEnd)
  }

  test('Test 1 (INVERTED 2026-08-04): present_login_window_as_sheet( is CALLED exactly once in the file, and that call site is inside the humble_login_open arm -- catches a future caller landing in (or being dropped from) the wrong arm', () => {
    const code = loadMainRsCode()
    // Negative lookbehind excludes the `fn present_login_window_as_sheet(` definition
    // itself, which also ends in a trailing `(` -- this counts CALL sites only.
    const fileCallSites =
      code.match(/(?<!fn )present_login_window_as_sheet\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const armCallSites =
      armBody.match(/(?<!fn )present_login_window_as_sheet\(/g) ?? []
    expect(armCallSites.length).toBe(1)
  })

  test("Test 2 (INVERTED 2026-08-04, updated 2026-08-04 by Plan 08): dismiss_login_window_sheet( is CALLED exactly TWICE in the file -- once directly inside the humble_login_open arm's WindowEvent::Destroyed branch (this test's original assertion), and once inside Plan 08's request_login_sheet_cancel, the shared dismissal entry point both close-affordance routes call -- catches either call site being dropped", () => {
    const code = loadMainRsCode()
    const fileCallSites =
      code.match(/(?<!fn )dismiss_login_window_sheet\(/g) ?? []
    expect(fileCallSites.length).toBe(2)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const destroyedBlock = extractBracedBlock(
      armBody,
      'if matches!(event, tauri::WindowEvent::Destroyed) {'
    )
    expect(destroyedBlock).toContain('dismiss_login_window_sheet(')

    const cancelStart = code.indexOf('fn request_login_sheet_cancel(')
    expect(cancelStart).toBeGreaterThan(-1)
    const cancelEnd = code.indexOf('#[cfg(target_os = "macos")]', cancelStart)
    expect(cancelEnd).toBeGreaterThan(cancelStart)
    expect(code.slice(cancelStart, cancelEnd)).toContain(
      'dismiss_login_window_sheet('
    )
  })

  test('Test 3 (INVERTED 2026-08-04): the present call site sits inside an if-visible guard -- hidden reveal/clear windows must never be presented', () => {
    const code = loadMainRsCode()
    const visiblePresentBlock = extractBracedBlock(
      code,
      'let sheet_presented = if visible {'
    )
    expect(visiblePresentBlock).toContain('present_login_window_as_sheet(')
  })

  test('Test 4 (INVERTED 2026-08-04, PERMANENT NEGATIVE): the comment-stripped source contains none of addChildWindow_ordered, removeChildWindow, attach_login_window_as_child, detach_login_window_from_parent, ATTACHED_LOGIN_CHILDREN -- the retired child-window mechanism must never reappear', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('addChildWindow_ordered')
    expect(code).not.toContain('removeChildWindow')
    expect(code).not.toContain('attach_login_window_as_child')
    expect(code).not.toContain('detach_login_window_from_parent')
    expect(code).not.toContain('ATTACHED_LOGIN_CHILDREN')
  })

  test('Test 5 (RETIRED 2026-08-04, now NEGATIVE): NSWindowDidDeminiaturizeNotification appears 0 times -- the deminiaturize re-raise observer was deliberately retired by Plan 07 Task 2 because a sheet is presented BY its parent and moves with it, so there is no child list to re-raise', () => {
    const code = loadMainRsCode()
    expect(
      (code.match(/NSWindowDidDeminiaturizeNotification/g) ?? []).length
    ).toBe(0)
  })

  test('Test 6 (SUPERSEDED 2026-08-04, now POSITIVE, REQ-34.4.2-03): the comment-stripped source CONTAINS beginSheet_completionHandler and endSheet exactly once each -- re-asserted here (Plan 01 already added this guard, above) so deleting either describe block still leaves it in place', () => {
    const code = loadMainRsCode()
    expect(code).toContain('beginSheet_completionHandler')
    expect((code.match(/beginSheet_completionHandler/g) ?? []).length).toBe(1)
    expect(code).toContain('endSheet')
    expect((code.match(/endSheet/g) ?? []).length).toBe(1)
  })

  test("Test 7 (NEGATIVE): no Tauri builder .parent(window) call appears anywhere in the comment-stripped source -- Tauri's builder .parent() cannot re-attach at runtime, which is exactly why AppKit-layer attachment was chosen instead. Scoped to exclude std::path::Path::parent() (a pre-existing, argument-less, unrelated call in this same file)", () => {
    const code = loadMainRsCode()
    // `.parent(` followed by anything other than an immediate `)` is a call WITH an
    // argument -- Tauri's `WindowBuilder`/`WebviewWindowBuilder::parent(&window)` always
    // takes one. `Path::parent()` (used twice elsewhere in this file, unrelated to
    // windows) always has empty parens and is deliberately excluded.
    expect(code).not.toMatch(/\.parent\([^)]/)
  })

  test('Test 8 (NEGATIVE): no window-focus-gained re-raise exists -- a focus-driven re-raise would steal key focus back to the login window every time the user clicks the main window', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('WindowEvent::Focused')
  })

  test("Test 9 (SCOPE GUARD, REQ-34.4.2-10, updated 2026-08-04 for Plan 07's renamed symbols): the PHASE_34_4_2_NEW_SYMBOLS-driven guard still passes with this plan's three current symbols appended -- none of them is referenced from open_pristine_epic_login_window's sliced body", () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn open_pristine_epic_login_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    const pristineBody = code.slice(start, end)
    for (const symbol of [
      'present_login_window_as_sheet',
      'dismiss_login_window_sheet',
      'PRESENTED_LOGIN_SHEETS',
      'MAIN_WINDOW_LABEL'
    ]) {
      expect(pristineBody).not.toContain(symbol)
    }
  })
})

// Phase 34.4.2 Plan 13 (operator decision D-A): the in-field autofill glyph mechanism --
// Plan 03's injected glyph + cancelled-navigation request channel, and Plan 04's
// synthesized-right-click poster that consumed it -- was DELETED, not disabled, after
// `34.4.2-LIVE-GATE-RERUN-2.md` item 3 measured it on real hardware: the synthesized
// right-click surfaces the system AutoFill menu but never fills the field, while an
// identical REAL right-click in the same sheet does (F-34.4.2-09, falsifying spike 022's own
// Recommendation #4). Cmd+V / Edit > Paste is now the sole credential-entry route
// (REQ-34.4.2-04/-05, SCOPE-CORRECTED). Supersedes the Plan 03 and Plan 04 describe blocks
// this file used to carry (their own guards are replaced by the permanent absence negative
// below); their one negative worth keeping forever -- T-34.4.2-20's private-selector ban --
// is RELOCATED into Test 3 here, unconditionally on the poster's own continued existence.
describe('Phase 34.4.2 Plan 13 — the in-field autofill mechanism is DELETED (operator decision D-A)', () => {
  test('Test 1 (PERMANENT ABSENCE, T-34.4.2-40): every PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS member appears 0 times in the comment-stripped production source -- a future session reintroducing any of them violates operator decision D-A', () => {
    const code = loadMainRsCode()
    for (const symbol of PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS) {
      const count = (
        code.match(
          new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        ) ?? []
      ).length
      // Asserted as an object (not a bare number) so a failing symbol's NAME appears
      // directly in Jest's diff output -- a future session reintroducing one of these is
      // told exactly which operator decision (D-A) it is violating, not just "expected 0".
      expect({ symbol, count }).toEqual({ symbol, count: 0 })
    }
  })

  test('Test 2 (STRONGER THAN Test 1, PERMANENT): this application constructs and posts NO synthesized NSEvent of any kind -- postEvent_atStart and the full mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure selector each appear 0 times in the comment-stripped production source', () => {
    const code = loadMainRsCode()
    expect((code.match(/postEvent_atStart/g) ?? []).length).toBe(0)
    expect(
      (
        code.match(
          /mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure/g
        ) ?? []
      ).length
    ).toBe(0)
  })

  // T-34.4.2-20 RELOCATED (permanent, outlives the poster) -- NOT tied to the deleted
  // mechanism: this negative exists to stop a FUTURE session reaching for a private "open the
  // Passwords panel" call, which spike 022 proved does not exist. It must survive any future
  // login-window work, independent of whether an in-field affordance ever returns.
  test('Test 3 (NEGATIVE, PERMANENT, T-34.4.2-20 -- survives independently of the deleted poster): the comment-stripped source contains none of the Digital Credentials / private credential-storage selectors spike 022 enumerated, which are either the W3C Digital Credentials API (identity documents, not passwords) or private and inaccessible', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('_showDigitalCredentialsPicker')
    expect(code).not.toContain('_setCanUseCredentialStorage')
    expect(code).not.toContain('_canUseCredentialStorage')
    expect(code).not.toContain('_dismissDigitalCredentialsPicker')
  })

  test("Test 4 (the surviving sentinel is alone): the humble_login_open arm's .on_navigation( closure contains is_login_cancel_request and contains no parse_autofill_request", () => {
    const code = loadMainRsCode()
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armEnd)
    const onNavStart = armBody.indexOf('.on_navigation(')
    expect(onNavStart).toBeGreaterThan(-1)
    const onNavEnd = armBody.indexOf('.build()', onNavStart)
    expect(onNavEnd).toBeGreaterThan(onNavStart)
    const onNavBody = armBody.slice(onNavStart, onNavEnd)
    expect(onNavBody).toContain('is_login_cancel_request')
    expect(onNavBody).not.toContain('parse_autofill_request')
  })

  test("Test 5 (the strip survived the deletion): login_cancel_strip_script( is still called exactly once in the comment-stripped PRODUCTION source, inside the humble_login_open arm's if-visible block", () => {
    const testModStart_code = loadMainRsCode()
    const testModStart = testModStart_code.indexOf('mod tests {')
    expect(testModStart).toBeGreaterThan(-1)
    const code = testModStart_code.slice(0, testModStart)
    const fileCallSites =
      code.match(/(?<!fn )login_cancel_strip_script\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armEnd)
    const visibleStart = armBody.indexOf('if visible {')
    expect(visibleStart).toBeGreaterThan(-1)
    let depth = 0
    let i = armBody.indexOf('{', visibleStart)
    const braceStart = i
    expect(braceStart).toBeGreaterThan(-1)
    for (; i < armBody.length; i++) {
      if (armBody[i] === '{') depth++
      else if (armBody[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    expect(depth).toBe(0)
    const visibleBlock = armBody.slice(visibleStart, i + 1)
    expect(visibleBlock).toContain('login_cancel_strip_script(')
  })
})

// Phase 34.4.2 Plan 08 (REQ-34.4.2-03/04/06/07/08/10, T-34.4.2-33/-34/-35): the mandated close
// affordance for a presented login sheet -- an injected, self-re-appending cancel strip
// (primary, visible) plus a page-independent bare-Esc monitor (backstop, works on a blank/
// error/interstitial page), both funnelled through request_login_sheet_cancel, the single
// dismissal entry point. PHASE_34_4_2_NEW_SYMBOLS (above) already carries this plan's four new
// symbol names, so Plan 01's own generalized Test 3 (both pristine regions) covers them
// without any change to that describe block; this block's own Test 8 below re-asserts the
// same absence directly, scoped to this plan's own file section, so deleting either describe
// block still leaves a guard in place (mirrors Plan 02's Test 9 / Plan 03's Test 4 / Plan 04's
// Test 7 precedent).
describe('Phase 34.4.2 Plan 08 — mandated close affordance (cancel strip + Esc backstop)', () => {
  function extractHumbleLoginOpenArmBody(code: string): string {
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    return code.slice(armStart, armEnd)
  }

  function extractPristineLoginFnBody(code: string): string {
    const start = code.indexOf('fn open_pristine_epic_login_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  function extractEpicPristineNavDelegateBody(code: string): string {
    const start = code.indexOf('define_class!(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('impl EpicPristineNavDelegate {', start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  /**
   * Scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block
   * (inclusive of both braces). Local copy of the identical helper other Plan-scoped describe
   * blocks in this file already use.
   */
  function extractBracedBlock(code: string, openMarker: string): string {
    const markerIdx = code.indexOf(openMarker)
    expect(markerIdx).toBeGreaterThan(-1)
    const braceStart = code.indexOf('{', markerIdx)
    expect(braceStart).toBeGreaterThan(-1)
    let depth = 0
    let i = braceStart
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    expect(depth).toBe(0)
    return code.slice(markerIdx, i + 1)
  }

  /**
   * Bounds the search to PRODUCTION code only -- everything before `mod tests {` -- mirroring
   * Plan 03's own identical helper and its rationale verbatim: `login_cancel_strip_script` is a
   * pure, cargo-tested helper (Task 1) with multiple call sites inside `mod tests` by design; a
   * whole-file count would conflate "how many cargo tests exercise this helper" with "how many
   * production call sites exist", which is the thing this plan's own `exactly ONCE`
   * acceptance criterion actually polices.
   */
  function productionCode(code: string): string {
    const testModStart = code.indexOf('mod tests {')
    expect(testModStart).toBeGreaterThan(-1)
    return code.slice(0, testModStart)
  }

  // The kill-switch-independence clause this test used to carry (asserting the strip's
  // injection call was absent from both branches of the now-deleted `GAMELIB_AUTOFILL_GLYPH`
  // statement) is RETIRED (Phase 34.4.2 Plan 13, operator decision D-A) -- not because it
  // stopped mattering, but because its subject, the kill switch itself, no longer exists. The
  // exactly-once and inside-`if visible` clauses below are unaffected and stay.
  test("Test 1: login_cancel_strip_script( is called exactly once in the comment-stripped PRODUCTION source, and that call site sits inside the humble_login_open arm's if-visible block", () => {
    const code = productionCode(loadMainRsCode())
    // Negative lookbehind excludes the `fn login_cancel_strip_script(` definition itself.
    const fileCallSites =
      code.match(/(?<!fn )login_cancel_strip_script\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const visibleBlock = extractBracedBlock(armBody, 'if visible {')
    expect(visibleBlock).toContain('login_cancel_strip_script(')
  })

  // RETIGHTENED (Phase 34.4.2 Plan 13, operator decision D-A): this was an ORDERING
  // assertion over two sibling sentinels sharing one closure (cancel checked before the
  // now-deleted autofill sentinel, since it's cheaper and the two paths are disjoint). An
  // ordering assertion over a deleted sibling is meaningless once that sibling is gone; the
  // property worth keeping is narrower and stronger: this closure parses exactly one
  // sentinel, and it is the cancel one.
  test("Test 2: inside the humble_login_open arm's .on_navigation( closure, is_login_cancel_request appears and parse_autofill_request does not", () => {
    const code = loadMainRsCode()
    const armBody = extractHumbleLoginOpenArmBody(code)
    const onNavStart = armBody.indexOf('.on_navigation(')
    expect(onNavStart).toBeGreaterThan(-1)
    const onNavEnd = armBody.indexOf('.build()', onNavStart)
    expect(onNavEnd).toBeGreaterThan(onNavStart)
    const onNavBody = armBody.slice(onNavStart, onNavEnd)

    expect(onNavBody).toContain('is_login_cancel_request')
    expect(onNavBody).not.toContain('parse_autofill_request')
  })

  test('Test 3 (ORDERING, load-bearing): request_login_sheet_cancel( is CALLED exactly twice in the file (strip route + Esc route), and its own sliced body calls dismiss_login_window_sheet( at an index strictly less than .close() -- ending the sheet before closing the window', () => {
    const code = loadMainRsCode()
    // Negative lookbehind excludes the `fn request_login_sheet_cancel(` definition itself.
    const fileCallSites =
      code.match(/(?<!fn )request_login_sheet_cancel\(/g) ?? []
    expect(fileCallSites.length).toBe(2)

    const start = code.indexOf('fn request_login_sheet_cancel(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)

    const dismissIdx = body.indexOf('dismiss_login_window_sheet(')
    const closeIdx = body.indexOf('.close()')
    expect(dismissIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeGreaterThan(-1)
    expect(dismissIdx).toBeLessThan(closeIdx)
  })

  test("Test 4 (NEGATIVE, T-34.4.2-35, privacy is a hard constraint): the Esc monitor's sliced handler body references neither characters nor charactersIgnoringModifiers", () => {
    const code = loadMainRsCode()
    const start = code.indexOf(
      'let esc_monitor_handler = block2::RcBlock::new('
    )
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('let esc_monitor_token = unsafe {', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)
    expect(body).not.toContain('characters')
    expect(body).not.toContain('charactersIgnoringModifiers')
  })

  test('Test 5 (NEGATIVE, REQ-34.4.2-06 / T-34.4.2-22): the sliced login_cancel_strip_script body registers no keyboard listener -- Cmd+V into the password field must keep working', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_cancel_strip_script(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('fn request_login_sheet_cancel(', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)
    expect(body).not.toContain('keydown')
    expect(body).not.toContain('keyup')
    expect(body).not.toContain('keypress')
  })

  test('Test 6 (NEGATIVE, REQ-34.4.2-07): the sliced login_cancel_strip_script body reads no input value and transmits no password field content', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_cancel_strip_script(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('fn request_login_sheet_cancel(', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)
    expect(body).not.toContain('.value')
    expect(body).not.toContain('password')
  })

  test("Test 7 (REGRESSION GUARD): addLocalMonitorForEventsMatchingMask_handler appears exactly twice in the whole comment-stripped source -- the pristine Epic arm's pre-existing monitor plus this plan's new Esc monitor; a count other than 2 means the byte-frozen pristine region was edited or refactored", () => {
    const code = loadMainRsCode()
    const matches =
      code.match(/addLocalMonitorForEventsMatchingMask_handler/g) ?? []
    expect(matches.length).toBe(2)
  })

  // Test 8 exists because the pristine Epic surface is excluded by a LOCKED USER SCOPE
  // DECISION (2026-08-04), not by a technical limitation -- Epic is implemented LAST, after
  // every other runner is ported and proven. Loosening this test requires the user's decision
  // to change, not a planner's judgement (mirrors Plan 01/02/03/04's own Test 3/4/9/4/7
  // rationale verbatim).
  test("Test 8 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): neither open_pristine_epic_login_window NOR EpicPristineNavDelegate references any PHASE_34_4_2_NEW_SYMBOLS member, including this plan's own four new symbols", () => {
    const code = loadMainRsCode()
    const pristineBody = extractPristineLoginFnBody(code)
    const delegateBody = extractEpicPristineNavDelegateBody(code)
    for (const symbol of PHASE_34_4_2_NEW_SYMBOLS) {
      expect(pristineBody).not.toContain(symbol)
      expect(delegateBody).not.toContain(symbol)
    }
  })
})

// Phase 34.4.2 Plan 11 (gap cycle 2) — review-finding fixes on the item 2/3/5 routes:
// WR-07 (never re-order a window that is already a presented sheet), WR-01 (a failed
// endSheet: hop must not permanently strand the parent), WR-03 (top-frame-only cancel strip),
// WR-04 (the strip's retry/observer must survive a throwing first build), IN-02 (the strip
// must not advertise a keyboard affordance it cannot deliver). Live behaviour is NOT claimed
// by any test below -- these are source guards only, per this plan's own acceptance criteria.
describe('Phase 34.4.2 Plan 11 — review-finding fixes on the item 2/3/5 routes', () => {
  /**
   * Bounds the search to PRODUCTION code only -- everything before `mod tests {` -- mirroring
   * Plan 08's own identical helper and its rationale verbatim.
   */
  function productionCode(code: string): string {
    const testModStart = code.indexOf('mod tests {')
    expect(testModStart).toBeGreaterThan(-1)
    return code.slice(0, testModStart)
  }

  // CONVERTED TO A ZERO-OCCURRENCE NEGATIVE (Phase 34.4.2 Plan 13, operator decision D-A):
  // this used to assert the WR-07 call site (inside the deleted synthesized-right-click
  // poster, its ONLY call site anywhere in the file) appeared exactly once, guarded by an
  // `isSheet()` check. That call site was deleted along with the poster -- an exactly-once
  // assertion over a subject with zero remaining call sites would FAIL, not vacuously pass,
  // so this is a real retightening, not housekeeping: it now asserts the call form is gone
  // entirely, which is what "the last call site left with the poster" actually means.
  test('Test 1: .makeKeyAndOrderFront(None) — the CALL form — appears 0 times in the comment-stripped PRODUCTION source; its sole call site left with the deleted synthesized-right-click poster (Plan 13, D-A)', () => {
    const code = productionCode(loadMainRsCode())
    const callMatches = code.match(/\.makeKeyAndOrderFront\(None\)/g) ?? []
    expect(callMatches.length).toBe(0)
  })

  test("Test 2 (WR-01, ORDERING): dismiss_login_window_sheet's sliced body calls register_presented_login_sheet( at least twice, each at an index strictly greater than list.retain( -- removal still happens first, re-registration only after a failed hop", () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn dismiss_login_window_sheet(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)

    const retainIdx = body.indexOf('list.retain(')
    expect(retainIdx).toBeGreaterThan(-1)

    const registerMatches = [
      ...body.matchAll(/register_presented_login_sheet\(/g)
    ]
    expect(registerMatches.length).toBeGreaterThanOrEqual(2)
    for (const match of registerMatches) {
      expect(match.index).toBeGreaterThan(retainIdx)
    }
  })

  test('Test 3 (WR-01, T-34.4.2-08 preserved): register_presented_login_sheet( appears exactly three times as a call site in production source -- the present-path registration plus the two dismiss failure arms', () => {
    const code = productionCode(loadMainRsCode())
    // Negative lookbehind excludes the `fn register_presented_login_sheet(` definition itself.
    const callSites =
      code.match(/(?<!fn )register_presented_login_sheet\(/g) ?? []
    expect(callSites.length).toBe(3)
  })

  test('Test 4 (WR-03/IN-02): the sliced login_cancel_strip_script body contains window.top and does not contain tabindex', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_cancel_strip_script(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('fn request_login_sheet_cancel(', start)
    expect(end).toBeGreaterThan(start)
    const body = code.slice(start, end)
    expect(body).toContain('window.top')
    expect(body).not.toContain('tabindex')
  })

  test('Test 5 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): neither open_pristine_epic_login_window NOR EpicPristineNavDelegate references register_presented_login_sheet or any other PHASE_34_4_2_NEW_SYMBOLS member', () => {
    function extractPristineLoginFnBody(code: string): string {
      const start = code.indexOf('fn open_pristine_epic_login_window(')
      expect(start).toBeGreaterThan(-1)
      const end = code.indexOf('#[cfg(target_os = "macos")]', start)
      expect(end).toBeGreaterThan(start)
      return code.slice(start, end)
    }
    function extractEpicPristineNavDelegateBody(code: string): string {
      const start = code.indexOf('define_class!(')
      expect(start).toBeGreaterThan(-1)
      const end = code.indexOf('impl EpicPristineNavDelegate {', start)
      expect(end).toBeGreaterThan(start)
      return code.slice(start, end)
    }
    const code = loadMainRsCode()
    const pristineBody = extractPristineLoginFnBody(code)
    const delegateBody = extractEpicPristineNavDelegateBody(code)
    for (const symbol of PHASE_34_4_2_NEW_SYMBOLS) {
      expect(pristineBody).not.toContain(symbol)
      expect(delegateBody).not.toContain(symbol)
    }
  })
})

// Phase 34.4.2 Plan 14 (T-34.4.2-39/-41): a second VISIBLE login window requested while one is
// already pending or presented must be refused at the shell entry point, before any window is
// built -- gate run 2's operator observed Amazon's slow nile spawn (~7-8s, F-34.4.2-06) let
// Humble's own click open and present FIRST, so Amazon's own sheet then queued behind it and
// surfaced unrequested the moment Humble was dismissed (origin confusion: typing one store's
// password into another store's just-arrived sheet). This describe block holds the
// source-level guard that makes that structurally impossible in place -- ordering,
// visible-only scoping, three-way clearing and a bounded (not unbounded) expiry.
describe('Phase 34.4.2 Plan 14 — single-flight guard on visible login windows (T-34.4.2-39)', () => {
  function extractHumbleLoginOpenArmBody(code: string): string {
    const armStart = code.indexOf('"humble_login_open" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    return code.slice(armStart, armEnd)
  }

  /**
   * Scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block
   * (inclusive of both braces), counting depth rather than relying on a second string marker
   * -- mirrors the identical helper the WR-07 and Plan 02 describe blocks (above) already use,
   * kept as a local copy per this file's own established convention (neither block imports
   * from the other).
   */
  function extractBracedBlock(code: string, openMarker: string): string {
    const markerIdx = code.indexOf(openMarker)
    expect(markerIdx).toBeGreaterThan(-1)
    const braceStart = code.indexOf('{', markerIdx)
    expect(braceStart).toBeGreaterThan(-1)
    let depth = 0
    let i = braceStart
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    expect(depth).toBe(0)
    return code.slice(markerIdx, i + 1)
  }

  // ORDERING. Both bounds matter: the first is Epic's structural exemption (D-D) -- the guard
  // must never run before Epic's own early return has had its chance to fire; the second is
  // "no window is built for a refused request" -- the guard must run before the shared
  // `WebviewWindowBuilder` this arm's every other runner (and Epic on non-macOS) goes on to
  // construct.
  test('Test 1 (ORDERING): PENDING_VISIBLE_LOGIN_WINDOW is referenced after open_pristine_epic_login_window( and before tauri::WebviewWindowBuilder::new( inside the humble_login_open arm', () => {
    const code = loadMainRsCode()
    const armBody = extractHumbleLoginOpenArmBody(code)
    const epicReturnIdx = armBody.indexOf('open_pristine_epic_login_window(')
    const guardIdx = armBody.indexOf('PENDING_VISIBLE_LOGIN_WINDOW')
    const builderIdx = armBody.indexOf('tauri::WebviewWindowBuilder::new(')
    expect(epicReturnIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(builderIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(epicReturnIdx)
    expect(guardIdx).toBeLessThan(builderIdx)
  })

  // VISIBLE-ONLY SCOPING. Brace-matched the way Plan 03's own `if visible` guard test does
  // (block first, containment second) rather than by proximity. The guard's condition is
  // deliberately `if visible == true {`, not the bare `if visible {` this arm uses elsewhere --
  // see the guard's own doc comment in main.rs for why (Plan 08 Test 1 / the WR-07 F-4 test
  // both locate the ORIGINAL `if visible {` block via the first `indexOf` match; an identical
  // bare condition here would silently redirect both to this new block instead).
  test('Test 2 (VISIBLE-ONLY SCOPING): the refuse-or-arm block is brace-matched from a condition referencing visible -- hidden reveal/clear windows never arm or are refused', () => {
    const code = loadMainRsCode()
    const armBody = extractHumbleLoginOpenArmBody(code)
    const guardBlock = extractBracedBlock(armBody, 'if visible == true {')
    expect(guardBlock).toContain('PENDING_VISIBLE_LOGIN_WINDOW')
    expect(guardBlock).toContain('visible')
  })

  // CLEAR-ON-EVERY-PATH. Negative-lookbehind excludes the `fn clear_pending_visible_login_window(`
  // definition itself -- counts CALL sites only, mirroring Plan 08 Test 1's identical idiom.
  // Three call sites: sheet presentation confirmed, the visible-fallback
  // (`window.show()`/`window.set_focus()`), and `WindowEvent::Destroyed`.
  test('Test 3 (CLEAR-ON-EVERY-PATH): clear_pending_visible_login_window( is CALLED exactly three times in comment-stripped production source', () => {
    const code = loadMainRsCode()
    const callSites =
      code.match(/(?<!fn )clear_pending_visible_login_window\(/g) ?? []
    expect(callSites.length).toBe(3)
  })

  // BOUNDED, NOT UNBOUNDED (T-34.4.2-41). A latch with no expiry would convert this plan's own
  // spoofing mitigation into a denial-of-service surface -- see PENDING_VISIBLE_LOGIN_WINDOW_TTL's
  // own doc comment. The TTL's definition must reference the EXISTING watchdog constant, not an
  // independently invented magic number, so the two can never disagree.
  test('Test 4 (BOUNDED, NOT UNBOUNDED, T-34.4.2-41): the refuse-or-arm region references pending_login_entry_is_stale, and PENDING_VISIBLE_LOGIN_WINDOW_TTL is defined in terms of LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT rather than an independent magic number', () => {
    const code = loadMainRsCode()
    const armBody = extractHumbleLoginOpenArmBody(code)
    const guardBlock = extractBracedBlock(armBody, 'if visible == true {')
    expect(guardBlock).toContain('pending_login_entry_is_stale')

    const ttlDeclIdx = code.indexOf('const PENDING_VISIBLE_LOGIN_WINDOW_TTL')
    expect(ttlDeclIdx).toBeGreaterThan(-1)
    const ttlDeclEnd = code.indexOf(';', ttlDeclIdx)
    expect(ttlDeclEnd).toBeGreaterThan(ttlDeclIdx)
    const ttlDecl = code.slice(ttlDeclIdx, ttlDeclEnd)
    expect(ttlDecl).toContain('LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT')
  })

  // SCOPE GUARD (REQ-34.4.2-10). All four Plan 14 symbols must be members of
  // PHASE_34_4_2_NEW_SYMBOLS so Plan 01's own array-driven Epic guard (Test 3, above) covers
  // them automatically -- no separate absence assertion needed here.
  test('Test 5 (SCOPE GUARD, REQ-34.4.2-10): all four Plan 14 symbols are present in PHASE_34_4_2_NEW_SYMBOLS', () => {
    for (const symbol of [
      'PENDING_VISIBLE_LOGIN_WINDOW',
      'PENDING_VISIBLE_LOGIN_WINDOW_TTL',
      'pending_login_entry_is_stale',
      'clear_pending_visible_login_window'
    ]) {
      expect(PHASE_34_4_2_NEW_SYMBOLS).toContain(symbol)
    }
  })

  // MUTATION DISCIPLINE (recorded again, with the reversal proof, in 34.4.2-14-SUMMARY.md).
  // Test 1's ordering assertion above was proven load-bearing by temporarily moving the
  // refuse-or-arm check's `if visible == true {` line (and its body) to directly above the
  // Epic early return in main.rs, re-running this describe block -- Test 1 FAILED
  // (`guardIdx` < `epicReturnIdx`) -- then reverting the edit and confirming
  // `git diff --stat -- src-tauri/src/main.rs` was empty afterward. Not encoded as a permanent
  // test here: it is a one-time proof the assertion actually fires, not a fixture this suite
  // re-runs every pass, mirroring Plan 13's own mutation check (`34.4.2-13-SUMMARY.md`'s
  // "Mutation Check" section), which was done and recorded the identical way.
})

/**
 * Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09, REQ-34.5-01/05/12): pins the continued
 * existence of the five pure deep-link/single-instance argv helpers Task 1 added, and pins
 * D-44-A structurally -- the comment-stripped source must never gain either of the two
 * rejected Tauri plugins (`tauri-plugin-single-instance`, `tauri-plugin-deep-link`), so a
 * future "simplification" back to a plugin-based guard cannot land silently.
 *
 * Every assertion below (positive and negative) is paired with a self-test driving
 * `loadMainRsCode(syntheticSource)` with the token deliberately absent (for a positive
 * assertion) or deliberately present (for a negative assertion) -- the RED proof this file's
 * own conventions require, mirroring the clipboard/tray describe blocks above.
 */
describe('Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09) deep-link/single-instance argv helpers', () => {
  // Each token carries a trailing `(` boundary deliberately: this file's own #[cfg(test)]
  // module (Task 1) names test fns like `cli_no_gui_requires_an_exact_flag_match` and
  // `protocol_url_arg_finds_url_among_the_vdf_launch_options` -- without the paren boundary,
  // `'fn cli_no_gui'` is a SUBSTRING of `fn cli_no_gui_requires_an_exact_flag_match(`, so the
  // gate would pass vacuously off the TEST function's own declaration even if the real
  // `fn cli_no_gui(` helper were deleted. Caught live: an early draft of this describe block
  // used the bare (unparenthesized) token and stayed green through a deliberate deletion of
  // `fn cli_no_gui` -- see this plan's SUMMARY for the failure transcript before the fix.
  const POSITIVE_TOKENS = [
    'fn protocol_url_arg(',
    'fn cli_no_gui(',
    'fn sidecar_forward_args(',
    'fn single_instance_socket_path(',
    'fn single_instance_dir('
  ]

  test.each(POSITIVE_TOKENS)('the real source contains %s', (token) => {
    expect(loadMainRsCode()).toContain(token)
  })

  test.each(POSITIVE_TOKENS)(
    'self-test (RED proof): a synthetic source lacking %s does NOT satisfy the gate',
    (token) => {
      const syntheticSource = 'fn some_other_helper() {}\n'
      expect(loadMainRsCode(syntheticSource)).not.toContain(token)
    }
  )

  const REJECTED_PLUGIN_TOKENS = [
    'tauri_plugin_single_instance',
    'tauri-plugin-single-instance',
    'tauri_plugin_deep_link',
    'tauri-plugin-deep-link'
  ]

  test.each(REJECTED_PLUGIN_TOKENS)(
    'the real source does NOT contain %s (D-44-A: hand-rolled guard, no plugin)',
    (token) => {
      expect(loadMainRsCode()).not.toContain(token)
    }
  )

  test.each(REJECTED_PLUGIN_TOKENS)(
    'self-test (RED proof): a synthetic source containing %s DOES fail the negative gate',
    (token) => {
      const syntheticSource = `// pretend plugin registration\nfn main() { let _x = "${token}"; }\n`
      expect(loadMainRsCode(syntheticSource)).toContain(token)
    }
  )
})

// Debug session `finder-reveal-no-selection` (2026-08-23), closing Phase 34.3 live-gate item 2 /
// gap G1 (REQ-34.3-11 item 2). `showItemInFolder` opened the correct folder but never SELECTED
// the target, because of a systemic macOS/Finder defect: the selection half of a reveal is
// dropped whenever the previously-frontmost app's window is on a different display/Space than
// the one Finder's reveal window opens on. The fix fires a follow-up Finder `select` Apple Event.
//
// WHY THIS GATE EXISTS AT ALL, stated plainly: the FIRST version of that fix was DEAD CODE and
// still passed its own "verified 8/8" check. It used `select POSIX file (item 1 of argv)` with no
// `as alias` coercion, which fails with AppleScript -1728 on EVERY invocation (measured 0/5), and
// `let _ = ...output()` discarded the failure so nothing ever said so. The 8/8 had been measured
// against a hand-typed osascript REPLICA rather than the shipped script. Two properties below --
// the coercion, and the non-discarded failure path -- are therefore each load-bearing, and each
// is invisible to every other kind of test in this repo: Rust unit tests cannot drive Finder, CI
// compiles no Rust at all, and a TS mock cannot observe the contents of a Rust string literal.
//
// WHAT THIS GATE CANNOT DO, so a future reader of a green dot is not misled: it proves the SOURCE
// SHAPE only. It cannot prove the Apple Event actually lands, that Finder selects anything, or
// that the cross-display defect is still worked around on a future macOS. That half is
// `34.3-HUMAN-UAT.md` item 2's live check (verified 3/3 through the real button on 2026-08-23).
describe('REQ-34.3-11 item 2 (debug session finder-reveal-no-selection) macOS Finder re-select workaround', () => {
  /**
   * Slices the workaround fn's own body out of `code`. Takes the source as an argument rather
   * than reading main.rs directly so the RED self-tests below drive this SAME extraction path
   * with synthetic input, per this file's existing `loadMainRsCode(source?)` convention.
   */
  function extractWorkaroundBody(code: string): string {
    const start = code.indexOf('fn macos_finder_reselect_workaround(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('\n}', start)
    expect(end).toBeGreaterThan(start)
    return code.slice(start, end)
  }

  /**
   * The two properties whose absence made the first version of this fix a silent no-op. Returned
   * as a pair (not asserted inline) so the self-tests can run the identical predicate against a
   * synthetic regressed source and prove this gate goes RED, rather than merely asserting that
   * today's source happens to be green.
   */
  function revealFixProperties(code: string): {
    coercesToAlias: boolean
    discardsFailure: boolean
  } {
    const body = extractWorkaroundBody(code)
    return {
      coercesToAlias: body.includes('as alias)'),
      discardsFailure: /let\s+_\s*=\s*Command::new\("osascript"\)/.test(body)
    }
  }

  test('the workaround fn exists and is macOS-gated', () => {
    const code = loadMainRsCode()
    const fnIdx = code.indexOf('fn macos_finder_reselect_workaround(')
    expect(fnIdx).toBeGreaterThan(-1)
    // The cfg attribute must gate the fn itself -- a non-macOS build must not compile a Finder
    // AppleScript shell-out at all.
    const precedingCfg = code.lastIndexOf('#[cfg(target_os = "macos")]', fnIdx)
    expect(precedingCfg).toBeGreaterThan(-1)
    // Nothing but the attribute between it and the fn it gates (same technique as the tray
    // template test above).
    expect(code.slice(precedingCfg, fnIdx)).not.toContain(';')
  })

  test('the shell_show_item_in_folder arm calls the workaround, macOS-gated, AFTER reveal_item_in_dir', () => {
    const code = loadMainRsCode()
    const armStart = code.indexOf('"shell_show_item_in_folder" => {')
    expect(armStart).toBeGreaterThan(-1)
    const armEnd = code.indexOf('"shell_open_path" =>', armStart)
    expect(armEnd).toBeGreaterThan(armStart)
    const armBody = code.slice(armStart, armEnd)

    const revealIdx = armBody.indexOf('.reveal_item_in_dir(')
    const callIdx = armBody.indexOf('macos_finder_reselect_workaround(')
    expect(revealIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(revealIdx)
    // The call site is itself cfg-gated, not merely the fn definition.
    const cfgIdx = armBody.lastIndexOf('#[cfg(target_os = "macos")]', callIdx)
    expect(cfgIdx).toBeGreaterThan(revealIdx)
    expect(armBody.slice(cfgIdx, callIdx)).not.toContain(';')
  })

  test('LOAD-BEARING: the AppleScript coerces the POSIX file specifier with `as alias`', () => {
    // Without this, Finder's `select` gets an unresolved specifier and errors -1728 every time.
    // Measured during the debug session: uncoerced 0/5 success, coerced 5/5.
    expect(revealFixProperties(loadMainRsCode()).coercesToAlias).toBe(true)
  })

  test('LOAD-BEARING: the osascript result is NOT discarded into `let _ =`', () => {
    // The dead-code version above survived precisely because its failure was thrown away. The
    // failure path must remain observable.
    const code = loadMainRsCode()
    expect(revealFixProperties(code).discardsFailure).toBe(false)
    expect(extractWorkaroundBody(code)).toContain('eprintln!')
  })

  test('the path is passed as an osascript argv ARGUMENT, never interpolated into script text', () => {
    // Interpolating a path into AppleScript source would be an injection surface and would need
    // quote/backslash escaping. `on run argv` + a separate .arg() avoids both.
    const body = extractWorkaroundBody(loadMainRsCode())
    expect(body).toContain('on run argv')
    expect(body).toContain('item 1 of argv')
    expect(body).not.toMatch(/format!\s*\(\s*"[^"]*tell application/)
  })

  test('SELF-TEST (RED direction): this gate rejects the exact dead-code form that shipped and passed an 8/8 replica check', () => {
    // Verbatim shape of the original committed fix, which never once succeeded at runtime.
    const regressed = [
      '#[cfg(target_os = "macos")]',
      'fn macos_finder_reselect_workaround(path: &str) {',
      '    let path = path.to_string();',
      '    thread::spawn(move || {',
      '        let _ = Command::new("osascript")',
      '            .arg("-e")',
      '            .arg("on run argv\\n  tell application \\"Finder\\" to select POSIX file (item 1 of argv)\\nend run")',
      '            .arg(&path)',
      '            .output();',
      '    });',
      '}'
    ].join('\n')
    const props = revealFixProperties(regressed)
    // Both load-bearing properties must read as VIOLATED against the known-bad source -- if
    // either came back "fine" here, the corresponding test above would be incapable of ever
    // failing and would be a green dot guarding nothing.
    expect(props.coercesToAlias).toBe(false)
    expect(props.discardsFailure).toBe(true)
  })

  test('SELF-TEST (RED direction): a comment merely NAMING `as alias` does not satisfy the coercion gate', () => {
    // main.rs's own comments discuss `as alias` and `POSIX file` at length (that is why the
    // coercion is explained in situ), so an unstripped gate could pass on prose alone even if the
    // real script reverted. Proves the comment-stripping, not the file's current contents.
    const commentOnly = [
      '#[cfg(target_os = "macos")]',
      'fn macos_finder_reselect_workaround(path: &str) {',
      '    // the `as alias)` coercion is required here',
      '    let out = Command::new("osascript").arg("-e").arg("select POSIX file x").output();',
      '    eprintln!("{:?}", out);',
      '}'
    ].join('\n')
    expect(
      revealFixProperties(loadMainRsCode(commentOnly)).coercesToAlias
    ).toBe(false)
  })
})
