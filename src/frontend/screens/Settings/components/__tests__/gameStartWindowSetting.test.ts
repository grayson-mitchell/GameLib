/**
 * Source-text gate for the merged "When a game starts" setting (quick task 261108-kpc).
 *
 * No jsdom in this jest project (see `src/frontend/jest.config.js`), so the select cannot be
 * mounted; assertions scan `stripSourceComments`-stripped source. The mode <-> boolean mapping is
 * proven behaviourally in `src/common/__tests__/gameStartWindow.test.ts`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { defined } from '../../../__tests__/fixtures/indexed'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const COMPONENTS = join(__dirname, '..')
const SECTIONS = join(__dirname, '..', '..', 'sections')
const CATALOG_PATH = join(REPO_ROOT, 'public/locales/en/gamelib.json')

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

function catalogValue(dotted: string): unknown {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalog
    )
}

describe('game start window setting (quick 261108-kpc)', () => {
  const component = readStripped(join(COMPONENTS, 'GameStartWindow.tsx'))

  it('is a SelectField with an InfoIcon on the label line', () => {
    expect(component).toContain('<SelectField')
    expect(component).toMatch(/labelHelp=\{\s*<InfoIcon/)
  })

  it('reads both keys with the right fallbacks and writes via the mapping module', () => {
    expect(component).toMatch(
      /useSetting\(\s*'hideWindowOnProtocolLaunch',\s*true/
    )
    expect(component).toMatch(/useSetting\(\s*'minimizeOnLaunch',\s*false/)
    expect(component).toContain('settingsForGameStartWindowMode(')
    expect(component).toContain('displayedGameStartWindowMode(')
    expect(component).not.toContain('ToggleSwitch')
  })

  it('every t() fallback equals its gamelib.json string', () => {
    const pattern =
      /\bt\(\s*'gamelib:(settings\.gameStartWindow\.[A-Za-z]+)'\s*,\s*(?:'([^']*)'|"([^"]*)")\s*\)/g
    const matches = [...component.matchAll(pattern)]

    // Non-vacuity: label, help, keep, shortcut, everyNeedsTray, every.
    expect(matches).toHaveLength(6)
    for (const match of matches) {
      const key = defined(match[1], 'key')
      const fallback = match[2] ?? defined(match[3], 'fallback')
      expect({ key, shipped: catalogValue(key) }).toEqual({
        key,
        shipped: fallback
      })
    }
  })

  it('General renders it and neither section references the removed components', () => {
    const general = readStripped(join(SECTIONS, 'GeneralSettings', 'index.tsx'))
    const advanced = readStripped(
      join(SECTIONS, 'AdvancedSettings', 'index.tsx')
    )
    expect(general).toContain('<GameStartWindow />')
    for (const source of [general, advanced]) {
      expect(source).not.toContain('MinimizeOnGameLaunch')
      expect(source).not.toContain('HideWindowOnProtocolLaunch')
    }
  })
})
