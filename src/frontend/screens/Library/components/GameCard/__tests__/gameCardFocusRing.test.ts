/**
 * Source-text gate for the non-console highlight ring (quick task 260925-pga,
 * rewritten by quick task 260926-acw).
 *
 * What this proves NOW: hover and focus are SPLIT into two separate rules on
 * both `.gameCard` and `.gameListItem` -- the opposite contract from pga's
 * original unification. Hover stays a plain, token-driven (`var(--accent,
 * ...)`) but SUBTLE ring; focus is a louder, two-tone ring built from the
 * shared `--focus-ring-*` tokens (`themes.scss`'s base `body {}` block). The
 * old `-webkit-focus-ring-color` hairline is still gone. The stale-focus
 * suppression rules (left behind by gamepad navigation or a click) still
 * exist, but are now scoped to `body:not(.controllerLayout)`, and
 * `.consoleCard.focused` in `ConsoleMode/index.scss` still spends the same
 * `--accent` token for its own ring.
 *
 * Why the contract flipped: 260925-pga unified hover and focus onto one
 * rule so a mouse user and a gamepad/keyboard user got "the same
 * affordance". The todo this quick task actions
 * (`2026-09-25-controller-focus-has-no-perceptible-affordance.md`) recorded
 * two problems that unification produced: (a) hover and focus became
 * pixel-identical, so an operator could not tell which one a ring meant,
 * and (b) worse, pga's "hover wins while mousing" stale-focus suppression
 * (`.gameList:hover .gameCard:focus-within:not(:hover)`) fired whenever the
 * mouse cursor was merely RESTING over the grid, erasing gamepad focus
 * outright. 260926-acw splits the two looks and confines the suppression to
 * mouse-only sessions (`body:not(.controllerLayout)`), so a controller
 * session no longer loses its ring just because a cursor was left parked
 * over the grid.
 *
 * What this does NOT prove: anything about rendered pixels, whether either
 * ring is actually legible against cover art in any given theme, or whether
 * `:hover`/`:focus-within` fire for a given input path. This project treats
 * a gate that appears to cover more than it does as worse than no gate, so
 * that proof is deliberately routed elsewhere -- to the operator's live
 * controller sweep recorded in the todo -- and not claimed here.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

function readGameCardCss(): string {
  const raw = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
  return stripSourceComments(raw)
}

function readConsoleModeScss(): string {
  const raw = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'ConsoleMode', 'index.scss'),
    'utf8'
  )
  return stripSourceComments(raw)
}

function ruleBody(css: string, selector: RegExp): string {
  const match = css.match(selector)
  if (!match) {
    throw new Error(`could not find a rule matching ${selector}`)
  }
  return match[0]
}

const GAME_CARD_HOVER_RULE = /\.gameCard:hover\s*\{[^}]*\}/
const GAME_CARD_FOCUS_RULE = /\.gameCard:focus-within\s*\{[^}]*\}/
const GAME_LIST_ITEM_HOVER_RULE = /\.gameListItem:hover\s*\{[^}]*\}/
const GAME_LIST_ITEM_FOCUS_RULE = /\.gameListItem:focus-within\s*\{[^}]*\}/

// The one surviving grouped-selector rule: the shared scale(1.05) transform.
// This is the exception the split-contract assertion below must allow.
const SCALE_RULE = /\.gameCard:hover,\s*\.gameCard:focus-within\s*\{[^}]*\}/

// Stale-focus suppression, now scoped to `body:not(.controllerLayout)`
// (260926-acw). There are two such rule bodies for `.gameCard`
// (ring/box-shadow/z-index, then the scale transform) sharing the same
// selector text, so this is matched with the global flag and both bodies
// are inspected independently below.
const GAME_CARD_STALE_FOCUS_SELECTOR =
  /body:not\(\.controllerLayout\) \.gameList:hover \.gameCard:focus-within:not\(:hover\)\s*\{[^}]*\}/g
const GAME_LIST_ITEM_STALE_FOCUS_RULE =
  /body:not\(\.controllerLayout\)\s*\.gameListLayout:hover\s*\.gameListItem:focus-within:not\(:hover\)\s*\{[^}]*\}/

describe('GameCard hover and focus are split (source gate, 260926-acw)', () => {
  it('.gameCard has separate :hover and :focus-within rules', () => {
    const css = readGameCardCss()

    expect(css).toMatch(GAME_CARD_HOVER_RULE)
    expect(css).toMatch(GAME_CARD_FOCUS_RULE)
  })

  it('no selector list groups .gameCard:hover with .gameCard:focus-within, except the shared scale rule', () => {
    const css = readGameCardCss()
    // Every grouped-selector occurrence of "gameCard:hover ... gameCard:focus-within"
    // in one selector list must be the scale(1.05) rule -- anything else
    // would mean hover and focus are back to sharing a ring rule.
    const groupedSelectorPattern =
      /\.gameCard:hover,\s*\.gameCard:focus-within\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null
    let groupedCount = 0
    while ((match = groupedSelectorPattern.exec(css)) !== null) {
      groupedCount += 1
      expect(match[1]).toMatch(/transform:\s*scale\(1\.05\)/)
    }
    expect(groupedCount).toBe(1)
    expect(css).toMatch(SCALE_RULE)
  })

  it('.gameCard:hover is subtle: a plain 2px accent outline, no --focus-ring tokens', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_HOVER_RULE)

    expect(body).toMatch(/outline:\s*2px solid var\(--accent/)
    expect(body).not.toMatch(/var\(--focus-ring-/)
  })

  it('.gameCard:focus-within is loud and consumes --focus-ring-color', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_FOCUS_RULE)

    expect(body).toMatch(/var\(--focus-ring-color/)
    expect(body).toMatch(/z-index:\s*3/)
    expect(body).toMatch(/box-shadow:/)
  })

  it('the -webkit-focus-ring-color hairline is gone from the stylesheet', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(/-webkit-focus-ring-color/)
  })

  it('.gameCard:hover has no bare hex literal outside a var(...) fallback slot', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_HOVER_RULE)
    const withoutVarSpans = body.replace(/var\([^)]*\)/g, '')

    expect(withoutVarSpans).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('.gameListItem has separate :hover and :focus-within rules', () => {
    const css = readGameCardCss()

    expect(css).toMatch(GAME_LIST_ITEM_HOVER_RULE)
    expect(css).toMatch(GAME_LIST_ITEM_FOCUS_RULE)
  })

  it('no selector list groups .gameListItem:hover with .gameListItem:focus-within', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(
      /\.gameListItem:hover,\s*\.gameListItem:focus-within/
    )
  })

  it('.gameListItem:hover carries a plain 2px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_HOVER_RULE)

    expect(body).toMatch(/outline:\s*2px solid var\(--accent/)
    expect(body).not.toMatch(/var\(--focus-ring-/)
  })

  it('.gameListItem:focus-within consumes --focus-ring-color', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_FOCUS_RULE)

    expect(body).toMatch(/var\(--focus-ring-color/)
  })

  it('ConsoleMode .consoleCard.focused still spends the same --accent token (read-only cross-file guard)', () => {
    // This does not assert ownership of console mode's styling -- it fails
    // LOUDLY if a future change moves console mode off --accent, because at
    // that moment the two modes silently stop matching and the whole
    // premise of this quick task ("matching the highlight border used in
    // console mode") is void.
    const scss = readConsoleModeScss()

    expect(scss).toMatch(/0 0 0 3px var\(--accent/)
  })
})

describe('Stale-focus suppression is scoped to body:not(.controllerLayout) (source gate, 260926-acw)', () => {
  it('two body:not(.controllerLayout) .gameList:hover .gameCard:focus-within:not(:hover) rule bodies exist -- ring and scale', () => {
    const css = readGameCardCss()
    const matches = css.match(GAME_CARD_STALE_FOCUS_SELECTOR)

    expect(matches).not.toBeNull()
    expect((matches as RegExpMatchArray).length).toBe(2)
  })

  it('one of those bodies clears the outline and restores the resting box-shadow and z-index -- not just box-shadow: none, which would drop the normal drop shadow', () => {
    const css = readGameCardCss()
    const bodies = css.match(GAME_CARD_STALE_FOCUS_SELECTOR) ?? []
    const ringSuppression = bodies.find((b) => /outline:\s*none/.test(b))

    expect(ringSuppression).toBeDefined()
    expect(ringSuppression).toMatch(/box-shadow:\s*0px 0px 12px 4px #00000055/)
    expect(ringSuppression).not.toMatch(/box-shadow:\s*none/)
    expect(ringSuppression).toMatch(/z-index:\s*auto/)
  })

  it('the other body suppresses the shared scale(1.05) transform back to resting size', () => {
    const css = readGameCardCss()
    const bodies = css.match(GAME_CARD_STALE_FOCUS_SELECTOR) ?? []
    const scaleSuppression = bodies.find((b) => /transform:/.test(b))

    expect(scaleSuppression).toBeDefined()
    expect(scaleSuppression).toMatch(/transform:\s*none/)
  })

  it('body:not(.controllerLayout) .gameListLayout:hover .gameListItem:focus-within:not(:hover) clears the row outline, background and box-shadow', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_STALE_FOCUS_RULE)

    expect(body).toMatch(/outline:\s*none/)
    expect(body).toMatch(/background:\s*none/)
    expect(body).toMatch(/box-shadow:\s*none/)
  })

  it('neither suppression rule fires unscoped -- both selectors begin with body:not(.controllerLayout)', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(
      /(?<!body:not\(\.controllerLayout\)\s)\.gameList:hover \.gameCard:focus-within:not\(:hover\)/
    )
    expect(css).not.toMatch(
      /(?<!body:not\(\.controllerLayout\)\s)\.gameListLayout:hover \.gameListItem:focus-within:not\(:hover\)/
    )
  })
})
