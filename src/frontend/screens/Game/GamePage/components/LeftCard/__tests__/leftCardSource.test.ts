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
const libraryRow = read('LibraryRow.tsx')
const hiddenNotice = read('HiddenNotice.tsx')
const editDetails = read('EditDetailsButton.tsx')
const storeBadge = read('StoreBadgeLink.tsx')

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

describe('Hide toggle and hidden notice (D-01)', () => {
  it('the Hide toggle is a pressed button with a constant noun label', () => {
    expect(libraryRow).toContain('className="hideToggle"')
    expect(libraryRow).toContain('aria-pressed={isHidden}')
    expect(libraryRow).toContain("t('gamelib:gamepage.leftCard.hide', 'Hide')")
  })

  it('the toggle makes the same add/remove calls the old menu made', () => {
    expect(libraryRow).toContain('hiddenGames.add(appName, title)')
    expect(libraryRow).toContain('hiddenGames.remove(appName)')
  })

  it('the notice offers Unhide through hiddenGames.remove(appName)', () => {
    expect(hiddenNotice).toContain('hiddenGames.remove(appName)')
    expect(hiddenNotice).toContain('gamelib:gamepage.leftCard.unhide')
  })

  it('the notice renders nothing unless the game is hidden', () => {
    expect(hiddenNotice).toMatch(/if \(!isHidden\) return null/)
  })
})

describe('StoreBadgeLink (D-01, T-100-08)', () => {
  it('links in-app to the store page and never opens a window', () => {
    expect(storeBadge).toContain('NavLink')
    expect(storeBadge).toContain('/store-page?store-url=')
    expect(storeBadge).not.toMatch(/window\.open|createNewWindow/)
  })

  it('keeps the plain badge when there is no store URL or the game is sideloaded', () => {
    expect(storeBadge).toContain("hasCapability(runner, 'hasStoreCatalog')")
    expect(storeBadge).toContain('className="store-icon"')
  })

  it('shows the store name and an arrow hidden from assistive tech', () => {
    expect(storeBadge).toContain("getStoreDisplayName(runner, '')")
    expect(storeBadge).toContain('<span aria-hidden="true">↗</span>')
  })
})

describe('EditDetailsButton (D-01)', () => {
  it('opens the install modal for a sideloaded game', () => {
    expect(editDetails).toContain(
      "hasCapability(gameInfo.runner, 'hasStoreCatalog')"
    )
    expect(editDetails).toContain('openInstallGameModal(')
  })

  it('opens the Edit Game dialog otherwise', () => {
    expect(editDetails).toContain('showDialogModal({')
    expect(editDetails).toContain('<EditGameDialog')
    expect(editDetails).toContain("t('edit-game.title', 'Edit Game')")
  })

  it('is revealed by opacity on hover or focus, never display', () => {
    const body = ruleBody(css, '.editDetailsButton')
    expect(body).toMatch(/opacity:\s*0/)
    expect(css).toContain('.gameArtBand:hover .editDetailsButton')
    expect(css).toContain('.editDetailsButton:focus-visible')
    expect(css).not.toMatch(/\.editDetailsButton[^{]*\{[^}]*display:\s*none/)
  })
})
