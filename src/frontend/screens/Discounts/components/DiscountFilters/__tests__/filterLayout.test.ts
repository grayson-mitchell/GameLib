/**
 * G-47-14b: the Deals Genres and Features controls cropped and re-centred their chips when space
 * ran out. The autocomplete root was a fixed 40px box with overflow hidden and nowrap, so once the
 * chips outgrew it the browser scrolled the clipped root to the caret, cropping chips and carrying
 * the notched outline away. The root must be allowed to grow.
 *
 * Source-text only (no jsdom in this project, see `src/frontend/jest.config.js`): it pins the
 * stylesheet and the component markup, not WebKit's painted layout -- that is a live check.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')
const tsx = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf-8')

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

interface Block {
  /** Text before the `{`, whitespace-normalised. */
  header: string
  /** Text between the braces. */
  body: string
}

/** Top-level blocks of a stylesheet (comments already stripped), at brace depth 0. */
function topLevelBlocks(stripped: string): Block[] {
  const blocks: Block[] = []
  let depth = 0
  let headerStart = 0
  let bodyStart = 0
  let header = ''
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (ch === '{') {
      if (depth === 0) {
        header = stripped.slice(headerStart, i).replace(/\s+/g, ' ').trim()
        bodyStart = i + 1
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        blocks.push({ header, body: stripped.slice(bodyStart, i) })
        headerStart = i + 1
      }
    }
  }
  return blocks
}

/** Declarations of a flat rule body, keyed by property name (so min-height is not read as height). */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    const prop = part.slice(0, colon).trim()
    if (!prop) continue
    out[prop] = part
      .slice(colon + 1)
      .replace(/\s+/g, ' ')
      .trim()
  }
  return out
}

const stripped = stripCssComments(css)
const blocks = topLevelBlocks(stripped)

/** The top-level rule whose selector is exactly `selector`; at-rule bodies are never searched. */
function topLevelRule(selector: string): Record<string, string> {
  const block = blocks.find((b) => b.header === selector)
  if (!block) throw new Error(`top-level rule not found: ${selector}`)
  return declarations(block.body)
}

describe('Deals filters: Genres and Features controls grow to hold their chips (G-47-14b)', () => {
  const root = () =>
    topLevelRule('.discountFilters__autocomplete .MuiInputBase-root')

  it('has a 40px floor and no fixed height', () => {
    const decl = root()
    expect(decl['min-height']).toBe('40px')
    expect(['auto', undefined]).toContain(decl['height'])
  })

  it('never clips: no overflow of any axis is hidden', () => {
    const decl = root()
    for (const prop of ['overflow', 'overflow-x', 'overflow-y']) {
      expect(decl[prop]).not.toBe('hidden')
    }
  })

  it('wraps its chips onto further lines instead of overflowing', () => {
    expect(root()['flex-wrap']).toBe('wrap')
  })

  it('has no hover-bubble chip list in the stylesheet', () => {
    expect(stripped).not.toMatch(/discountFilters__tooltipChips/)
  })

  it('has no hover bubble in the component, still trims blurred chips to two', () => {
    const source = stripSourceComments(tsx)
    expect(source).not.toMatch(/\bTooltip\b/)
    expect(source).toMatch(/limitTags=\{2\}/)
    expect(source).toMatch(/<Autocomplete/)
  })
})
