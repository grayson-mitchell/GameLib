/**
 * Source-text structural gate targeting the "Join our Discord" CALL SITE (Phase 34.3 gap-fill,
 * debug session `open-external-frame-noop`, closing REQ-34.3-11 item 1's second half).
 *
 * WHY THIS GATE EXISTS AND WHY IT IS SHAPED THIS WAY
 *
 * `openDiscordLink` (`frontend/helpers`) is a `send()`-routed IPC caller (`makeListenerCaller`
 * produced). It used to be bound BARE as a JSX `onClick` handler
 * (`onClick={openDiscordLink}`), so React invoked it with the click's SyntheticEvent, which got
 * forwarded straight into the IPC frame. Tauri's `invoke()` JSON-serializes that payload
 * internally and threw on the event's cyclic references, silently rejecting the send with no
 * signal anywhere -- see `tauriTransport.ts`'s `send()` docstring for the other half of this
 * same debug session. The fix (`LogSettings/index.tsx`) wraps the call in a local zero-arg
 * `openDiscord()` function and binds THAT to `onClick`, so no event object is ever forwarded.
 * Today ONLY a code comment protects that shape from silently regressing back to a bare bind.
 *
 * `LogSettings/index.tsx` cannot be imported under this project's `node`-environment Frontend
 * jest project (no jsdom, no react-test-renderer -- see `src/frontend/jest.config.js`'s header
 * comment). Same documented constraint and same approach as
 * `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts`: read the real component source
 * and assert on its text shape instead of rendering it.
 *
 * COMMENT-STRIPPING IS LOAD-BEARING HERE, not just defensive boilerplate. The very comment that
 * explains this fix ALSO contains the literal substrings `openDiscordLink`, `onClick`, and
 * `SyntheticEvent` at length (see the block directly above `function openDiscord()` in the real
 * file), so any naive gate over the RAW file text can pass on that prose alone even if the real
 * JSX reverted to a bare bind. Every assertion below therefore runs against comment-stripped
 * source, and the self-test suite proves the stripping is actually doing that work (mirrors
 * `tauriShellSource.test.ts`'s own comment-stripping self-test for the sibling REQ-34.3-11 item 2
 * gate).
 *
 * Every positive assertion below uses `toBe`/`toContain`, and the one negative assertion (the
 * component must never bare-bind `openDiscordLink`) is paired with a positive assertion that
 * fails if the construct it is supposed to protect (the wrapper) vanishes entirely -- this
 * project has shipped 7 vacuous bare-negative-regex gates that passed happily against files that
 * no longer contained the construct at all, and this gate is built not to be the 8th.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const componentPath = join(__dirname, '..', 'index.tsx')
const realSource = readFileSync(componentPath, 'utf-8')

/** Drops every whole line whose trimmed text starts with a `//` comment marker. */
function stripLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

/** Collapses every run of whitespace to a single space -- a whitespace WINDOW, not a line. */
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

/** The exact pipeline every assertion below runs source text through. */
function analyze(source: string): string {
  return collapse(stripLineComments(source))
}

const WRAPPER_DEFINITION = 'function openDiscord() { openDiscordLink() }'
const WRAPPER_BIND = 'onClick={openDiscord}'
const BARE_BIND = 'onClick={openDiscordLink}'

describe('LogSettings "Join our Discord" call-site gate', () => {
  const collapsed = analyze(realSource)

  it('non-vacuity anchor: openDiscordLink is imported from frontend/helpers, and comment-stripping did not eat the whole file', () => {
    expect(collapsed).toContain(
      "import { openDiscordLink } from 'frontend/helpers'"
    )
    // Exactly two references survive comment-stripping: the import, and the single call
    // inside the wrapper below. The real file's explanatory comment names `openDiscordLink`
    // twice more -- if this count is ever 4, comment-stripping silently stopped working and
    // every other assertion in this file is reading unstripped prose.
    const occurrences = (collapsed.match(/openDiscordLink/g) ?? []).length
    expect(occurrences).toBeGreaterThan(0)
    expect(occurrences).toBe(2)
  })

  it('a local zero-arg openDiscord() wrapper exists and calls openDiscordLink() with no arguments', () => {
    expect(collapsed).toContain(WRAPPER_DEFINITION)
  })

  it('the JSX button binds the wrapper (onClick={openDiscord}), exactly once', () => {
    const count = collapsed.split(WRAPPER_BIND).length - 1
    expect(count).toBe(1)
  })

  it('openDiscordLink is NEVER bound bare as the JSX handler (paired with the wrapper-exists assertion above)', () => {
    // Paired negative: this alone would pass vacuously against a file with no Discord button
    // at all. The wrapper-definition and wrapper-bind assertions above are what make this
    // meaningful -- together they require "the wrapper exists, is wired to onClick, AND the
    // raw import is never wired to onClick directly".
    expect(collapsed).not.toContain(BARE_BIND)
  })

  describe('self-test (anti-vacuity, RED-proof precursors)', () => {
    it('comment-stripping actually removes the explanatory comment block, not just decorative whitespace', () => {
      // The real file's comment names the debug session itself -- a marker string that exists
      // ONLY in the comment, never in code. If this string survives into `collapsed`, the
      // strip step is not running and every assertion above is vulnerable to passing on prose.
      expect(realSource).toContain('open-external-frame-noop')
      expect(collapsed).not.toContain('open-external-frame-noop')
    })

    it('a synthetic COMMENT-ONLY specimen (prose mentions the wrapper and the safe bind, but the real code still bare-binds) is NOT accepted by the gate', () => {
      const trap = [
        "import { openDiscordLink } from 'frontend/helpers'",
        '// function openDiscord() { openDiscordLink() }',
        '// onClick={openDiscord} is the safe binding used elsewhere',
        'function Component() {',
        '  return <a onClick={openDiscordLink}>Join our Discord</a>',
        '}'
      ].join('\n')
      const trapCollapsed = analyze(trap)

      // The wrapper-existence assertion must NOT be satisfied by the comment-only mention --
      // proves the positive assertion is reading code, not prose.
      expect(trapCollapsed).not.toContain(WRAPPER_DEFINITION)
      // And the bare-bind negative assertion correctly still catches the real (uncommented)
      // regression this specimen contains.
      expect(trapCollapsed).toContain(BARE_BIND)
    })

    it('a synthetic reversion to a bare onClick={openDiscordLink} bind is caught by the gate (RED direction)', () => {
      const regressed = realSource.replace(
        'onClick={openDiscord}',
        'onClick={openDiscordLink}'
      )
      const regressedCollapsed = analyze(regressed)
      // Against the regressed source, the "never bare bound" assertion's predicate must flip
      // to true -- i.e. the real assertion (`.not.toContain(BARE_BIND)`) would now FAIL.
      expect(regressedCollapsed).toContain(BARE_BIND)
    })

    it('a synthetic removal of the openDiscord() wrapper is caught by the gate (RED direction)', () => {
      const regressed = realSource.replace(
        'function openDiscord() {\n    openDiscordLink()\n  }',
        ''
      )
      // Guard the fixture itself: if the literal wrapper text ever reformats, this replace
      // silently no-ops and the test below would pass vacuously against the untouched source.
      expect(regressed).not.toBe(realSource)
      const regressedCollapsed = analyze(regressed)
      // The wrapper-existence assertion's predicate must flip to false against this specimen.
      expect(regressedCollapsed).not.toContain(WRAPPER_DEFINITION)
    })
  })
})
