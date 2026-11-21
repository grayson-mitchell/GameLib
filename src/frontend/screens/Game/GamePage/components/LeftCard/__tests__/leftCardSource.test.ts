/**
 * Phase 100 (D-01, D-08, D-09, D-22): mock-free source gates for the left
 * card's library controls. There is no jsdom or CSS engine in this jest
 * project, so these prove the SOURCE says so; the live look is the operator
 * check. Files are read through `stripSourceComments`, so a comment that merely
 * names a forbidden pattern cannot satisfy or trip a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const read = (name: string) =>
  stripSourceComments(readFileSync(join(__dirname, '..', name), 'utf8'))

const css = read('index.css')
const heart = read('FavouriteHeart.tsx')

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
