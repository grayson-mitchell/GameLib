/**
 * Source-text gate for the non-console focus ring (quick task 260925-pga).
 *
 * What this proves: that `.gameCard:focus-within` and `.gameListItem:focus-within`
 * in `GameCard/index.css` carry a token-driven (`var(--accent, ...)`) outline,
 * that the old `-webkit-focus-ring-color` hairline is gone, and that
 * `.consoleCard.focused` in `ConsoleMode/index.scss` still spends the same
 * `--accent` token for its own ring.
 *
 * What this does NOT prove: anything about rendered pixels, whether the ring
 * is actually legible against cover art in any given theme, or whether
 * `:focus-within` fires for a given input path. This project treats a gate
 * that appears to cover more than it does as worse than no gate, so that
 * proof is deliberately routed elsewhere -- to this quick task's Task 3
 * human visual check -- and not claimed here.
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

describe('GameCard focus ring is token-driven (source gate)', () => {
  it('.gameCard:focus-within carries a 3px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, /\.gameCard:focus-within\s*\{[^}]*\}/)

    expect(body).toMatch(/outline:\s*3px solid var\(--accent/)
  })

  it('.gameCard:focus-within carries z-index: 2 and a box-shadow', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, /\.gameCard:focus-within\s*\{[^}]*\}/)

    expect(body).toMatch(/z-index:\s*2/)
    expect(body).toMatch(/box-shadow:/)
  })

  it('the -webkit-focus-ring-color hairline is gone from the stylesheet', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(/-webkit-focus-ring-color/)
  })

  it('.gameCard:focus-within has no bare hex literal outside a var(...) fallback slot', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, /\.gameCard:focus-within\s*\{[^}]*\}/)
    // Strip every var(...) span first -- the only place a hex literal is
    // permitted is the fallback slot inside var(--token, #fallback). What
    // survives after that strip must carry no hex at all: this is the
    // assertion that actually enforces "theme-token driven, not
    // hardcoded" -- the other three only enforce presence.
    const withoutVarSpans = body.replace(/var\([^)]*\)/g, '')

    expect(withoutVarSpans).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('.gameListItem:focus-within carries a 2px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, /\.gameListItem:focus-within\s*\{[^}]*\}/)

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
