/**
 * RF1 of the 87-69 live gate, at the desk (87-72 Task 1): what the TS launch spawns a CrossOver game with,
 * fed the `launchSettings` that `engine_launch_select` returns on each of its two CrossOver branches.
 *
 * RF1: CrossOver launches started by GameLib exit within one to two seconds on the plain `cx-healthy` branch,
 * while the single launch right after a pinned-to-crossover restore ran normally. The crate-side file
 * (`src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs`) records that both branches return the same
 * spawn-relevant fields; the fixtures below are that literal (`RECORDED_SPAWN_SHAPE`), copied, with the fake
 * profile's root as `/test/home`. What is asserted here is H2 of the debug record: the env for a `crossover`
 * wineVersion sets `CX_BOTTLE` to the bottle, leaves no `WINEPREFIX` or `WINESERVER` that points outside that
 * bottle's directory, and the wine binary the store commands pass is CrossOver's.
 *
 * Every invariant here holds at HEAD, so none is committed in its expected-to-fail form. What the env does NOT
 * carry is `WINEPREFIX`, while the nile launch passes `--wine-prefix <winePrefix>` (the shared default prefix)
 * on the command line beside it; that is recorded in the debug record as an observation, not asserted, because
 * the shell replay of the logged command (re-run 1) ran with that flag and started the game.
 *
 * Spawns nothing. Platform flags are mocked per case via jest.isolateModules. The env builder is the test-only copy in
 * `wine/__tests__/oracle/envBuildersFixture.ts` (88.1-17).
 */
import type { GameSettings } from 'common/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend', Gog: 'Gog', Legendary: 'Legendary' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

const CX_BIN =
  '/test/home/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const BOTTLE = 'GameLib-legendary-54f7949350c949c6a2c47f12e7b15636'
const BOTTLES_ROOT = '/test/home/Library/Application Support/CrossOver/Bottles'

/**
 * `RECORDED_SPAWN_SHAPE` of crossover_launch_shape.rs: the settings both branches hand the launch, over the
 * re-run 1 stored settings (the shared default prefix stays, the engine is on Automatic).
 */
const RECORDED_SPAWN_SHAPE = {
  wineVersion: {
    type: 'crossover',
    bin: `${CX_BIN}/wine`,
    name: 'CrossOver 26.3.0.39832',
    wineserver: `${CX_BIN}/wineserver`
  },
  wineCrossoverBottle: BOTTLE,
  winePrefix: '/test/home/Games/GameLib/Prefixes/shared',
  engineOverride: 'automatic'
}

/** The two branches' `launchSettings`, as recorded from the crate test: equal, one fixture each. */
const BRANCHES: Record<'plain' | 'restore', typeof RECORDED_SPAWN_SHAPE> = {
  plain: structuredClone(RECORDED_SPAWN_SHAPE),
  restore: structuredClone(RECORDED_SPAWN_SHAPE)
}

const asSettings = (shape: typeof RECORDED_SPAWN_SHAPE) =>
  ({
    ...shape,
    enviromentOptions: [],
    preferSystemLibs: false
  }) as unknown as GameSettings

function loadWith(platform: { isMac: boolean; isLinux: boolean }) {
  let setup!: (settings: GameSettings, id?: string) => Record<string, string>
  let flags!: (
    settings: GameSettings,
    wrapper: string
  ) => Promise<Record<string, unknown>>
  let flagsArray!: (
    settings: GameSettings,
    wrapper: string
  ) => Promise<string[]>
  jest.isolateModules(() => {
    jest.doMock('backend/constants/environment', () => ({
      ...jest.requireActual('backend/constants/environment'),
      ...platform
    }))
    // `launcher.ts` no longer builds the env (88.1-17 deleted it, Rust owns it); the verbatim test-only copy stands in
    // for it, so the RF1 invariants keep a TS reading until that copy goes with the command runner twin in 88.2.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fixture = require('backend/wine/__tests__/oracle/envBuildersFixture')
    const { setupWineEnvVars } = fixture
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compat = require('backend/utils/compatibility_layers')
    setup = (settings, id) =>
      setupWineEnvVars(
        {
          paths: { flatpakHome: '/test/flatpak', runtimePath: '/test/runtime' }
        },
        settings,
        id
      )
    // A CrossOver wine reads no umu path: the deps are never consulted for this wine type.
    flags = (settings, wrapper) =>
      compat.getWineFlags({ paths: {} }, settings, wrapper)
    flagsArray = (settings, wrapper) =>
      compat.getWineFlagsArray({ paths: {} }, settings, wrapper)
  })
  return { setup, flags, flagsArray }
}

const inside = (path: string, dir: string) =>
  path === dir || path.startsWith(`${dir}/`)

describe.each(Object.entries(BRANCHES))(
  'RF1 desk: the %s CrossOver branch',
  (_branch, shape) => {
    const { setup, flags, flagsArray } = loadWith({
      isMac: true,
      isLinux: false
    })

    it('selects the per-game bottle with CX_BOTTLE', () => {
      const env = setup(asSettings(shape))
      expect(env.CX_BOTTLE).toBe(BOTTLE)
    })

    it('leaves no WINEPREFIX or WINESERVER that points outside the bottle directory', () => {
      const env = setup(asSettings(shape))
      const bottleDir = `${BOTTLES_ROOT}/${BOTTLE}`
      for (const name of ['WINEPREFIX', 'WINESERVER', 'WINELOADER']) {
        const value = env[name]
        if (value === undefined) continue
        expect({ name, inside: inside(value, bottleDir) }).toEqual({
          name,
          inside: true
        })
      }
    })

    it('does not carry a Proton or toolkit variable', () => {
      const env = setup(asSettings(shape))
      for (const name of [
        'STEAM_COMPAT_DATA_PATH',
        'STEAM_COMPAT_CLIENT_INSTALL_PATH',
        'PROTONPATH'
      ]) {
        expect(env).not.toHaveProperty(name)
      }
    })

    it('passes CrossOver wine, under the CrossOver bin dir, as the --wine of a store command', async () => {
      const settings = asSettings(shape)
      const flagsOut = await flags(settings, '')
      expect(flagsOut['--wine']).toBe(`${CX_BIN}/wine`)
      expect(inside(String(flagsOut['--wine']), CX_BIN)).toBe(true)
      const array = await flagsArray(settings, '')
      expect(array.slice(0, 2)).toEqual(['--wine', `${CX_BIN}/wine`])
      expect(array).not.toContain('--no-wine')
    })

    it('does not rewrite the settings it is handed', () => {
      const settings = asSettings(shape)
      const before = JSON.stringify(settings)
      setup(settings)
      expect(JSON.stringify(settings)).toBe(before)
    })
  }
)

describe('RF1 desk: the two branches spawn the same', () => {
  it('builds the same env for the plain and the restore branch', () => {
    const { setup } = loadWith({ isMac: true, isLinux: false })
    expect(setup(asSettings(BRANCHES.plain))).toEqual(
      setup(asSettings(BRANCHES.restore))
    )
  })

  it('builds the same store wine flags for the plain and the restore branch', async () => {
    const { flagsArray } = loadWith({ isMac: true, isLinux: false })
    expect(await flagsArray(asSettings(BRANCHES.plain), '')).toEqual(
      await flagsArray(asSettings(BRANCHES.restore), '')
    )
  })
})
