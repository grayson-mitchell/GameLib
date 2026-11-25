/**
 * Source gate for the game page's Back control (quick 261125-pmb).
 *
 * Locked decision "Always back to Library": the Back control on the game page
 * goes to `/library` whatever screen opened the page (Downloads included), and
 * is labelled "Back to Library". Downloads is reached through its app-level
 * tab. There is no jsdom in this jest project, so these gates prove the SOURCE
 * says so. Every source is read through `stripSourceComments`, so comment
 * prose can neither satisfy nor trip a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const readSource = (path: string) =>
  stripSourceComments(readFileSync(path, 'utf8'))

const GAME_PAGE = readSource(join(__dirname, '..', 'index.tsx'))
const DOWNLOAD_ITEM = readSource(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'DownloadManager',
    'components',
    'DownloadManagerItem',
    'index.tsx'
  )
)
const LOCALES = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'public/locales/en'
)

describe('quick 261125-pmb: the game page Back control always returns to the Library', () => {
  it('the game page no longer special-cases a Downloads origin', () => {
    expect(GAME_PAGE).not.toContain('fromDM')
    expect(GAME_PAGE).not.toContain('/download-manager')
  })

  it('the back link goes to /library and is labelled Back to Library', () => {
    const end = GAME_PAGE.indexOf(
      '</NavLink>',
      GAME_PAGE.indexOf('className="backButton"')
    )
    const start = GAME_PAGE.lastIndexOf(
      '<NavLink',
      GAME_PAGE.indexOf('className="backButton"')
    )
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const link = GAME_PAGE.slice(start, end)
    expect(link).toContain('to="/library"')
    expect(link).toContain('title={backToLibraryLabel}')
    expect(link).toContain('aria-label={backToLibraryLabel}')
    expect(link).not.toContain('webview.controls.back')
    expect(GAME_PAGE).toMatch(
      /const backToLibraryLabel = tGamelib\(\s*'gamelib:gamepage\.backToLibrary',\s*'Back to Library',?\s*\)/
    )
  })

  it('the Downloads item opens the game page with gameInfo and nothing else in router state', () => {
    expect(DOWNLOAD_ITEM).not.toContain('fromDM')
    expect(DOWNLOAD_ITEM).toMatch(
      /navigate\(\s*`\/gamepage\/\$\{runner\}\/\$\{appName\}`,\s*\{\s*state:\s*\{\s*gameInfo(?::\s*gameInfo)?\s*\}/
    )
  })

  it('the label lives in the gamelib catalog, not the upstream gamepage catalog', () => {
    const gamelib = JSON.parse(
      readFileSync(join(LOCALES, 'gamelib.json'), 'utf8')
    )
    expect(gamelib.gamepage.backToLibrary).toBe('Back to Library')
    expect(readFileSync(join(LOCALES, 'gamepage.json'), 'utf8')).not.toContain(
      'backToLibrary'
    )
  })
})
