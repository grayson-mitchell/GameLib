/**
 * Quick task `261015-lz5` (closes
 * `.planning/todos/pending/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md`):
 * pins that all 30 of `macos_epic_embed.rs`'s diagnostics route through
 * `crate::shell_diag(...)` rather than a bare `eprintln!`, so they persist to
 * `~/Library/Logs/GameLib/gamelib-shell.log` and survive a packaged build where
 * LaunchServices discards stderr.
 *
 * Modeled directly on `shellDiagPersistence.test.ts` and `keyringDiagPersistence.test.ts`
 * (same self-test, same comment-stripping discipline, same counted-not-`toContain`-ed
 * assertions), and reuses the `macosEpicEmbedSource.test.ts` loader shape (comment-stripped
 * via the shared `stripSourceComments`/`stripTrailingLineComment` utilities).
 *
 * Why this file exists at all: `macos_epic_embed.rs` is `#![cfg(target_os = "macos")]` objc2
 * glue that Linux CI never compiles, AND **this project's CI runs no cargo step at all**
 * (`.github/workflows/*.yml` contains neither `cargo test` nor `cargo check`, measured). So a
 * cargo-side assertion would never run on a push. This jest file, reading the Rust source as
 * text, is the only thing that actually gates the swap on every push.
 *
 * COMMENT-STRIPPED for every assertion below, same reasoning as both precedents: a future doc
 * comment discussing the swap (Task 1 added one) could otherwise satisfy a gate that merely
 * names the forbidden macro, without a single real occurrence in code.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'

const EPIC_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'macos_epic_embed.rs'
)

/** Comment-stripped macos_epic_embed.rs, via the shared strippers — never a hand-rolled pass. */
function loadCode(source?: string): string {
  const raw = source ?? readFileSync(EPIC_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const code = loadCode()

// Measured at HEAD `9fa43de5e` (Task 1's commit): 30 discarded-stderr eprintln! sites swapped
// to crate::shell_diag(...), 0 remaining — not the 25 the source todo's own title claimed.
const MEASURED_CALL_SITE_COUNT = 30

describe('comment-stripping is real for this gate (self-test)', () => {
  test('a comment naming the forbidden macro does not survive stripping', () => {
    // Presence precondition FIRST — an absence assertion alone would pass on a deleted/reworded
    // comment for entirely the wrong reason. See shellDiagPersistence.test.ts's identical
    // reasoning.
    const snippet = '// eprintln! was replaced with shell_diag here\nfn a() {}'
    expect(snippet).toContain('eprintln!')
    expect(loadCode(snippet)).not.toContain('eprintln!')
  })
})

describe('zero occurrences of the discarded-stderr macro remain', () => {
  test('eprintln! does not occur anywhere in the comment-stripped source', () => {
    const occurrences = code.match(/eprintln!/g)
    expect(occurrences).toBeNull()
  })
})

describe('exactly 30 crate::shell_diag( call sites — COUNTED, not toContain-ed', () => {
  test('crate::shell_diag( occurs exactly MEASURED_CALL_SITE_COUNT times', () => {
    // Counted rather than `toContain`-ed: a `toContain` pin is satisfied by 1 call site out of
    // 30 and is the exact shape that lets 29 regressions through (shellDiagPersistence.test.ts's
    // identical framing).
    expect(count(code, 'crate::shell_diag(')).toBe(MEASURED_CALL_SITE_COUNT)
  })
})

describe('double-prefix guard: no shell_diag call in this file passes a literal beginning with [shell] ', () => {
  // Guards BOTH argument forms this file actually uses: a plain literal (`shell_diag("...`) and
  // an interpolated one (`shell_diag(&format!("...`). A count-only assertion above cannot see
  // this: it would still report 30 if every single one of them doubled the prefix.
  const DOUBLE_PREFIX_RE = /shell_diag\(\s*(?:&format!\(\s*)?"\[shell\]/

  test('the guard passes against the real file', () => {
    expect(code).not.toMatch(DOUBLE_PREFIX_RE)
  })

  test('non-vacuity control: the guard DOES match a synthetic plain-literal double-prefix', () => {
    expect('crate::shell_diag("[shell] doubled")').toMatch(DOUBLE_PREFIX_RE)
  })

  test('non-vacuity control: the guard DOES match a synthetic &format!(...) double-prefix', () => {
    expect('crate::shell_diag(&format!("[shell] doubled: {e}"))').toMatch(
      DOUBLE_PREFIX_RE
    )
  })
})

describe('RED-proof: this gate fails against the pre-Task-1 shape', () => {
  test('a hand-reconstructed pre-fix snippet (bare eprintln!, no shell_diag) fails every assertion above', () => {
    // A committed, durable mutation arm — a literal snippet carrying the pre-Task-1 shape, run
    // through the SAME helpers and assertions the live gates above use. Kept as a literal
    // snippet rather than a `git show`, so it cannot rot when HEAD moves past Task 1's commit
    // (per the plan's D-LZ5-03 instruction).
    const preTask1Snippet = `
    fn epic_embed_record_launcher_scheme_block(webview: &WKWebView, what: &str) {
        eprintln!(
            "[shell] macos_epic_embed: blocked a {what} to the Epic Games Launcher scheme \\
             ('{EPIC_GAMES_LAUNCHER_SCHEME}') -- D-14"
        );
        if let Ok(mut guard) = surface().lock() {
            guard.blocked_launcher_scheme_count =
                guard.blocked_launcher_scheme_count.saturating_add(1);
            let event = nav_state_json(webview);
            guard.enqueue_nav_event(event);
        } else {
            eprintln!("[shell] WARN: macos_epic_embed surface registry poisoned -- continuing");
        }
    }`

    const preTask1Code = loadCode(preTask1Snippet)

    const eprintlnOccurrences = preTask1Code.match(/eprintln!/g)
    expect(eprintlnOccurrences).not.toBeNull()
    expect(eprintlnOccurrences!.length).toBe(2)
    expect(eprintlnOccurrences!.length).not.toBe(0)

    const shellDiagOccurrences = count(preTask1Code, 'crate::shell_diag(')
    expect(shellDiagOccurrences).toBe(0)
    expect(shellDiagOccurrences).not.toBe(MEASURED_CALL_SITE_COUNT)
  })
})
