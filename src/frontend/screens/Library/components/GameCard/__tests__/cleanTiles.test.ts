/**
 * Source-text gate: clean tile mode (quick 261101-tjv).
 *
 * What this proves: (1) GamesList reads `cleanTiles` from the context and puts
 * it on the wrapper class list; (2) the stylesheet collapses
 * `--game-card-bar-height` to 0 under `.cleanTiles .gameCard`, so the card and
 * the pre-reveal placeholder both shrink to the bare 3:4 art; (3) the grid bar
 * is hidden with `display: none`; (4) nothing under `.cleanTiles` touches
 * `.gameListItem`, because the list layout's `.icons` is the table's Action
 * column; (5) GameCard still renders the `icons` bar unconditionally, so
 * gamepad.ts can still `.click()` `.playIcon` / `.downIcon` (click() fires on
 * display:none elements).
 *
 * What this cannot prove: rendered pixels (no CSS engine in the node jest
 * project). That the tile is exactly art-height with no gap is UAT's job.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf8')

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('clean tile mode', () => {
  it('GamesList passes cleanTiles from context onto the wrapper class list', () => {
    const src = read('GamesList/index.tsx')
    expect(src).toMatch(
      /const \{[^}]*\bcleanTiles\b[^}]*\} =\s*useContext\(ContextProvider\)/
    )
    expect(src).toMatch(/cx\(\{[^}]*\bcleanTiles\b[^}]*\}\)/)
  })

  it('collapses --game-card-bar-height to zero under .cleanTiles .gameCard', () => {
    expect(css).toMatch(
      /\.cleanTiles \.gameCard:not\(\.justPlayed\)\s*\{[^}]*--game-card-bar-height:\s*0(px)?\s*;/
    )
  })

  it('hides the grid bar under .cleanTiles .gameCard > .icons', () => {
    expect(css).toMatch(
      /\.cleanTiles \.gameCard:not\(\.justPlayed\) > \.icons\s*\{[^}]*display:\s*none\s*;/
    )
  })

  it('exempts the Recently Played just-played hero, which keeps its bar', () => {
    const selectors =
      cssNoComments.match(/[^{}]*\.cleanTiles[^{}]*(?=\{)/g) ?? []
    for (const s of selectors) expect(s).toContain(':not(.justPlayed)')
  })

  it('never targets the list layout', () => {
    const selectors =
      cssNoComments.match(/[^{}]*\.cleanTiles[^{}]*(?=\{)/g) ?? []
    expect(selectors.length).toBeGreaterThan(0)
    for (const s of selectors) expect(s).not.toContain('gameListItem')
  })

  it('GameCard keeps the icons bar in the DOM regardless of cleanTiles', () => {
    const src = read('GameCard/index.tsx')
    expect(src).toContain('className="icons"')
    expect(src).not.toContain('cleanTiles')
  })
})
