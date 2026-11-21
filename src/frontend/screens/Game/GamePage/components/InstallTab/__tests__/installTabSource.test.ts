/**
 * Phase 100 (D-10, D-11, D-13): mock-free source gates over the Install tab.
 * The rows are hook-heavy and the repo has no jsdom, so the wiring that
 * matters is asserted on the comment-stripped source.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const TAB_DIR = join(__dirname, '..')
const COMPONENTS_DIR = join(TAB_DIR, '..')
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

  it('VersionRow verifies through useRowAction with no confirmation and updates through handleUpdate (D-13, D-19)', () => {
    const code = read(TAB_DIR, 'VersionRow.tsx')
    expect(code).toContain("useRowAction('repair'")
    expect(code).toContain('repair(')
    expect(code).not.toContain('showDialogModal')
    expect(code).toContain('onClick={handleUpdate}')
    expect(code).toContain('gates.verify')
    expect(code).toContain('gates.update')
    expect(code).toContain('<WhatsNewLink />')
  })

  it('WhatsNewLink renders the changelog only through GameChangeLog (T-100-12)', () => {
    const code = read(TAB_DIR, 'WhatsNewLink.tsx')
    expect(code).toContain('<GameChangeLog')
    expect(code).not.toContain('dangerouslySetInnerHTML')
  })

  it('GameStatus takes whatsNew as a prop and gained no import', () => {
    const code = read(COMPONENTS_DIR, 'GameStatus.tsx')
    expect(code).toContain('whatsNew')
    expect(code).not.toMatch(/import[^\n]*WhatsNewLink/)
    expect(code).not.toMatch(/import[^\n]*InstallTab/)
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

  it('InstallTab renders Size then Version inside installFacts and hands VersionRow the update props', () => {
    const code = read(TAB_DIR, 'index.tsx')
    const location = code.indexOf('<LocationRow')
    const size = code.indexOf('<SizeRow')
    const version = code.indexOf('<VersionRow')
    const legacy = code.indexOf('className="legacyRows"')
    expect(size).toBeGreaterThan(location)
    expect(version).toBeGreaterThan(size)
    expect(legacy).toBeGreaterThan(version)
    expect(code).toContain('handleUpdate={handleUpdate}')
    expect(code).toContain('hasUpdate={hasUpdate}')
  })

  it('CloudSavesSync opens its menu on click only, with no hover handler, hex colour or quick-menu setting (D-03, D-21)', () => {
    const code = read(COMPONENTS_DIR, 'CloudSavesSync.tsx')
    expect(code).not.toContain('onMouseEnter')
    expect(code).not.toContain('onMouseLeave')
    expect(code).not.toContain('enableQuickSavesMenu')
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    expect(code).toContain('setAnchorEl(event.currentTarget)')
  })

  it('CloudSavesSync syncs through executeCloudSync and confirms only the forced commands (T-100-14)', () => {
    const code = read(COMPONENTS_DIR, 'CloudSavesSync.tsx')
    expect(code).toContain('executeCloudSync({')
    expect(code).toContain("useRowAction('syncSaves'")
    expect(code.match(/showDialogModal\(/g)).toHaveLength(1)
    expect(code).toMatch(
      /if \(needsForceConfirm\(syncType\)\) \{\s*showDialogModal\(/
    )
    expect(code).toContain('gates.syncNow')
    expect(code).toContain('gates.openSaves')
  })

  it('IntegrationRows drives the Auto-sync saves switch from useSetting (D-03)', () => {
    const code = read(TAB_DIR, 'IntegrationRows.tsx')
    expect(code).toContain("useSetting('autoSyncSaves'")
    expect(code).toContain('id="installTabAutoSync"')
  })

  it('InstallTab renders CloudSavesSync inside installFacts after VersionRow', () => {
    const code = read(TAB_DIR, 'index.tsx')
    const version = code.indexOf('<VersionRow')
    const cloud = code.indexOf('<CloudSavesSync')
    const legacy = code.indexOf('className="legacyRows"')
    expect(cloud).toBeGreaterThan(version)
    expect(legacy).toBeGreaterThan(cloud)
  })

  it('EngineRow offers Open prefix only through gates.openPrefix (D-01, D-11)', () => {
    const code = read(TAB_DIR, 'EngineRow.tsx')
    expect(code).toContain('gates.openPrefix.show')
    expect(code).toContain('window.api.openFolder(winePrefix)')
    expect(code.match(/<FactAction/g)).toHaveLength(1)
    expect(code).toContain("hasCapability(runner, 'winePrefixToolsAvailable')")
  })

  it('StaticFactRows are action-less facts (D-05)', () => {
    const code = read(TAB_DIR, 'StaticFactRows.tsx')
    expect(code).not.toContain('FactAction')
    expect(code).toContain('export const OnlineRequiredRow')
    expect(code).toContain('export const ThirdPartyRow')
  })

  it('InstalledInfo is gone and the InstallTab renders every re-homed fact in order (D-14)', () => {
    expect(existsSync(join(COMPONENTS_DIR, 'InstalledInfo.tsx'))).toBe(false)
    const code = read(TAB_DIR, 'index.tsx')
    expect(code).not.toContain('InstalledInfo')
    const order = [
      '<VersionRow',
      '<EngineRow',
      '<CloudSavesSync',
      '<PlatformSupport',
      '<OnlineRequiredRow',
      '<ThirdPartyRow',
      'className="legacyRows"'
    ].map((marker) => code.indexOf(marker))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('NotInstalledFacts opens the import door behind gates.locate (D-01)', () => {
    const code = read(TAB_DIR, 'NotInstalledFacts.tsx')
    expect(code).toContain('gates.locate.show')
    expect(code).toContain('openInstallGameModal({')
    expect(code).toContain("action: 'import'")
    expect(code).toContain('<ThirdPartyRow')
    expect(code).toContain('<DownloadSizeInfo')
    expect(code).toContain('<PlatformSupport')
  })

  it('InstallTab branches installed and not-installed facts and places the notes before the legacy rows (D-06)', () => {
    const code = read(TAB_DIR, 'index.tsx')
    const notInstalled = code.indexOf('<NotInstalledFacts')
    const notes = code.indexOf('className="installNotes"')
    const humble = code.indexOf('<HumbleOriginInfo')
    const nativePort = code.indexOf('<NativePortInfo')
    const legacy = code.indexOf('className="legacyRows"')
    const integration = code.indexOf('<IntegrationRows')
    expect(code).toContain('gameInfo.is_installed ? (')
    expect(notInstalled).toBeGreaterThan(-1)
    expect(notes).toBeGreaterThan(notInstalled)
    expect(humble).toBeGreaterThan(notes)
    expect(nativePort).toBeGreaterThan(humble)
    expect(legacy).toBeGreaterThan(nativePort)
    expect(integration).toBeGreaterThan(legacy)
    expect(code).not.toContain('<DownloadSizeInfo')
  })

  it('the two notes carry installNote and NativePortInfo keeps its three is-text buttons (D-06)', () => {
    const humble = read(COMPONENTS_DIR, 'HumbleOriginInfo.tsx')
    const native = read(COMPONENTS_DIR, 'NativePortInfo.tsx')
    expect(humble).toContain('installNote')
    expect(native).toContain('installNote')
    expect(native.match(/className="button is-text"/g)).toHaveLength(3)
  })

  it('the Settings Cloud Saves Sync section no longer offers the quick-sync-menu toggle (D-21)', () => {
    const dir = join(
      TAB_DIR,
      '..',
      '..',
      '..',
      '..',
      'Settings',
      'sections',
      'SyncSaves'
    )
    for (const name of ['index.tsx', 'legendary.tsx', 'gog.tsx']) {
      const code = read(dir, name)
      expect({ name, hit: code.includes('enableQuickSavesMenu') }).toEqual({
        name,
        hit: false
      })
      expect({ name, hit: code.includes('QuickSavesToggle') }).toEqual({
        name,
        hit: false
      })
    }
  })
})
