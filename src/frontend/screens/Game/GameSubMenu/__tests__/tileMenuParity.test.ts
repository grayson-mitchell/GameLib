/**
 * Source-text gate (quick task 261115-szs): the game page three-dot menu (GameSubMenu) has
 * parity with the library tile context menu for Favourites, Hide, Logs and an always-visible
 * Edit Game. `GameSubMenu/index.tsx` cannot be rendered under the node-environment Frontend
 * jest project (no jsdom), so, like the sibling guards, this reads the real source, collapses
 * whitespace and asserts shape. Regexes are whitespace-tolerant so a Prettier re-wrap cannot
 * defeat them.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
const collapse = (s: string) => s.replace(/\s+/g, ' ')
const flat = collapse(source)

const BTN = 'className="link button is-text is-link buttonWithIcon"'

function buttonWith(call: string): RegExp {
  const escaped = call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `<button[^>]*onClick=\\{\\s*\\(\\)\\s*=>\\s*${escaped}\\s*\\}[^>]*${BTN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  )
}

describe('GameSubMenu tile-menu parity (quick-261115-szs)', () => {
  it('has the favourites toggle', () => {
    for (const s of [
      'useFavouriteGames()',
      'favouriteGames.add(appName, title)',
      'favouriteGames.remove(appName)',
      "'button.add_to_favourites'",
      "'button.remove_from_favourites'",
      '<FavoriteIcon />',
      '<FavoriteBorderIcon />'
    ]) {
      expect(flat).toContain(s)
    }
    expect(flat).toMatch(buttonWith('favouriteGames.add(appName, title)'))
    expect(flat).toMatch(buttonWith('favouriteGames.remove(appName)'))
  })

  it('has the hide toggle', () => {
    for (const s of [
      'useHiddenGames()',
      'hiddenGames.add(appName, title)',
      'hiddenGames.remove(appName)',
      "'button.hide_game'",
      "'button.unhide_game'",
      '<VisibilityOffIcon />',
      '<VisibilityIcon />'
    ]) {
      expect(flat).toContain(s)
    }
    expect(flat).toMatch(buttonWith('hiddenGames.add(appName, title)'))
    expect(flat).toMatch(buttonWith('hiddenGames.remove(appName)'))
  })

  it('has Logs gated on installed, not uninstalling, not browser', () => {
    expect(flat).toContain('openGameLogsModal(gameInfo)')
    expect(flat).toContain("'submenu.logs'")
    expect(flat).toMatch(
      /\{\s*isInstalled\s*&&\s*!is\.uninstalling\s*&&\s*!isBrowserGame\s*&&\s*\(\s*<button[^>]*onClick=\{\s*\(\)\s*=>\s*openGameLogsModal\(gameInfo\)/
    )
    expect(flat).toMatch(buttonWith('openGameLogsModal(gameInfo)'))
  })

  it('has Edit Game outside the installed cluster', () => {
    const editIdx = flat.search(
      /onClick=\{\s*(async\s*)?\(\)\s*=>\s*handleEdit\(\)/
    )
    const clusterIdx = flat.indexOf('{isInstalled && (')
    expect(editIdx).toBeGreaterThan(-1)
    expect(clusterIdx).toBeGreaterThan(-1)
    expect(editIdx).toBeLessThan(clusterIdx)
    expect(flat).toContain("'button.sideload.edit'")
  })

  it('does not add Remove From Recent', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source.includes('remove_from_recent')).toBe(false)
  })
})
