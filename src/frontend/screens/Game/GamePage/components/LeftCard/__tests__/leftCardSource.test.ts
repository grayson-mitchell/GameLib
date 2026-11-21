/**
 * Phase 100 (D-01, D-08, D-09, D-22): mock-free source gates for the left
 * card's library controls. There is no jsdom or CSS engine in this jest
 * project, so these prove the SOURCE says so; the live look is the operator
 * check. Files are read through `stripSourceComments`, so a comment that merely
 * names a forbidden pattern cannot satisfy or trip a gate.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const read = (name: string) =>
  stripSourceComments(readFileSync(join(__dirname, '..', name), 'utf8'))

const css = read('index.css')
const heart = read('FavouriteHeart.tsx')
const popover = read('CategoryPopover.tsx')

/** Text of the brace-counted block that starts at `needle` in `source`. */
function blockAfter(source: string, needle: string): string {
  const start = source.indexOf(needle)
  if (start === -1) throw new Error(`${needle} not found`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated block after ${needle}`)
}

/** Brace-counted body of the first rule that opens with exactly `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${escaped} \\{`).exec(source)
  if (!m) throw new Error(`rule not found: ${selector}`)
  const open = source.indexOf('{', m.index)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated rule: ${selector}`)
}

describe('FavouriteHeart (D-01, D-22)', () => {
  it('is a pressed/unpressed button with the constant accessible name', () => {
    expect(heart).toContain('aria-pressed')
    expect(heart).toContain(
      "aria-label={t('gamelib:gamepage.leftCard.favourite', 'Favourite')}"
    )
  })

  it('calls the same add/remove the old menu made', () => {
    expect(heart).toContain('favouriteGames.add(appName, title)')
    expect(heart).toContain('favouriteGames.remove(appName)')
  })
})

describe('LeftCard/index.css (D-22)', () => {
  it('fills the heart with the per-theme --fav when pressed', () => {
    const body = ruleBody(css, ".favouriteHeart[aria-pressed='true']")
    expect(body).toMatch(/color:\s*var\(--fav\)/)
  })

  it('uses theme tokens only: no hex, rgb()/hsl() or black/white keyword', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(css.match(/\b(?:rgba?|hsla?)\(/g)).toBeNull()
    expect(css.match(/\b(?:black|white)\b/gi)).toBeNull()
  })
})

describe('CategoryPopover: create-and-assign (D-09, T-100-04)', () => {
  const handler = blockAfter(popover, 'function handleNewCategory')

  it('validates the name before it calls addCategory', () => {
    const validate = handler.indexOf('validateNewCategoryName(')
    const add = handler.indexOf('addCategory(')
    expect(validate).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(validate)
  })

  it('assigns the game right after creating the category, in the same handler', () => {
    const add = handler.indexOf('addCategory(')
    const assign = handler.indexOf('addToGame(')
    expect(assign).toBeGreaterThan(add)
  })

  it('keys the assignment with the shared composite key', () => {
    expect(popover).toContain('categoryKeyFor(appName, runner)')
  })
})

describe('LeftCard never opens the Categories modal (D-08)', () => {
  const tsxFiles = readdirSync(join(__dirname, '..')).filter((f) =>
    f.endsWith('.tsx')
  )

  it('finds the component files it is meant to guard', () => {
    expect(tsxFiles).toEqual(
      expect.arrayContaining(['CategoryPopover.tsx', 'LibraryRow.tsx'])
    )
  })

  it.each(tsxFiles)('%s does not reference openGameCategoriesModal', (f) => {
    expect(read(f)).not.toContain('openGameCategoriesModal')
  })

  it.each(tsxFiles)('%s renders no raw HTML (T-100-05)', (f) => {
    expect(read(f)).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('LeftCard/index.css: category chips (D-01)', () => {
  it('draws the category chip outlined, never filled like a genre chip', () => {
    const body = ruleBody(css, '.categoryChip')
    expect(body).toMatch(/background:\s*transparent/)
    expect(body).toMatch(/border:\s*1px solid var\(--border-color\)/)
  })

  it('draws the add chip with a dashed border', () => {
    expect(ruleBody(css, '.addCategoryChip')).toMatch(/border:\s*1px dashed/)
  })

  it('keeps the remove button in the focus ring: hidden by opacity, never display', () => {
    const body = ruleBody(css, '.categoryChip__remove')
    expect(body).toMatch(/opacity:\s*0/)
    expect(body).not.toMatch(/display:\s*none/)
  })
})
