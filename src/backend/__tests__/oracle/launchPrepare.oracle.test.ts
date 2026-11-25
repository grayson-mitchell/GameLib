/**
 * The prepare_launch oracle (88.1-02, D-11, D-12, D-13, D-14, D-22, D-25): the whole step a store manager
 * runs before it builds its game command, `launcher.prepareLaunch(gameSettings, logWriter, gameInfo)`,
 * driven through the real TS `Launcher` on a fresh fake HOME and recorded as the golden the Rust
 * `gamelib-launch` prepare step has to reproduce. The golden exists before any Rust prepare code does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/prepare_launch/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`; the `class` of every recorded spawn is the one hand-authored,
 *                   non-oracle field (it comes from `golden/classes.json`, never from the TS)
 *   expected/<case>/input.json     the facts a launcher adapter will send, and the answers the collaborators
 *                                  were scripted with (D-11: the shim-call boundary)
 *   expected/<case>/result.json    the reply, minus `rpcClient`
 *   expected/<case>/log.json       the per-game log entries as `{ level, parts }`, in call order
 *   expected/<case>/spawns.json    the gamescope help probe and the CrossOver bottle-folder probe, with class
 *   expected/<case>/requests.json  the Epic status request, then every `requestRustInvoke` channel and args
 *   expected/<case>/events.json    backend log lines, notifications, the online monitor's ask count,
 *                                  frontend messages and store-hook calls
 *
 * Pairwise rows (D-14). The prepare step has about twenty independent knobs, and the generator lists the
 * whole product, so each (OS, runner) cell is covered by two suites that share the axes they interact on:
 *   identity (every OS)   network (online, offline setting, online monitor down, both), canRunOffline,
 *                         third-party managed app, isNative, anti-cheat info, Epic status and the expired
 *                         flag (legendary), the CrossOver wine type and bottle report (macOS)
 *   tools (Linux only)    host (plain, Flatpak, Steam Deck game mode), mangohud, gamemode, gamescope
 *                         (off, limiter, upscaling x binary found or missing x new, old or failed help),
 *                         the umu conditions, network, canRunOffline, third-party, isNative
 * A pair that straddles the suites (a tool axis against anti-cheat, Epic status or the expired flag) is not
 * enumerated: the step reads them in different stages and shares no state between them. Each suite asserts
 * `uncoveredPairs` is empty over its own axes, and that every axis value appears at least once.
 *
 * Discord presence is never constructed: every case runs with `discordRPC` false, and `deltas.json` records
 * `discord-rpc-dropped` (the operator decision of 2026-11-17 in the 82 amendment; `constructAndUpdateRPC` is
 * deleted in 88.1, not ported).
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`, with an
 * injected platform, Steam Deck and Flatpak probes and PATH lookups; the Epic status request is replayed
 * from the `epic_status` exchanges and every other case replays an empty exchange list, so a request the
 * case did not script fails. Nothing reaches the network or the real profile. Behaviour that looks wrong is
 * kept as recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import { replayAxiosClient } from 'backend/testUtils/launchOracle/epicReplay'
import {
  createFakeLauncherDeps,
  recordingLogWriter
} from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  allPairs,
  uncoveredPairs,
  type Axes,
  type Row
} from 'backend/testUtils/launchOracle/pairwise'
import {
  injectExecutableOnPath,
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  attachSpawnClass,
  loadClasses
} from 'backend/testUtils/launchOracle/spawnClass'
import * as environment from 'backend/constants/environment'
import * as logger from 'backend/logger'
import { createCommandRunner } from 'backend/commandRunner'
import {
  createLauncher,
  setupEnvVars,
  setupWineEnvVars
} from 'backend/launcher'
import { resolveEpicOfflineMode } from 'backend/storeManagers/legendary/epicOfflineMode'
import { getUmuPath, isUmuSupported } from 'backend/utils/compatibility_layers'
import type { SystemInformation } from 'backend/utils/systeminfo'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'
import {
  RUST_INFO_ANTICHEAT_INFO,
  RUST_WINE_RUNTIME_DOWNLOAD,
  RUST_WINE_RUNTIME_IS_INSTALLED
} from 'common/types/sidecarTransport'
import type { GameInfo, GameSettings, Runner } from 'common/types'

// The backend jest project shadows i18next with a key-echoing mock; the Epic notification copy needs the real one.
jest.unmock('i18next')

const CRATE = 'gamelib-launch'
const SLICE = 'prepare_launch'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const PREPARE_FLOOR = 582
const EPIC_SLICE = 'epic_status'
const STEM = 'epicOfflineMode'

const mode = engineWineOracleMode()

// ---------------------------------------------------------------------------------------------
// The axes
// ---------------------------------------------------------------------------------------------

type Network = 'online' | 'setting-offline' | 'monitor-offline' | 'both-offline'
type Host = 'plain' | 'flatpak' | 'deck'
type Tool = 'off' | 'found' | 'missing'
type Gamescope =
  | 'off'
  | 'limiter-new'
  | 'limiter-old'
  | 'limiter-failed'
  | 'limiter-missing'
  | 'upscaling-new'
  | 'upscaling-old'
  | 'upscaling-failed'
  | 'upscaling-missing'
type Umu = 'not-proton' | 'disabled' | 'on-path' | 'installed' | 'download'
type Anticheat = 'none' | 'status' | 'empty-list' | 'both'
type Epic = 'operational' | 'major' | 'unreachable'
type WineType = 'crossover' | 'wine'
type Bottle = 'reported' | 'unterminated' | 'none' | 'failed'

/** Everything one case varies. A suite fills the axes it covers; the rest hold their default. */
interface Spec {
  network: Network
  canRunOffline: boolean
  thirdParty: boolean
  native: boolean
  anticheat: Anticheat
  epic: Epic
  storeExpired: boolean
  wineType: WineType
  bottle: Bottle
  host: Host
  mangohud: Tool
  gamemode: Tool
  gamescope: Gamescope
  umu: Umu
}

const DEFAULT_SPEC: Spec = {
  network: 'online',
  canRunOffline: true,
  thirdParty: false,
  native: false,
  anticheat: 'none',
  epic: 'operational',
  storeExpired: false,
  wineType: 'crossover',
  bottle: 'reported',
  host: 'plain',
  mangohud: 'off',
  gamemode: 'off',
  gamescope: 'off',
  umu: 'not-proton'
}

const OSES: readonly OraclePlatform[] = ['linux', 'mac', 'windows']
const RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam'
]
type Suite = 'identity' | 'tools'

const NETWORKS: Network[] = [
  'online',
  'setting-offline',
  'monitor-offline',
  'both-offline'
]
const GAMESCOPES: Gamescope[] = [
  'off',
  'limiter-new',
  'limiter-old',
  'limiter-failed',
  'limiter-missing',
  'upscaling-new',
  'upscaling-old',
  'upscaling-failed',
  'upscaling-missing'
]
const UMUS: Umu[] = [
  'not-proton',
  'disabled',
  'on-path',
  'installed',
  'download'
]

function axesFor(os: OraclePlatform, runner: Runner, suite: Suite): Axes {
  const axes: Record<string, (string | boolean)[]> = {
    network: NETWORKS,
    canRunOffline: [true, false],
    thirdParty: [true, false],
    native: [true, false]
  }
  if (suite === 'identity') {
    axes.anticheat = ['none', 'status', 'empty-list', 'both']
    if (runner === 'legendary') {
      axes.epic = ['operational', 'major', 'unreachable']
      axes.storeExpired = [true, false]
    }
    if (os === 'mac') {
      axes.wineType = ['crossover', 'wine']
      axes.bottle = ['reported', 'unterminated', 'none', 'failed']
    }
  } else {
    axes.host = ['plain', 'flatpak', 'deck']
    axes.mangohud = ['off', 'found', 'missing']
    axes.gamemode = ['off', 'found', 'missing']
    axes.gamescope = GAMESCOPES
    axes.umu = UMUS
  }
  return axes
}

/**
 * Rows the step makes the same as another row are not generated: an axis the step never reaches takes its
 * default (the Epic status when the launch is already offline, the bottle report when no CrossOver probe
 * runs, everything after a missing tool that ends the step early, the tools a Steam Deck game mode skips).
 */
function feasibleFor(
  os: OraclePlatform,
  runner: Runner,
  suite: Suite
): (row: Row) => boolean {
  void runner
  if (suite === 'identity') {
    return (row) => {
      if (
        row.epic !== undefined &&
        row.network !== 'online' &&
        row.epic !== 'operational'
      ) {
        return false
      }
      if (
        os === 'mac' &&
        !(row.thirdParty === true && row.wineType === 'crossover') &&
        row.bottle !== 'reported'
      ) {
        return false
      }
      return true
    }
  }
  return (row) => {
    const deck = row.host === 'deck'
    if (deck && row.mangohud === 'missing') return false
    if (
      deck &&
      !['off', 'limiter-new', 'upscaling-new'].includes(row.gamescope as string)
    ) {
      return false
    }
    const mangohudBlocks = !deck && row.mangohud === 'missing'
    const gamemodeBlocks = !mangohudBlocks && row.gamemode === 'missing'
    if (mangohudBlocks && row.gamemode !== 'off') return false
    if (
      (mangohudBlocks || gamemodeBlocks) &&
      (row.gamescope !== 'off' || row.umu !== 'not-proton')
    ) {
      return false
    }
    return true
  }
}

interface PrepareCase {
  id: string
  os: OraclePlatform
  runner: Runner
  /** The pairwise suite a generated case belongs to. */
  suite?: Suite
  /** The test title a named case stands for, verbatim. */
  title?: string
  /** The pairwise row a generated case stands for. */
  axes?: Row
  spec: Spec
}

const pad = (n: number): string => String(n).padStart(3, '0')

function pairwiseCases(): PrepareCase[] {
  const cases: PrepareCase[] = []
  for (const os of OSES) {
    for (const runner of RUNNERS) {
      let n = 0
      const suites: Suite[] =
        os === 'linux' ? ['identity', 'tools'] : ['identity']
      for (const suite of suites) {
        const rows = allPairs(
          axesFor(os, runner, suite),
          feasibleFor(os, runner, suite)
        )
        for (const row of rows) {
          n += 1
          cases.push({
            id: `${os}-${runner}-${pad(n)}`,
            os,
            runner,
            suite,
            axes: row,
            spec: { ...DEFAULT_SPEC, ...(row as Partial<Spec>) }
          })
        }
      }
    }
  }
  return cases
}

/** One named case per `epicOfflineMode.test.ts` title (D-14); the three source-text gates are not ported (D-15). */
const SOURCE_TEXT_GATE_REASON = 'source-text gate, dropped per D-15'
const GATE_TITLES = [
  'R8 source gate (comment-stripped) > Test 6a: the expired flag is read exactly once, inside the legendary resolveOfflineMode hook, and launcher.ts calls the hook once',
  'R8 source gate (comment-stripped) > Test 6b: the gate has teeth - a second read outside the hook is caught',
  'R8 source gate (comment-stripped) > Test 6c: no store manager games.ts consults the sign-in state'
] as const

function namedCases(): PrepareCase[] {
  const named = (
    id: string,
    os: OraclePlatform,
    runner: Runner,
    spec: Partial<Spec>,
    title?: string
  ): PrepareCase => ({
    id: title === undefined ? id : `${STEM}--${slug(title)}`,
    os,
    runner,
    ...(title === undefined ? {} : { title }),
    spec: { ...DEFAULT_SPEC, ...spec }
  })
  const out: PrepareCase[] = [
    named('named-mangohud-missing-on-flatpak', 'linux', 'gog', {
      host: 'flatpak',
      mangohud: 'missing'
    }),
    named('named-mangohud-missing-plain-host', 'linux', 'gog', {
      mangohud: 'missing'
    }),
    named('named-gamemode-missing', 'linux', 'gog', { gamemode: 'missing' }),
    named('named-gamescope-missing-on-flatpak', 'linux', 'gog', {
      host: 'flatpak',
      gamescope: 'upscaling-missing'
    }),
    named('named-gamescope-skipped-on-steam-deck-game-mode', 'linux', 'gog', {
      host: 'deck',
      mangohud: 'found',
      gamescope: 'limiter-new'
    }),
    named(
      'named-third-party-mac-crossover-bottle-reported',
      'mac',
      'legendary',
      {
        thirdParty: true,
        wineType: 'crossover',
        bottle: 'reported'
      }
    ),
    named(
      'named-third-party-mac-crossover-no-bottle-folder',
      'mac',
      'legendary',
      {
        thirdParty: true,
        wineType: 'crossover',
        bottle: 'none'
      }
    ),
    named('named-third-party-mac-crossover-probe-fails', 'mac', 'legendary', {
      thirdParty: true,
      wineType: 'crossover',
      bottle: 'failed'
    }),
    named(
      'named-third-party-mac-crossover-bottle-line-unterminated',
      'mac',
      'legendary',
      { thirdParty: true, wineType: 'crossover', bottle: 'unterminated' }
    ),
    named('named-third-party-mac-wine-prefix', 'mac', 'legendary', {
      thirdParty: true,
      wineType: 'wine'
    }),
    named('named-third-party-linux-prefix', 'linux', 'legendary', {
      thirdParty: true
    }),
    named('named-third-party-windows', 'windows', 'legendary', {
      thirdParty: true
    }),
    named('named-anticheat-status-only', 'linux', 'legendary', {
      anticheat: 'status'
    }),
    named('named-anticheat-empty-list', 'linux', 'legendary', {
      anticheat: 'empty-list'
    }),
    named('named-anticheat-status-and-anticheats', 'linux', 'legendary', {
      anticheat: 'both'
    }),
    named('named-anticheat-status-and-anticheats-gog', 'linux', 'gog', {
      anticheat: 'both'
    }),
    named('named-umu-downloaded', 'linux', 'gog', { umu: 'download' }),
    named('named-umu-download-skipped-offline-monitor', 'linux', 'gog', {
      umu: 'download',
      network: 'monitor-offline'
    })
  ]
  // The R8 expiry rule (49-03) moves into Rust with prepare_launch.
  const rule = (title: string, runner: Runner, spec: Partial<Spec>) =>
    out.push(
      named('', 'linux', runner, spec, `resolveEpicOfflineMode (R8) > ${title}`)
    )
  rule(
    'Test 1: an expired Epic store with a canRunOffline game launches offline',
    'legendary',
    { storeExpired: true, canRunOffline: true }
  )
  rule(
    'Test 2: a game that cannot run offline is left alone (the stderr modal stays the fallback)',
    'legendary',
    { storeExpired: true, canRunOffline: false }
  )
  rule('Test 3: a store that is not expired is left alone', 'legendary', {
    storeExpired: false,
    canRunOffline: true
  })
  rule(
    'Test 4: runner %p with an expired flag returns the input offlineMode unchanged',
    'gog',
    { storeExpired: true, canRunOffline: true }
  )
  rule(
    'Test 5: offlineMode=true is never turned off, for every combination',
    'legendary',
    { network: 'setting-offline', storeExpired: false, canRunOffline: false }
  )
  for (const runner of ['gog', 'nile', 'steam', 'sideload'] as const) {
    for (const network of ['online', 'setting-offline'] as const) {
      out.push(
        named(`expiry-test4-${runner}-${network}`, 'linux', runner, {
          storeExpired: true,
          canRunOffline: true,
          network
        })
      )
    }
  }
  for (const canRunOffline of [true, false]) {
    for (const storeExpired of [true, false]) {
      out.push(
        named(
          `expiry-test5-legendary-offline-${canRunOffline ? 'can' : 'cannot'}-${storeExpired ? 'expired' : 'valid'}`,
          'linux',
          'legendary',
          { network: 'setting-offline', canRunOffline, storeExpired }
        )
      )
    }
  }
  return out
}

function prepareCases(): PrepareCase[] {
  return [...pairwiseCases(), ...namedCases()]
}

/** The documented Rust-side differences (D-19); the file is built from this, never hand-edited. */
const DELTAS: Readonly<Record<string, string>> = {
  'discord-rpc-dropped':
    'The TS built a Discord presence client in prepareLaunch when the global discordRPC setting was on, and returned it as rpcClient. The operator decision of 2026-11-17 (the 82 amendment) deletes constructAndUpdateRPC in 88.1 and does not port it, so the Rust prepare step never builds a client and the reply carries no rpcClient. Every case here runs with discordRPC false, so no golden holds a client.'
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

const NEW_HELP = 'usage ... -F, --filter ...'
const OLD_HELP = 'usage ... -U, --fsr-upscaling'
const FLATPAK_RUNTIME = '23.08'
const GAMESCOPE_SITE = 'prepare_launch.gamescope_help'
const CROSSOVER_SITE = 'prepare_launch.crossover_bottle_folder'

const NODE_PLATFORM: Record<OraclePlatform, string> = {
  linux: 'linux',
  mac: 'darwin',
  windows: 'win32'
}

const settingOffline = (spec: Spec): boolean =>
  spec.network === 'setting-offline' || spec.network === 'both-offline'
const monitorOnline = (spec: Spec): boolean =>
  spec.network === 'online' || spec.network === 'setting-offline'

/** What the step reaches, derived from the case the way the TS control flow reads it (Linux tools section). */
function reach(c: PrepareCase) {
  const { spec } = c
  const linux = c.os === 'linux'
  const deck = spec.host === 'deck'
  const mangohudSearched = linux && spec.mangohud !== 'off' && !deck
  const mangohudBlocks = mangohudSearched && spec.mangohud === 'missing'
  const gamemodeSearched = linux && !mangohudBlocks && spec.gamemode !== 'off'
  const gamemodeBlocks = gamemodeSearched && spec.gamemode === 'missing'
  const gamescopeSearched =
    linux &&
    !mangohudBlocks &&
    !gamemodeBlocks &&
    spec.gamescope !== 'off' &&
    !deck
  const gamescopeFound =
    gamescopeSearched && !spec.gamescope.endsWith('-missing')
  const epic =
    c.runner === 'legendary' && !settingOffline(spec) && monitorOnline(spec)
  const crossover =
    c.os === 'mac' && spec.thirdParty && spec.wineType === 'crossover'
  return { gamescopeFound, epic, crossover }
}

function systemInfoFor(c: PrepareCase): SystemInformation {
  const deck = c.spec.host === 'deck'
  return {
    CPU: { model: 'Oracle CPU @ 3.00GHz', cores: 8 },
    memory: {
      used: 4 * 1024 ** 3,
      total: 16 * 1024 ** 3,
      usedFormatted: '4 GB',
      totalFormatted: '16 GB'
    },
    GPUs: [
      {
        deviceId: '0x1234',
        vendorId: '0x5678',
        subdeviceId: '0x0001',
        subvendorId: '0x0002',
        deviceString: 'Oracle GPU',
        vendorString: 'Oracle',
        driverVersion: '1.0'
      }
    ],
    OS: {
      platform: NODE_PLATFORM[c.os],
      name: 'Oracle OS',
      version: '1.0'
    },
    steamDeckInfo: deck
      ? { isDeck: true, model: 'LCD', mode: 'game' }
      : { isDeck: false },
    isFlatpak: c.spec.host === 'flatpak',
    isAppImage: false,
    softwareInUse: {
      heroicVersion: '0.0.0-oracle',
      legendaryVersion: '0.0.0',
      gogdlVersion: '0.0.0',
      cometVersion: '0.0.0',
      nileVersion: '0.0.0'
    }
  }
}

/** The settings a launch carries for this case, over a full GameSettings so the log filter has every key to drop. */
function settingsFor(
  c: PrepareCase,
  profile: EngineOracleProfile
): GameSettings {
  const { spec } = c
  const home = profile.home
  const proton = c.os === 'linux' && spec.umu !== 'not-proton'
  const wineVersion =
    c.os === 'mac'
      ? spec.wineType === 'crossover'
        ? {
            bin: join(home, 'crossover', 'bin', 'wine'),
            name: 'CrossOver 24',
            type: 'crossover' as const
          }
        : {
            bin: join(home, 'wine', 'bin', 'wine'),
            name: 'Wine Staging',
            type: 'wine' as const,
            wineserver: join(home, 'wine', 'bin', 'wineserver')
          }
      : proton
        ? {
            bin: join(home, 'proton', 'proton'),
            name: 'Proton-GE 9',
            type: 'proton' as const
          }
        : {
            bin: join(home, 'wine', 'bin', 'wine'),
            name: 'Wine-GE 8',
            type: 'wine' as const,
            wineserver: join(home, 'wine', 'bin', 'wineserver')
          }
  const gs = spec.gamescope
  const limiter = gs.startsWith('limiter')
  const upscaling = gs.startsWith('upscaling')
  return {
    autoInstallDxvk: true,
    autoInstallVkd3d: true,
    autoInstallDxvkNvapi: false,
    autoSyncSaves: false,
    battlEyeRuntime: false,
    DXVKFpsCap: '0',
    eacRuntime: false,
    enableDXVKFpsLimit: false,
    enableEsync: true,
    enableFSR: false,
    enableMsync: false,
    enableFsync: true,
    enableWineWayland: false,
    enableHDR: false,
    enableWoW64: false,
    gamescope: {
      enableUpscaling: upscaling,
      enableLimiter: limiter,
      enableForceGrabCursor: false,
      windowType: upscaling ? 'fullscreen' : '',
      gameWidth: upscaling ? '1280' : '',
      gameHeight: upscaling ? '720' : '',
      upscaleWidth: upscaling ? '1920' : '',
      upscaleHeight: upscaling ? '1080' : '',
      upscaleMethod: upscaling ? 'fsr' : '',
      fpsLimiter: limiter ? '60' : '',
      fpsLimiterNoFocus: limiter ? '15' : '',
      additionalOptions: ''
    },
    enviromentOptions: [],
    ignoreGameUpdates: false,
    language: '',
    launcherArgs: '',
    nvidiaPrime: false,
    offlineMode: settingOffline(spec),
    preferSystemLibs: false,
    showFps: false,
    showMangohud: spec.mangohud !== 'off',
    targetExe: '',
    useGameMode: spec.gamemode !== 'off',
    wineCrossoverBottle: c.os === 'mac' ? 'Bottle1' : '',
    winePrefix: join(home, 'Games', 'Prefix'),
    wineVersion,
    wrapperOptions: [],
    savesPath: '',
    beforeLaunchScriptPath: '',
    afterLaunchScriptPath: '',
    disableUMU: spec.umu === 'disabled',
    verboseLogs: true,
    advertiseAvxForRosetta: false,
    enableQuickSavesMenu: false
  }
}

function gameInfoFor(c: PrepareCase, profile: EngineOracleProfile): GameInfo {
  const dir = join(profile.home, 'Games', `Oracle-${c.runner}`)
  return {
    app_name: `app-${c.runner}`,
    runner: c.runner,
    title: `Oracle ${c.runner} Game`,
    art_cover: '',
    art_square: '',
    is_installed: true,
    canRunOffline: c.spec.canRunOffline,
    ...(c.spec.thirdParty ? { thirdPartyManagedApp: 'EA app' } : {}),
    ...(c.runner === 'sideload'
      ? { folder_name: dir, install: {} }
      : { install: { install_path: dir } }),
    ...(c.runner === 'legendary' ? { namespace: 'oracle-namespace' } : {})
  } as unknown as GameInfo
}

function anticheatReply(anticheat: Anticheat): unknown {
  if (anticheat === 'none') return null
  if (anticheat === 'status') return { status: 'Working' }
  if (anticheat === 'empty-list') return { status: 'Supported', anticheats: [] }
  return { status: 'Broken', anticheats: ['Easy Anti-Cheat', 'BattlEye'] }
}

function gamescopeHelp(spec: Spec): 'new' | 'old' | 'failed' | null {
  if (spec.gamescope === 'off' || spec.gamescope.endsWith('-missing')) {
    return null
  }
  return spec.gamescope.split('-')[1] as 'new' | 'old' | 'failed'
}

function epicExchangeCase(epic: Epic): string {
  if (epic === 'major') return 'epic-epic-games-store-status-major'
  if (epic === 'unreachable') return 'epic-epic-games-store-network-enotfound'
  return 'epic-epic-games-store-status-operational'
}

type Event =
  | { kind: 'backend-log'; level: string; prefix: string | null; text: string }
  | { kind: 'notification'; title?: string; body?: string }
  | { kind: 'online-monitor'; asked: number }
  | { kind: 'frontend'; via: string; channel: string; args: unknown[] }
  | { kind: 'hook'; runner: string; member: string; args: unknown[] }

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.join(' ') : String(message)

interface Recorded {
  input: unknown
  result: unknown
  log: unknown
  spawns: unknown[]
  requests: Record<string, unknown>[]
  events: Event[]
}

async function recordOnProfile(
  c: PrepareCase,
  profile: EngineOracleProfile
): Promise<Recorded> {
  const { spec } = c
  const events: Event[] = []
  const gameSettings = settingsFor(c, profile)
  const gameInfo = gameInfoFor(c, profile)
  const reached = reach(c)
  const gamescopeBin = '/usr/bin/gamescope'
  const executables: Record<string, string | null> = {
    mangohud: spec.mangohud === 'missing' ? null : '/usr/bin/mangohud',
    gamemoderun: spec.gamemode === 'missing' ? null : '/usr/bin/gamemoderun',
    gamescope: spec.gamescope.endsWith('-missing') ? null : gamescopeBin,
    'umu-run': spec.umu === 'on-path' ? '/usr/bin/umu-run' : null
  }
  const help = gamescopeHelp(spec)
  const bottleStderr =
    spec.bottle === 'reported'
      ? `cx: starting\nWINEPREFIX = "${join(profile.home, 'bottles', 'Bottle1')}"\ncx: done\n`
      : spec.bottle === 'unterminated'
        ? `cx: starting\nWINEPREFIX = "${join(profile.home, 'bottles', 'Bottle1')}"`
        : 'cx: starting\ncx: done\n'

  const scripted = [
    ...(reached.gamescopeFound
      ? [
          {
            program: gamescopeBin,
            argv: ['--help'],
            ...(help === 'failed'
              ? { code: null, stderr: NEW_HELP, timedOut: true }
              : { code: 0, stderr: help === 'old' ? OLD_HELP : NEW_HELP })
          }
        ]
      : []),
    ...(reached.crossover
      ? [
          {
            program: gameSettings.wineVersion.bin,
            argv: ['--bottle', 'Bottle1', '--verbose', 'whoami'],
            ...(spec.bottle === 'failed'
              ? { throws: 'spawn ENOENT' }
              : { code: 0, stderr: bottleStderr })
          }
        ]
      : [])
  ]
  const tracer = createSpawnTracer({
    baseEnv: profile.fake.env as Record<string, string>,
    scripted
  })
  const runOptions: {
    timeoutMs: number | null
    replaceEnv: boolean | null
    resolveOn: string | null
    timeoutNone: boolean
    windowsHide: boolean | null
  }[] = []
  const runner = {
    ...tracer.runner,
    run: (
      program: string,
      argv: readonly string[],
      opts?: Parameters<typeof tracer.runner.run>[2]
    ) => {
      runOptions.push({
        timeoutMs: opts?.timeoutMs ?? null,
        replaceEnv: opts?.replaceEnv ?? null,
        resolveOn: opts?.resolveOn ?? null,
        timeoutNone: opts?.timeout?.none === true,
        windowsHide: opts?.windowsHide ?? null
      })
      return tracer.runner.run(program, argv, opts)
    }
  }
  const logLine =
    (level: string) =>
    (message: unknown, prefix?: unknown): void => {
      events.push({
        kind: 'backend-log',
        level,
        prefix: typeof prefix === 'string' ? prefix : null,
        text: asText(message)
      })
    }
  const commandRunner = createCommandRunner({
    runner,
    platform: 'darwin',
    logger: {
      logInfo: logLine('info') as never,
      logWarning: logLine('warning') as never,
      logError: logLine('error') as never,
      logDebug: (() => undefined) as never,
      backendPrefix: 'Backend' as never
    },
    getRunnerLogWriter: () => {
      throw new Error('not used by runWineCommand')
    },
    abort: { create: () => new AbortController(), remove: () => undefined },
    errorHandler: () => undefined,
    searchForExecutableOnPath: () => Promise.resolve(null),
    commandToArgsArray: () => [],
    wine: {
      getDefaultSettings: () => {
        throw new Error('not used: the probe passes its own settings')
      },
      verifyWinePrefix: () =>
        Promise.reject(new Error('not used: the prefix check is skipped')),
      // The launcher's validWine is a shim over Rust (87-24); the probe only needs the check to pass.
      validWine: () => Promise.resolve(true),
      setupEnvVars,
      setupWineEnvVars: (s, gameId) =>
        setupWineEnvVars({ paths: profile.paths }, s, gameId),
      isUmuSupported: (s) => isUmuSupported({ paths: profile.paths }, s),
      getUmuPath: () => getUmuPath({ paths: profile.paths })
    }
  })

  const fake = createFakeLauncherDeps(profile, {
    online: monitorOnline(spec),
    rust: {
      [RUST_INFO_ANTICHEAT_INFO]: () => anticheatReply(spec.anticheat),
      [RUST_WINE_RUNTIME_IS_INSTALLED]: () => spec.umu === 'installed',
      [RUST_WINE_RUNTIME_DOWNLOAD]: () => true
    },
    games: { [`${c.runner}:${gameInfo.app_name}`]: { native: spec.native } },
    hooks: {
      'legendary.resolveOfflineMode': (input: {
        offlineMode: boolean
        runner: Runner
        canRunOffline: boolean
      }) =>
        resolveEpicOfflineMode({ ...input, storeExpired: spec.storeExpired })
    },
    overrides: {
      config: { getSettings: () => ({ discordRPC: false }) },
      infoCaches: {
        systemInfo: { getSystemInfo: () => Promise.resolve(systemInfoFor(c)) }
      },
      notifications: {
        show: (opts: { title?: string; body?: string }) => {
          events.push({
            kind: 'notification',
            title: opts.title,
            body: opts.body
          })
        }
      },
      runner,
      commandRunner
    } as never
  })
  // Only the legendary store has an expiry hook; the others have none, so the step never calls one for them.
  for (const other of RUNNERS) {
    if (other !== 'legendary') {
      fake.deps.launchHooks[other].resolveOfflineMode = undefined
    }
  }

  const input = {
    os: c.os,
    runner: c.runner,
    appName: gameInfo.app_name,
    gameSettings,
    gameInfo,
    globalSettings: { discordRPC: false },
    isNative: spec.native,
    storeExpired: spec.storeExpired,
    host: {
      steamDeckGameMode: spec.host === 'deck',
      flatpak: spec.host === 'flatpak',
      flatpakRuntimeVersion: spec.host === 'flatpak' ? FLATPAK_RUNTIME : ''
    },
    onlineMonitor: monitorOnline(spec),
    executables,
    gamescopeHelp:
      help === null
        ? null
        : help === 'failed'
          ? 'timeout'
          : help === 'old'
            ? OLD_HELP
            : NEW_HELP,
    umu: {
      installed: spec.umu === 'installed',
      downloadAnswer: true
    },
    anticheat: anticheatReply(spec.anticheat),
    epicStatusExchange: reached.epic ? epicExchangeCase(spec.epic) : null,
    crossoverBottle: reached.crossover
      ? spec.bottle === 'failed'
        ? { spawnError: 'spawn ENOENT' }
        : { stderr: bottleStderr }
      : null,
    systemInfo: systemInfoFor(c)
  }

  const spy = (
    level: 'info' | 'warning' | 'error',
    name: 'logInfo' | 'logWarning' | 'logError'
  ) => {
    const s = jest.spyOn(logger, name)
    s.mockImplementation(logLine(level) as never)
    return () => s.mockRestore()
  }
  const deck = spec.host === 'deck'
  const flatpak = spec.host === 'flatpak'
  const restores = [
    injectPlatform(c.os),
    injectProbe(environment, 'isSteamDeckGameMode', deck),
    injectProbe(environment, 'isSteamDeck', deck),
    injectProbe(environment, 'isFlatpak', flatpak),
    injectProbe(
      environment,
      'flatpakRuntimeVersion',
      flatpak ? FLATPAK_RUNTIME : ''
    ),
    injectExecutableOnPath(executables),
    spy('info', 'logInfo'),
    spy('warning', 'logWarning'),
    spy('error', 'logError')
  ]
  // Every case replays: the Epic status page where the step asks for it, an empty exchange list otherwise.
  const replay = replayAxiosClient({
    crate: CRATE,
    slice: EPIC_SLICE,
    caseId: reached.epic ? epicExchangeCase(spec.epic) : '__no-request__',
    mode: mode === 'write' ? 'write' : 'compare',
    transportFailureCode:
      reached.epic && spec.epic === 'unreachable' ? 'ENOTFOUND' : null
  })
  const writer = recordingLogWriter()
  let reply: unknown
  try {
    reply = await withInjected(restores, async () => {
      try {
        return await createLauncher(fake.deps).prepareLaunch(
          gameSettings,
          writer.writer,
          gameInfo
        )
      } catch (error) {
        return { threw: (error as Error).message }
      }
    })
    await replay.recorder.finish()
  } finally {
    replay.restore()
  }
  const log = await writer.entries()
  tracer.expectAllConsumed()

  const spawns = attachSpawnClass(
    tracer.records.map((record, i) => ({
      callSite:
        record.program === gamescopeBin ? GAMESCOPE_SITE : CROSSOVER_SITE,
      program: record.program,
      argv: record.argv,
      ...runOptions[i],
      envDiff: record.envDiff,
      cwd: record.cwd,
      result: record.result
    })),
    loadClasses(CRATE)
  )

  events.push({ kind: 'online-monitor', asked: fake.onlineAsked() })
  for (const sent of fake.frontend) {
    events.push({
      kind: 'frontend',
      via: sent.kind,
      channel: sent.channel,
      args: sent.args
    })
  }
  for (const hook of fake.hooks) {
    events.push({ kind: 'hook', ...hook })
  }
  const requests: Record<string, unknown>[] = [
    ...replay.recorder.requested.map((line) => {
      const [method, url] = line.split(' ')
      return { kind: 'http', method, url }
    }),
    ...fake.requests.map((request) => ({ kind: 'rust', ...request }))
  ]

  const clean = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value === undefined ? null : value)) as T
  return {
    input: clean(input),
    result: clean(reply),
    log: clean(log),
    spawns: clean(spawns),
    requests: clean(requests),
    events: clean(events)
  }
}

async function recordCase(c: PrepareCase): Promise<Recorded> {
  if (mode === 'record') {
    throw new Error(
      'prepare_launch replays the epic_status exchanges only; GAMELIB_EW_ORACLE=record is not supported'
    )
  }
  return withEngineOracleProfile(async (profile) =>
    normalisePaths(
      await withPinnedBaseEnv(profile.fake, () => recordOnProfile(c, profile)),
      profile
    )
  )
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** The sidecar's i18next init, as `sidecar/bootstrap.ts` does it (locale en). */
async function initSidecarI18next(): Promise<void> {
  // The default instance, because that is the one `utils.ts` calls.
  // eslint-disable-next-line import-x/no-named-as-default-member
  await i18next.use(Backend).init({
    initImmediate: false,
    backend: {
      allowMultiLoading: false,
      loadPath: (lng: string, namespace: string) =>
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'public',
          'locales',
          ...localeFileSegments(lng, namespace)
        )
    },
    debug: false,
    returnEmptyString: false,
    returnNull: false,
    fallbackLng: 'en',
    ...i18nextLanguageOptions('en'),
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation'
  })
}

/** A committed golden file of one case, parsed. */
function committed(id: string, file: string): unknown {
  return JSON.parse(
    readFileSync(join(goldenDir(CRATE, SLICE), 'expected', id, file), 'utf8')
  )
}

describeSkipOnWindows('prepare_launch oracle (88.1-02)', () => {
  const built = prepareCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<PrepareCase>(CRATE, SLICE)
  const byId = (id: string): PrepareCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }

  beforeAll(initSidecarI18next)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly what the delta table produces', () => {
    expect(
      JSON.parse(
        readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
      )
    ).toEqual(DELTAS)
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events,
      requests: recorded.requests,
      spawns: recorded.spawns,
      extra: { 'input.json': recorded.input, 'log.json': recorded.log }
    })
  })

  describe('the pairwise matrix (D-14)', () => {
    for (const os of OSES) {
      for (const runner of RUNNERS) {
        const suites: Suite[] =
          os === 'linux' ? ['identity', 'tools'] : ['identity']
        for (const suite of suites) {
          it(`${os} ${runner} ${suite}: every legal pair is covered and every axis value appears`, () => {
            const rows = cases.flatMap((c) =>
              c.os === os && c.runner === runner && c.suite === suite && c.axes
                ? [c.axes]
                : []
            )
            const axes = axesFor(os, runner, suite)
            const feasible = feasibleFor(os, runner, suite)
            expect(rows.length).toBeGreaterThan(0)
            expect(uncoveredPairs(axes, rows, feasible)).toEqual([])
            for (const [axis, values] of Object.entries(axes)) {
              const seen = new Set(rows.map((row) => row[axis]))
              expect(
                values.filter((value) => !seen.has(value)).map(String)
              ).toEqual(
                // A value the feasibility rule never allows with another is still in some row; none is missing.
                []
              )
            }
          })
        }
      }
    }
  })

  describe('what the step answers', () => {
    it('a missing mangohud ends the step with the reason, and the Flatpak host adds the install hint', async () => {
      const plain = await recordCase(byId('named-mangohud-missing-plain-host'))
      const flatpak = await recordCase(
        byId('named-mangohud-missing-on-flatpak')
      )
      expect(plain.result).toEqual({
        success: false,
        failureReason:
          'Mangohud is enabled, but `mangohud` executable could not be found on $PATH'
      })
      expect(flatpak.result).toEqual({
        success: false,
        failureReason: `Mangohud is enabled, but \`mangohud\` executable could not be found on $PATH. Make sure to install Mangohud's flatpak package with runtime ${FLATPAK_RUNTIME} and restart GameLib.`
      })
    })

    it('a missing gamemoderun ends the step; a missing gamescope only warns and the step succeeds', async () => {
      const gamemode = await recordCase(byId('named-gamemode-missing'))
      expect(gamemode.result).toEqual({
        success: false,
        failureReason:
          'GameMode is enabled, but `gamemoderun` executable could not be found on $PATH'
      })
      const gamescope = await recordCase(
        byId('named-gamescope-missing-on-flatpak')
      )
      expect(gamescope.result).toMatchObject({
        success: true,
        gameScopeCommand: []
      })
      expect(
        gamescope.events.filter(
          (e) => e.kind === 'backend-log' && e.level === 'warning'
        )
      ).toEqual([
        {
          kind: 'backend-log',
          level: 'warning',
          prefix: null,
          text: `Gamescope is enabled, but \`gamescope\` executable could not be found on $PATH. Make sure to install Gamescope's flatpak package with runtime ${FLATPAK_RUNTIME}`
        }
      ])
    })

    it('Steam Deck game mode skips mangohud and gamescope without searching for them', async () => {
      const deck = await recordCase(
        byId('named-gamescope-skipped-on-steam-deck-game-mode')
      )
      expect(deck.result).toMatchObject({
        success: true,
        mangoHudCommand: [],
        gameScopeCommand: []
      })
      expect(deck.spawns).toEqual([])
    })

    it('an expired Epic store goes offline for a game that can run offline, and nothing turns offline mode off', async () => {
      const results = async (id: string) =>
        (await recordCase(byId(id))).result as { offlineMode?: boolean }
      const expired = `${STEM}--${slug('resolveEpicOfflineMode (R8) > Test 1: an expired Epic store with a canRunOffline game launches offline')}`
      const cannot = `${STEM}--${slug('resolveEpicOfflineMode (R8) > Test 2: a game that cannot run offline is left alone (the stderr modal stays the fallback)')}`
      const valid = `${STEM}--${slug('resolveEpicOfflineMode (R8) > Test 3: a store that is not expired is left alone')}`
      expect((await results(expired)).offlineMode).toBe(true)
      expect((await results(cannot)).offlineMode).toBe(false)
      expect((await results(valid)).offlineMode).toBe(false)
      for (const canRunOffline of ['can', 'cannot']) {
        for (const expiry of ['expired', 'valid']) {
          expect(
            (
              await results(
                `expiry-test5-legendary-offline-${canRunOffline}-${expiry}`
              )
            ).offlineMode
          ).toBe(true)
        }
      }
      for (const runner of ['gog', 'nile', 'steam', 'sideload']) {
        expect(
          (await results(`expiry-test4-${runner}-online`)).offlineMode
        ).toBe(false)
        expect(
          (await results(`expiry-test4-${runner}-setting-offline`)).offlineMode
        ).toBe(true)
      }
    })

    it('umu downloads once when it is wanted, online, not installed and not on PATH, and not when the monitor is down', async () => {
      const download = await recordCase(byId('named-umu-downloaded'))
      const channels = (
        download.requests as { kind: string; channel?: string }[]
      )
        .filter((r) => r.kind === 'rust')
        .map((r) => r.channel)
      expect(channels).toEqual([
        RUST_INFO_ANTICHEAT_INFO,
        RUST_WINE_RUNTIME_IS_INSTALLED,
        RUST_WINE_RUNTIME_DOWNLOAD
      ])
      const offline = await recordCase(
        byId('named-umu-download-skipped-offline-monitor')
      )
      expect(
        (offline.requests as { kind: string; channel?: string }[])
          .filter((r) => r.kind === 'rust')
          .map((r) => r.channel)
      ).toEqual([RUST_INFO_ANTICHEAT_INFO])
    })

    it('the third-party CrossOver probe logs the bottle folder it reports, and nothing when it reports none or fails', async () => {
      const logged = async (id: string) =>
        JSON.stringify((await recordCase(byId(id))).log)
      expect(
        await logged('named-third-party-mac-crossover-bottle-reported')
      ).toContain('<HOME>/bottles/Bottle1')
      expect(
        await logged('named-third-party-mac-crossover-no-bottle-folder')
      ).not.toContain('Installed in:')
      expect(
        await logged('named-third-party-mac-crossover-probe-fails')
      ).not.toContain('Installed in:')
      expect(
        await logged('named-third-party-mac-crossover-bottle-line-unterminated')
      ).not.toContain('Installed in:')
    })

    it('anti-cheat status alone, and status with anticheats, reach the log as the TS wrote them', async () => {
      const statusOnly = JSON.stringify(
        (await recordCase(byId('named-anticheat-status-only'))).log
      )
      const both = JSON.stringify(
        (await recordCase(byId('named-anticheat-status-and-anticheats'))).log
      )
      expect(statusOnly).toContain('Anticheat Status: Working')
      expect(statusOnly).not.toContain('Anticheats:')
      expect(both).toContain('Anticheat Status: Broken')
      expect(both).toContain('Anticheats: Easy Anti-Cheat,BattlEye')
      // An empty list is truthy, so a game with no anti-cheat still logs an empty "Anticheats:" line.
      const empty = JSON.stringify(
        (await recordCase(byId('named-anticheat-empty-list'))).log
      )
      expect(empty).toContain('Anticheat Status: Supported')
      expect(empty).toContain('Anticheats: \\n\\n')
    })

    it('every committed input carries discordRPC false and no reply carries a Discord client', () => {
      for (const c of cases) {
        const input = committed(c.id, 'input.json') as {
          globalSettings: { discordRPC: boolean }
        }
        expect({ id: c.id, discord: input.globalSettings.discordRPC }).toEqual({
          id: c.id,
          discord: false
        })
        expect(committed(c.id, 'result.json')).not.toHaveProperty('rpcClient')
      }
    })

    it('a Linux case records the gamescope help spawn and a Mac case the CrossOver bottle-folder spawn, both as helpers', () => {
      const spawnsOf = (c: PrepareCase) =>
        committed(c.id, 'spawns.json') as { callSite: string; class: string }[]
      const sites = (os: OraclePlatform) =>
        cases.filter((c) => c.os === os).flatMap((c) => spawnsOf(c))
      expect(sites('linux').map((s) => s.callSite)).toContain(GAMESCOPE_SITE)
      expect(sites('mac').map((s) => s.callSite)).toContain(CROSSOVER_SITE)
      for (const spawn of [...sites('linux'), ...sites('mac')]) {
        expect(spawn.class).toBe('helper')
      }
      expect(sites('windows')).toEqual([])
    })

    it('no case reaches the network: only the scripted Epic status request is ever made', () => {
      for (const c of cases) {
        const requests = committed(c.id, 'requests.json') as {
          kind: string
          url?: string
        }[]
        for (const request of requests.filter((r) => r.kind === 'http')) {
          expect(request.url).toBe(
            'https://status.epicgames.com/api/v2/components.json'
          )
        }
      }
    })
  })

  describe('incident census (D-14)', () => {
    it('every title of epicOfflineMode.test.ts is a named case or a reasoned source-text gate', () => {
      const titles = tsTestTitles(
        join(
          __dirname,
          '..',
          '..',
          'storeManagers',
          'legendary',
          '__tests__',
          `${STEM}.test.ts`
        )
      )
      const ids = cases
        .filter((c) => c.id.startsWith(`${STEM}--`))
        .map((c) => c.id.slice(STEM.length + 2))
      const notPorted = Object.fromEntries(
        GATE_TITLES.map((title) => [title, SOURCE_TEXT_GATE_REASON])
      )
      assertCasesCoverTitles(ids, titles, notPorted)
      // No case without a title either: a typo in a case title would pass the line above only by luck.
      expect([...ids].sort()).toEqual(
        titles
          .filter((t) => !(GATE_TITLES as readonly string[]).includes(t))
          .map(slug)
          .sort()
      )
      expect(titles).toHaveLength(8)
    })
  })

  it('the golden folders hold the six files of the contract', () => {
    for (const c of cases.slice(0, 5)) {
      for (const file of [
        'input.json',
        'result.json',
        'log.json',
        'spawns.json',
        'requests.json',
        'events.json'
      ]) {
        expect({
          id: c.id,
          file,
          exists: existsSync(
            join(goldenDir(CRATE, SLICE), 'expected', c.id, file)
          )
        }).toEqual({ id: c.id, file, exists: true })
      }
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, PREPARE_FLOOR)
    assertManifest(CRATE, SLICE, cases, PREPARE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, PREPARE_FLOOR)
  })
})
