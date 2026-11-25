/**
 * The prepare_wine oracle (88.1-03, D-11, D-12, D-13, D-14, D-22, D-25): `launcher.prepareWineLaunch(game,
 * logWriter, opts)`, the wine half of the prepare step, driven through the real TS `Launcher` on a fresh fake
 * HOME and recorded as the golden the Rust `gamelib-launch` prepare_wine ops have to reproduce. The golden exists
 * before any Rust prepare_wine code does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/prepare_wine/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/input.json    what the case started from and what every collaborator was scripted to answer:
 *                                 the game info, the stored settings, the options, the seeded fix files and
 *                                 installed_games, the rust replies (by channel, in call order), the hook answers,
 *                                 the scripted spawn results and the fake HOME's starting layout (D-11)
 *   expected/<case>/result.json   the reply (`{ success, failureReason?, envVars?, knownFixEnv? }`)
 *   expected/<case>/begin.json    the ordered trace up to the store-setup point, ending with `prefixUpdated`
 *   expected/<case>/finish.json   the ordered trace from the store-setup point to the end
 *   expected/<case>/tree.json     `snapshotTree` of the prefix, bottle, engine and install folders afterwards
 *
 * One ordered trace per case (D-25), every entry stamped with a global sequence number `seq`, in call order:
 *   spawn         program, argv, the FULL env (the tracer's base is empty, so `envDiff.set` is the whole env), cwd,
 *                 the run options, the result, the call site and its spawn class (`golden/classes.json`)
 *   rust          one `requestRustInvoke`: channel, args and the scripted reply (or its rejection)
 *   frontend      a renderer push or a backend-event emit (the `gameStatusUpdate` winetricks and redist statuses,
 *                 the CrossOver-bottle dialog)
 *   hook          a `launchHooks[runner]` call (the `logWriter` argument is written `<logWriter>`)
 *   log           a per-game log entry as `{ level, parts }`
 *   backend-log   a backend log line
 *   app-state, notification, dialog, online-monitor   the other collaborators
 *
 * The split (D-26, D-30). The interim Rust adapter runs the TS store-setup hook between two Rust steps, so each
 * trace is cut where that hook sits: immediately before the `launchHooks[runner].prepareLaunch` call when the
 * prefix was updated (a runner with no such hook is cut right after the "Created/Updated Wineprefix" line, where
 * the call would be), else immediately before the first `RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY` request. `begin.json`
 * ends with `prefixUpdated`. A case that returns before the store-setup point (no valid wine, a missing CrossOver
 * bottle) has its whole trace in `begin.json`, `split` is `none` and `finish.json` holds an empty trace.
 *
 * Pairwise rows (D-14). Each feasible (OS, wine type) cell is covered by three suites that share the axes they
 * interact on (the product of all axes does not fit one generator run): `flow` (the early exits, the prefix and the
 * installed_games file), `fixes` (tier-1 and tier-2 fixes, the DXVK family, the engine overlay, the deadline arm)
 * and `runtimes` (the GOG comet dummy, the EAC and BattlEye runtimes against the online monitor). Each suite asserts
 * `uncoveredPairs` is empty over its own axes and that every axis value appears at least once. A pair that straddles
 * two suites (a fix against a runtime) is not enumerated: the step reads them in different stages and shares no
 * state between them. "No prefix folder" is the `prefix` value `absent`. The wine-prefix creation a real `wineboot`
 * does is a scripted side effect of the traced spawn.
 *
 * Flagged assumption (spec-less edge probe): the edge-coverage row of SVC-03 is unclassified and unresolved; this
 * matrix stands in for edge coverage and is not claimed as a verified edge.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22, T-88.1-05, T-88.1-06): every case runs on a fresh fake HOME inside
 * `withPinnedBaseEnv` (eleven env keys), with an injected platform, Steam Deck and Flatpak probes and PATH lookups.
 * The wine commands run through the real `createCommandRunner` over `createSpawnTracer`, so no wine binary is
 * executed: an unscripted spawn fails by name. Behaviour that looks wrong is kept as recorded and filed as a todo
 * (D-20); a fix is never mixed into a golden diff.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import { fix, type Layer } from 'backend/__tests__/oracle/knownFixReader.cases'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  syncManifest,
  withEngineOracleProfile,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
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
  setupWineEnvVars,
  verifyWinePrefix
} from 'backend/launcher'
import { validWine } from 'backend/enginewine/wineCore'
import { getUmuPath, isUmuSupported } from 'backend/utils/compatibility_layers'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'
import {
  RUST_ENGINE_LAUNCH_ARM_DEADLINE,
  RUST_ENGINE_LAUNCH_SETTINGS_GET,
  RUST_ENGINE_RESOLVE_TOOL_SETTINGS,
  RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY,
  RUST_KNOWNFIX_PROFILE_OVERLAY_ENV,
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
  RUST_WINE_RUNTIME_DOWNLOAD,
  RUST_WINE_RUNTIME_IS_INSTALLED,
  RUST_WINE_VALID,
  RUST_WINE_WINETRICKS_INSTALL,
  RUST_WINE_WINETRICKS_LIST_INSTALLED
} from 'common/types/sidecarTransport'
import type { Game } from 'common/types/game_manager'
import type {
  GameInfo,
  GameSettings,
  Runner,
  WineInstallation
} from 'common/types'

// The backend jest project shadows i18next with a key-echoing mock; the CrossOver dialog copy needs the real one.
jest.unmock('i18next')

const CRATE = 'gamelib-launch'
const SLICE = 'prepare_wine'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const PREPARE_WINE_FLOOR = 391

const mode = engineWineOracleMode()

// ---------------------------------------------------------------------------------------------
// The axes
// ---------------------------------------------------------------------------------------------

type Cell =
  | 'linux-wine'
  | 'linux-proton-umu'
  | 'linux-proton-noumu'
  | 'mac-crossover'
  | 'mac-toolkit'
  | 'mac-wine'
type WineType = 'wine' | 'proton' | 'crossover' | 'toolkit'

const CELLS: Record<
  Cell,
  { os: OraclePlatform; type: WineType; umu: boolean }
> = {
  'linux-wine': { os: 'linux', type: 'wine', umu: false },
  'linux-proton-umu': { os: 'linux', type: 'proton', umu: true },
  'linux-proton-noumu': { os: 'linux', type: 'proton', umu: false },
  'mac-crossover': { os: 'mac', type: 'crossover', umu: false },
  'mac-toolkit': { os: 'mac', type: 'toolkit', umu: false },
  'mac-wine': { os: 'mac', type: 'wine', umu: false }
}
const CELL_IDS = Object.keys(CELLS) as Cell[]

type Valid = 'valid' | 'invalid'
type Prefix = 'absent' | 'partial' | 'complete'
type Installed = 'absent' | 'without-game' | 'with-game'
type Offline = 'off-can' | 'off-cannot' | 'on-can' | 'on-cannot'
type Tier1 = 'none' | 'winetricks' | 'runInPrefix' | 'envVariables'
type Tier2 = 'none' | 'registry' | 'overlay' | 'both'
type Dummy = 'absent' | 'present' | 'empty-winepath'
type Runtime = 'off' | 'installed' | 'missing'
type Whoami = 'reported' | 'no-prefix-line' | 'fails'
type Reply = 'ok' | 'rejects'

/** Everything one case varies. A suite fills the axes it covers; the rest hold their default. */
interface Spec {
  runner: Runner
  gameWine: Valid
  defaultWine: Valid
  bottle: 'present' | 'missing'
  prefix: Prefix
  installed: Installed
  offline: Offline
  engine: 'none' | 'overlay'
  eosOverlay: 'enabled' | 'disabled' | 'n/a'
  tier1: Tier1
  tier2: Tier2
  mergesTier1Env: boolean
  deadline: Reply
  dxvk: boolean
  nvapi: boolean
  vkd3d: boolean
  comet: 'default' | 'off'
  dummy: Dummy
  online: boolean
  eac: Runtime
  battleye: Runtime
  whoami: Whoami
  registry: Reply
  overlay: Reply
  remoteTier2: boolean
}

const DEFAULT_SPEC: Spec = {
  runner: 'nile',
  gameWine: 'valid',
  defaultWine: 'valid',
  bottle: 'present',
  prefix: 'complete',
  installed: 'absent',
  offline: 'off-can',
  engine: 'none',
  eosOverlay: 'n/a',
  tier1: 'none',
  tier2: 'none',
  mergesTier1Env: true,
  deadline: 'ok',
  dxvk: true,
  nvapi: false,
  vkd3d: true,
  comet: 'default',
  dummy: 'present',
  online: true,
  eac: 'off',
  battleye: 'off',
  whoami: 'reported',
  registry: 'ok',
  overlay: 'ok',
  remoteTier2: false
}

const RUNNERS: Runner[] = ['legendary', 'gog', 'nile', 'sideload']

type Suite = 'flow' | 'fixes' | 'runtimes'
const SUITES: Suite[] = ['flow', 'fixes', 'runtimes']

const isLinuxCell = (cell: Cell): boolean => CELLS[cell].os === 'linux'

function axesFor(cell: Cell, suite: Suite): Axes {
  const { type } = CELLS[cell]
  const crossover = type === 'crossover'
  const axes: Record<string, (string | boolean)[]> = {}
  if (suite === 'flow') {
    axes.runner = RUNNERS
    axes.gameWine = ['valid', 'invalid']
    axes.defaultWine = ['valid', 'invalid']
    if (crossover) axes.bottle = ['present', 'missing']
    axes.prefix = crossover
      ? ['absent', 'complete']
      : ['absent', 'partial', 'complete']
    axes.installed = ['absent', 'without-game', 'with-game']
    axes.offline = ['off-can', 'off-cannot', 'on-can', 'on-cannot']
    axes.engine = ['none', 'overlay']
    if (isLinuxCell(cell)) axes.eosOverlay = ['enabled', 'disabled', 'n/a']
  } else if (suite === 'fixes') {
    axes.tier1 = ['none', 'winetricks', 'runInPrefix', 'envVariables']
    axes.tier2 = ['none', 'registry', 'overlay', 'both']
    axes.installed = ['absent', 'with-game']
    axes.mergesTier1Env = [true, false]
    axes.deadline = ['ok', 'rejects']
    axes.engine = ['none', 'overlay']
    if (type === 'wine') axes.dxvk = [true, false]
    if (cell === 'linux-wine') {
      axes.nvapi = [true, false]
      axes.vkd3d = [true, false]
    }
  } else {
    axes.runner = RUNNERS
    axes.comet = ['default', 'off']
    axes.dummy = ['absent', 'present', 'empty-winepath']
    axes.online = [true, false]
    axes.eac = ['off', 'installed', 'missing']
    axes.battleye = ['off', 'installed', 'missing']
    axes.prefix = crossover ? ['absent', 'complete'] : ['partial', 'complete']
  }
  return axes
}

/**
 * Rows the step makes the same as another row are not generated: an axis the step never reaches takes its
 * default (everything after the early exit of two invalid wines or a missing CrossOver bottle, the default wine
 * when the game's own is valid, the prefix files when no wine runs, the dummy of a runner that is not GOG, the
 * EOS overlay of anything but legendary on Linux).
 */
function feasibleFor(cell: Cell, suite: Suite): (row: Row) => boolean {
  const linux = isLinuxCell(cell)
  const isDefault = (row: Row, keys: (keyof Spec)[]): boolean =>
    keys.every(
      (key) => row[key] === undefined || row[key] === DEFAULT_SPEC[key]
    )
  if (suite === 'flow') {
    return (row) => {
      const early = row.gameWine === 'invalid' && row.defaultWine === 'invalid'
      if (early) {
        return (
          row.engine === 'none' &&
          row.prefix === 'complete' &&
          row.installed === 'absent' &&
          row.offline === 'off-can' &&
          (row.eosOverlay === undefined || row.eosOverlay === 'n/a') &&
          (row.bottle === undefined || row.bottle === 'present')
        )
      }
      if (row.gameWine === 'valid' && row.defaultWine === 'invalid') {
        return false
      }
      // The engine's wine is always valid, so the stored wine's validity is not asked about.
      if (row.engine === 'overlay' && row.gameWine === 'invalid') return false
      if (row.gameWine === 'invalid' && row.prefix === 'partial') return false
      if (row.prefix === 'absent' && row.installed !== 'absent') return false
      if (row.bottle === 'missing') {
        if (
          !isDefault(row, ['prefix', 'installed', 'offline']) ||
          (row.eosOverlay !== undefined && row.eosOverlay !== 'n/a')
        ) {
          return false
        }
      }
      if (linux) {
        const legendary = row.runner === 'legendary'
        if (legendary !== (row.eosOverlay !== 'n/a')) return false
      }
      return true
    }
  }
  if (suite === 'fixes') {
    return () => true
  }
  return (row) => {
    if (row.runner !== 'gog') {
      return row.comet === 'default' && row.dummy === 'present'
    }
    // Comet off never reaches the dummy.
    if (row.comet === 'off' && row.dummy !== 'present') return false
    return true
  }
}

interface WineCase {
  id: string
  cell: Cell
  /** The pairwise suite a generated case belongs to. */
  suite?: Suite
  /** The pairwise row a generated case stands for. */
  axes?: Row
  /** What a named case is about, in a sentence. */
  about?: string
  spec: Spec
}

const pad = (n: number): string => String(n).padStart(3, '0')

function pairwiseCases(): WineCase[] {
  const cases: WineCase[] = []
  for (const cell of CELL_IDS) {
    let n = 0
    for (const suite of SUITES) {
      const rows = allPairs(axesFor(cell, suite), feasibleFor(cell, suite))
      for (const row of rows) {
        n += 1
        cases.push({
          id: `${cell}-${pad(n)}`,
          cell,
          suite,
          axes: row,
          spec: { ...DEFAULT_SPEC, ...(row as Partial<Spec>) }
        })
      }
    }
  }
  return cases
}

function namedCases(): WineCase[] {
  const named = (
    id: string,
    cell: Cell,
    about: string,
    spec: Partial<Spec>
  ): WineCase => ({
    id: `named-${id}`,
    cell,
    about,
    spec: { ...DEFAULT_SPEC, ...spec }
  })
  return [
    // The tracer: a Linux wine launch that creates installed_games and has a tier-1 winetricks fix.
    named(
      'tracer-linux-wine-winetricks-fix',
      'linux-wine',
      'a Linux wine launch that writes installed_games and installs a tier-1 winetricks fix, split at the store-setup hook',
      { runner: 'gog', tier1: 'winetricks' }
    ),
    // The early exits.
    named(
      'game-wine-invalid-default-valid',
      'linux-wine',
      "the game's wine is invalid and the default wine is valid: the step goes on with the game's settings",
      { gameWine: 'invalid' }
    ),
    named(
      'both-wines-invalid',
      'linux-wine',
      'both wines are invalid: an early { success: false } and no further trace',
      { gameWine: 'invalid', defaultWine: 'invalid' }
    ),
    named(
      'crossover-bottle-missing',
      'mac-crossover',
      'the CrossOver bottle does not exist: the dialog event and the failure reason',
      { bottle: 'missing' }
    ),
    named(
      'crossover-whoami-without-prefix-line',
      'mac-crossover',
      'whoami reports no WINEPREFIX line: no installed_games write, no store setup',
      { whoami: 'no-prefix-line' }
    ),
    named(
      'crossover-whoami-spawn-fails',
      'mac-crossover',
      'the whoami probe cannot be spawned: no installed_games write',
      { whoami: 'fails' }
    ),
    // installed_games.
    named(
      'installed-games-lists-the-game',
      'linux-wine',
      'installed_games already lists the game: no store setup hook and no installFixes, tier-1 fix or not',
      { installed: 'with-game', tier1: 'winetricks' }
    ),
    named(
      'installed-games-without-the-game',
      'linux-wine',
      'installed_games lists another game: the game is appended and the prefix counts as updated',
      { installed: 'without-game' }
    ),
    named(
      'prefix-folder-absent',
      'linux-wine',
      'no prefix folder: wineboot creates it and installed_games is written',
      { prefix: 'absent' }
    ),
    named(
      'prefix-folder-absent-umu',
      'linux-proton-umu',
      'no prefix folder under umu: createprefix creates it',
      { prefix: 'absent' }
    ),
    named(
      'prefix-partial-waits-on-wineserver',
      'linux-wine',
      'a prefix with no system.reg waits on wineserver after wineboot',
      { prefix: 'partial' }
    ),
    // Tier-1 and tier-2 fixes.
    named(
      'tier1-run-in-prefix',
      'linux-wine',
      'a tier-1 runInPrefix fix runs each program through the game wine command and sends the redist status',
      { runner: 'nile', tier1: 'runInPrefix' }
    ),
    named(
      'tier1-env-variables',
      'linux-wine',
      'a tier-1 envVariables fix reaches the overlay request as strings and the knownFixEnv log line',
      { tier1: 'envVariables' }
    ),
    named(
      'tier1-env-variables-not-merged-sideload',
      'linux-wine',
      'a sideload launch does not merge tier-1 envVariables (mergesTier1Env false)',
      { runner: 'sideload', tier1: 'envVariables', mergesTier1Env: false }
    ),
    named(
      'remote-layer-carries-tier2-keys',
      'linux-wine',
      'a remote-layer file with tier-2 keys: no registry or overlay effect, the tier-1 env of the overlay request is empty',
      { remoteTier2: true }
    ),
    named(
      'tier2-registry-and-overlay',
      'linux-wine',
      'a local tier-2 profile with registry and overlays: the overlay env joins the returned env and the log',
      { tier2: 'both', tier1: 'envVariables' }
    ),
    named(
      'registry-reply-rejects',
      'linux-wine',
      'the registry reply rejects: the settle warning and the launch goes on',
      { tier2: 'registry', registry: 'rejects' }
    ),
    named(
      'overlay-reply-rejects',
      'linux-wine',
      'the overlay reply rejects: the settle warning, an empty overlay env, the launch goes on',
      { tier2: 'overlay', overlay: 'rejects' }
    ),
    named(
      'registry-and-overlay-replies-reject',
      'linux-wine',
      'both tier-2 replies reject: two settle warnings and the launch goes on',
      { tier2: 'both', registry: 'rejects', overlay: 'rejects' }
    ),
    // The GOG dummy.
    named(
      'gog-dummy-installed-and-service-created',
      'linux-wine',
      'GOG, comet on, the dummy is not in the prefix: it is copied and its service created',
      { runner: 'gog', dummy: 'absent' }
    ),
    named(
      'gog-dummy-already-present',
      'linux-wine',
      'GOG, comet on, the dummy is already in the prefix: winepath only',
      { runner: 'gog', dummy: 'present' }
    ),
    named(
      'gog-dummy-winepath-empty',
      'linux-wine',
      "the dummy's winepath answers '': the backend error line, the copy fails and is logged, the launch goes on",
      { runner: 'gog', dummy: 'empty-winepath' }
    ),
    named(
      'gog-comet-support-off',
      'linux-wine',
      'GOG with experimentalFeatures.cometSupport false: no dummy step',
      { runner: 'gog', comet: 'off', dummy: 'absent' }
    ),
    named(
      'gog-dummy-on-crossover',
      'mac-crossover',
      'GOG on a CrossOver bottle: winepath and the service creation run in the bottle',
      { runner: 'gog', dummy: 'absent' }
    ),
    // DXVK and the runtimes.
    named(
      'dxvk-family-on-linux-wine',
      'linux-wine',
      'DXVK, DXVK-NVAPI and vkd3d are all installed on a Linux wine',
      { dxvk: true, nvapi: true, vkd3d: true }
    ),
    named(
      'dxvk-not-installed-on-proton',
      'linux-proton-umu',
      'DXVK, DXVK-NVAPI and vkd3d are on but a proton prefix installs none of them',
      { dxvk: true, nvapi: true, vkd3d: true }
    ),
    named(
      'dxvk-only-on-mac-wine',
      'mac-wine',
      'on macOS only DXVK is installed; DXVK-NVAPI and vkd3d are Linux-only',
      { dxvk: true, nvapi: true, vkd3d: true }
    ),
    named(
      'dxvk-not-installed-on-crossover',
      'mac-crossover',
      'CrossOver installs no DXVK',
      { dxvk: true, nvapi: true, vkd3d: true }
    ),
    named(
      'eac-offline-no-download',
      'linux-wine',
      'the EAC runtime is wanted but the monitor is offline: it is not even looked up',
      { eac: 'missing', battleye: 'missing', online: false }
    ),
    named(
      'eac-and-battleye-downloaded',
      'linux-wine',
      'both runtimes are wanted, online and not installed: each is downloaded',
      { eac: 'missing', battleye: 'missing', online: true }
    ),
    named(
      'eac-installed-no-download',
      'linux-wine',
      'both runtimes are wanted, online and installed: nothing is downloaded',
      { eac: 'installed', battleye: 'installed', online: true }
    ),
    // The remaining collaborators.
    named(
      'offline-setting-game-cannot-run-offline',
      'linux-wine',
      "offline mode is on and the game does not support it: the warning goes to the game's log",
      { offline: 'on-cannot' }
    ),
    named(
      'eos-overlay-enabled-linux-legendary',
      'linux-wine',
      'legendary on Linux asks the overlay hook and logs it enabled',
      { runner: 'legendary', eosOverlay: 'enabled' }
    ),
    named(
      'eos-overlay-not-asked-on-mac',
      'mac-wine',
      'legendary on macOS never asks the overlay hook',
      { runner: 'legendary' }
    ),
    named(
      'engine-launch-settings-overlay',
      'linux-wine',
      'the engine layer answers different settings: the launch runs with the overlaid prefix and wine',
      { engine: 'overlay', tier1: 'winetricks' }
    ),
    named(
      'engine-launch-settings-overlay-crossover-bottle',
      'mac-crossover',
      'the engine layer names another CrossOver bottle: the bottle check and whoami use it',
      { engine: 'overlay' }
    ),
    named(
      'deadline-arm-rejects',
      'linux-wine',
      'the deadline arm rejects: the backend warning and the success is kept',
      { deadline: 'rejects' }
    ),
    named(
      'mac-toolkit-default',
      'mac-toolkit',
      'a macOS toolkit launch: no wineserver to wait on',
      { prefix: 'partial' }
    ),
    named(
      'proton-without-umu-prefix-partial',
      'linux-proton-noumu',
      'proton without umu runs `proton run wineboot`',
      { prefix: 'partial' }
    )
  ]
}

function prepareWineCases(): WineCase[] {
  return [...pairwiseCases(), ...namedCases()]
}

/** The documented Rust-side differences (D-19); the file is built from this, never hand-edited. */
const DELTAS: Readonly<Record<string, string>> = {}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

const APP = (runner: Runner): string => `app-${runner}`
const GAME_WINE = 'Game Wine'
const DEFAULT_WINE = 'Default Wine'
const ENGINE_WINE = 'Engine Wine'
const BOTTLE = 'Bottle1'
const ENGINE_BOTTLE = 'EngineBottle'

const NODE_PLATFORM: Record<OraclePlatform, NodeJS.Platform> = {
  linux: 'linux',
  mac: 'darwin',
  windows: 'win32'
}

const REG = [
  { key: 'HKLM\\Software\\X', name: 'N', type: 'REG_DWORD', value: 1 }
]
const OVERLAYS = [{ id: 'o1' }]

/** The wine installation of a cell: `name` tells the scripted validity check which one a call asks about. */
function wineFor(
  cell: Cell,
  home: string,
  name: string,
  root: string
): WineInstallation {
  const { type, os } = CELLS[cell]
  const bin = (file: string) => join(home, root, 'bin', file)
  // A Linux wine carries its library folders (a wine with none logs the "Couldn't find all library folders" error).
  const libs =
    os === 'linux'
      ? { lib: join(home, root, 'lib64'), lib32: join(home, root, 'lib') }
      : {}
  if (type === 'proton') {
    return { bin: join(home, root, 'proton'), name, type, ...libs }
  }
  if (type === 'crossover') {
    return { bin: bin('wine'), name, type }
  }
  if (type === 'toolkit') {
    return { bin: bin('wine64'), name, type }
  }
  return {
    bin: bin('wine'),
    name,
    type,
    ...libs,
    wineserver: bin('wineserver')
  }
}

/** The settings the case stores for the game (a full GameSettings, so the engine overlay has every key to carry). */
function storedSettings(c: WineCase, home: string): GameSettings {
  const { spec } = c
  const offline = spec.offline.startsWith('on')
  return {
    autoInstallDxvk: spec.dxvk,
    autoInstallVkd3d: spec.vkd3d,
    autoInstallDxvkNvapi: spec.nvapi,
    autoSyncSaves: false,
    battlEyeRuntime: spec.battleye !== 'off',
    DXVKFpsCap: '0',
    eacRuntime: spec.eac !== 'off',
    enableDXVKFpsLimit: false,
    enableEsync: true,
    enableFSR: false,
    enableMsync: false,
    enableFsync: true,
    enableWineWayland: false,
    enableHDR: false,
    enableWoW64: false,
    gamescope: {
      enableUpscaling: false,
      enableLimiter: false,
      enableForceGrabCursor: false,
      windowType: '',
      gameWidth: '',
      gameHeight: '',
      upscaleWidth: '',
      upscaleHeight: '',
      upscaleMethod: '',
      fpsLimiter: '',
      fpsLimiterNoFocus: '',
      additionalOptions: ''
    },
    enviromentOptions: [],
    ignoreGameUpdates: false,
    language: '',
    launcherArgs: '',
    nvidiaPrime: false,
    offlineMode: offline,
    preferSystemLibs: false,
    showFps: false,
    showMangohud: false,
    targetExe: '',
    useGameMode: false,
    wineCrossoverBottle: CELLS[c.cell].type === 'crossover' ? BOTTLE : '',
    winePrefix: join(home, 'Games', 'Prefix'),
    wineVersion: wineFor(c.cell, home, GAME_WINE, 'wine'),
    wrapperOptions: [],
    savesPath: '',
    beforeLaunchScriptPath: '',
    afterLaunchScriptPath: '',
    disableUMU: false,
    verboseLogs: true,
    advertiseAvxForRosetta: false,
    enableQuickSavesMenu: false
  } as unknown as GameSettings
}

/** What the engine layer answers for `RUST_ENGINE_LAUNCH_SETTINGS_GET`: the stored settings with the engine overlaid. */
function overlaidSettings(
  c: WineCase,
  stored: GameSettings,
  home: string
): GameSettings {
  const wine = wineFor(c.cell, home, ENGINE_WINE, 'engine')
  return {
    ...stored,
    winePrefix: join(home, 'engine', 'prefix'),
    wineVersion: wine,
    ...(CELLS[c.cell].type === 'crossover'
      ? { wineCrossoverBottle: ENGINE_BOTTLE }
      : {})
  }
}

function gameInfoFor(c: WineCase, home: string): GameInfo {
  const { runner } = c.spec
  const dir = join(home, 'Games', `Oracle-${runner}`)
  return {
    app_name: APP(runner),
    runner,
    title: `Oracle ${runner} Game`,
    art_cover: '',
    art_square: '',
    is_installed: true,
    canRunOffline: !c.spec.offline.endsWith('cannot'),
    folder_name: `Oracle-${runner}`,
    install: { install_path: dir }
  } as unknown as GameInfo
}

const FIX_LAYER: Layer = 'local'

/** The known-fix files the case starts from, as seed entries (placeholders, never real paths). */
function fixSeed(c: WineCase): SeedEntry[] {
  const { spec } = c
  const app = APP(spec.runner)
  const seed: SeedEntry[] = []
  if (spec.tier1 === 'winetricks') {
    seed.push(
      fix(FIX_LAYER, app, spec.runner, 1, {
        title: 'tier-1 fix',
        winetricks: ['corefonts', 'vcrun2019']
      })
    )
  } else if (spec.tier1 === 'runInPrefix') {
    seed.push(
      fix(FIX_LAYER, app, spec.runner, 1, {
        title: 'tier-1 fix',
        runInPrefix: ['redist/setup.exe', 'redist/extra.exe']
      })
    )
  } else if (spec.tier1 === 'envVariables') {
    seed.push(
      fix(FIX_LAYER, app, spec.runner, 1, {
        title: 'tier-1 fix',
        envVariables: { ORACLE_FLAG: 'on', ORACLE_COUNT: 3 }
      })
    )
  }
  if (spec.tier2 !== 'none') {
    seed.push(
      fix(FIX_LAYER, app, spec.runner, 2, {
        title: 'tier-2 profile',
        evidence: 'todo.md',
        ...(spec.tier2 === 'registry' || spec.tier2 === 'both'
          ? { registry: REG }
          : {}),
        ...(spec.tier2 === 'overlay' || spec.tier2 === 'both'
          ? { overlays: OVERLAYS }
          : {})
      })
    )
  }
  if (spec.remoteTier2) {
    // The remote layer is tier 1 only: its tier-2 keys are dropped by the allow-list.
    seed.push(
      fix('remote', app, spec.runner, 1, {
        title: 'remote fix',
        registry: REG,
        overlays: OVERLAYS,
        shimFeatures: ['f1']
      })
    )
  }
  return seed
}

/** The folder installed_games lives in, and the one wine is told to use. */
function prefixFolder(
  c: WineCase,
  profile: EngineOracleProfile,
  effective: GameSettings
): string {
  return CELLS[c.cell].type === 'crossover'
    ? join(profile.home, 'bottles', effective.wineCrossoverBottle)
    : effective.winePrefix
}

/** The files a wine prefix of this type holds once it is complete. */
function prefixFiles(type: WineType): { dirs: string[]; files: string[] } {
  const common = ['system.reg', 'user.reg', 'userdef.reg']
  if (type === 'proton') {
    return {
      dirs: ['pfx/dosdevices', 'pfx/drive_c'],
      files: [
        'pfx.lock',
        'tracked_files',
        'version',
        'config_info',
        ...common.map((f) => `pfx/${f}`)
      ]
    }
  }
  return { dirs: ['dosdevices', 'drive_c'], files: common }
}

function createPrefix(folder: string, type: WineType): void {
  const { dirs, files } = prefixFiles(type)
  for (const dir of dirs) mkdirSync(join(folder, dir), { recursive: true })
  for (const file of files) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    writeFileSync(join(folder, file), '')
  }
}

type RecordedReply = { reply: unknown } | { rejects: string }

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

interface Recorded {
  input: unknown
  result: unknown
  begin: unknown
  finish: unknown
  tree: unknown
}

/** Runs one case on a profile and returns every golden file's content, paths not yet normalised. */
async function recordOnProfile(
  c: WineCase,
  profile: EngineOracleProfile
): Promise<Recorded> {
  const { spec } = c
  const { type, os } = CELLS[c.cell]
  const home = profile.home
  const app = APP(spec.runner)
  const crossover = type === 'crossover'
  const stored = storedSettings(c, home)
  const overlaid = overlaidSettings(c, stored, home)
  const effective = spec.engine === 'overlay' ? overlaid : stored
  const gameInfo = gameInfoFor(c, home)
  const folder = prefixFolder(c, profile, effective)
  const bottleName = effective.wineCrossoverBottle
  const umuPath = join(home, 'bin', 'umu-run')
  const umu = CELLS[c.cell].umu
  const runnerBin = umu
    ? umuPath
    : effective.wineVersion.bin.replaceAll("'", '')
  const defaultWine = {
    ...wineFor(c.cell, home, DEFAULT_WINE, 'default')
  }
  const opts = { mergesTier1Env: spec.mergesTier1Env }

  // --- the starting layout of the fake HOME ---------------------------------------------------
  const seed: SeedEntry[] = [
    ...fixSeed(c),
    {
      path: '<HOME>/public/bin/x64/win32/GalaxyCommunication.exe',
      text: 'MZ oracle dummy'
    }
  ]
  if (umu) {
    seed.push({ path: '<HOME>/bin/umu-run', text: '#!/bin/sh\n', mode: '0755' })
  }
  if (crossover && spec.bottle === 'present') {
    seed.push({
      path: `<HOME>/Library/Application Support/CrossOver/Bottles/${bottleName}/cxbottle.conf`,
      text: '[Bottle]\n'
    })
  }
  const prefixSeed = (): SeedEntry[] => {
    if (spec.prefix === 'absent') return []
    const entries: SeedEntry[] = []
    if (spec.prefix === 'partial') {
      const { dirs } = prefixFiles(type)
      entries.push({ path: `${folder}/${dirs[1]}`, dir: true })
    } else {
      const { dirs, files } = prefixFiles(type)
      for (const dir of dirs)
        entries.push({ path: `${folder}/${dir}`, dir: true })
      for (const file of files)
        entries.push({ path: `${folder}/${file}`, text: '' })
    }
    if (spec.installed === 'without-game') {
      entries.push({
        path: `${folder}/installed_games`,
        text: JSON.stringify(['other-app'])
      })
    } else if (spec.installed === 'with-game') {
      entries.push({
        path: `${folder}/installed_games`,
        text: JSON.stringify([app])
      })
    }
    return entries
  }
  seedProfile(profile, seed)
  seedProfile(profile, prefixSeed())
  // The GOG dummy: where `winepath` says it lives.
  const dummyDest = join(
    effective.winePrefix,
    'drive_c',
    'ProgramData',
    'GOG.com',
    'Galaxy',
    'redists',
    'GalaxyCommunication.exe'
  )
  const whoamiStderr =
    spec.whoami === 'reported'
      ? `cx: starting\nWINEPREFIX = "${folder}"\ncx: done\n`
      : 'cx: starting\ncx: done\n'
  const winepathStdout = spec.dummy === 'empty-winepath' ? '' : `${dummyDest}\n`

  // --- the scripted Rust replies --------------------------------------------------------------
  const wineValid: Record<string, boolean> = {
    [GAME_WINE]: spec.gameWine === 'valid',
    [DEFAULT_WINE]: spec.defaultWine === 'valid',
    [ENGINE_WINE]: true
  }
  const runtimeInstalled: Record<string, boolean> = {
    eac_runtime: spec.eac === 'installed',
    battleye_runtime: spec.battleye === 'installed'
  }
  const overlayEnv =
    spec.tier2 === 'overlay' || spec.tier2 === 'both'
      ? { ORACLE_OVERLAY_LIB: join(home, 'overlays', 'o1', 'lib') }
      : {}
  const rustScript: Record<string, (args: unknown[]) => unknown> = {
    [RUST_ENGINE_LAUNCH_SETTINGS_GET]: () => effective,
    [RUST_WINE_VALID]: (args) =>
      wineValid[(args[0] as WineInstallation).name] ?? false,
    [RUST_WINE_WINETRICKS_LIST_INSTALLED]: () => ['corefonts', 'vcrun2019'],
    [RUST_WINE_WINETRICKS_INSTALL]: (args) =>
      (args[1] as string[]).map(() => 'installed'),
    [RUST_ENGINE_RESOLVE_TOOL_SETTINGS]: () =>
      spec.engine === 'overlay'
        ? {
            kind: 'engine',
            key: `${spec.runner}:${app}`,
            settings: effective
          }
        : { kind: 'stored', settings: effective },
    [RUST_WINE_RUN_COMMAND_FOR_GAME]: () => ({ stdout: '', stderr: '' }),
    [RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY]: () => {
      if (spec.registry === 'rejects') {
        throw new Error('scripted registry failure')
      }
      return null
    },
    [RUST_KNOWNFIX_PROFILE_OVERLAY_ENV]: () => {
      if (spec.overlay === 'rejects') {
        throw new Error('scripted overlay failure')
      }
      return overlayEnv
    },
    [RUST_WINE_DXVK_INSTALL_REMOVE]: () => true,
    [RUST_WINE_RUNTIME_IS_INSTALLED]: (args) =>
      runtimeInstalled[args[0] as string] ?? false,
    [RUST_WINE_RUNTIME_DOWNLOAD]: () => true,
    [RUST_ENGINE_LAUNCH_ARM_DEADLINE]: () => {
      if (spec.deadline === 'rejects') {
        throw new Error('scripted deadline failure')
      }
      return { armed: false }
    }
  }
  const replies: Record<string, RecordedReply[]> = {}
  const rust = Object.fromEntries(
    Object.entries(rustScript).map(([channel, answer]) => [
      channel,
      (args: unknown[]) => {
        try {
          const reply = answer(args)
          ;(replies[channel] ??= []).push({ reply: reply ?? null })
          return reply
        } catch (error) {
          ;(replies[channel] ??= []).push({
            rejects: (error as Error).message
          })
          throw error
        }
      }
    ])
  )

  // --- the sequence counter and the recorders -------------------------------------------------
  let sequence = 0
  const next = (): number => (sequence += 1)
  const stamp = <T extends object>(list: T[]): void => {
    const original = list.push.bind(list)
    list.push = (...items: T[]) =>
      original(...items.map((item) => ({ seq: next(), ...item })))
  }
  const events: Record<string, unknown>[] = []
  stamp(events)
  const logLine =
    (level: string) =>
    (message: unknown, prefix?: unknown): void => {
      events.push({
        kind: 'backend-log',
        level,
        prefix: typeof prefix === 'string' ? prefix : null,
        text: Array.isArray(message) ? message.join(' ') : String(message)
      })
    }

  // The tracer's base is empty, so `envDiff.set` of a spawn is its whole environment.
  const tracer = createSpawnTracer({
    baseEnv: {},
    scripted: [
      {
        program: runnerBin,
        match: (argv) =>
          argv.includes('wineboot') || argv.includes('createprefix'),
        repeat: true,
        stream: () => createPrefix(effective.winePrefix, type)
      },
      {
        program: runnerBin,
        match: (argv) => argv.includes('whoami'),
        repeat: true,
        ...(spec.whoami === 'fails'
          ? { throws: 'spawn ENOENT' }
          : { code: 0, stderr: whoamiStderr })
      },
      {
        program: runnerBin,
        match: (argv) => argv.includes('winepath'),
        repeat: true,
        code: 0,
        // A dummy that is already installed is there once the prefix exists, not before it is created.
        stream: (io: { stdout(text: string): void }) => {
          if (spec.dummy === 'present') {
            mkdirSync(dirname(dummyDest), { recursive: true })
            writeFileSync(dummyDest, 'MZ already installed')
          }
          io.stdout(winepathStdout)
        }
      },
      {
        program: runnerBin,
        match: (argv) => argv.includes('sc') && argv.includes('create'),
        repeat: true,
        code: 0
      },
      ...(effective.wineVersion.wineserver
        ? [
            {
              program: effective.wineVersion.wineserver,
              argv: ['--wait'],
              repeat: true,
              code: 0
            }
          ]
        : [])
    ]
  })
  stamp(tracer.records as unknown as object[])
  const runOptions = new Map<number, Record<string, unknown>>()
  const runner = {
    ...tracer.runner,
    run: async (
      program: string,
      argv: readonly string[],
      options?: Parameters<typeof tracer.runner.run>[2]
    ) => {
      const before = tracer.records.length
      try {
        return await tracer.runner.run(program, argv, options)
      } finally {
        if (tracer.records.length > before) {
          runOptions.set(before, {
            timeoutMs: options?.timeoutMs ?? null,
            replaceEnv: options?.replaceEnv ?? null,
            resolveOn: options?.resolveOn ?? null,
            timeoutNone: options?.timeout?.none === true,
            windowsHide: options?.windowsHide ?? null,
            track: options?.track ?? null
          })
        }
      }
    }
  }

  // The command runner is the real one; `verifyWinePrefix` calls back into the runner it is part of.
  const self: { runner?: ReturnType<typeof createCommandRunner> } = {}
  const fake = createFakeLauncherDeps(profile, {
    online: spec.online,
    rust,
    games: {
      [`${spec.runner}:${app}`]: {
        native: false,
        info: gameInfo,
        settings: stored
      }
    },
    hooks: {
      'legendary.isOverlayEnabled': spec.eosOverlay === 'enabled'
    }
  })
  const paths = {
    ...fake.deps.paths,
    galaxyCommunicationExePath: join(
      home,
      'public',
      'bin',
      'x64',
      'win32',
      'GalaxyCommunication.exe'
    )
  }
  const commandRunner = createCommandRunner({
    runner,
    platform: NODE_PLATFORM[os],
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
        throw new Error('not used: every call passes its own settings')
      },
      verifyWinePrefix: (s) =>
        verifyWinePrefix(
          {
            commandRunner: {
              runWineCommand: (a) => {
                if (!self.runner) throw new Error('runner not built')
                return self.runner.runWineCommand(a)
              }
            },
            paths,
            requestRustInvoke: fake.deps.requestRustInvoke
          },
          s
        ),
      validWine: (wineVersion) => validWine(fake.deps, wineVersion),
      setupEnvVars,
      setupWineEnvVars: (s, gameId) =>
        setupWineEnvVars({ paths: profile.paths }, s, gameId),
      isUmuSupported: (s) => isUmuSupported({ paths: profile.paths }, s),
      getUmuPath: () => getUmuPath({ paths: profile.paths })
    }
  })
  self.runner = commandRunner
  const cometOff = spec.comet === 'off'
  Object.assign(fake.deps, {
    paths,
    runner,
    commandRunner,
    config: {
      getSettings: () => ({
        wineVersion: defaultWine,
        discordRPC: false,
        experimentalFeatures: cometOff ? { cometSupport: false } : {}
      })
    },
    onlineMonitor: {
      isOnline: () => {
        events.push({ kind: 'online-monitor', answer: spec.online })
        return spec.online
      }
    }
  })
  // The hooks the real stores define, and only those (`buildLaunchHooks`): the fake stubs every member.
  const defined: Record<Runner, string[]> = {
    sideload: [],
    gog: ['prepareLaunch'],
    legendary: ['prepareLaunch', 'isOverlayEnabled'],
    nile: ['prepareLaunch'],
    steam: []
  }
  for (const r of Object.keys(defined) as Runner[]) {
    const hooks = fake.deps.launchHooks[r] as unknown as Record<string, unknown>
    for (const member of Object.keys(hooks)) {
      if (!defined[r].includes(member)) hooks[member] = undefined
    }
  }
  stamp(fake.requests)
  stamp(fake.frontend)
  stamp(fake.notifications)
  stamp(fake.dialogs)
  stamp(fake.hooks)
  stamp(fake.appState)

  const writer = recordingLogWriter()
  const writerSeq: number[] = []
  const tracedWriter = Object.fromEntries(
    (
      [
        'logDebug',
        'logInfo',
        'logWarning',
        'logError',
        'writeString',
        'close'
      ] as const
    ).map((name) => [
      name,
      (...parts: unknown[]) => {
        writerSeq.push(next())
        return (writer.writer[name] as unknown as (...p: unknown[]) => unknown)(
          ...parts
        )
      }
    ])
  ) as unknown as typeof writer.writer

  const game = {
    getGameInfo: () => gameInfo,
    getSettings: () => Promise.resolve(stored)
  } as unknown as Game

  const input = {
    cell: c.cell,
    os,
    wineType: type,
    umu,
    runner: spec.runner,
    appName: app,
    gameInfo,
    storedSettings: stored,
    defaultWine,
    experimentalFeatures: cometOff ? { cometSupport: false } : {},
    opts,
    engineSettings: spec.engine === 'overlay' ? overlaid : null,
    seed: [...seed, ...prefixSeed()],
    installedGames: spec.installed,
    prefixFolder: folder,
    online: spec.online,
    hooks: { isOverlayEnabled: spec.eosOverlay === 'enabled' },
    hooksDefined: defined,
    wineValid,
    runtimeInstalled,
    scriptedRust: {
      overlayEnv,
      registry: spec.registry,
      overlay: spec.overlay,
      deadline: spec.deadline
    },
    spawns: {
      runnerBin,
      whoamiStderr: spec.whoami === 'fails' ? null : whoamiStderr,
      winepathStdout,
      dummyDest
    }
  }

  const spy = (
    level: 'info' | 'warning' | 'error',
    name: 'logInfo' | 'logWarning' | 'logError'
  ) => {
    const s = jest.spyOn(logger, name)
    s.mockImplementation(logLine(level) as never)
    return () => s.mockRestore()
  }
  const restores = [
    injectPlatform(os),
    injectProbe(environment, 'isSteamDeckGameMode', false),
    injectProbe(environment, 'isSteamDeck', false),
    injectProbe(environment, 'isFlatpak', false),
    injectProbe(environment, 'flatpakRuntimeVersion', ''),
    injectExecutableOnPath({ 'umu-run': umu ? umuPath : null }),
    spy('info', 'logInfo'),
    spy('warning', 'logWarning'),
    spy('error', 'logError')
  ]
  const reply = await withInjected(restores, async () => {
    try {
      return await createLauncher(fake.deps).prepareWineLaunch(
        game,
        tracedWriter,
        opts
      )
    } catch (error) {
      return { threw: (error as Error).message }
    }
  })
  const log = await writer.entries()

  // --- one ordered trace --------------------------------------------------------------------
  const logWriterMarker = (a: unknown): unknown =>
    a === tracedWriter ? '<logWriter>' : a
  const seen: Record<string, number> = {}
  const trace: { seq: number; [key: string]: unknown }[] = [
    ...(events as { seq: number }[]),
    ...fake.requests.map((r) => {
      const index = (seen[r.channel] = (seen[r.channel] ?? -1) + 1)
      return {
        ...(r as unknown as { seq: number }),
        kind: 'rust',
        ...(replies[r.channel]?.[index] ?? { reply: null })
      }
    }),
    ...fake.frontend.map((f) => ({ ...f, kind: 'frontend', via: f.kind })),
    ...fake.hooks.map((h) => ({
      ...h,
      kind: 'hook',
      args: h.args.map(logWriterMarker)
    })),
    ...fake.appState.map((a) => ({ ...a, kind: 'app-state' })),
    ...fake.notifications.map((n) => ({ ...n, kind: 'notification' })),
    ...fake.dialogs.map((d) => ({ ...d, kind: 'dialog', dialog: d.kind })),
    ...attachSpawnClass(
      tracer.records.map((record, i) => ({
        ...(record as unknown as { seq: number }),
        kind: 'spawn',
        callSite: callSiteOf(record.argv),
        program: record.program,
        argv: record.argv,
        envDiff: record.envDiff,
        cwd: record.cwd,
        options: runOptions.get(i) ?? null,
        result: record.result
      })),
      loadClasses(CRATE)
    ),
    ...log.map((entry, i) => ({
      seq: writerSeq[i] as number,
      kind: 'log',
      level: entry.level,
      parts: entry.parts
    }))
  ].map((e) => {
    const { seq, ...rest } = e as { seq: number }
    return { seq, ...rest }
  })
  trace.sort((a, b) => a.seq - b.seq)
  if (JSON.stringify(trace).includes('unscripted')) {
    throw new Error(`${c.id}: the case reached an unscripted collaborator`)
  }

  const updatedAt = trace.findIndex(
    (e) =>
      e.kind === 'backend-log' &&
      String(e.text).startsWith('Created/Updated Wineprefix at')
  )
  const hookAt = trace.findIndex(
    (e) => e.kind === 'hook' && e.member === 'prepareLaunch'
  )
  const registryAt = trace.findIndex(
    (e) =>
      e.kind === 'rust' && e.channel === RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY
  )
  const prefixUpdated = updatedAt >= 0
  let split: 'hook' | 'updated-log' | 'registry' | 'none'
  let at: number
  if (prefixUpdated && hookAt >= 0) {
    split = 'hook'
    at = hookAt
  } else if (prefixUpdated) {
    split = 'updated-log'
    at = updatedAt + 1
  } else if (registryAt >= 0) {
    split = 'registry'
    at = registryAt
  } else {
    split = 'none'
    at = trace.length
  }

  const roots = ['Games', 'bottles', 'engine']
  const tree = roots.flatMap((root) =>
    existsSync(join(home, root))
      ? snapshotTree(join(home, root)).map((entry) => ({
          ...entry,
          path: `${root}/${entry.path}`
        }))
      : []
  )

  const clean = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value === undefined ? null : value)) as T
  return {
    input: clean(input),
    result: clean(reply),
    begin: clean({ split, trace: trace.slice(0, at), prefixUpdated }),
    finish: clean({ trace: trace.slice(at) }),
    tree: clean(tree)
  }
}

/** The call site of a wine spawn, from what it runs (the classes of these are in `golden/classes.json`). */
function callSiteOf(argv: readonly string[]): string {
  if (argv.includes('whoami')) return 'prepare_wine.crossover_bottle_folder'
  if (argv.includes('winepath')) return 'prepare_wine.galaxy_winepath'
  if (argv.includes('sc') && argv.includes('create')) {
    return 'prepare_wine.galaxy_sc_create'
  }
  return 'prepare_wine.verify_prefix'
}

async function recordCase(c: WineCase): Promise<Recorded> {
  if (mode === 'record') {
    throw new Error(
      'prepare_wine has no recorded exchanges; GAMELIB_EW_ORACLE=record is not supported'
    )
  }
  return withEngineOracleProfile(async (profile) =>
    normalisePaths(
      await withPinnedBaseEnv(profile.fake, () => recordOnProfile(c, profile)),
      profile
    )
  )
}

/** The files of one golden folder: write mode rewrites them, compare mode checks the file set and the bytes. */
function writeOrCompare(caseId: string, recorded: Recorded): void {
  const dir = join(goldenDir(CRATE, SLICE), 'expected', caseId)
  const produced = new Map<string, string>([
    ['input.json', json(recorded.input)],
    ['result.json', json(recorded.result)],
    ['begin.json', json(recorded.begin)],
    ['finish.json', json(recorded.finish)],
    ['tree.json', json(recorded.tree)]
  ])
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const [name, text] of produced) writeFileSync(join(dir, name), text)
    return
  }
  expect([...produced.keys()].sort()).toEqual(readdirSync(dir).sort())
  for (const [name, text] of produced) {
    expect(text).toBe(readFileSync(join(dir, name), 'utf8'))
  }
}

/** The sidecar's i18next init, as `sidecar/bootstrap.ts` does it (locale en). */
async function initSidecarI18next(): Promise<void> {
  // The default instance, because that is the one `launcher.ts` calls.
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

describeSkipOnWindows('prepare_wine oracle (88.1-03)', () => {
  const built = prepareWineCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<WineCase>(CRATE, SLICE)
  const byId = (id: string): WineCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }
  void byId

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
    writeOrCompare(c.id, await recordCase(c))
  })

  type Entry = {
    seq: number
    kind: string
    channel?: string
    member?: string
    text?: string
    callSite?: string
    class?: string
    level?: string
    parts?: unknown[]
    args?: unknown[]
    reply?: unknown
    argv?: string[]
    program?: string
    envDiff?: { set: Record<string, string> }
    title?: string
  }
  const begin = (id: string) =>
    committed(id, 'begin.json') as {
      split: string
      trace: Entry[]
      prefixUpdated: boolean
    }
  const finish = (id: string) =>
    committed(id, 'finish.json') as { trace: Entry[] }
  const trace = (id: string): Entry[] => [
    ...begin(id).trace,
    ...finish(id).trace
  ]
  const channels = (id: string): string[] =>
    trace(id).flatMap((e) => (e.kind === 'rust' ? [e.channel as string] : []))
  const count = (id: string, channel: string): number =>
    channels(id).filter((name) => name === channel).length
  const backend = (id: string, level: string): string[] =>
    trace(id).flatMap((e) =>
      e.kind === 'backend-log' && e.level === level ? [String(e.text)] : []
    )
  const gameLog = (id: string): string =>
    JSON.stringify(trace(id).filter((e) => e.kind === 'log'))
  const result = (id: string) =>
    committed(id, 'result.json') as Record<string, unknown>
  const tree = (id: string) =>
    (committed(id, 'tree.json') as { path: string }[]).map((e) => e.path)
  const overlayRequest = (id: string) =>
    trace(id).find(
      (e) =>
        e.kind === 'rust' && e.channel === RUST_KNOWNFIX_PROFILE_OVERLAY_ENV
    )?.args?.[0] as { tier1Env: Record<string, string> }

  describe('the split (D-26, D-30)', () => {
    it('the tracer case is cut at the store-setup hook: begin ends with prefixUpdated, finish starts with the hook call', () => {
      const id = 'named-tracer-linux-wine-winetricks-fix'
      expect(Object.keys(begin(id)).at(-1)).toBe('prefixUpdated')
      expect(begin(id).prefixUpdated).toBe(true)
      expect(begin(id).split).toBe('hook')
      expect(finish(id).trace[0]).toMatchObject({
        kind: 'hook',
        member: 'prepareLaunch'
      })
    })

    it('every case is cut by the rule: before the hook when the prefix was updated, else before the registry request', () => {
      for (const c of cases) {
        const b = begin(c.id)
        const f = finish(c.id)
        const all = [...b.trace, ...f.trace]
        const updatedAt = all.findIndex(
          (e) =>
            e.kind === 'backend-log' &&
            String(e.text).startsWith('Created/Updated Wineprefix at')
        )
        expect({ id: c.id, updated: b.prefixUpdated }).toEqual({
          id: c.id,
          updated: updatedAt >= 0
        })
        if (b.split === 'hook') {
          expect(f.trace[0]).toMatchObject({
            kind: 'hook',
            member: 'prepareLaunch'
          })
          expect(b.trace.at(-1)?.text).toMatch(/^Created\/Updated Wineprefix/)
        } else if (b.split === 'updated-log') {
          // A runner with no store-setup hook (sideload): the cut sits where the call would be.
          expect(b.trace.at(-1)?.text).toMatch(/^Created\/Updated Wineprefix/)
          expect(all.some((e) => e.member === 'prepareLaunch')).toBe(false)
        } else if (b.split === 'registry') {
          expect(b.prefixUpdated).toBe(false)
          expect(f.trace[0]).toMatchObject({
            kind: 'rust',
            channel: RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY
          })
        } else {
          expect(b.split).toBe('none')
          expect(f.trace).toEqual([])
        }
        const seqs = all.map((e) => e.seq)
        expect(seqs).toEqual([...seqs].sort((x, y) => x - y))
      }
    })
  })

  describe('what the step answers', () => {
    it('a game wine that is invalid with a valid default goes on; both invalid is an early failure with no further trace', () => {
      expect(result('named-game-wine-invalid-default-valid')).toMatchObject({
        success: true
      })
      expect(result('named-both-wines-invalid')).toEqual({ success: false })
      expect(channels('named-both-wines-invalid')).toEqual([
        RUST_ENGINE_LAUNCH_SETTINGS_GET,
        RUST_WINE_VALID,
        RUST_WINE_VALID
      ])
      expect(begin('named-both-wines-invalid').split).toBe('none')
    })

    it('a missing CrossOver bottle shows the dialog and fails with the reason, with no spawn', () => {
      const id = 'named-crossover-bottle-missing'
      expect(result(id)).toEqual({
        success: false,
        failureReason: 'CrossOver bottle "Bottle1" does not exist'
      })
      const dialog = trace(id).find(
        (e) => e.kind === 'frontend' && e.channel === 'showDialog'
      )
      expect(dialog?.args?.slice(0, 3)).toEqual([
        'CrossOver bottle not found',
        `The CrossOver bottle "Bottle1" does not exist, can't launch!`,
        'ERROR'
      ])
      expect(trace(id).some((e) => e.kind === 'spawn')).toBe(false)
    })

    it('a whoami with no WINEPREFIX line, or one that cannot spawn, writes no installed_games and runs no store setup', () => {
      for (const id of [
        'named-crossover-whoami-without-prefix-line',
        'named-crossover-whoami-spawn-fails'
      ]) {
        expect(begin(id).prefixUpdated).toBe(false)
        expect(tree(id).some((p) => p.endsWith('installed_games'))).toBe(false)
        expect(trace(id).some((e) => e.member === 'prepareLaunch')).toBe(false)
        expect(result(id)).toMatchObject({ success: true })
      }
    })

    it('a game installed_games already lists gets no store setup and no installFixes, whatever its tier-1 fix', () => {
      const id = 'named-installed-games-lists-the-game'
      expect(begin(id).prefixUpdated).toBe(false)
      expect(trace(id).some((e) => e.member === 'prepareLaunch')).toBe(false)
      expect(trace(id).some((e) => e.channel === 'gameStatusUpdate')).toBe(
        false
      )
      expect(count(id, RUST_WINE_WINETRICKS_INSTALL)).toBe(0)
      const other = 'named-installed-games-without-the-game'
      expect(begin(other).prefixUpdated).toBe(true)
    })

    it('a tier-1 winetricks fix sends the winetricks status and installs the verbs; runInPrefix sends the redist status and runs each program', () => {
      const tracer = 'named-tracer-linux-wine-winetricks-fix'
      expect(count(tracer, RUST_WINE_WINETRICKS_INSTALL)).toBe(1)
      expect(
        trace(tracer)
          .filter((e) => e.kind === 'frontend')
          .map((e) => (e.args?.[0] as { status: string }).status)
      ).toEqual(['winetricks', 'winetricks'])
      const redist = 'named-tier1-run-in-prefix'
      expect(count(redist, RUST_WINE_RUN_COMMAND_FOR_GAME)).toBe(2)
      expect(count(redist, RUST_ENGINE_RESOLVE_TOOL_SETTINGS)).toBe(2)
      expect(
        trace(redist)
          .filter((e) => e.kind === 'frontend')
          .map((e) => (e.args?.[0] as { status: string }).status)
      ).toEqual(['redist', 'redist'])
    })

    it('tier-1 envVariables reach the overlay request as strings, unless the caller does not merge them', () => {
      expect(overlayRequest('named-tier1-env-variables').tier1Env).toEqual({
        ORACLE_FLAG: 'on',
        ORACLE_COUNT: '3'
      })
      expect(
        overlayRequest('named-tier1-env-variables-not-merged-sideload').tier1Env
      ).toEqual({})
    })

    it('a remote-layer file with tier-2 keys has no registry or overlay effect: the overlay request carries no tier-1 env', () => {
      const id = 'named-remote-layer-carries-tier2-keys'
      expect(overlayRequest(id).tier1Env).toEqual({})
      expect(result(id)).toMatchObject({ success: true, knownFixEnv: {} })
      expect(
        backend(id, 'warning').some((line) => line.includes('tier-2 key'))
      ).toBe(true)
    })

    it('a local tier-2 profile adds its overlay env to the returned env and to the log', () => {
      const id = 'named-tier2-registry-and-overlay'
      expect(result(id)).toMatchObject({
        knownFixEnv: { ORACLE_OVERLAY_LIB: '<HOME>/overlays/o1/lib' }
      })
      expect(gameLog(id)).toContain('ORACLE_OVERLAY_LIB')
    })

    it('a registry reply that rejects and an overlay reply that rejects are warnings and the launch goes on', () => {
      expect(
        backend('named-registry-reply-rejects', 'warning').some((l) =>
          l.includes('known-fix registry step failed')
        )
      ).toBe(true)
      expect(
        backend('named-overlay-reply-rejects', 'warning').some((l) =>
          l.includes('overlay env failed')
        )
      ).toBe(true)
      for (const id of [
        'named-registry-reply-rejects',
        'named-overlay-reply-rejects',
        'named-registry-and-overlay-replies-reject'
      ]) {
        expect(result(id)).toMatchObject({ success: true })
      }
      expect(
        backend('named-registry-and-overlay-replies-reject', 'warning')
      ).toHaveLength(2)
    })

    it('the GOG dummy: copied with its service created, already present, an empty winepath, or comet off', () => {
      const spawnSites = (id: string) =>
        trace(id).flatMap((e) => (e.kind === 'spawn' ? [e.callSite] : []))
      expect(
        spawnSites('named-gog-dummy-installed-and-service-created')
      ).toEqual([
        'prepare_wine.verify_prefix',
        'prepare_wine.galaxy_winepath',
        'prepare_wine.galaxy_sc_create'
      ])
      expect(
        tree('named-gog-dummy-installed-and-service-created').some((p) =>
          p.endsWith('GalaxyCommunication.exe')
        )
      ).toBe(true)
      expect(spawnSites('named-gog-dummy-already-present')).toEqual([
        'prepare_wine.verify_prefix',
        'prepare_wine.galaxy_winepath'
      ])
      const empty = backend('named-gog-dummy-winepath-empty', 'error')
      expect(empty[0]).toContain("Couldn't get wine path for")
      expect(empty[1]).toContain(
        'Failed to install GalaxyCommunication dummy into the prefix'
      )
      expect(result('named-gog-dummy-winepath-empty')).toMatchObject({
        success: true
      })
      expect(spawnSites('named-gog-comet-support-off')).toEqual([
        'prepare_wine.verify_prefix'
      ])
    })

    it('the DXVK family installs on a Linux wine, only DXVK on a macOS wine, and nothing on proton or CrossOver', () => {
      const tools = (id: string) =>
        trace(id)
          .filter(
            (e) =>
              e.kind === 'rust' && e.channel === RUST_WINE_DXVK_INSTALL_REMOVE
          )
          .map((e) => (e.args?.[0] as { tool: string }).tool)
      expect(tools('named-dxvk-family-on-linux-wine')).toEqual([
        'dxvk',
        'dxvk-nvapi',
        'vkd3d'
      ])
      expect(tools('named-dxvk-only-on-mac-wine')).toEqual(['dxvk'])
      expect(tools('named-dxvk-not-installed-on-proton')).toEqual([])
      expect(tools('named-dxvk-not-installed-on-crossover')).toEqual([])
    })

    it('the EAC and BattlEye runtimes are downloaded only when wanted, online and not installed', () => {
      const offline = 'named-eac-offline-no-download'
      expect(count(offline, RUST_WINE_RUNTIME_IS_INSTALLED)).toBe(0)
      expect(count(offline, RUST_WINE_RUNTIME_DOWNLOAD)).toBe(0)
      const downloaded = 'named-eac-and-battleye-downloaded'
      expect(
        trace(downloaded)
          .filter((e) => e.channel === RUST_WINE_RUNTIME_DOWNLOAD)
          .map((e) => e.args)
      ).toEqual([['eac_runtime'], ['battleye_runtime']])
      const installed = 'named-eac-installed-no-download'
      expect(count(installed, RUST_WINE_RUNTIME_IS_INSTALLED)).toBe(2)
      expect(count(installed, RUST_WINE_RUNTIME_DOWNLOAD)).toBe(0)
    })

    it('the offline-mode warning, the EOS overlay line and the deadline arm failure reach their logs', () => {
      expect(
        gameLog('named-offline-setting-game-cannot-run-offline')
      ).toContain(
        "Warning: 'offlineMode' is turned on but the game does not support offline mode."
      )
      expect(gameLog('named-eos-overlay-enabled-linux-legendary')).toContain(
        'EOS Overlay: Enabled'
      )
      expect(
        trace('named-eos-overlay-not-asked-on-mac').some(
          (e) => e.member === 'isOverlayEnabled'
        )
      ).toBe(false)
      const id = 'named-deadline-arm-rejects'
      expect(result(id)).toMatchObject({ success: true })
      expect(backend(id, 'warning')).toEqual([
        'Engine: the launch deadline could not be armed: Error: scripted deadline failure'
      ])
    })

    it('the engine overlay settings, not the stored ones, drive the prefix, the wine and the CrossOver bottle', () => {
      const linux = trace('named-engine-launch-settings-overlay')
      const wineboot = linux.find((e) => e.kind === 'spawn')
      expect(wineboot?.program).toBe('<HOME>/engine/bin/wine')
      expect(wineboot?.envDiff?.set.WINEPREFIX).toBe('<HOME>/engine/prefix')
      const cx = trace('named-engine-launch-settings-overlay-crossover-bottle')
      const whoami = cx.find((e) => e.kind === 'spawn')
      expect(whoami?.argv).toEqual([
        '--bottle',
        'EngineBottle',
        '--verbose',
        'whoami'
      ])
    })
  })

  describe('spawns', () => {
    it('every spawn call site of the plan is recorded, each as a helper', () => {
      const seen = new Map<string, Set<string>>()
      for (const c of cases) {
        for (const e of trace(c.id)) {
          if (e.kind !== 'spawn') continue
          const classes = seen.get(e.callSite as string) ?? new Set<string>()
          classes.add(e.class as string)
          seen.set(e.callSite as string, classes)
        }
      }
      for (const site of [
        'prepare_wine.verify_prefix',
        'prepare_wine.crossover_bottle_folder',
        'prepare_wine.galaxy_winepath',
        'prepare_wine.galaxy_sc_create'
      ]) {
        expect({ site, classes: [...(seen.get(site) ?? [])] }).toEqual({
          site,
          classes: ['helper']
        })
      }
    })

    it('a wine never runs: no spawn names a binary outside the fake HOME, and no env carries the real home', () => {
      const realHome = homedir()
      for (const c of cases) {
        for (const e of trace(c.id)) {
          if (e.kind !== 'spawn') continue
          expect(String(e.program)).toMatch(/^<HOME>\//)
          expect(JSON.stringify(e.envDiff)).not.toContain(realHome)
        }
        expect(JSON.stringify(trace(c.id))).not.toContain(realHome)
      }
    })
  })

  it('the golden folders hold the five files of the contract', () => {
    for (const c of cases) {
      expect(
        readdirSync(join(goldenDir(CRATE, SLICE), 'expected', c.id)).sort()
      ).toEqual([
        'begin.json',
        'finish.json',
        'input.json',
        'result.json',
        'tree.json'
      ])
    }
  })

  it('every pairwise suite covers every legal pair and every axis value', () => {
    for (const cell of CELL_IDS) {
      for (const suite of SUITES) {
        const rows = cases.flatMap((c) =>
          c.cell === cell && c.suite === suite && c.axes ? [c.axes] : []
        )
        if (rows.length === 0) continue
        const axes = axesFor(cell, suite)
        expect({
          cell,
          suite,
          uncovered: uncoveredPairs(axes, rows, feasibleFor(cell, suite))
        }).toEqual({ cell, suite, uncovered: [] })
        for (const [axis, values] of Object.entries(axes)) {
          const present = new Set(rows.map((row) => row[axis]))
          expect(values.filter((value) => !present.has(value))).toEqual([])
        }
      }
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, PREPARE_WINE_FLOOR)
    assertManifest(CRATE, SLICE, cases, PREPARE_WINE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, PREPARE_WINE_FLOOR)
  })
})
