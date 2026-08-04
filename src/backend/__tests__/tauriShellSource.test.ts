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

// Phase 34.4.2 Plan 03, Test 8 (REQ-34.4.2-10): reads Cargo.toml directly rather than through
// `loadMainRsCode` -- this is a config-shape assertion (the `objc2-web-kit` feature array),
// not a main.rs source assertion, mirroring `cargoFeatures.test.ts`'s own convention.
const CARGO_TOML_PATH = join(__dirname, '..', '..', '..', 'src-tauri', 'Cargo.toml')

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

  test('POSITIVE: the title-refresh call (set_title) lives inside the arm\'s .on_page_load( hook body', () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const pageLoadStart = armBody.indexOf('.on_page_load(')
    expect(pageLoadStart).toBeGreaterThan(-1)
    const pageLoadEnd = armBody.indexOf('.build()', pageLoadStart)
    expect(pageLoadEnd).toBeGreaterThan(pageLoadStart)
    const pageLoadBlock = armBody.slice(pageLoadStart, pageLoadEnd)
    expect(pageLoadBlock).toContain('set_title(')
  })

  // RETIGHTENED (Phase 34.4.2 Plan 03, REQ-34.4.2-04/08), not deleted: this used to be a
  // blanket "no .on_navigation( at all" guard. Plan 03 adds exactly one sentinel-only,
  // cancel-only .on_navigation( arm to intercept the in-field autofill glyph's request --
  // that does NOT violate the invariant this guard protects, because the invariant is "no
  // on_navigation-driven login-watch relay" (spike 013: 5 of 8 on_navigation events on
  // Humble's real login page were third-party iframes; letting a subframe re-arm
  // notifyLoginNavigated()'s deadline via on_navigation would defeat WR-03's timeout), not
  // "no on_navigation call of any kind". The assertions below enforce that narrower invariant
  // precisely: at most one on_navigation call exists, its closure parses the autofill
  // sentinel and nothing else, and it never touches the login-watch relay's own state
  // (push_login_window_event/set_title/current_origin/login_event_value) -- those stay
  // exclusively owned by the .on_page_load( hook, per the POSITIVE test above.
  test('NEGATIVE/RETIGHTENED: the humble_login_open arm has at most one .on_navigation( call, and that closure ONLY parses the autofill sentinel -- it never drives the login-watch relay', () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const onNavCount = (armBody.match(/\.on_navigation\(/g) ?? []).length
    expect(onNavCount).toBeLessThanOrEqual(1)

    const onNavStart = armBody.indexOf('.on_navigation(')
    expect(onNavStart).toBeGreaterThan(-1)
    const onNavEnd = armBody.indexOf('.build()', onNavStart)
    expect(onNavEnd).toBeGreaterThan(onNavStart)
    const onNavBody = armBody.slice(onNavStart, onNavEnd)

    expect(onNavBody).toContain('parse_autofill_request')
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
  'login_window_wk_webview',
  // Plan 02 (AppKit child-window attachment):
  'attach_login_window_as_child',
  'detach_login_window_from_parent',
  'ATTACHED_LOGIN_CHILDREN',
  'MAIN_WINDOW_LABEL',
  // Plan 03 (in-field autofill glyph + cancelled-navigation request channel):
  'AUTOFILL_EXFIL_PATH',
  'AutofillRequest',
  'parse_autofill_request',
  'autofill_glyph_script',
  // Plan 04 (synthesized right-click poster):
  'css_rect_center_in_view',
  'clamp_point_to_view_bounds',
  'synth_autofill_mouse_event',
  'post_autofill_right_click',
  'LAST_AUTOFILL_POST',
  'AUTOFILL_POST_DEBOUNCE'
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

  test('Test 1: login_window_ns_window resolves via get_webview_window and never references get_window( -- the pristine surface is unreachable from it by construction', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_window_ns_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('fn login_window_wk_webview(', start)
    expect(end).toBeGreaterThan(start)
    const fnBody = code.slice(start, end)
    expect(fnBody).toContain('get_webview_window(')
    expect(fnBody).not.toContain('get_window(')
  })

  test('Test 2: login_window_wk_webview references with_webview', () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn login_window_wk_webview(')
    expect(start).toBeGreaterThan(-1)
    // The next top-level item after this resolver (the pre-existing doc comment naming the
    // Epic logout defect fix, stripped down to its code line) bounds the search window.
    const end = code.indexOf(
      'fn clear_default_data_store_cookies_for_domain(',
      start
    )
    expect(end).toBeGreaterThan(start)
    expect(code.slice(start, end)).toContain('with_webview')
  })

  // GENERALIZED by Phase 34.4.2 Plan 03 (REQ-34.4.2-10): this guard used to check only
  // `open_pristine_epic_login_window`'s sliced body. It now runs the SAME
  // `PHASE_34_4_2_NEW_SYMBOLS` loop against `EpicPristineNavDelegate`'s sliced body too, so any
  // symbol a FUTURE plan appends to the array is automatically checked against BOTH pristine
  // regions with no further test edits -- the guard's coverage grows by mechanism, not by a
  // planner remembering to duplicate a hardcoded check for each new region.
  test('Test 3 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): neither open_pristine_epic_login_window NOR EpicPristineNavDelegate references any of this phase\'s new symbols', () => {
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

  test('Test 5 (NEGATIVE, REQ-34.4.2-03): the comment-stripped source contains no beginSheet and no endSheet anywhere', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('beginSheet')
    expect(code).not.toContain('endSheet')
  })
})

// Phase 34.4.2 Plan 02 (REQ-34.4.2-01/02/03/04/05/08/10): AppKit child-window attach/detach
// for the Tauri-managed login surface (Humble/GOG/Amazon -- REQ-34.4.2-10's locked scope,
// unchanged from Plan 01), the deminiaturize re-raise observer, and the permanent negatives
// that keep sheets, Tauri's own `.parent(` builder call, and a focus-driven re-raise out.
// PHASE_34_4_2_NEW_SYMBOLS (above) already carries this plan's four new symbol names, so
// Plan 01's own Test 3/Test 4 scope guard covers them without any change to that describe
// block; Test 9 below re-asserts the same absence directly, scoped to this plan's own file
// section, so deleting either describe block still leaves a guard in place.
describe('Phase 34.4.2 Plan 02 — AppKit child-window attachment', () => {
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

  test('Test 1: attach_login_window_as_child( is CALLED exactly once in the file, and that call site is inside the humble_login_open arm -- catches a future caller landing in (or being dropped from) the wrong arm', () => {
    const code = loadMainRsCode()
    // Negative lookbehind excludes the `fn attach_login_window_as_child(` definition
    // itself, which also ends in a trailing `(` -- this counts CALL sites only.
    const fileCallSites = code.match(/(?<!fn )attach_login_window_as_child\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const armCallSites = armBody.match(/(?<!fn )attach_login_window_as_child\(/g) ?? []
    expect(armCallSites.length).toBe(1)
  })

  test("Test 2: detach_login_window_from_parent( is CALLED exactly once in the file, inside the humble_login_open arm's WindowEvent::Destroyed branch -- catches the detach call being dropped from the close hook", () => {
    const code = loadMainRsCode()
    const fileCallSites =
      code.match(/(?<!fn )detach_login_window_from_parent\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const destroyedBlock = extractBracedBlock(
      armBody,
      'if matches!(event, tauri::WindowEvent::Destroyed) {'
    )
    expect(destroyedBlock).toContain('detach_login_window_from_parent(')
  })

  test('Test 3: the attach call site sits inside an if-visible guard -- hidden reveal/clear windows must never be attached', () => {
    const code = loadMainRsCode()
    const visibleAttachBlock = extractBracedBlock(
      code,
      'let child_attached = if visible {'
    )
    expect(visibleAttachBlock).toContain('attach_login_window_as_child(')
  })

  test('Test 4: addChildWindow_ordered and removeChildWindow each appear exactly once in the file, each inside its own named helper', () => {
    const code = loadMainRsCode()
    expect((code.match(/addChildWindow_ordered\(/g) ?? []).length).toBe(1)
    expect((code.match(/removeChildWindow\(/g) ?? []).length).toBe(1)

    const attachStart = code.indexOf('fn attach_login_window_as_child(')
    expect(attachStart).toBeGreaterThan(-1)
    const attachEnd = code.indexOf(
      'fn detach_login_window_from_parent(',
      attachStart
    )
    expect(attachEnd).toBeGreaterThan(attachStart)
    expect(code.slice(attachStart, attachEnd)).toContain('addChildWindow_ordered(')

    const detachStart = code.indexOf('fn detach_login_window_from_parent(')
    expect(detachStart).toBeGreaterThan(-1)
    const detachEnd = code.indexOf(
      'fn clear_default_data_store_cookies_for_domain(',
      detachStart
    )
    expect(detachEnd).toBeGreaterThan(detachStart)
    expect(code.slice(detachStart, detachEnd)).toContain('removeChildWindow(')
  })

  test('Test 5: NSWindowDidDeminiaturizeNotification appears exactly once, and makeKeyAndOrderFront appears inside the same sliced deminiaturize-observer handler', () => {
    const code = loadMainRsCode()
    expect(
      (code.match(/NSWindowDidDeminiaturizeNotification/g) ?? []).length
    ).toBe(1)

    const observerStart = code.indexOf(
      'match login_window_ns_window(app.handle(), MAIN_WINDOW_LABEL) {'
    )
    expect(observerStart).toBeGreaterThan(-1)
    const observerEnd = code.indexOf(
      'match app.get_webview_window(MAIN_WINDOW_LABEL) {',
      observerStart
    )
    expect(observerEnd).toBeGreaterThan(observerStart)
    const observerBlock = code.slice(observerStart, observerEnd)
    expect(observerBlock).toContain('NSWindowDidDeminiaturizeNotification')
    expect(observerBlock).toContain('makeKeyAndOrderFront(')
  })

  test('Test 6 (NEGATIVE, REQ-34.4.2-03): the comment-stripped source contains no beginSheet and no endSheet anywhere -- re-asserted here (Plan 01 already added this guard, above) so deleting either describe block still leaves it in place', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('beginSheet')
    expect(code).not.toContain('endSheet')
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

  test("Test 9 (SCOPE GUARD, REQ-34.4.2-10): the PHASE_34_4_2_NEW_SYMBOLS-driven guard still passes with this plan's four symbols appended -- none of them is referenced from open_pristine_epic_login_window's sliced body", () => {
    const code = loadMainRsCode()
    const start = code.indexOf('fn open_pristine_epic_login_window(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('#[cfg(target_os = "macos")]', start)
    expect(end).toBeGreaterThan(start)
    const pristineBody = code.slice(start, end)
    for (const symbol of [
      'attach_login_window_as_child',
      'detach_login_window_from_parent',
      'ATTACHED_LOGIN_CHILDREN',
      'MAIN_WINDOW_LABEL'
    ]) {
      expect(pristineBody).not.toContain(symbol)
    }
  })
})

// Phase 34.4.2 Plan 03 (REQ-34.4.2-04/06/07/08/10): the in-field autofill glyph injected into
// the Tauri-managed login surface (Humble/GOG/Amazon), and the cancelled-navigation request
// channel it uses to reach Rust. PHASE_34_4_2_NEW_SYMBOLS (above) already carries this plan's
// four new symbol names, so Plan 01's own generalized Test 3 (both pristine regions) covers
// them without any change to that describe block; Test 4 below re-asserts the same absence
// directly, scoped to this plan's own file section, so deleting either describe block still
// leaves a guard in place (mirrors Plan 02's own Test 9 precedent).
describe('Phase 34.4.2 Plan 03 — in-field autofill glyph and its cancelled-navigation channel', () => {
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
   * (inclusive of both braces), counting depth rather than relying on a second string
   * marker. Local copy of the identical helper the Plan 02 describe block (above) already
   * uses -- kept per-describe-block rather than shared, matching this file's existing
   * convention of not sharing helpers across `describe` callbacks.
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
   * Bounds the search to PRODUCTION code only -- everything before `#[cfg(test)] mod tests {`
   * (the unique, code-only occurrence of that exact brace-terminated text; doc-comment
   * mentions of the phrase elsewhere in the file never include the trailing ` {`, and are
   * stripped by `loadMainRsCode` regardless). `autofill_glyph_script`/`parse_autofill_request`
   * are pure, cargo-tested helpers (Plan 03 Task 1) with multiple call sites inside `mod
   * tests` by design -- a whole-file count would conflate "how many cargo tests exercise this
   * helper" with "how many production call sites exist", which is the thing these `exactly
   * ONCE` acceptance criteria actually police (mirrors the file's own reveal_post_script /
   * clear_storage_script precedent, neither of which carries a whole-file uniqueness guard for
   * exactly this reason).
   */
  function productionCode(code: string): string {
    const testModStart = code.indexOf('mod tests {')
    expect(testModStart).toBeGreaterThan(-1)
    return code.slice(0, testModStart)
  }

  test('Test 1: autofill_glyph_script( is called exactly once in the comment-stripped PRODUCTION source, inside the humble_login_open arm slice', () => {
    const code = productionCode(loadMainRsCode())
    // Negative lookbehind excludes the `fn autofill_glyph_script(` definition itself.
    const fileCallSites = code.match(/(?<!fn )autofill_glyph_script\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const armCallSites = armBody.match(/(?<!fn )autofill_glyph_script\(/g) ?? []
    expect(armCallSites.length).toBe(1)
  })

  test('Test 2: within the arm slice, the autofill_glyph_script( call site lies inside an if-visible guard', () => {
    const code = loadMainRsCode()
    const armBody = extractHumbleLoginOpenArmBody(code)
    const visibleStart = armBody.indexOf('if visible {')
    expect(visibleStart).toBeGreaterThan(-1)
    // The `if visible` block containing the glyph injection is closed a few lines before the
    // arm's dev-only-diagnostic `#[cfg(debug_assertions)]` attribute -- a CODE token that
    // survives comment-stripping, unlike the surrounding prose (which is comment-only and
    // therefore invisible to `loadMainRsCode`'s output). Bound the search there rather than
    // brace-counting, mirroring this file's other arm-slice conventions.
    const visibleEnd = armBody.indexOf(
      '#[cfg(debug_assertions)]',
      visibleStart
    )
    expect(visibleEnd).toBeGreaterThan(visibleStart)
    const visibleBlock = armBody.slice(visibleStart, visibleEnd)
    expect(visibleBlock).toContain('autofill_glyph_script(')
  })

  test('Test 3: the arm contains exactly one .on_navigation( call, its closure body contains parse_autofill_request and return false, and contains none of push_login_window_event/set_title/current_origin/login_event_value', () => {
    const armBody = extractHumbleLoginOpenArmBody(loadMainRsCode())
    const onNavCount = (armBody.match(/\.on_navigation\(/g) ?? []).length
    expect(onNavCount).toBe(1)

    const onNavStart = armBody.indexOf('.on_navigation(')
    expect(onNavStart).toBeGreaterThan(-1)
    const onNavEnd = armBody.indexOf('.build()', onNavStart)
    expect(onNavEnd).toBeGreaterThan(onNavStart)
    const onNavBody = armBody.slice(onNavStart, onNavEnd)

    expect(onNavBody).toContain('parse_autofill_request')
    expect(onNavBody).toContain('return false')
    expect(onNavBody).not.toContain('push_login_window_event')
    expect(onNavBody).not.toContain('set_title')
    expect(onNavBody).not.toContain('current_origin')
    expect(onNavBody).not.toContain('login_event_value')
  })

  // GENERALIZED array-driven guard (REQ-34.4.2-10): every member of PHASE_34_4_2_NEW_SYMBOLS
  // -- current and future appends -- is asserted absent from BOTH pristine regions. Plan 01's
  // own Test 3 already runs this same generalized loop; this copy is scoped to this plan's own
  // file section so deleting either describe block still leaves a guard in place (Plan 02's
  // Test 9 precedent). Additionally asserts the pristine open function receives no WKUserScript
  // machinery at all -- the pristine surface receives NOTHING from this phase.
  test('Test 4 (SCOPE GUARD, REQ-34.4.2-10): neither pristine region references any PHASE_34_4_2_NEW_SYMBOLS member, and open_pristine_epic_login_window contains no WKUserScript/addUserScript/userContentController', () => {
    const code = loadMainRsCode()
    const pristineBody = extractPristineLoginFnBody(code)
    const delegateBody = extractEpicPristineNavDelegateBody(code)
    for (const symbol of PHASE_34_4_2_NEW_SYMBOLS) {
      expect(pristineBody).not.toContain(symbol)
      expect(delegateBody).not.toContain(symbol)
    }
    expect(pristineBody).not.toContain('WKUserScript')
    expect(pristineBody).not.toContain('addUserScript')
    expect(pristineBody).not.toContain('userContentController')
  })

  // Permanent negatives (spike 022, `login-window-ux-macos.md` "What to Avoid"): these are not
  // stylistic bans, they are records of MEASURED platform impossibility -- a future reader must
  // be able to see that, so nobody spends another spike rediscovering them.
  test('Test 5 (NEGATIVE, permanent -- spike 022 measured platform impossibility): the source contains none of the Digital Credentials / private credential-storage selectors, which are either the W3C Digital Credentials API (identity documents, not passwords) or private and inaccessible', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('_showDigitalCredentialsPicker')
    expect(code).not.toContain('_setCanUseCredentialStorage')
    expect(code).not.toContain('_canUseCredentialStorage')
    expect(code).not.toContain('menuForEvent')
  })

  test('Test 6 (NEGATIVE, permanent -- spike 022 measured platform impossibility): the source contains no willOpenMenu and no NSMenu import -- the AutoFill item is injected by macOS at menu-display time and is absent from the NSMenu object graph; capturing or re-firing it is impossible', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('willOpenMenu')
    expect(code).not.toContain('NSMenu')
  })

  test('Test 7: GAMELIB_AUTOFILL_GLYPH appears exactly once, inside the same (brace-matched) if-visible block as autofill_glyph_script(, and that block contains no #[cfg(debug_assertions)] attribute -- the kill switch must work in a packaged build (unlike GAMELIB_LOGIN_DIAG, which IS debug_assertions-gated, further down this same arm)', () => {
    const code = loadMainRsCode()
    expect((code.match(/GAMELIB_AUTOFILL_GLYPH/g) ?? []).length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    // Brace-matched (not string-bounded), so an ABSENCE assertion on the slice is meaningful
    // rather than trivially true by construction of the boundary itself.
    const visibleBlock = extractBracedBlock(armBody, 'if visible {')

    expect(visibleBlock).toContain('GAMELIB_AUTOFILL_GLYPH')
    expect(visibleBlock).not.toContain('#[cfg(debug_assertions)]')
  })

  test('Test 8 (NEGATIVE, REQ-34.4.2-10): Cargo.toml\'s objc2-web-kit feature array contains none of WKUserScript/WKUserContentController/WKUserScriptInjectionTime -- the features only a pristine-surface injection would need', () => {
    const cargoToml = readFileSync(CARGO_TOML_PATH, 'utf-8')
    const start = cargoToml.indexOf('objc2-web-kit = {')
    expect(start).toBeGreaterThan(-1)
    const end = cargoToml.indexOf('] }', start)
    expect(end).toBeGreaterThan(start)
    const featureBlock = cargoToml.slice(start, end)
    expect(featureBlock).not.toContain('WKUserScript')
    expect(featureBlock).not.toContain('WKUserContentController')
    expect(featureBlock).not.toContain('WKUserScriptInjectionTime')
  })
})

// Phase 34.4.2 Plan 04 (REQ-34.4.2-05/06/07/08/10): the synthesized right-click poster that
// closes the affordance -- turns the autofill request Plan 03 delivers into a debounced,
// bounds-validated RightMouseDown/RightMouseUp pair posted at the password field's centre.
// PHASE_34_4_2_NEW_SYMBOLS (above) already carries this plan's six new symbol names, so Plan
// 01's own generalized Test 3 (both pristine regions) covers them without any change to that
// describe block; Test 7 below re-asserts the same absence directly, scoped to this plan's own
// file section, so deleting either describe block still leaves a guard in place (mirrors Plan
// 02's Test 9 / Plan 03's Test 4 precedent).
describe('Phase 34.4.2 Plan 04 — synthesized right-click poster', () => {
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
   * Slices `code` from `fn post_autofill_right_click(` (inclusive) to the next top-level
   * `#[cfg(target_os = "macos")]` attribute OR the next `\nfn ` token -- whichever comes
   * first -- asserting the start was found and at least one candidate end marker was found
   * before slicing (an `indexOf` miss returning -1 must fail loudly, never silently slice to
   * the file start/end).
   */
  function extractPostAutofillRightClickBody(code: string): string {
    const start = code.indexOf('fn post_autofill_right_click(')
    expect(start).toBeGreaterThan(-1)
    const cfgEnd = code.indexOf('#[cfg(target_os = "macos")]', start)
    const fnEnd = code.indexOf('\nfn ', start)
    const candidates = [cfgEnd, fnEnd].filter((idx) => idx > start)
    expect(candidates.length).toBeGreaterThan(0)
    const end = Math.min(...candidates)
    return code.slice(start, end)
  }

  test('Test 1: post_autofill_right_click( is CALLED exactly ONCE in the file, and that call site is inside the humble_login_open arm slice', () => {
    const code = loadMainRsCode()
    // Negative lookbehind excludes the `fn post_autofill_right_click(` definition itself.
    const fileCallSites =
      code.match(/(?<!fn )post_autofill_right_click\(/g) ?? []
    expect(fileCallSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const armCallSites =
      armBody.match(/(?<!fn )post_autofill_right_click\(/g) ?? []
    expect(armCallSites.length).toBe(1)
  })

  test('Test 2 (ORDERING): inside post_autofill_right_click\'s sliced body, clamp_point_to_view_bounds is referenced BEFORE the first postEvent_atStart -- the bounds refusal cannot be bypassed by reordering', () => {
    const code = loadMainRsCode()
    const body = extractPostAutofillRightClickBody(code)
    const clampIdx = body.indexOf('clamp_point_to_view_bounds')
    const postIdx = body.indexOf('postEvent_atStart')
    expect(clampIdx).toBeGreaterThan(-1)
    expect(postIdx).toBeGreaterThan(-1)
    expect(clampIdx).toBeLessThan(postIdx)
  })

  test('Test 3 (ORDERING): inside the same sliced body, the debounce read (LAST_AUTOFILL_POST) precedes login_window_wk_webview -- a flooded request must be rejected before it ever touches AppKit', () => {
    const code = loadMainRsCode()
    const body = extractPostAutofillRightClickBody(code)
    const debounceIdx = body.indexOf('LAST_AUTOFILL_POST')
    const webviewIdx = body.indexOf('login_window_wk_webview')
    expect(debounceIdx).toBeGreaterThan(-1)
    expect(webviewIdx).toBeGreaterThan(-1)
    expect(debounceIdx).toBeLessThan(webviewIdx)
  })

  test('Test 4 (RESTRICTION): the sliced body constructs exactly two NSEventType:: variants -- RightMouseDown and RightMouseUp -- and contains no LeftMouse, no KeyDown, no ScrollWheel', () => {
    const code = loadMainRsCode()
    const body = extractPostAutofillRightClickBody(code)
    const variantMatches = body.match(/NSEventType::/g) ?? []
    expect(variantMatches.length).toBe(2)
    expect(body).toContain('NSEventType::RightMouseDown')
    expect(body).toContain('NSEventType::RightMouseUp')
    expect(body).not.toContain('LeftMouse')
    expect(body).not.toContain('KeyDown')
    expect(body).not.toContain('ScrollWheel')
  })

  test('Test 5 (RESTRICTION): the sliced body references ATTACHED_LOGIN_CHILDREN -- hidden reveal/clear windows are structurally unreachable from this path', () => {
    const code = loadMainRsCode()
    const body = extractPostAutofillRightClickBody(code)
    expect(body).toContain('ATTACHED_LOGIN_CHILDREN')
  })

  test('Test 6 (NEGATIVE, permanent): the comment-stripped source contains none of the Digital Credentials / private credential-storage selectors -- re-asserts Plan 03\'s own guard here so deleting either describe block still leaves one in place', () => {
    const code = loadMainRsCode()
    expect(code).not.toContain('_showDigitalCredentialsPicker')
    expect(code).not.toContain('_dismissDigitalCredentialsPicker')
    expect(code).not.toContain('_canUseCredentialStorage')
    expect(code).not.toContain('_setCanUseCredentialStorage')
  })

  // Test 7 exists because the pristine Epic surface is excluded by a LOCKED USER SCOPE
  // DECISION (2026-08-04), not by a technical limitation -- Epic is implemented LAST, after
  // every other runner is ported and proven. Loosening this test requires the user's decision
  // to change, not a planner's judgement (mirrors Plan 01's own Test 3/4 rationale verbatim).
  test('Test 7 (SCOPE GUARD, REQ-34.4.2-10, LOCKED USER SCOPE DECISION): neither open_pristine_epic_login_window NOR EpicPristineNavDelegate references any PHASE_34_4_2_NEW_SYMBOLS member, including this plan\'s own six new symbols', () => {
    const code = loadMainRsCode()
    const pristineBody = extractPristineLoginFnBody(code)
    const delegateBody = extractEpicPristineNavDelegateBody(code)
    for (const symbol of PHASE_34_4_2_NEW_SYMBOLS) {
      expect(pristineBody).not.toContain(symbol)
      expect(delegateBody).not.toContain(symbol)
    }
  })

  test('Test 8: synth_autofill_mouse_event is the SOLE construction site -- mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure appears exactly once in the whole comment-stripped source', () => {
    const code = loadMainRsCode()
    const matches =
      code.match(
        /mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure/g
      ) ?? []
    expect(matches.length).toBe(1)

    const start = code.indexOf('fn synth_autofill_mouse_event(')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf(
      'fn post_autofill_right_click(',
      start
    )
    expect(end).toBeGreaterThan(start)
    expect(code.slice(start, end)).toContain(
      'mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure'
    )
  })
})
