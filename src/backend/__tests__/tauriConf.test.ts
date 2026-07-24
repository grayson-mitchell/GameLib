/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the TARGET shape
 * of src-tauri/tauri.conf.json. RED today (bundle.active is currently false,
 * targets is "all", plugins is {}) -- turned GREEN by Plan 34-02.
 *
 * Read-file-then-assert-shape, one-behavior-per-test style, modeled on
 * src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts.
 *
 * T-34-01 (Spoofing / updater feed spoofing): the negative Heroic assertion
 * below is the mitigation for this threat -- it must never silently pass on
 * a config that (re-)derives the updater feed from Heroic upstream.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAURI_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)

const SRC_TAURI_DIR = join(__dirname, '..', '..', '..', 'src-tauri')

function loadTauriConf(): Record<string, unknown> {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as Record<
    string,
    unknown
  >
}

describe('tauri.conf.json bundle shape (D-01 / D-02 -- real installable build, all 3 platforms)', () => {
  test('bundle.active is true', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.active).toBe(true)
  })

  test('bundle.targets includes nsis, appimage, and dmg', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.targets).toEqual(expect.arrayContaining(['nsis', 'appimage', 'dmg']))
  })

  test('bundle.externalBin includes binaries/gamelib-sidecar (D-06)', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.externalBin).toEqual(
      expect.arrayContaining(['binaries/gamelib-sidecar'])
    )
  })

  test('bundle.createUpdaterArtifacts is true', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.createUpdaterArtifacts).toBe(true)
  })

  test('does NOT declare certificateThumbprint or signCommand (D-04 -- signing-free base config)', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const windows = (bundle.windows ?? {}) as Record<string, unknown>
    expect(windows).not.toHaveProperty('certificateThumbprint')
    expect(windows).not.toHaveProperty('signCommand')
  })
})

describe('tauri.conf.json updater plugin shape (D-07 / D-08)', () => {
  test('plugins.updater.pubkey is a non-empty string', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    expect(typeof updater.pubkey).toBe('string')
    expect((updater.pubkey as string).length).toBeGreaterThan(0)
  })

  test('plugins.updater.endpoints[0] points at grayson-mitchell/GameLib', () => {
    const conf = loadTauriConf()
    const plugins = conf.plugins as Record<string, unknown>
    const updater = plugins.updater as Record<string, unknown>
    const endpoints = updater.endpoints as string[]
    expect(endpoints[0]).toMatch(/grayson-mitchell\/GameLib/)
  })

  test('the updater feed never contains Heroic-Games-Launcher (T-34-01 -- fork-pointed feed, never derive from defaults)', () => {
    const conf = loadTauriConf()
    expect(JSON.stringify(conf)).not.toContain('Heroic-Games-Launcher')
  })
})

describe('tauri.conf.json icon set (CR-02 -- nsis needs a Windows .ico)', () => {
  test('bundle.icon contains icons/icon.ico', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    expect(bundle.icon).toEqual(expect.arrayContaining(['icons/icon.ico']))
  })

  test('when bundle.targets includes nsis, at least one bundle.icon entry ends with .ico', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const targets = bundle.targets as string[]
    const icons = bundle.icon as string[]
    if (targets.includes('nsis')) {
      expect(icons.some((icon) => icon.endsWith('.ico'))).toBe(true)
    }
  })

  test('every bundle.icon path exists on disk', () => {
    const conf = loadTauriConf()
    const bundle = conf.bundle as Record<string, unknown>
    const icons = bundle.icon as string[]
    const missing = icons.filter(
      (icon) => !existsSync(join(SRC_TAURI_DIR, icon))
    )
    expect(missing).toEqual([])
  })

  test('src-tauri/icons/icon.ico starts with the ICO magic bytes', () => {
    const icoPath = join(SRC_TAURI_DIR, 'icons', 'icon.ico')
    const header = readFileSync(icoPath).subarray(0, 4)
    expect(header).toEqual(Buffer.from([0x00, 0x00, 0x01, 0x00]))
  })
})
