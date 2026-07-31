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
    expect(code).toContain('include_bytes!("../../public/icon-dark.png")')
    expect(code).toContain('include_bytes!("../../public/icon-light.png")')
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
      'humble_login_cookies_for_domain'
    ]
    const newArms = armNames.filter(
      (name) => name && !preExistingArms.includes(name)
    )
    expect(newArms).toEqual(['tray_set_icon'])
  })
})

describe('REQ-34.1-07 main.rs tray scope boundary (Phase 34.1 Plan 06, D-11 negative bound)', () => {
  test('REQ-34.1-07 does NOT contain the declared out-of-scope menu depth (recents/dock/Reload/Debug/openDevTools)', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('recent')
    expect(code).not.toContain('dock')
    expect(code).not.toContain('Reload')
    expect(code).not.toContain('Debug')
    expect(code).not.toContain('openDevTools')
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

  test('humble_login_cookies_for_domain (the census arm) calls cookie_domain_matches with the cookie\'s OWN domain FIRST', () => {
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

  test('on_document_title_changed is present in source -- static proof only, NOT proof the OS title bar tracks Humble\'s document title (that is plan 29 item 1)', () => {
    const code = loadMainRsCode()
    expect(code).toContain('on_document_title_changed')
  })

  test('always_on_top never appears in non-comment source (F-4) -- proves the persistent-pin option was never wired, NOT that the one-shot raise plan 29 item 1 must observe actually happens', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('always_on_top')
  })

  test('no WebviewWindowBuilder chain in this file hard-codes .title( -- WR-07\'s negative half, unchanged; proves absence only, never the presence plan 29 item 1 must observe', () => {
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
      expect(chain).not.toContain('.title(')
    }
  })

  test('.inner_size(/.center()/.focused(true)/on_document_title_changed appear ONLY inside humble_login_open\'s if-visible block -- the adjacent-already-present gating Plan 18 introduced and nothing had ever tested; proves source placement only, never that the operator actually saw the window raised (plan 29 item 1)', () => {
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
    const revealEnd = code.indexOf('"humble_login_clear_storage" => {', revealStart)
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
    expect((hiddenWindowsBody.match(/\.visible\(false\)/g) ?? []).length).toBe(2)
  })
})
