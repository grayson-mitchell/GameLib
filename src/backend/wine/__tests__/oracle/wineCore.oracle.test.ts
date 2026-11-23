/**
 * The wine command core oracle (87-08, D-22 and D-08): the env builders `setupEnvVars` and
 * `setupWineEnvVars`, `validWine`, and `runWineCommand`, driven on a fake HOME and recorded as the
 * goldens the Rust `gamelib-wine` core (and the TS twins that stay until Phase 88) have to reproduce.
 * These functions are the hard dependency of DXVK, Winetricks and bottle creation, so they are
 * pinned before any Rust for them exists.
 *
 * Three artefacts, none typed by hand except the inputs:
 *   vectors/wine_env.json              input and output vectors of both env builders
 *   vectors/valid_wine.json            `validWine` over each wine type, present, missing and partly present
 *   golden/wine_command/               `runWineCommand` cases (hand-authored `cases.json`) recorded as
 *                                      spawn traces plus results through the 87-05 harness
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite every artefact from the TS
 *   (default)                        recompute and compare, offline
 *
 * A vector or case never reads the real HOME, PATH or /Applications: every path is a placeholder
 * (`<HOME>`, `<TOOLS>`, ...) expanded onto a fresh fake profile, the platform is injected, the six
 * `process.env` keys the builders read are set to synthetic values (and every other key is left
 * alone because the builders do not read it), and a `runWineCommand` case runs with `process.env`
 * replaced by the fake profile's eight variables plus a scripted PATH. The spawns are scripted: no
 * wine binary is ever executed. The goldens are recorded on a POSIX host (joined paths use `/`).
 *
 * The vectors carry only the `GameSettings` fields the builders read (see `ENV_SETTINGS_KEYS`).
 * A path ending in `/` in `existing` is a directory; any other is an empty file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  fixturesRoot,
  oracleMode
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { createCommandRunner } from 'backend/commandRunner'
import {
  setupEnvVars,
  setupWineEnvVars,
  validWine,
  verifyWinePrefix
} from 'backend/launcher'
import { getUmuPath, isUmuSupported } from 'backend/utils/compatibility_layers'
import type {
  GameSettings,
  WineCommandArgs,
  WineInstallation
} from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'wine_command'
/** The wine_command case count this plan commits; a later edit may raise it, never lower it. */
const COMMAND_FLOOR = 16
/** The env vector count; the plan asks for at least 40. */
const ENV_FLOOR = 40
/** The validWine vector count. */
const VALID_FLOOR = 14

/** The `process.env` keys the two env builders read. */
const ENV_KEYS = [
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'ORIG_LD_LIBRARY_PATH',
  'SteamAppId',
  'STEAM_COMPAT_APP_ID',
  'SteamGameId'
] as const
type EnvKey = (typeof ENV_KEYS)[number]

/** The `GameSettings` fields `setupEnvVars` and `setupWineEnvVars` read (`wineVersion` aside). */
const ENV_SETTINGS_KEYS = [
  'nvidiaPrime',
  'showFps',
  'enviromentOptions',
  'winePrefix',
  'wineCrossoverBottle',
  'enableDXVKFpsLimit',
  'DXVKFpsCap',
  'enableFSR',
  'maxSharpness',
  'enableEsync',
  'enableMsync',
  'enableFsync',
  'enableWineWayland',
  'enableHDR',
  'enableWoW64',
  'autoInstallDxvkNvapi',
  'eacRuntime',
  'battlEyeRuntime',
  'verboseLogs',
  'preferSystemLibs',
  'advertiseAvxForRosetta'
] as const

type EnvSettings = Pick<GameSettings, (typeof ENV_SETTINGS_KEYS)[number]> & {
  wineVersion: WineInstallation
}

/**
 * The module object `backend/utils` calls `release()` on. A namespace import is a frozen copy, so the
 * spy needs the registry's own object.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const osModule = (): typeof import('os') => require('os')

const modeOf = oracleMode

/** Expands every placeholder in every string of a JSON-shaped value onto the profile. */
function expandDeep<T>(value: T, profile: EngineOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return expandPlaceholders(node, profile)
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

/** `existing` entries as seeds: a trailing `/` is a directory, anything else an empty file. */
function seedsOf(existing: readonly string[]): SeedEntry[] {
  return existing.map((path) =>
    path.endsWith('/')
      ? { path: path.slice(0, -1), dir: true as const }
      : { path, text: '' }
  )
}

/** Runs `fn` with exactly `values` set for `keys` in `process.env`, then restores them. */
function withEnvKeys<T>(
  keys: readonly string[],
  values: Record<string, string>,
  fn: () => T
): T {
  const saved = new Map<string, string | undefined>()
  for (const key of keys) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/** Replaces the whole of `process.env` for the duration of `fn` (async), then puts it back. */
async function withCleanProcessEnv<T>(
  clean: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, clean)
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

const vectorFile = (name: string): string =>
  join(fixturesRoot(CRATE), 'vectors', name)

/** Write mode writes the file; compare mode asserts the committed bytes; record mode does nothing. */
function writeOrCompareVectors(name: string, vectors: unknown[]): void {
  const text = `${JSON.stringify(vectors, null, 2)}\n`
  const mode = modeOf()
  if (mode === 'record') return
  const file = vectorFile(name)
  if (mode === 'write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
    return
  }
  expect(text).toBe(readFileSync(file, 'utf8'))
}

// ---------------------------------------------------------------------------------------------
// Inputs: the env vectors
// ---------------------------------------------------------------------------------------------

interface EnvInput {
  id: string
  platform: OraclePlatform
  settings: EnvSettings
  gameId?: string
  installPath?: string
  /** The `process.env` values of the read keys (every key not listed is unset). */
  env: Partial<Record<EnvKey, string>>
  /** Paths that exist on the profile before the call (`/` suffix: a directory). */
  existing: string[]
}

const WINE_DIR = '<TOOLS>/wine/Wine-9'
const wine: WineInstallation = {
  type: 'wine',
  name: 'Wine-9',
  bin: `${WINE_DIR}/bin/wine`,
  wineserver: `${WINE_DIR}/bin/wineserver`,
  lib: `${WINE_DIR}/lib64`,
  lib32: `${WINE_DIR}/lib`
}
const PROTON_DIR = '<TOOLS>/proton/GE-Proton9-27'
const proton: WineInstallation = {
  type: 'proton',
  name: 'GE-Proton9-27',
  bin: `${PROTON_DIR}/proton`
}
const CROSSOVER_BIN =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const crossover: WineInstallation = {
  type: 'crossover',
  name: 'CrossOver - 24.0.0',
  bin: `${CROSSOVER_BIN}/wine`,
  wineserver: `${CROSSOVER_BIN}/wineserver`
}
const GPTK_DIR = '<TOOLS>/game-porting-toolkit/GPTK-3/Contents/Resources/wine'
const toolkit: WineInstallation = {
  type: 'toolkit',
  name: 'GPTK-3',
  bin: `${GPTK_DIR}/bin/wine64`,
  wineserver: `${GPTK_DIR}/bin/wineserver`,
  lib: `${GPTK_DIR}/lib`,
  lib32: `${GPTK_DIR}/lib`
}
const macWine: WineInstallation = {
  type: 'wine',
  name: 'Wine Crossover - 9.0',
  bin: '<TOOLS>/wine/mac/Contents/Resources/wine/bin/wine64',
  wineserver: '<TOOLS>/wine/mac/Contents/Resources/wine/bin/wineserver',
  lib: '<TOOLS>/wine/mac/Contents/Resources/wine/lib',
  lib32: '<TOOLS>/wine/mac/Contents/Resources/wine/lib'
}

const baseSettings: Omit<EnvSettings, 'wineVersion'> = {
  nvidiaPrime: false,
  showFps: false,
  enviromentOptions: [],
  winePrefix: '<HOME>/Games/prefix',
  wineCrossoverBottle: '',
  enableDXVKFpsLimit: false,
  DXVKFpsCap: '60',
  enableFSR: false,
  enableEsync: false,
  enableMsync: false,
  enableFsync: false,
  enableWineWayland: false,
  enableHDR: false,
  enableWoW64: false,
  autoInstallDxvkNvapi: false,
  eacRuntime: false,
  battlEyeRuntime: false,
  verboseLogs: false,
  preferSystemLibs: false,
  advertiseAvxForRosetta: false
}

/** The two dirs the GStreamer probe reads, and the two the wine-dll probe reads, for `wine`. */
const GST_DIRS = [
  `${WINE_DIR}/lib64/gstreamer-1.0/`,
  `${WINE_DIR}/lib/gstreamer-1.0/`
]
const DLL_DIRS = [`${WINE_DIR}/lib64/wine/`, `${WINE_DIR}/lib/wine/`]

function vec(
  id: string,
  platform: OraclePlatform,
  wineVersion: WineInstallation,
  settings: Partial<Omit<EnvSettings, 'wineVersion'>> = {},
  extra: Partial<
    Pick<EnvInput, 'gameId' | 'installPath' | 'env' | 'existing'>
  > = {}
): EnvInput {
  return {
    id,
    platform,
    settings: { ...baseSettings, ...settings, wineVersion },
    ...(extra.gameId !== undefined && { gameId: extra.gameId }),
    ...(extra.installPath !== undefined && { installPath: extra.installPath }),
    env: extra.env ?? {},
    existing: extra.existing ?? []
  }
}

const ENV_INPUTS: EnvInput[] = [
  // setupEnvVars
  vec('env-linux-defaults', 'linux', wine),
  vec(
    'env-ld-preload-from-process',
    'linux',
    wine,
    {},
    { env: { LD_PRELOAD: '/opt/synthetic/preload.so' } }
  ),
  vec('env-ld-preload-from-settings', 'linux', wine, {
    enviromentOptions: [{ key: 'LD_PRELOAD', value: '/opt/synthetic/user.so' }]
  }),
  vec('env-nvidia-prime', 'linux', wine, { nvidiaPrime: true }),
  vec('env-mac-show-fps', 'mac', wine, { showFps: true }),
  vec(
    'env-linux-install-path',
    'linux',
    wine,
    {},
    { installPath: '<HOME>/Games/GameOne' }
  ),
  vec(
    'env-mac-install-path-ignored',
    'mac',
    wine,
    {},
    { installPath: '<HOME>/Games/GameOne' }
  ),
  vec('env-custom-quotes-and-overrides', 'linux', wine, {
    nvidiaPrime: true,
    enviromentOptions: [
      { key: 'MY_VAR', value: '"quoted value"' },
      { key: 'PLAIN', value: 'a b' },
      { key: 'DRI_PRIME', value: '0' },
      { key: 'EMPTY', value: '' }
    ]
  }),
  vec('env-custom-unset-syntax', 'linux', wine, {
    enviromentOptions: [
      { key: 'WINEDEBUG', value: '-all' },
      { key: 'UNSET_ME', value: '' },
      { key: 'MANGOHUD_CONFIG', value: '"cpu_temp,gpu_temp"' }
    ]
  }),
  vec('env-windows-defaults', 'windows', wine),
  // wine type
  vec('wine-linux-libs-no-probes', 'linux', wine),
  vec('wine-linux-gstreamer-both', 'linux', wine, {}, { existing: GST_DIRS }),
  vec(
    'wine-linux-gstreamer-one-only',
    'linux',
    wine,
    {},
    { existing: [GST_DIRS[0] as string] }
  ),
  vec('wine-linux-winedll-both', 'linux', wine, {}, { existing: DLL_DIRS }),
  vec(
    'wine-linux-winedll-one-only',
    'linux',
    wine,
    {},
    { existing: [DLL_DIRS[1] as string] }
  ),
  vec(
    'wine-linux-both-probes',
    'linux',
    wine,
    {},
    { existing: [...GST_DIRS, ...DLL_DIRS] }
  ),
  vec(
    'wine-linux-orig-ld-set-in-process',
    'linux',
    wine,
    {},
    {
      env: {
        ORIG_LD_LIBRARY_PATH: '/opt/synthetic/orig',
        LD_LIBRARY_PATH: '/opt/synthetic/ld'
      }
    }
  ),
  vec(
    'wine-linux-ld-library-path-appended',
    'linux',
    wine,
    {},
    {
      env: { LD_LIBRARY_PATH: '/opt/synthetic/ld-a:/opt/synthetic/ld-b' }
    }
  ),
  vec('wine-linux-prefer-system-libs', 'linux', wine, {
    preferSystemLibs: true
  }),
  vec(
    'wine-linux-no-lib-paths',
    'linux',
    { ...wine, lib: undefined, lib32: undefined },
    {},
    {
      env: { LD_LIBRARY_PATH: '/opt/synthetic/ld' }
    }
  ),
  vec('wine-linux-only-lib32', 'linux', { ...wine, lib: undefined }),
  vec('wine-mac-no-lib-paths', 'mac', {
    ...wine,
    lib: undefined,
    lib32: undefined
  }),
  vec('wine-mac-with-libs', 'mac', macWine),
  vec('wine-dlloverrides-appended', 'linux', wine, {
    enviromentOptions: [{ key: 'WINEDLLOVERRIDES', value: 'd3d11=n' }]
  }),
  vec('wine-dlloverrides-key-case-insensitive', 'linux', wine, {
    enviromentOptions: [{ key: 'WineDllOverrides', value: 'dxgi=n' }]
  }),
  vec('wine-linux-esync-fsync', 'linux', wine, {
    enableEsync: true,
    enableFsync: true
  }),
  vec('wine-linux-sync-off', 'linux', wine, {
    enableEsync: false,
    enableFsync: false
  }),
  vec('wine-linux-wayland-hdr', 'linux', wine, {
    enableWineWayland: true,
    enableHDR: true
  }),
  vec('wine-linux-wayland-no-hdr', 'linux', wine, { enableWineWayland: true }),
  vec('wine-linux-wow64', 'linux', wine, { enableWoW64: true }),
  vec('wine-linux-nvapi', 'linux', wine, { autoInstallDxvkNvapi: true }),
  vec('wine-mac-nvapi-ignored', 'mac', macWine, { autoInstallDxvkNvapi: true }),
  vec('wine-linux-runtimes', 'linux', wine, {
    eacRuntime: true,
    battlEyeRuntime: true
  }),
  vec('wine-linux-fsr-default-sharpness', 'linux', wine, { enableFSR: true }),
  vec('wine-linux-fsr-sharpness-zero', 'linux', wine, {
    enableFSR: true,
    maxSharpness: 0
  }),
  vec('wine-linux-fsr-sharpness-five', 'linux', wine, {
    enableFSR: true,
    maxSharpness: 5
  }),
  vec('wine-linux-fps-cap-and-hud', 'linux', wine, {
    showFps: true,
    enableDXVKFpsLimit: true,
    DXVKFpsCap: '144'
  }),
  vec('wine-mac-msync', 'mac', macWine, { enableMsync: true }),
  vec('wine-mac-dxmt-name-implies-msync', 'mac', {
    ...macWine,
    name: 'Wine-Staging-DXMT'
  }),
  vec('wine-linux-deprecated-ge-name', 'linux', {
    ...wine,
    name: 'Wine-GE-Proton7-35'
  }),
  vec('wine-linux-modern-ge-name', 'linux', {
    ...wine,
    name: 'Wine-GE-Proton8-26'
  }),
  vec('wine-windows-prefix-only', 'windows', wine),
  // proton
  vec('proton-linux-defaults', 'linux', proton, {}, { gameId: 'GameOne' }),
  vec('proton-linux-no-gameid-uses-zero', 'linux', proton),
  vec('proton-linux-sync-on', 'linux', proton, {
    enableEsync: true,
    enableFsync: true
  }),
  vec('proton-linux-wayland-hdr', 'linux', proton, {
    enableWineWayland: true,
    enableHDR: true
  }),
  vec('proton-linux-wow64', 'linux', proton, { enableWoW64: true }),
  vec('proton-linux-nvapi', 'linux', proton, { autoInstallDxvkNvapi: true }),
  vec('proton-linux-runtimes', 'linux', proton, {
    eacRuntime: true,
    battlEyeRuntime: true
  }),
  vec(
    'proton-steam-ids-from-process',
    'linux',
    proton,
    {},
    {
      gameId: 'GameOne',
      env: { STEAM_COMPAT_APP_ID: '480', SteamAppId: '481', SteamGameId: '482' }
    }
  ),
  vec(
    'proton-steam-appid-follows-compat-id',
    'linux',
    proton,
    {},
    {
      env: { STEAM_COMPAT_APP_ID: '480' }
    }
  ),
  vec('proton-verbose-logs', 'linux', proton, { verboseLogs: true }),
  vec('proton-verbose-logs-user-keys-win', 'linux', proton, {
    verboseLogs: true,
    enviromentOptions: [
      { key: 'WINEDEBUG', value: '-all' },
      { key: 'DXVK_LOG_LEVEL', value: 'none' }
    ]
  }),
  vec('proton-mac-prefix-vars', 'mac', proton),
  // crossover and toolkit
  vec('crossover-mac-bottle', 'mac', crossover, {
    wineCrossoverBottle: 'GameLibSteam'
  }),
  vec('crossover-mac-show-fps-and-msync', 'mac', crossover, {
    wineCrossoverBottle: 'Other Bottle',
    showFps: true,
    enableMsync: true
  }),
  vec('toolkit-mac-defaults', 'mac', toolkit),
  vec('toolkit-mac-msync-sets-esync', 'mac', toolkit, { enableMsync: true }),
  vec('toolkit-mac-avx', 'mac', toolkit, { advertiseAvxForRosetta: true }),
  vec('wine-mac-avx-ignored', 'mac', macWine, { advertiseAvxForRosetta: true }),
  vec('toolkit-linux-avx-ignored', 'linux', toolkit, {
    advertiseAvxForRosetta: true
  })
]

// ---------------------------------------------------------------------------------------------
// Inputs: the validWine vectors
// ---------------------------------------------------------------------------------------------

interface ValidInput {
  id: string
  platform: OraclePlatform
  /** The `os.release()` the Sonoma check reads (mac only). */
  release?: string
  wineVersion: WineInstallation | null
  existing: string[]
}

const WINE_BINS = [wine.bin, wine.wineserver as string]
const validInputs: ValidInput[] = [
  {
    id: 'wine-both-present',
    platform: 'linux',
    wineVersion: wine,
    existing: WINE_BINS
  },
  {
    id: 'wine-bin-only',
    platform: 'linux',
    wineVersion: wine,
    existing: [wine.bin]
  },
  {
    id: 'wine-wineserver-only',
    platform: 'linux',
    wineVersion: wine,
    existing: [wine.wineserver as string]
  },
  {
    id: 'wine-none-present',
    platform: 'linux',
    wineVersion: wine,
    existing: []
  },
  {
    id: 'wine-no-wineserver-field',
    platform: 'linux',
    wineVersion: { ...wine, wineserver: undefined },
    existing: [wine.bin]
  },
  {
    id: 'wine-empty-wineserver-field',
    platform: 'linux',
    wineVersion: { ...wine, wineserver: '' },
    existing: [wine.bin]
  },
  {
    id: 'wine-mac-both-present',
    platform: 'mac',
    wineVersion: macWine,
    existing: [macWine.bin, macWine.wineserver as string]
  },
  {
    id: 'wine-windows-both-present',
    platform: 'windows',
    wineVersion: wine,
    existing: WINE_BINS
  },
  {
    id: 'proton-bin-present',
    platform: 'linux',
    wineVersion: proton,
    existing: [proton.bin]
  },
  {
    id: 'proton-bin-missing',
    platform: 'linux',
    wineVersion: proton,
    existing: []
  },
  {
    id: 'proton-wineserver-not-needed',
    platform: 'linux',
    wineVersion: { ...proton, wineserver: '<TOOLS>/proton/missing/wineserver' },
    existing: [proton.bin]
  },
  {
    id: 'crossover-bin-present',
    platform: 'mac',
    wineVersion: crossover,
    existing: [crossover.bin]
  },
  {
    id: 'crossover-bin-missing',
    platform: 'mac',
    wineVersion: crossover,
    existing: [crossover.wineserver as string]
  },
  {
    id: 'toolkit-present-recent-macos',
    platform: 'mac',
    release: '24.1.0',
    wineVersion: toolkit,
    existing: [toolkit.bin]
  },
  {
    id: 'toolkit-present-darwin-14',
    platform: 'mac',
    release: '14.0.0',
    wineVersion: toolkit,
    existing: [toolkit.bin]
  },
  {
    id: 'toolkit-present-old-darwin-13',
    platform: 'mac',
    release: '13.6.0',
    wineVersion: toolkit,
    existing: [toolkit.bin]
  },
  {
    id: 'toolkit-missing-recent-macos',
    platform: 'mac',
    release: '24.1.0',
    wineVersion: toolkit,
    existing: []
  },
  {
    id: 'toolkit-linux-skips-os-check',
    platform: 'linux',
    release: '13.6.0',
    wineVersion: toolkit,
    existing: [toolkit.bin]
  },
  { id: 'no-wine-version', platform: 'linux', wineVersion: null, existing: [] }
]

// ---------------------------------------------------------------------------------------------
// Inputs: runWineCommand cases (golden/wine_command/cases.json)
// ---------------------------------------------------------------------------------------------

interface CommandCase {
  id: string
  platform: OraclePlatform
  /** When true `gameSettings` is omitted and `getDefaultSettings()` supplies `settings`. */
  useDefaultSettings?: boolean
  settings: EnvSettings & { disableUMU: boolean }
  seed?: SeedEntry[]
  /** Extra PATH directories (placeholders), in order. */
  path?: string[]
  args: Omit<WineCommandArgs, 'gameSettings' | 'onSpawn'>
  scripted: {
    program: string
    argv?: string[]
    code?: number
    stdout?: string
    stderr?: string
  }[]
  note: string
}

describeSkipOnWindows('wine core oracle (87-08)', () => {
  // The os.release() spy: validWine's Sonoma check calls it through the named import.
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('records setupEnvVars and setupWineEnvVars over the env vectors', async () => {
    const vectors: unknown[] = []
    for (const input of ENV_INPUTS) {
      const restorePlatform = mockPlatform(input.platform)
      try {
        const expected = await withEngineOracleProfile(
          (profile) => {
            const settings = expandDeep(input.settings, profile) as GameSettings
            const installPath =
              input.installPath === undefined
                ? undefined
                : expandPlaceholders(input.installPath, profile)
            const env = expandDeep(input.env, profile) as Record<string, string>
            return withEnvKeys(ENV_KEYS, env, () =>
              normalisePaths(
                {
                  setupEnvVars: setupEnvVars(settings, installPath),
                  setupWineEnvVars: setupWineEnvVars(
                    { paths: profile.paths },
                    settings,
                    input.gameId
                  )
                },
                profile
              )
            )
          },
          { seed: seedsOf(input.existing) }
        )
        vectors.push({ ...input, expected })
      } finally {
        restorePlatform()
      }
    }
    assertAtOrAboveFloor('wine_env vectors', vectors.length, ENV_FLOOR)
    expect(new Set(ENV_INPUTS.map((v) => v.id)).size).toBe(ENV_INPUTS.length)
    writeOrCompareVectors('wine_env.json', vectors)
    if (modeOf() === 'compare') {
      const committed = JSON.parse(
        readFileSync(vectorFile('wine_env.json'), 'utf8')
      ) as unknown[]
      assertAtOrAboveFloor(
        'wine_env committed vectors',
        committed.length,
        ENV_FLOOR
      )
    }
  })

  it('covers every wineVersion.type and the unset-variable syntax in the env vectors', () => {
    const types = new Set(ENV_INPUTS.map((v) => v.settings.wineVersion.type))
    expect([...types].sort()).toEqual([
      'crossover',
      'proton',
      'toolkit',
      'wine'
    ])
    // Every vector carries exactly the settings the builders read, so the Rust side deserialises one shape.
    for (const v of ENV_INPUTS) {
      expect(
        Object.keys(v.settings).filter((k) => k !== 'wineVersion')
      ).toEqual(
        expect.arrayContaining(
          ENV_SETTINGS_KEYS.filter((k) => k !== 'maxSharpness')
        )
      )
    }
    expect(
      ENV_INPUTS.some((v) =>
        v.settings.enviromentOptions.some((e) => e.value === '')
      )
    ).toBe(true)
  })

  it('records validWine over each wine type, present, missing and partly present', async () => {
    const vectors: unknown[] = []
    for (const input of validInputs) {
      const restorePlatform = mockPlatform(input.platform)
      if (input.release !== undefined) {
        jest.spyOn(osModule(), 'release').mockReturnValue(input.release)
      }
      try {
        const expected = await withEngineOracleProfile(
          (profile) =>
            validWine(
              input.wineVersion === null
                ? (null as unknown as WineInstallation)
                : expandDeep(input.wineVersion, profile)
            ),
          { seed: seedsOf(input.existing) }
        )
        vectors.push({ ...input, expected })
      } finally {
        restorePlatform()
        jest.restoreAllMocks()
      }
    }
    assertAtOrAboveFloor('valid_wine vectors', vectors.length, VALID_FLOOR)
    const results = vectors.map((v) => (v as { expected: boolean }).expected)
    // Both outcomes are present, so an always-true or always-false validWine cannot pass.
    expect(results).toContain(true)
    expect(results).toContain(false)
    writeOrCompareVectors('valid_wine.json', vectors)
  })

  describe('runWineCommand spawn traces', () => {
    const cases = loadCases<CommandCase>(CRATE, SLICE)

    it.each(cases)('$id', async (c) => {
      const restorePlatform = mockPlatform(c.platform)
      try {
        await withEngineOracleProfile(
          async (profile) => {
            const events: unknown[] = []
            const scriptedBin = expandPlaceholders(
              '<HOME>/scripted-bin',
              profile
            )
            const pathDirs = (c.path ?? []).map((p) =>
              expandPlaceholders(p, profile)
            )
            const clean: Record<string, string> = {
              ...(profile.fake.env as Record<string, string>),
              PATH: [...pathDirs, scriptedBin].join(':')
            }
            const settings = expandDeep(c.settings, profile)
            const tracer = createSpawnTracer({
              baseEnv: clean,
              scripted: c.scripted.map((s) => ({
                ...s,
                program: expandPlaceholders(s.program, profile),
                argv: s.argv?.map((a) => expandPlaceholders(a, profile))
              }))
            })
            // The trace holds argv, env and cwd; what the runner is asked for beyond that is the
            // options the command runner chooses, pinned here as events.
            const runner = {
              ...tracer.runner,
              run: (
                program: string,
                argv: readonly string[],
                opts?: Parameters<typeof tracer.runner.run>[2]
              ) => {
                events.push({
                  kind: 'runOptions',
                  program,
                  replaceEnv: opts?.replaceEnv ?? null,
                  track: opts?.track ?? null,
                  resolveOn: opts?.resolveOn ?? null,
                  timeoutMs: opts?.timeoutMs ?? null,
                  timeoutNone: opts?.timeout?.none === true,
                  windowsHide: opts?.windowsHide ?? null
                })
                return tracer.runner.run(program, argv, opts)
              }
            }
            const message =
              (kind: string) =>
              (...a: unknown[]) => {
                events.push({ kind, message: a[0] })
              }
            // The real verifyWinePrefix calls back into the runner it is part of.
            const self: { runner?: ReturnType<typeof createCommandRunner> } = {}
            const commandRunner = createCommandRunner({
              runner,
              platform:
                c.platform === 'windows'
                  ? 'win32'
                  : c.platform === 'mac'
                    ? 'darwin'
                    : 'linux',
              logger: {
                logInfo: message('info') as never,
                logWarning: message('warning') as never,
                logError: ((m: unknown[]) => {
                  events.push({ kind: 'error', message: String(m[0]) })
                }) as never,
                logDebug: () => undefined,
                backendPrefix: 'Backend' as never
              },
              getRunnerLogWriter: () => {
                throw new Error('not used by runWineCommand')
              },
              abort: {
                create: () => new AbortController(),
                remove: () => undefined
              },
              errorHandler: () => undefined,
              searchForExecutableOnPath: () => Promise.resolve(null),
              commandToArgsArray: () => [],
              wine: {
                getDefaultSettings: () => settings as GameSettings,
                verifyWinePrefix: (s) =>
                  verifyWinePrefix(
                    {
                      commandRunner: {
                        runWineCommand: (a) => {
                          if (!self.runner) throw new Error('runner not built')
                          return self.runner.runWineCommand(a)
                        }
                      },
                      paths: profile.paths
                    },
                    s
                  ),
                validWine,
                setupEnvVars,
                setupWineEnvVars: (s, gameId) =>
                  setupWineEnvVars({ paths: profile.paths }, s, gameId),
                isUmuSupported: (s) =>
                  isUmuSupported({ paths: profile.paths }, s),
                getUmuPath: () => getUmuPath({ paths: profile.paths })
              }
            })
            self.runner = commandRunner
            const args = expandDeep(c.args, profile)
            const commandPartsBefore = [...args.commandParts]
            const result = await withCleanProcessEnv(clean, () =>
              commandRunner.runWineCommand({
                ...args,
                ...(c.useDefaultSettings
                  ? {}
                  : { gameSettings: settings as GameSettings }),
                options: {
                  ...args.options,
                  onOutput: (data: string) => {
                    events.push({ kind: 'output', data })
                  },
                  logWriters: [
                    {
                      writeString: (text: string) => {
                        events.push({ kind: 'logWriter', text })
                      }
                    } as never
                  ]
                }
              })
            )
            tracer.expectAllConsumed()
            writeOrCompareGolden(CRATE, SLICE, c.id, {
              result: normalisePaths(
                {
                  note: c.note,
                  commandPartsBefore,
                  commandPartsAfter: args.commandParts,
                  result
                },
                profile
              ),
              events: normalisePaths(events, profile),
              after: snapshotTree(profile.home),
              spawns: normalisePaths(tracer.records, profile)
            })
          },
          { seed: c.seed }
        )
      } finally {
        restorePlatform()
      }
    })

    it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
      syncManifest(CRATE, SLICE, cases, COMMAND_FLOOR)
      assertManifest(CRATE, SLICE, cases, COMMAND_FLOOR)
    })

    it('an empty case list fails the manifest check', () => {
      expectEmptyCasesToFail(CRATE, SLICE, COMMAND_FLOOR)
    })
  })

  it('has the committed vector files at or above their floors', () => {
    if (modeOf() !== 'compare') return
    for (const [name, floor] of [
      ['wine_env.json', ENV_FLOOR],
      ['valid_wine.json', VALID_FLOOR]
    ] as const) {
      expect(existsSync(vectorFile(name))).toBe(true)
      const parsed: unknown = JSON.parse(readFileSync(vectorFile(name), 'utf8'))
      expect(Array.isArray(parsed)).toBe(true)
      assertAtOrAboveFloor(name, (parsed as unknown[]).length, floor)
    }
  })
})
