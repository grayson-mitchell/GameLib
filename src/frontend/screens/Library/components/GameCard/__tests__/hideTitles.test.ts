/**
 * Source-text gate: hide titles mode (quick 261101-tsq).
 *
 * What this proves: (1) GamesList reads `hideTitles` from the context and
 * puts it on the wrapper class list; (2) the stylesheet removes the grid
 * title under `.hideTitles .gameCard .gameTitle` with `display: none`, placed
 * AFTER the hover/always-visible reveal rule (equal specificity with the hover
 * selector, so source order is what wins); (3) nothing under `.hideTitles`
 * touches `.gameListItem` (list name column) or `.gameListInfo` (status
 * label); (4) the Accessibility screen disables the always-show toggle while
 * hideTitles is on, and wires the new toggle.
 *
 * What this cannot prove: rendered pixels or hover behaviour (no CSS engine in
 * the node jest project). UAT covers those.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf8')

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('hide titles mode', () => {
  it('GamesList passes hideTitles from context onto the wrapper class list', () => {
    const src = read('GamesList/index.tsx')
    expect(src).toMatch(
      /const \{[^}]*\bhideTitles\b[^}]*\} =\s*useContext\(ContextProvider\)/
    )
    expect(src).toMatch(/cx\(\{[^}]*\bhideTitles\b[^}]*\}\)/)
  })

  it('removes the grid title under .hideTitles .gameCard .gameTitle', () => {
    expect(cssNoComments).toMatch(
      /\.hideTitles \.gameCard \.gameTitle\s*\{[^}]*display:\s*none\s*;/
    )
  })

  it('places the rule after the hover/always-visible reveal rule', () => {
    const reveal = cssNoComments.indexOf('.gameCard:hover .gameTitle,')
    const hide = cssNoComments.indexOf('.hideTitles .gameCard .gameTitle')
    expect(reveal).toBeGreaterThanOrEqual(0)
    expect(hide).toBeGreaterThan(reveal)
  })

  it('never targets the list layout or the status label', () => {
    const selectors =
      cssNoComments.match(/[^{}]*\.hideTitles[^{}]*(?=\{)/g) ?? []
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) {
      expect(sel).not.toMatch(/gameListItem/)
      expect(sel).not.toMatch(/gameListInfo/)
    }
  })

  it('Accessibility disables always-show while hideTitles is on', () => {
    const src = read('../../Accessibility/index.tsx')
    expect(src).toContain('disabled={hideTitles}')
    expect(src).toContain('setHideTitles(!hideTitles)')
  })
})
