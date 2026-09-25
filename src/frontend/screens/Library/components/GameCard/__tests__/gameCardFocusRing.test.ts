/**
 * Source-text gate for the non-console highlight ring (quick task 260925-pga).
 *
 * What this proves: that `.gameCard` and `.gameListItem` carry a single,
 * token-driven (`var(--accent, ...)`) ring rule shared by BOTH `:hover` and
 * `:focus-within` -- not two separate rules where only one gets the ring --
 * that the old `-webkit-focus-ring-color` hairline is gone, and that
 * `.consoleCard.focused` in `ConsoleMode/index.scss` still spends the same
 * `--accent` token for its own ring.
 *
 * Hover was added after a live operator check reported the ring worked
 * under gamepad focus but was invisible under mouse hover: this app already
 * treats hover and focus as one "highlighted" state (see the pre-existing
 * `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }`
 * rule), so the ring now follows that same grouped-selector precedent.
 *
 * What this does NOT prove: anything about rendered pixels, whether the ring
 * is actually legible against cover art in any given theme, or whether
 * `:hover`/`:focus-within` fire for a given input path. This project treats
 * a gate that appears to cover more than it does as worse than no gate, so
 * that proof is deliberately routed elsewhere -- to this quick task's
 * Task 3 human visual check -- and not claimed here.
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

// The grouped-selector shape the file uses throughout (see the pre-existing
// scale(1.05) rule): `.gameCard:hover,\n.gameCard:focus-within { ... }`.
// Matching on this grouped form -- rather than `:focus-within` alone -- is
// the assertion that actually proves hover and focus share ONE rule; a gate
// that matched `:focus-within` in isolation would stay green even if hover
// were dropped back out or split into its own ring-less rule.
const GAME_CARD_RING_RULE =
  /\.gameCard:hover,\s*\.gameCard:focus-within\s*\{[^}]*\}/
const GAME_LIST_ITEM_RING_RULE =
  /\.gameListItem:hover,\s*\.gameListItem:focus-within\s*\{[^}]*\}/

describe('GameCard highlight ring is token-driven and shared by hover + focus (source gate)', () => {
  it('.gameCard groups :hover with :focus-within under one ring rule', () => {
    const css = readGameCardCss()

    expect(css).toMatch(GAME_CARD_RING_RULE)
  })

  it('the shared .gameCard rule carries a 3px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_RING_RULE)

    expect(body).toMatch(/outline:\s*3px solid var\(--accent/)
  })

  it('the shared .gameCard rule carries z-index: 2 and a box-shadow', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_RING_RULE)

    expect(body).toMatch(/z-index:\s*2/)
    expect(body).toMatch(/box-shadow:/)
  })

  it('the -webkit-focus-ring-color hairline is gone from the stylesheet', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(/-webkit-focus-ring-color/)
  })

  it('the shared .gameCard rule has no bare hex literal outside a var(...) fallback slot', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_RING_RULE)
    // Strip every var(...) span first -- the only place a hex literal is
    // permitted is the fallback slot inside var(--token, #fallback). What
    // survives after that strip must carry no hex at all: this is the
    // assertion that actually enforces "theme-token driven, not
    // hardcoded" -- the other assertions only enforce presence.
    const withoutVarSpans = body.replace(/var\([^)]*\)/g, '')

    expect(withoutVarSpans).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('.gameListItem groups :hover with :focus-within under one ring rule', () => {
    const css = readGameCardCss()

    expect(css).toMatch(GAME_LIST_ITEM_RING_RULE)
  })

  it('the shared .gameListItem rule carries a 2px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_RING_RULE)

    expect(body).toMatch(/outline:\s*2px solid var\(--accent/)
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
