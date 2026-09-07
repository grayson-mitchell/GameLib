/**
 * Quick task `260907-j8n` (actions the F-9 todo,
 * `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`,
 * disposition `2026-09-07`): pins that the shell's four RPC transport-failure diagnostics route
 * through `shell_diag()` rather than a bare `eprintln!`, so they persist to `gamelib-shell.log`
 * and survive a packaged build where LaunchServices discards stderr.
 *
 * Why this file exists at all, given `src-tauri/src/main.rs` already carries a cargo test module
 * for the pure `invoke_abandoned_message` helper: that module cannot reach the four CALL SITES
 * this task actually changed — two sit inside the reader thread, two sit inside
 * `SidecarState::invoke`'s timeout and disconnect arms — because none of the four is reachable
 * from `#[cfg(test)] mod tests` without a live sidecar (a real `Child`/`ChildStdin`). Those call
 * sites could therefore route through the correct helper with the correct format and still never
 * be exercised by a single cargo test. More pointedly: **this project's CI runs no cargo step at
 * all** (`.github/workflows/*.yml` contains neither `cargo test` nor `cargo check`), so that
 * module is a manual gate. This file is the part that actually runs on every push.
 *
 * **This task does NOT close F-9.** It makes an invoke abandoned with no late response
 * observable in a packaged build for the first time — previously it was visible only as a
 * rejected promise in the renderer. `id=1575` remains UNDETERMINED; see the todo's 2026-09-07
 * disposition.
 *
 * COMMENT-STRIPPED for every presence/absence assertion, and that is load-bearing here
 * specifically: the doc comments this task added to `main.rs` quote the diagnostic formats and
 * the ordering constraint verbatim, to explain what changed and why. An unfiltered match would
 * therefore pass on the explanatory prose alone even if the real call sites were reverted — the
 * exact "a RAW-source gate is satisfied by the prose that names its subject" failure this project
 * has already paid for. The shared stripper (`stripSourceComments`) also drops any line beginning
 * with `*`, which in Rust would eat a leading-deref line (`*foo = bar;`); none of the lines this
 * gate matches has that shape, so it is a known property of the shared util, not a defect here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from '../testUtils/stripSourceComments'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

const CAPTURE_SCROLLBACK_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'meta',
  'captureShellScrollback.ts'
)

function loadMainRsRaw(): string {
  return readFileSync(MAIN_RS_PATH, 'utf-8')
}

/** Comment-stripped main.rs, via the shared stripper — never a hand-rolled pass. */
function loadMainRsCode(source?: string): string {
  return stripSourceComments(source ?? loadMainRsRaw())
}

describe('comment-stripping is real for this gate (self-test)', () => {
  // The doc comment Task 1 added on the `match timeout` block in `SidecarState::invoke`, quoted
  // verbatim in the plan and present ONLY inside that comment — never in code.
  const PHRASE =
    'a transport failure that leaves no trace is indistinguishable from no failure'

  test('the ordering-rationale phrase is present in RAW source but absent after stripping', () => {
    // Presence precondition FIRST: an absence assertion alone would go on passing for entirely
    // the wrong reason the moment someone reworded or deleted the comment, because a phrase that
    // no longer exists is trivially absent from stripped output.
    expect(loadMainRsRaw()).toContain(PHRASE)
    expect(loadMainRsCode()).not.toContain(PHRASE)
  })
})

describe('Site A and Site B route through shell_diag, not a bare eprintln!', () => {
  test('Site A (unknown/timed-out id) calls shell_diag', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /shell_diag\(&format!\(\s*"response for unknown\/timed-out id=\{id\} channel=\{channel\} \(dropped\)"/
    )
  })

  test('Site A regression guard: the bare eprintln! form is gone', () => {
    const code = loadMainRsCode()

    expect(code).not.toMatch(
      /eprintln!\(\s*"\[shell\] response for unknown\/timed-out/
    )
  })

  test('Site B (missing/non-string id) calls shell_diag', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /shell_diag\(\s*"response frame with a missing or non-string id \(dropped\)"/
    )
  })

  test('Site B regression guard: the bare eprintln! form is gone', () => {
    const code = loadMainRsCode()

    expect(code).not.toMatch(
      /eprintln!\(\s*"\[shell\] response frame with a missing or non-string id/
    )
  })
})

describe('Sites C and D: both silent invoke() arms are now instrumented', () => {
  test('shell_diag(&invoke_abandoned_message( occurs exactly twice — COUNTED', () => {
    const code = loadMainRsCode()

    // Counted, not `toContain`-ed, for the same reason the sibling gate
    // (`abandonedInvokeAttribution.test.ts`) counts `record_abandoned` calls: a `toContain` pin
    // catches deletion of every occurrence, never one of two, and the timeout arm is precisely
    // where F-9's own event came from. This is the same blind spot that gate's own history
    // documents having been hand-verified against.
    const occurrences = code.match(/shell_diag\(&invoke_abandoned_message\(/g)
    expect(occurrences).toHaveLength(2)
  })

  test('the timeout arm carries the "timeout" reason, paired with its own Err', () => {
    const code = loadMainRsCode()

    // This shape also encodes the ordering constraint `abandonedInvokeAttribution.test.ts`
    // imposes: that gate matches `record_abandoned(&id, &channel);\s*Err(...)` with only
    // whitespace between the two statements, so the new `shell_diag` call MUST precede
    // `record_abandoned`, never sit between it and the `Err`. Reordering it to come after
    // `record_abandoned` (between it and `Err`) would satisfy this pin while breaking that one —
    // RED-proofed in the SUMMARY (mutation d).
    expect(code).toMatch(
      /shell_diag\(&invoke_abandoned_message\("timeout", &id, &channel\)\);\s*self\.record_abandoned\(&id, &channel\);\s*Err\(invoke_timeout_message\(&channel\)\)/
    )
  })

  test('the disconnect arm carries the "sidecar closed" reason, paired with its own Err', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /shell_diag\(&invoke_abandoned_message\("sidecar closed", &id, &channel\)\);\s*self\.record_abandoned\(&id, &channel\);\s*Err\("sidecar closed before responding"\.into\(\)\)/
    )
  })
})

describe('double-prefix guard: no shell_diag call anywhere in main.rs passes a literal beginning with [shell] ', () => {
  const DOUBLE_PREFIX_RE = /shell_diag\(\s*(?:&format!\(\s*)?"\[shell\]/

  test('the guard passes against real main.rs', () => {
    const code = loadMainRsCode()

    expect(code).not.toMatch(DOUBLE_PREFIX_RE)
  })

  test('the guard is non-vacuous: a synthetic positive control DOES match', () => {
    // A guard whose vocabulary is wrong convicts nothing and reports green forever — measure the
    // vocabulary first, against a case it must catch.
    expect('shell_diag(&format!("[shell] doubled"))').toMatch(DOUBLE_PREFIX_RE)
  })
})

describe("invoke_abandoned_message's contract", () => {
  test('the signature is pinned', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /fn invoke_abandoned_message\(reason: &str, id: &str, channel: &str\) -> String/
    )
  })

  test('the format literal is pinned and carries both id and channel', () => {
    const code = loadMainRsCode()

    expect(code).toContain(
      'format!("invoke abandoned ({reason}): id={id} channel={channel}")'
    )
  })
})

describe('non-collision with the capture harness, drift-proof', () => {
  // Local `String.raw` copies of the harness's two regex pattern SOURCES. Declared here rather
  // than imported: `meta/captureShellScrollback.ts`'s module scope runs `assertRepoRoot()` and
  // reads `src-tauri/src/main.rs` as a side effect of import, which this gate must not trigger
  // just to probe it.
  const TARGET_DROP_RE_SOURCE = String.raw`^\[shell\] response for unknown/timed-out id=(?<id>\S+) channel=(?<channel>\S+) \(dropped\)$`
  const LEGACY_TARGET_DROP_RE_SOURCE = String.raw`^\[shell\] response for unknown/timed-out id=(?<id>\S+) \(dropped\)$`

  function loadCaptureScrollbackRaw(): string {
    return readFileSync(CAPTURE_SCROLLBACK_PATH, 'utf-8')
  }

  test('the local copies are byte-identical to the harness source — a rename or edit there fails HERE', () => {
    const harnessSource = loadCaptureScrollbackRaw()

    expect(harnessSource).toContain(TARGET_DROP_RE_SOURCE)
    expect(harnessSource).toContain(LEGACY_TARGET_DROP_RE_SOURCE)
  })

  test('a rendered new abandonment line matches NEITHER harness regex', () => {
    const sample = '[shell] invoke abandoned (timeout): id=1575 channel=getCookies'

    expect(sample).not.toMatch(new RegExp(TARGET_DROP_RE_SOURCE))
    expect(sample).not.toMatch(new RegExp(LEGACY_TARGET_DROP_RE_SOURCE))
  })

  test('non-vacuity control: a rendered Site A line still matches TARGET_DROP_RE', () => {
    const siteALine =
      '[shell] response for unknown/timed-out id=1575 channel=getCookies (dropped)'

    expect(siteALine).toMatch(new RegExp(TARGET_DROP_RE_SOURCE))
  })
})
