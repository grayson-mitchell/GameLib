/**
 * G-47-7: Store Search art was cropped. `thumb_of` (the Rust ITAD mapping,
 * src-tauri/crates/gamelib-info/src/itad/mapping.rs, which replaced the TS `thumbOf` in 86-16/86-17)
 * used to pick ITAD's banner145 (145x55 landscape) and `.storeSearchRow__thumb` rendered it in a 60x80
 * portrait box with `object-fit: cover`, so Phase 20's cover box cut away about 72% of the
 * image width.
 *
 * The two halves are coupled: the box ratio is banner300's measured 300x140, so a change to the
 * preferred asset must change the box, and the other way round. This suite reads the REAL
 * stylesheet and the REAL `thumb_of` source (no jsdom in this project -- see
 * `src/frontend/jest.config.js`) and pins them together. Source-text only: it proves the two
 * agree, not that WebKit paints the art whole -- that last step is a live check.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')
// __dirname is src/frontend/screens/StoreSearch/__tests__; src/ is four levels up, the repo root five.
const itadSource = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'crates',
    'gamelib-info',
    'src',
    'itad',
    'mapping.rs'
  ),
  'utf-8'
)

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Body of the first rule whose selector is exactly `.storeSearchRow__thumb` (no compound). */
function thumbRuleBody(): string {
  const stripped = stripCssComments(css)
  const match = stripped.match(/(?:^|\n)\.storeSearchRow__thumb\s*\{([^}]*)\}/)
  if (!match) throw new Error('.storeSearchRow__thumb rule not found')
  return match[1] ?? ''
}

function thumbOfBody(): string {
  const start = itadSource.indexOf('fn thumb_of(')
  if (start === -1) throw new Error('thumb_of not found in itad/mapping.rs')
  const end = itadSource.indexOf('\n}', start)
  return itadSource.slice(start, end)
}

describe('Store Search thumbnail box (G-47-7)', () => {
  it('is a landscape contain box at banner300 ratio, never cover', () => {
    const body = thumbRuleBody()
    expect(body).toMatch(/aspect-ratio:\s*300\s*\/\s*140\s*;/)
    expect(body).toMatch(/object-fit:\s*contain\s*;/)
    expect(body).not.toMatch(/cover/)
  })

  it('thumb_of lists banner300 before banner145 before boxart', () => {
    // Drop `//` comments so a mention in prose cannot mask a reorder of the asset list.
    const body = thumbOfBody().replace(/\/\/.*$/gm, '')
    const i300 = body.indexOf('banner300')
    const i145 = body.indexOf('banner145')
    const iBox = body.indexOf('boxart')
    expect(i300).toBeGreaterThan(-1)
    expect(i300).toBeLessThan(i145)
    expect(i145).toBeLessThan(iBox)
  })
})
