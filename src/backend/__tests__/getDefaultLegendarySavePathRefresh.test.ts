/**
 * Regression test — quick task 260912-rvv, acting on the measurement made by quick task
 * `260912-qop` (`getGameInfoForceReloadStaleness.test.ts`).
 *
 * THIS IS A REGRESSION TEST, NOT A CHARACTERISATION PROBE. Contrast with qop's
 * `getGameInfoForceReloadStaleness.test.ts`, which pins `LegendaryLibraryManager.getGameInfo`
 * directly and is expected to stay GREEN forever (it measures a mechanism this fix does not
 * touch). This file drives the actual defect site — `save_sync.ts`'s
 * `getDefaultLegendarySavePath()` — end to end, and is expected to FAIL on unfixed code and
 * PASS once `refreshInstalled()` is called before the readback.
 *
 * THE DEFECT (fixed by this quick task): `getDefaultLegendarySavePath()` runs
 * `legendary sync-saves --accept-path` (which rewrites `save_path` into `installed.json` on
 * disk) and immediately reads it back via `getGameInfo(appName, true)`. That readback does not
 * consult `installed.json` -- it merges install fields from the module-scope `installedGames`
 * map, which only `refreshInstalled()` writes. Without an intervening refresh the readback
 * returns a stale (or absent) value even though the fresh one is already on disk, leaving the
 * Cloud Saves Sync save-path field EMPTY on the first call (live-reproduced, quick 260912-qop).
 *
 * TWO ARMS, both driving the real, exported `getDefaultSavePath(APP_NAME, 'legendary', [])`:
 *  - EMPTY arm -- `installed.json` and the seeded in-memory map both hold `save_path: null`
 *    (the real first-call state; mirrors the live evidence where the UI persisted
 *    `savesPath: ''`). WITHOUT THE FIX this resolves to `''` via the `if (!new_save_path)`
 *    logError branch in `save_sync.ts`. WITH THE FIX it resolves to `NEW_SENTINEL`.
 *  - STALE arm -- both hold `OLD_SENTINEL` (a non-empty, already-present value). WITHOUT THE
 *    FIX this resolves to `OLD_SENTINEL` (a present-but-wrong value slips past the
 *    `if (!new_save_path)` guard). WITH THE FIX it resolves to `NEW_SENTINEL`. This arm exists
 *    so the EMPTY arm cannot be the whole test: an assertion that only distinguishes
 *    "empty" from "non-empty" would also be satisfied by a stale-but-present value, which is
 *    the defect wearing a different mask.
 *
 * WHY THE `runRunnerCommand` STUB WRITES THE FIXTURE FILE (the anti-vacuity control that
 * matters most here): `sync-saves --accept-path` is what actually rewrites `save_path` into
 * `installed.json` on disk in production. A stub that merely resolves without touching disk
 * would make this test pass with OR without the fix -- the readback would just keep seeing
 * whatever was seeded at the start of the arm, and neither arm would ever prove the refresh
 * closed the staleness window. The stub below performs that exact disk write as its side
 * effect, and a write-through control (below) proves the write actually landed.
 *
 * FOUR ANTI-VACUITY CONTROLS, present in both arms:
 *  (a) sentinel-distinctness guard -- the two sentinels, and NEW_SENTINEL vs `''`, can never be
 *      trivially equal;
 *  (b) trap guard, BEFORE the call under test -- `manager.getGameInfo(APP_NAME, true)` must
 *      already resolve to a defined, fully-loaded record (correct title, `is_installed`).
 *      Without this, an `undefined` GameInfo would make `save_sync.ts`'s non-null destructure
 *      throw a TypeError, and the EMPTY arm would "fail without the fix" for entirely the
 *      wrong reason (a `loadFile()` early-return, not the staleness defect);
 *  (c) stub-was-called assertion, AFTER the call -- `runRunnerCommand` was actually invoked
 *      with `subcommand: 'sync-saves'` and `'--accept-path': true`, so a silently skipped
 *      sync-saves step cannot be mistaken for a passing refresh;
 *  (d) write-through control, AFTER the call -- the fixture `installed.json` on disk really
 *      does hold `NEW_SENTINEL`, so a silently failed stub write cannot be mistaken for a
 *      stale in-memory read.
 *
 * Anchors (verified at 358fbdc7d):
 *   `src/backend/save_sync.ts`
 *     L17-36  `getDefaultSavePath(appName, runner, alreadyDefinedGogSaves)` -- the only export;
 *             `getDefaultLegendarySavePath` is module-private, so this test drives the public
 *             entry point and narrows the runner to `'legendary'`.
 *     L71-85  `runRunnerCommand({ subcommand: 'sync-saves', ..., '--accept-path': true }, ...)`
 *     L86-87  the false-assumption comment this quick task corrects
 *     L89-91  `const { save_path: new_save_path } = libraryManagerMap['legendary']
 *             .getGameInfo(appName, true)!` -- the stale readback; the fix inserts
 *             `refreshInstalled()` immediately before this line.
 *   `src/backend/storeManagers/legendary/library.ts` (NOT modified by this file's existence)
 *     L58   `let installedGames: Map<string, InstalledJsonMetadata> = new Map()` (module scope)
 *     L131  `refreshInstalled()` -- the ONLY writer of `installedGames`, synchronous (no `async`)
 *     L203  `getGameInfo(appName, forceReload = false)`
 *
 * MOCK BOUNDARIES. Ported, path-adjusted, from
 * `storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts` (quick 260912-qop),
 * extended for the wider call path `getDefaultSavePath` walks through `save_sync.ts`:
 *  - `../storeManagers/legendary/constants` -> mint a disposable, hermetic mkdtemp fixture root
 *    (0700), exactly as qop does. Resolved by ABSOLUTE PATH, so this one mock also covers
 *    `library.ts`'s own `./constants` import and `save_sync.ts`'s
 *    `./storeManagers/legendary/constants` import -- required, because `save_sync` reads
 *    `legendaryInstalled` directly while `library.ts` joins `legendaryConfigPath` +
 *    `installed.json` itself.
 *  - `backend/logger`     -> logInfo/logError/logWarning/logDebug + LogPrefix (also covers
 *                            `save_sync.ts`'s own `./logger` import -- same resolved module).
 *  - `../utils`           -> qop's set (formatEpicStoreUrl/getLegendaryBin/isEpicServiceOffline/
 *                            getFileSize/axiosClient), PLUS `getShellPath` for `save_sync.ts`'s
 *                            `./utils` import (same resolved module; unused on this call path
 *                            but needed for import resolution).
 *  - `../launcher`        -> qop's `callRunner` (for `library.ts`), PLUS `getWinePath`,
 *                            `setupWineEnvVars`, `verifyWinePrefix` for `save_sync.ts`'s
 *                            `./launcher` import. None of the three wine helpers are reached in
 *                            this test: the fake game's `isNative()` returns `true`, which skips
 *                            both call sites that would otherwise invoke them.
 *  - `backend/online_monitor`, `../storeManagers/legendary/electronStores`,
 *    `../storeManagers/legendary/user`, `../storeManagers/legendary/games` -> qop's set,
 *    verbatim, not on this call path either, needed only for module resolution.
 *  - `backend/platform`   -> minimal `{ app: { getPath: jest.fn() } }`. `save_sync.ts` imports
 *                            `app` at module scope; `app.getPath` is only actually called on the
 *                            GOG branch (`getDefaultGogSavePaths`), never the legendary branch
 *                            this test drives.
 *  - `backend/storeManagers` -- THE LOAD-BEARING MOCK. The real module
 *    (`storeManagers/index.ts`) eagerly constructs EVERY store manager (GOG/Legendary/Nile/
 *    Zoom/Sideload/Steam) at import time; mocking it is what keeps this test from having to
 *    stand up five unrelated managers. The factory injects a REAL `LegendaryLibraryManager`
 *    (`jest.requireActual('backend/storeManagers/legendary/library').default`, constructed
 *    inside the factory -- safe, because the class has no explicit constructor) under key
 *    `legendary`, plus a bare stub under `gog` (never exercised; present only so the object
 *    shape is complete). Using the REAL manager is the whole point: the fix's effect is a REAL
 *    `refreshInstalled()` repopulating the REAL module-scope `installedGames` map that the REAL
 *    `getGameInfo` reads. A fully-mocked `getGameInfo` would test the mock, not the defect.
 *  - `./storeManagers/legendary/commands/base` (`LegendaryAppName`) -> left UNMOCKED. It is a
 *    plain `z.string().brand(...)`, so `'Iris'` parses with no special setup.
 *  - real, UNMOCKED: `fs`/`graceful-fs` (this test's entire question is whether the in-memory
 *    map gets refreshed from disk -- a mocked filesystem would measure the mock, not the
 *    defect), `path`, `./thirdParty` (reads `thirdPartyInstalled` off the same mocked
 *    `../storeManagers/legendary/constants`; the file does not exist in the fixture root, so it
 *    returns `[]`), `common/types`, `common/types/gog`, `common/types/legendary`.
 *
 * Only `getGame` and `runRunnerCommand` are stubbed on the manager. `getGameInfo` and
 * `refreshInstalled` are left UNSTUBBED -- they are the mechanism under measurement.
 */

// ── ../storeManagers/legendary/constants mock: mint a disposable, hermetic fixture root ─────
jest.mock('../storeManagers/legendary/constants', () => {
  const nodeFs = jest.requireActual<typeof import('fs')>('fs')
  const nodePath = jest.requireActual<typeof import('path')>('path')
  const nodeOs = jest.requireActual<typeof import('os')>('os')

  const parent = process.env.GAMELIB_JEST_RUN_ROOT ?? nodeOs.tmpdir()
  const root = nodeFs.mkdtempSync(nodePath.join(parent, 'gamelib-rvv-legendary-'))
  // See qop's identical comment: mkdtemp's 0700 request can be masked by the process umask;
  // this restores owner-write. mkdtemp's unpredictable suffix remains the actual control
  // (T-rvv-01).
  nodeFs.chmodSync(root, 0o700)

  return {
    legendaryConfigPath: root,
    legendaryUserInfo: nodePath.join(root, 'user.json'),
    legendaryInstalled: nodePath.join(root, 'installed.json'),
    thirdPartyInstalled: nodePath.join(root, 'third-party-installed.json'),
    legendaryMetadata: nodePath.join(root, 'metadata'),
    epicRedistPath: nodePath.join(root, 'epicRedist')
  }
})

// ── backend/logger mock (also covers save_sync.ts's own './logger' import) ──────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: {
    Legendary: 'Legendary',
    Backend: 'Backend'
  }
}))

// ── ../utils mock (also covers save_sync.ts's own './utils' import) ─────────────────────────
jest.mock('../utils', () => ({
  formatEpicStoreUrl: jest.fn(
    (title: string) => `https://store.epicgames.com/p/${title}`
  ),
  getLegendaryBin: jest.fn(() => ({ dir: '/fake', bin: 'legendary' })),
  isEpicServiceOffline: jest.fn(() => Promise.resolve(false)),
  getFileSize: jest.fn(() => '0.12 GB'),
  axiosClient: { get: jest.fn() },
  getShellPath: jest.fn((path: string) => Promise.resolve(path))
}))

// ── ../launcher mock (also covers save_sync.ts's own './launcher' import) ───────────────────
jest.mock('../launcher', () => ({
  callRunner: jest.fn(),
  getWinePath: jest.fn(),
  setupWineEnvVars: jest.fn(),
  verifyWinePrefix: jest.fn()
}))

// ── backend/online_monitor mock ──────────────────────────────────────────────────────────────
jest.mock('backend/online_monitor', () => ({
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn()
}))

// ── ../storeManagers/legendary/electronStores mock ───────────────────────────────────────────
jest.mock('../storeManagers/legendary/electronStores', () => ({
  libraryStore: { get: jest.fn(() => []), set: jest.fn() },
  installStore: {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(() => false),
    delete: jest.fn()
  },
  gamesOverrideStore: {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(() => false),
    delete: jest.fn()
  },
  gameInfoStore: { get: jest.fn(), set: jest.fn() }
}))

// ── ../storeManagers/legendary/user mock (LegendaryUser -- not on this call path) ───────────
jest.mock('../storeManagers/legendary/user', () => ({
  LegendaryUser: {
    isLoggedIn: jest.fn(() => true),
    logout: jest.fn(),
    getUserDetails: jest.fn()
  }
}))

// ── ../storeManagers/legendary/games mock (LegendaryGame -- never constructed here) ─────────
jest.mock('../storeManagers/legendary/games', () => ({
  __esModule: true,
  default: class LegendaryGame {}
}))

// ── backend/platform mock ─────────────────────────────────────────────────────────────────────
jest.mock('backend/platform', () => ({
  app: { getPath: jest.fn(() => '/fake/documents') }
}))

// ── backend/storeManagers mock -- THE LOAD-BEARING MOCK ──────────────────────────────────────
// Real module eagerly constructs every store manager at import time; this factory sidesteps
// that by injecting a REAL LegendaryLibraryManager (constructed here -- no explicit
// constructor, so this is safe) plus a bare `gog` stub. `jest.requireActual` is used (rather
// than an outer import reference) because jest hoists `jest.mock` factories above imports and
// would otherwise hit a temporal-dead-zone reference.
jest.mock('backend/storeManagers', () => {
  const ActualLegendaryLibraryManager = jest.requireActual<
    typeof import('backend/storeManagers/legendary/library')
  >('backend/storeManagers/legendary/library').default

  return {
    libraryManagerMap: {
      legendary: new ActualLegendaryLibraryManager(),
      gog: {}
    }
  }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────────
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDefaultSavePath } from '../save_sync'
import { libraryManagerMap } from 'backend/storeManagers'
import {
  legendaryConfigPath,
  legendaryMetadata
} from '../storeManagers/legendary/constants'
import type {
  InstalledJsonMetadata,
  GameMetadataInner
} from 'common/types/legendary'
import type LegendaryGame from '../storeManagers/legendary/games'

// Two obviously distinct, greppable sentinels -- see the sentinel-distinctness guard below.
const OLD_SENTINEL = '/rvv/OLD-stale-save-path'
const NEW_SENTINEL = '/rvv/NEW-fresh-save-path'

const APP_NAME = 'Iris'

// The manager the real `backend/storeManagers` mock factory constructed above -- the SAME
// object reference `save_sync.ts` sees through its own `import { libraryManagerMap } from
// 'backend/storeManagers'`, since jest caches one module instance per test file.
const manager = libraryManagerMap.legendary

/**
 * `metadata/Iris.json` fixture -- reused verbatim (path-adjusted import) from
 * `getGameInfoForceReloadStaleness.test.ts`, shaped to avoid all five `loadFile()`
 * early-return traps. `Iris` / `Phoenix Point` / `Mac` is the real-world anchor this defect
 * was filed against (CONTEXT doc); nothing in this test reads the operator's real config.
 */
const metadataInner: GameMetadataInner = {
  ageGatings: {},
  applicationId: APP_NAME,
  categories: [{ path: 'games' }],
  creationDate: '2020-01-01T00:00:00.000Z',
  customAttributes: {
    CloudSaveFolder_MAC: {
      type: 'STRING',
      value: '/Users/rvv/Library/Application Support/PhoenixPoint'
    }
  } as GameMetadataInner['customAttributes'],
  description: 'Turn-based tactics against an alien threat.',
  developer: 'Snapshot Games',
  developerId: 'snapshot-games',
  endOfSupport: false,
  entitlementName: APP_NAME,
  entitlementType: 'EXECUTABLE',
  eulaIds: ['egstore'],
  id: 'iris-catalog-id',
  keyImages: [],
  lastModifiedDate: '2020-01-01T00:00:00.000Z',
  namespace: 'snapshot-games-ns',
  releaseInfo: [
    { appId: APP_NAME, id: 'iris-release-id', platform: ['Mac', 'Windows'] }
  ],
  status: 'ACTIVE',
  title: 'Phoenix Point',
  unsearchable: false
}

// `InstalledJsonMetadata.save_path` is declared `?: string` (optional), but this fixture must
// also express the real "never synced" on-disk shape, which legendary writes as a literal
// `null` -- not an absent key. Widened locally, per the CONTEXT decision, rather than loosening
// the shared production type for one test.
type InstalledJsonFixtureEntry = Omit<InstalledJsonMetadata, 'save_path'> & {
  save_path: string | null
}

function installedJsonFixture(
  savePath: string | null
): Record<string, InstalledJsonFixtureEntry> {
  return {
    [APP_NAME]: {
      app_name: APP_NAME,
      base_urls: [],
      can_run_offline: true,
      egl_guid: 'egl-guid-rvv-1',
      executable: 'PhoenixPoint.app',
      install_path: '/Applications/Phoenix Point.app',
      install_size: 123456789,
      install_tags: [],
      is_dlc: false,
      launch_parameters: '',
      needs_verification: false,
      platform: 'Mac',
      prereq_info: [],
      requires_ot: false,
      save_path: savePath,
      title: 'Phoenix Point',
      version: '1.0.0'
    }
  }
}

describe(
  'getDefaultSavePath(appName, "legendary", []) refreshes installedGames before the ' +
    'save_path readback (quick 260912-rvv)',
  () => {
    let installedJsonPath: string

    beforeEach(() => {
      mkdirSync(legendaryMetadata, { recursive: true })
      writeFileSync(
        join(legendaryMetadata, `${APP_NAME}.json`),
        JSON.stringify({
          app_name: APP_NAME,
          app_title: 'Phoenix Point',
          metadata: metadataInner
        })
      )
      installedJsonPath = join(legendaryConfigPath, 'installed.json')
    })

    /**
     * Per-arm setup, shared by both tests. `resetMocks: true` in `src/backend/jest.config.js`
     * wipes spy implementations between tests, so every spy is (re-)established here, called
     * fresh from inside each `it`, never at module/factory time.
     */
    function seedArm(initialSavePath: string | null) {
      // Step 1: installed.json on disk (and, after the two calls below, the in-memory map)
      // start with the arm's initial value.
      writeFileSync(
        installedJsonPath,
        JSON.stringify(installedJsonFixture(initialSavePath))
      )
      manager.loadGamesInAccount()
      manager.refreshInstalled()

      // `getGame`: a minimal fake game. `save_path` is deliberately falsy so the L45-65
      // "discard the stored path" branch in save_sync.ts is skipped, and `isNative()` is
      // `true` so `verifyWinePrefix` is never reached -- the arm under test is the readback,
      // not those unrelated branches.
      const fakeGame = {
        getGameInfo: () => ({
          save_folder: 'PhoenixPointSaves',
          save_path: ''
        }),
        isNative: () => true,
        getSettings: () => Promise.resolve({})
      } as unknown as LegendaryGame
      jest.spyOn(manager, 'getGame').mockReturnValue(fakeGame)

      // `runRunnerCommand`: replaces the real CLI invocation entirely (T-rvv-02) and performs
      // the one side effect that matters -- writing a FRESH save_path into installed.json,
      // exactly as `legendary sync-saves --accept-path` does in production. A stub that only
      // resolves without this write would make the test pass with or without the fix.
      const runRunnerCommandSpy = jest
        .spyOn(manager, 'runRunnerCommand')
        .mockImplementation(() => {
          writeFileSync(
            installedJsonPath,
            JSON.stringify(installedJsonFixture(NEW_SENTINEL))
          )
          return Promise.resolve({ stdout: '', stderr: '' })
        })

      return runRunnerCommandSpy
    }

    it(
      'EMPTY arm: first call resolves to the fresh path, not "" (installed.json/map start ' +
        'with save_path: null -- the real first-sync state)',
      async () => {
        // (a) sentinel-distinctness guard.
        expect(OLD_SENTINEL).not.toBe(NEW_SENTINEL)
        expect(NEW_SENTINEL).not.toBe('')

        const runRunnerCommandSpy = seedArm(null)

        // (b) trap guard, BEFORE the call under test.
        const preCallInfo = manager.getGameInfo(APP_NAME, true)
        expect(preCallInfo).toBeDefined()
        expect(preCallInfo!.title).toBe('Phoenix Point')
        expect(preCallInfo!.is_installed).toBe(true)

        const result = await getDefaultSavePath(APP_NAME, 'legendary', [])

        // (c) stub-was-called assertion, AFTER the call.
        expect(runRunnerCommandSpy).toHaveBeenCalledTimes(1)
        expect(runRunnerCommandSpy.mock.calls[0][0]).toMatchObject({
          subcommand: 'sync-saves',
          '--accept-path': true
        })

        // (d) write-through control, AFTER the call.
        const onDisk = JSON.parse(
          readFileSync(installedJsonPath, 'utf-8')
        ) as Record<string, InstalledJsonFixtureEntry>
        expect(onDisk[APP_NAME].save_path).toBe(NEW_SENTINEL)

        // THE ASSERTION UNDER TEST. Without the fix this is `''` (the `if (!new_save_path)`
        // logError branch fires because the unrefreshed map still holds `null`).
        expect(result).toBe(NEW_SENTINEL)
      }
    )

    it(
      'STALE arm: first call resolves to the fresh path, not the old one (installed.json/map ' +
        'start with a non-empty OLD sentinel -- rules out "presence" alone as the signal)',
      async () => {
        // (a) sentinel-distinctness guard.
        expect(OLD_SENTINEL).not.toBe(NEW_SENTINEL)
        expect(NEW_SENTINEL).not.toBe('')

        const runRunnerCommandSpy = seedArm(OLD_SENTINEL)

        // (b) trap guard, BEFORE the call under test.
        const preCallInfo = manager.getGameInfo(APP_NAME, true)
        expect(preCallInfo).toBeDefined()
        expect(preCallInfo!.title).toBe('Phoenix Point')
        expect(preCallInfo!.is_installed).toBe(true)

        const result = await getDefaultSavePath(APP_NAME, 'legendary', [])

        // (c) stub-was-called assertion, AFTER the call.
        expect(runRunnerCommandSpy).toHaveBeenCalledTimes(1)
        expect(runRunnerCommandSpy.mock.calls[0][0]).toMatchObject({
          subcommand: 'sync-saves',
          '--accept-path': true
        })

        // (d) write-through control, AFTER the call.
        const onDisk = JSON.parse(
          readFileSync(installedJsonPath, 'utf-8')
        ) as Record<string, InstalledJsonFixtureEntry>
        expect(onDisk[APP_NAME].save_path).toBe(NEW_SENTINEL)

        // THE ASSERTION UNDER TEST. Without the fix this is `OLD_SENTINEL` (a present-but-wrong
        // value slips past the `if (!new_save_path)` guard).
        expect(result).toBe(NEW_SENTINEL)
      }
    )
  }
)
