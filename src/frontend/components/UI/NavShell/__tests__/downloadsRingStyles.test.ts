/**
 * Comment-immune source gate for `DownloadsRing/index.scss` (34.10-14,
 * closing F-34.10-02 cause (a): the ambient Downloads ring read as
 * invisible at rest and a solid filled disc on hover).
 *
 * This is a SOURCE-TEXT gate, not a render test -- there is no jsdom / CSS
 * transform in this jest project (see `src/frontend/jest.config.js`
 * docstring), so a stylesheet cannot be mounted, computed or painted here.
 * Every assertion below scans the stylesheet after it has passed through
 * BOTH `stripSourceComments` (block comments, `//`-prefixed and `*`-prefixed
 * whole lines) AND `stripTrailingLineComment` (a trailing `// ...` appended
 * to a line of real code) -- following `shellTokens.test.ts`'s
 * `readFileSync` + `stripSourceComments` idiom, layered with
 * `stripTrailingLineComment` because this gate's assertions run per-line.
 *
 * What this gate proves: the mask declarations, the shared idle-track token
 * chain, the raised idle opacity, the grown ring size and the fallback-block
 * containment are all present in source.
 *
 * What this gate does NOT and CANNOT prove: contrast, actual visibility,
 * the painted result, or whether WKWebView honours `mask` /
 * `-webkit-mask` at all. That proof is routed to plan 34.10-16's live gate
 * -- item 4 (Downloads ring) and item 1's per-theme pass (this change alters
 * navbar-adjacent colour tokens).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const STYLESHEET_PATH = join(
  __dirname,
  '..',
  'components',
  'DownloadsRing',
  'index.scss'
)

function readGated(): string {
  const raw = readFileSync(STYLESHEET_PATH, 'utf8')
  return stripSourceComments(raw)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

describe('DownloadsRing stylesheet (F-34.10-02, REQ-34.10-08)', () => {
  const source = readGated()

  it('declares both -webkit-mask and unprefixed mask with a farthest-side radial-gradient value', () => {
    expect(source).toMatch(/-webkit-mask:\s*radial-gradient\(\s*farthest-side/)
    expect(source).toMatch(/(^|[^-])mask:\s*radial-gradient\(\s*farthest-side/)
  })

  it('never references --divider', () => {
    expect(source).not.toMatch(/--divider/)
  })

  it('shares the navbar-inactive/navbar-accent token chain between the ring track and the count badge, byte for byte', () => {
    const chain = 'var(--navbar-inactive, var(--navbar-accent))'
    const occurrences = source.split(chain).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('raises idle opacity to 0.65 and no longer declares 0.5', () => {
    expect(source).toMatch(/opacity:\s*0\.65/)
    expect(source).not.toMatch(/opacity:\s*0\.5\s*;/)
  })

  it('grows the ring to 16px in both dimensions', () => {
    expect(source).toMatch(/width:\s*16px/)
    expect(source).toMatch(/height:\s*16px/)
  })

  it('confines every ::after rule to inside the @supports not (...) fallback block, positionally', () => {
    const fallbackIndex = source.indexOf('@supports not (')
    expect(fallbackIndex).toBeGreaterThan(-1)

    const afterIndices: number[] = []
    let cursor = source.indexOf('::after')
    while (cursor !== -1) {
      afterIndices.push(cursor)
      cursor = source.indexOf('::after', cursor + 1)
    }

    // At least the rest-state hole and the hover override must exist.
    expect(afterIndices.length).toBeGreaterThanOrEqual(2)
    for (const idx of afterIndices) {
      expect(idx).toBeGreaterThan(fallbackIndex)
    }
  })

  it('the @supports fallback block also carries a DownloadsRing:hover ::after rule', () => {
    expect(source).toMatch(
      /@supports not[\s\S]*\.DownloadsRing:hover[\s\S]*::after[\s\S]*\}/
    )
  })
})
