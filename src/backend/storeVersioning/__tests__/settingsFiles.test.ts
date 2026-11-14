import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBackups } from '../backup'
import {
  ensureSettingsMigrated,
  isSettingsFileReadOnly,
  writeSettingsFile
} from '../settingsFiles'

const fixtures = join(__dirname, '..', '..', 'storeMigrations', '__tests__')

let root: string
let stderr: jest.SpyInstance

// One engine and tracker per test: nothing carries over between tests.
let h: VersioningHarness

beforeEach(() => {
  h = createVersioningHarness()
  root = mkdtempSync(join(tmpdir(), 'settings-files-'))
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stderr.mockRestore()
  rmSync(root, { recursive: true, force: true })
})

describe('ensureSettingsMigrated', () => {
  test('migrates a v0 global file with a private backup', () => {
    const path = join(root, 'config.json')
    copyFileSync(join(fixtures, 'fixtures', 'settings-global-v0.json'), path)
    const original = readFileSync(path)
    ensureSettingsMigrated(h.versioning, path, 'settings/global')
    const out = JSON.parse(readFileSync(path, 'utf8'))
    expect(out.version).toBe('v1')
    expect(out.defaultSettings.trayIconVariant).toBe('dark')
    expect(out.defaultSettings.darkTrayIcon).toBeUndefined()
    const backups = listBackups(path)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0]!).equals(original)).toBe(true)
    expect(statSync(backups[0]!).mode & 0o777).toBe(0o600)
  })

  test('a newer file is untouched and read-only', () => {
    const path = join(root, 'config.json')
    const text = JSON.stringify({ defaultSettings: {}, version: 'v9' })
    writeFileSync(path, text)
    ensureSettingsMigrated(h.versioning, path, 'settings/global')
    expect(readFileSync(path, 'utf8')).toBe(text)
    expect(isSettingsFileReadOnly(h.versioning, path)).toBe(true)
    writeSettingsFile(h.versioning, path, { changed: true })
    expect(readFileSync(path, 'utf8')).toBe(text)
  })

  test('a v0 game file is migrated to v2 with one private backup and its settings intact', () => {
    const dir = join(root, 'GamesConfig')
    mkdirSync(dir)
    const path = join(dir, 'app.json')
    copyFileSync(join(fixtures, 'fixtures', 'settings-game-v0.json'), path)
    ensureSettingsMigrated(h.versioning, path, 'settings/game')
    const after = JSON.parse(readFileSync(path, 'utf8'))
    expect(after.version).toBe('v2')
    expect(after.myApp.language).toBe('en')
    expect(after.explicit).toBe(true)
    const backups = listBackups(path)
    expect(backups).toHaveLength(1)
    expect(statSync(backups[0]!).mode & 0o777).toBe(0o600)
    expect(isSettingsFileReadOnly(h.versioning, path)).toBe(false)
  })

  test('invalid per-game values are dropped and the backup keeps the original bytes', () => {
    const dir = join(root, 'GamesConfig')
    mkdirSync(dir)
    const path = join(dir, 'app.json')
    const src = join(
      fixtures,
      'fixtures',
      'settings-game-v1-invalid-values.json'
    )
    copyFileSync(src, path)
    ensureSettingsMigrated(h.versioning, path, 'settings/game')
    const after = JSON.parse(readFileSync(path, 'utf8'))
    expect(after.version).toBe('v2')
    expect('gamescope' in after.Game2).toBe(false)
    const backups = listBackups(path)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0]!).equals(readFileSync(src))).toBe(true)
  })

  test('is memoised per path', () => {
    const path = join(root, 'config.json')
    copyFileSync(join(fixtures, 'fixtures', 'settings-global-v0.json'), path)
    ensureSettingsMigrated(h.versioning, path, 'settings/global')
    const after = readFileSync(path, 'utf8')
    ensureSettingsMigrated(h.versioning, path, 'settings/global')
    expect(readFileSync(path, 'utf8')).toBe(after)
    expect(listBackups(path)).toHaveLength(1)
  })

  test('writeSettingsFile writes private 2-space JSON when writable', () => {
    const path = join(root, 'config.json')
    writeSettingsFile(h.versioning, path, { a: 1 })
    expect(readFileSync(path, 'utf8')).toBe('{\n  "a": 1\n}')
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})
