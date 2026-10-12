/**
 * Phase 50 review fixes (findings 2, 5, 7, 10, 12, 13, 14) — SOURCE-TEXT checks over
 * `src-tauri/src/macos_epic_embed.rs`.
 *
 * Say it plainly: these are structural assertions on Rust source text, not behaviour. That file
 * is `#![cfg(target_os = "macos")]` objc2 glue — Linux CI never compiles it and nothing anywhere
 * can run it outside a real Mac with a live `WKWebView`. The DECISIONS it applies (visibility,
 * selection, the nav-state flag merge, KVO de-duplication) live in the cfg-free
 * `src-tauri/src/epic_embed_state.rs` and are behaviour-tested there with `cargo test` on Linux.
 * What only source text can pin is that the glue actually routes through those decisions: one
 * `setHidden` writer, the selection change on the main thread, no bare nav-state return, the
 * NSURL built before any view mutation, the autoresizing mask, and KVO registered AND removed.
 *
 * Every assertion runs against a comment-stripped copy (the shared `stripSourceComments` util
 * plus the string-aware trailing-`//` pass `tauriShellSource.test.ts` uses), because the module's
 * own doc comments name most of the tokens asserted on here.
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

function loadCode(source?: string): string {
  const raw = source ?? readFileSync(EPIC_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

/** Returns `fn <name>(...)`'s brace-matched body (signature through closing brace). */
function fnBody(code: string, name: string): string {
  const start = code.search(new RegExp(`fn ${name}\\s*[(<]`))
  if (start === -1) throw new Error(`fn ${name} not found`)
  const open = code.indexOf('{', start)
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) return code.slice(start, i + 1)
    }
  }
  throw new Error(`fn ${name} body is unbalanced`)
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const code = loadCode()

describe('helpers (self-test)', () => {
  test('fnBody returns exactly one brace-matched function', () => {
    const src = 'fn a() { if x { y } }\nfn b() { z }'
    expect(fnBody(src, 'a')).toBe('fn a() { if x { y } }')
  })

  test('a comment naming a token does not survive stripping', () => {
    expect(loadCode('// webview.setHidden(true)\nfn a() {}')).not.toContain(
      'setHidden'
    )
  })
})

describe('finding 13 — deselect changes `selected` inside the main-thread closure that hides', () => {
  test('deselect dispatches to the main thread itself and makes the selection change there', () => {
    const body = fnBody(code, 'deselect')
    const dispatch = body.indexOf('run_on_main_thread(')
    expect(dispatch).toBeGreaterThan(-1)
    const transition = body.indexOf('.visibility.deselect()')
    expect(transition).toBeGreaterThan(dispatch)
  })

  test('deselect no longer writes `selected = false` after a separate hide round-trip', () => {
    const body = fnBody(code, 'deselect')
    expect(body).not.toMatch(/selected\s*=\s*false/)
    expect(body).not.toContain('set_hidden(')
  })
})

describe('findings 5 + 7 — one derived-visibility writer', () => {
  test('`setHidden(` appears exactly once, inside apply_visibility', () => {
    expect(count(code, 'setHidden(')).toBe(1)
    expect(fnBody(code, 'apply_visibility')).toContain('setHidden(')
  })

  test('the challenge hook, page-initiated navigation start and chrome navigate all re-apply the derived visibility', () => {
    for (const name of [
      'decide_policy_for_navigation_response',
      'did_start_provisional_navigation',
      'navigate'
    ]) {
      const body = fnBody(code, name)
      expect({ name, sets: body.includes('set_challenged(') }).toEqual({
        name,
        sets: true
      })
      expect({ name, applies: body.includes('apply_visibility(') }).toEqual({
        name,
        applies: true
      })
    }
  })

  test('show/hide/open derive through the state machine, never a raw boolean', () => {
    expect(fnBody(code, 'set_hidden')).toMatch(
      /visibility\.(hide|show)\(\)|\.hide\(\)|\.show\(\)/
    )
    expect(fnBody(code, 'open')).toContain('.visibility.open()')
  })
})

describe('finding 2 — direct nav-result returns carry the Epic flags', () => {
  test('navigate_webview_on_main_thread never returns a bare nav_state_json()', () => {
    const body = fnBody(code, 'navigate_webview_on_main_thread')
    expect(body).not.toMatch(/Ok\(\s*nav_state_json\(/)
    expect(body).toContain('epic_nav_state_with_flags(')
  })

  test('enqueue_nav_event merges through the same function', () => {
    expect(fnBody(code, 'enqueue_nav_event')).toContain(
      'epic_nav_state_with_flags('
    )
  })
})

describe('finding 10 — open() builds the NSURL before mutating any view', () => {
  test('URLWithString precedes the first setFrame/addSubview/apply_visibility in open()', () => {
    const body = fnBody(code, 'open')
    const nsurl = body.indexOf('URLWithString(')
    expect(nsurl).toBeGreaterThan(-1)
    for (const mutation of ['setFrame(', 'addSubview(', 'apply_visibility(']) {
      const at = body.indexOf(mutation)
      expect({ mutation, before: at === -1 || nsurl < at }).toEqual({
        mutation,
        before: true
      })
    }
    expect(count(body, 'URLWithString(')).toBe(1)
  })
})

describe("finding 14 — the subview carries wry's child autoresizing mask", () => {
  test('a non-flipped parent gets ViewMinYMargin (wry), a flipped one ViewMaxYMargin', () => {
    expect(fnBody(code, 'top_pinned_autoresizing_mask')).toMatch(
      /if parent_is_flipped\s*\{\s*NSAutoresizingMaskOptions::ViewMaxYMargin\s*\}\s*else\s*\{\s*NSAutoresizingMaskOptions::ViewMinYMargin\s*\}/
    )
  })

  test('the cold path applies it, and no size-tracking mask exists anywhere (D-18)', () => {
    expect(fnBody(code, 'open')).toMatch(
      /setAutoresizingMask\(\s*top_pinned_autoresizing_mask\(\s*ns_view\.isFlipped\(\)\s*\)\s*\)/
    )
    expect(code).not.toMatch(/View(Width|Height)Sizable/)
  })
})
