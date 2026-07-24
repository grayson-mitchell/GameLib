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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAURI_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)

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
