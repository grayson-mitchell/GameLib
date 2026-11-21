/**
 * Phase 100 (D-10, D-11, D-13): mock-free source gates over the Install tab.
 * The rows are hook-heavy and the repo has no jsdom, so the wiring that
 * matters is asserted on the comment-stripped source.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const TAB_DIR = join(__dirname, '..')
const ACTIONS_DIR = join(TAB_DIR, '..', '..', 'actions')

function strip(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

const read = (...parts: string[]) =>
  strip(readFileSync(join(...parts), 'utf-8'))

const tabSources = readdirSync(TAB_DIR)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ name, code: read(TAB_DIR, name) }))

describe('Install tab source gates', () => {
  it('sees the tab files (non-vacuous)', () => {
    const names = tabSources.map((s) => s.name)
    expect(names).toEqual(
      expect.arrayContaining(['index.tsx', 'FactRow.tsx', 'LocationRow.tsx'])
    )
  })

  it('has no second progress bar and no is-text class (D-10)', () => {
    for (const { name, code } of tabSources) {
      expect({
        name,
        hit: /LinearProgress|CircularProgress/.test(code)
      }).toEqual({
        name,
        hit: false
      })
      expect({ name, hit: /className="[^"]*is-text/.test(code) }).toEqual({
        name,
        hit: false
      })
    }
  })

  it('LocationRow takes Move busy from is.moving and reads its gates (D-10, D-11)', () => {
    const code = read(TAB_DIR, 'LocationRow.tsx')
    expect(code).toContain('is.moving')
    expect(code).toContain('gates.move')
    expect(code).toContain('gates.setFolder')
  })

  it('useInstallLocationActions confirms before each picker (D-13)', () => {
    const code = read(ACTIONS_DIR, 'useInstallLocationActions.ts')
    expect(code).toContain(
      "import useOpenDialog from 'frontend/hooks/useOpenDialog'"
    )
    expect(code.match(/openDialog\(/g)).toHaveLength(2)
    expect(code.match(/showDialogModal\(/g)).toHaveLength(2)
    expect(code).toContain("useRowAction('moveInstall'")
    expect(code).toContain("useRowAction('changeInstallPath'")
  })

  it('SizeRow opens ModifyInstallModal from gates.modify with gameInstallInfo (D-01)', () => {
    const code = read(TAB_DIR, 'SizeRow.tsx')
    expect(code).toContain('import ModifyInstallModal from')
    expect(code).toContain('gates.modify')
    expect(code).toContain('gameInstallInfo={gameInstallInfo}')
    expect(code).toContain('is.installing')
  })

  it('InstallTab renders LocationRow inside installFacts before legacyRows', () => {
    const code = read(TAB_DIR, 'index.tsx')
    const facts = code.indexOf('className="installFacts"')
    const location = code.indexOf('<LocationRow')
    const legacy = code.indexOf('className="legacyRows"')
    expect(facts).toBeGreaterThan(-1)
    expect(location).toBeGreaterThan(facts)
    expect(legacy).toBeGreaterThan(location)
  })
})
