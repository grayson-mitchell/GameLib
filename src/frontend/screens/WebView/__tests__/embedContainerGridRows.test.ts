/**
 * Phase 50 review finding 8 (D-07/D-14, UAT item 14): the slow-load banner and the
 * blocked-launcher notice must render directly UNDER `StoreEmbedControls` and ABOVE the embed
 * slot. `epicEmbedSurfaceContract.test.ts` already pins their JSX ORDER, but JSX order is not
 * where they paint: `.WebView__embedContainer` is a CSS grid, and with the original two-track
 * template (`auto 1fr`) and the slot pinned to `grid-row: 2`, CSS grid auto-placement put the
 * banner and notice into implicit rows 3 and 4 -- BELOW the store embed, whatever the JSX said.
 *
 * This suite reads the REAL `index.css` and the REAL final return of `index.tsx` (no jsdom in
 * this project -- see `src/frontend/jest.config.js`), then runs CSS grid's row-major
 * auto-placement over them by hand: every chrome child before the slot is auto-placed, the slot
 * is explicitly placed. It asserts every chrome child lands in an EXPLICIT `auto` track above the
 * slot's row and the slot owns the `1fr` track. Source-text only: it proves the stylesheet and the
 * JSX agree, not that WebKit paints it -- that last step is a live check (UAT item 14).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')
const indexSource = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf-8')

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Returns the declaration value of `property` inside the top-level rule for `selector`. */
function declaration(
  source: string,
  selector: string,
  property: string
): string | null {
  const stripped = stripCssComments(source)
  const ruleStart = stripped.indexOf(`${selector} {`)
  if (ruleStart === -1) return null
  const bodyEnd = stripped.indexOf('}', ruleStart)
  const body = stripped.slice(ruleStart, bodyEnd)
  const match = body.match(
    new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`)
  )
  return match ? match[1].trim() : null
}

/** The component tags rendered as direct grid children BEFORE the slot, in JSX order. */
function chromeChildrenBeforeSlot(source: string): string[] {
  const rootIdx = source.indexOf(
    '<div className="WebView WebView__embedContainer">'
  )
  const slotIdx = source.indexOf('className="WebView__embedSlot"', rootIdx)
  if (rootIdx === -1 || slotIdx === -1) {
    throw new Error('final-return container or slot marker not found')
  }
  const between = source.slice(rootIdx + 1, slotIdx)
  return [...between.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1])
}

interface Placement {
  tracks: string[]
  chromeRows: number[]
  slotRow: number
}

/**
 * Row-major auto-placement for a single-column grid: the explicitly placed slot claims its row
 * first, then each auto-placed child takes the next free row, in order. A row beyond the
 * explicit template is an implicit row.
 */
function place(source: string, chromeCount: number): Placement {
  const template = declaration(
    source,
    '.WebView__embedContainer',
    'grid-template-rows'
  )
  const slotRowValue = declaration(source, '.WebView__embedSlot', 'grid-row')
  if (template === null || slotRowValue === null) {
    throw new Error('grid-template-rows or the slot grid-row not found')
  }
  const tracks = template.split(/\s+/)
  const slotRow = Number(slotRowValue)
  const chromeRows: number[] = []
  let row = 1
  for (let i = 0; i < chromeCount; i++) {
    if (row === slotRow) row++
    chromeRows.push(row)
    row++
  }
  return { tracks, chromeRows, slotRow }
}

describe('WebView embed container grid rows (finding 8, D-07/D-14)', () => {
  const chrome = chromeChildrenBeforeSlot(indexSource)

  it('anti-vacuity: the final return renders the controls, the banner and the notice before the slot', () => {
    expect(chrome).toEqual([
      'StoreEmbedControls',
      'StoreEmbedTimeoutBanner',
      'EpicLauncherBlockedNotice'
    ])
  })

  it('places every chrome row in an explicit auto track ABOVE the slot, and the slot in the 1fr track', () => {
    const { tracks, chromeRows, slotRow } = place(css, chrome.length)

    expect(Number.isInteger(slotRow)).toBe(true)
    for (const row of chromeRows) {
      expect(row).toBeLessThan(slotRow)
      // An explicit track, not an implicit row appended after the template.
      expect(row).toBeLessThanOrEqual(tracks.length)
      expect(tracks[row - 1]).toBe('auto')
    }
    expect(tracks[slotRow - 1]).toBe('1fr')
    // The slot is the LAST track, so nothing can be auto-placed beneath the store embed.
    expect(slotRow).toBe(tracks.length)
  })

  it('negative control: the original two-track grid puts the banner and notice BELOW the slot', () => {
    const regressed = css
      .replace(/grid-template-rows:\s*[^;]+;/, 'grid-template-rows: auto 1fr;')
      .replace(/(\.WebView__embedSlot \{\s*grid-row:\s*)[^;]+;/, '$12;')
    expect(regressed).not.toBe(css)

    const { chromeRows, slotRow } = place(regressed, chrome.length)
    expect(slotRow).toBe(2)
    expect(chromeRows).toEqual([1, 3, 4])
  })
})
