/**
 * Characterisation probe — quick task 260912-qop, serving the pending todo
 * `2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`.
 *
 * CLAIM BEING MEASURED (static reading of source, turned into a repeatable desk
 * measurement here): `LegendaryLibraryManager.getGameInfo(appName, forceReload = true)`
 * does NOT re-read `installed.json`. It re-reads the *metadata* file
 * (`legendaryMetadata/<app>.json`) and merges install fields — including `save_path` —
 * from the module-scope `installedGames` map, which is rebuilt ONLY by
 * `refreshInstalled()`. `src/backend/save_sync.ts`'s `getDefaultLegendarySavePath()` runs
 * `legendary sync-saves --accept-path` (which rewrites `save_path` into `installed.json`
 * on disk) and IMMEDIATELY afterwards reads it back via `getGameInfo(appName, true)` with
 * no `refreshInstalled()` in between — so the readback can return a STALE value even
 * though the fresh one is already on disk.
 *
 * Anchors (verified at 5ded84fab, `src/backend/storeManagers/legendary/library.ts`):
 *   L58   `let installedGames: Map<string, InstalledJsonMetadata> = new Map()` (module scope)
 *   L131  `refreshInstalled()` — the ONLY writer of `installedGames`
 *   L203  `getGameInfo(appName, forceReload = false)`
 *   L485  `private loadFile(app_name)` — L557 `installedGames.get(app_name)` (the stale map)
 *   L640  `save_path` — TOP-LEVEL field on the returned `GameInfo` (not under `install`)
 *   L682  `hasGame = (appName) => allGames.has(appName)`
 * `src/backend/save_sync.ts`, `getDefaultLegendarySavePath()`:
 *   L72-85 runs `legendary sync-saves --skip-upload --skip-download --accept-path`
 *   L89-91 `const { save_path: new_save_path } = libraryManagerMap['legendary']
 *          .getGameInfo(appName, true)!` — no `refreshInstalled()` in between.
 *
 * THIS IS A CHARACTERISATION TEST, NOT A REGRESSION TEST. The "THE DEFECT" assertion below
 * is expected to be GREEN today and is expected to FLIP TO RED the day someone fixes
 * `getGameInfo`/`save_sync` (e.g. by adding a `refreshInstalled()` call before the
 * readback, or by having `getGameInfo` consult `installed.json` directly). That flip is the
 * signal this probe exists to produce — do not "fix" this test if it goes red without first
 * checking whether the underlying defect was fixed.
 *
 * UPDATE (quick 260912-rvv): the prediction above was WRONG, and this task is the proof. The
 * fix landed as a `refreshInstalled()` call inserted into `save_sync.ts` — exactly the example
 * given above — and this probe stayed GREEN, because it pins `getGameInfo` itself, which the
 * fix does not change. `getGameInfo(appName, true)` still returns whatever `installedGames`
 * currently holds; the fix's effect is that `save_sync.ts` now calls `refreshInstalled()`
 * before it reads that value, not that `getGameInfo`'s own behaviour changed. The fix's signal
 * now lives in `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts`, which drives
 * the actual `getDefaultSavePath()` call path end to end and DOES flip red without the fix. If
 * this probe ever does go red, something unintended changed in `library.ts`: STOP and
 * investigate — do not adjust this test to pass.
 *
 * OUT OF SCOPE: the 500ms `installedJsonWatcher` debounce race
 * (`src/backend/sidecar/installedJsonWatcher.ts`) is a live-timing property, not
 * desk-provable, and is not asserted here. Neither `save_sync.ts` nor `library.ts` is
 * modified by this file's existence — this plan produces a MEASUREMENT, not a fix.
 *
 * MOCK BOUNDARIES.
 *  - `../constants`      -> mint a disposable, hermetic fixture root (mkdtempSync, 0700)
 *                           instead of the operator's real `legendaryConfig`. Precedent:
 *                           `user.test.ts`'s own `jest.mock('../constants', ...)`.
 *  - `backend/logger`    -> logInfo/logError/logWarning/logDebug + LogPrefix
 *  - `../../../utils`    -> formatEpicStoreUrl/getLegendaryBin/isEpicServiceOffline/
 *                           getFileSize/axiosClient (none of these are on the call path
 *                           this probe drives except formatEpicStoreUrl/getFileSize inside
 *                           `loadFile()`; mocked so `library.ts`'s module graph resolves
 *                           without pulling in real HTTP/CLI machinery)
 *  - `../../../launcher` -> callRunner (not on the call path; needed for module resolution)
 *  - `backend/online_monitor` -> isOnline/runOnceWhenOnline (not on the call path)
 *  - `../electronStores`  -> libraryStore/installStore/gamesOverrideStore stubs (not on the
 *                           call path this probe drives)
 *  - `../user`           -> LegendaryUser (not on the call path; `../user` itself pulls in
 *                           `GlobalConfig`/`humble/loginWindowSeam` and other heavy chains)
 *  - `../games`          -> LegendaryGame (not constructed by this probe; its own import
 *                           chain pulls in `GameConfig`/`GlobalConfig`/`libraryManagerMap`)
 *  - real, UNMOCKED: `fs`/`graceful-fs` (the entire question is whether `getGameInfo`
 *    consults the file — a mocked filesystem would measure the mock, not the claim), `path`,
 *    `./thirdParty` (reads `thirdPartyInstalled` off the same mocked `../constants`; the
 *    file does not exist in the fixture root, so it returns `[]`, which is the real,
 *    intended behaviour for a game with no third-party install record),
 *    `./commands`/`./commands/base` (pure zod schemas, no side effects), `backend/schemas`,
 *    `backend/constants/environment`, `../e2eMock`/`backend/ipc`/`backend/platform`/
 *    `backend/main_window` (the sidecar Electron-replacement stub is deliberately
 *    import-safe by design — see `backend/platform/index.ts`'s own header comment).
 */

// ── ../constants mock: mint a disposable, hermetic fixture root ────────────────────────────
// A factory (not a static object) so the root is a real, unpredictable mkdtemp directory
// rather than a fixed path — the same T-qop-01 control `jest.setupContainment.ts` and
// `jest.globalSetup.js` establish for the rest of this project. `jest.requireActual` is used
// for `fs`/`path`/`os` so this factory does not accidentally consume any mock those modules
// might otherwise carry. No outer `const` is referenced here, so there is no
// temporal-dead-zone hazard under jest's `jest.mock` hoisting.
jest.mock('../constants', () => {
  const nodeFs = jest.requireActual<typeof import('fs')>('fs')
  const nodePath = jest.requireActual<typeof import('path')>('path')
  const nodeOs = jest.requireActual<typeof import('os')>('os')

  const parent = process.env.GAMELIB_JEST_RUN_ROOT ?? nodeOs.tmpdir()
  const root = nodeFs.mkdtempSync(
    nodePath.join(parent, 'gamelib-qop-legendary-')
  )
  // Not redundant despite mkdtemp requesting 0700 -- that request is masked by the
  // process umask (see jest.setupContainment.ts's docstring for the measured 0500-under-
  // umask-0277 case). This restores owner-write; mkdtemp's unpredictable suffix remains the
  // actual security control (T-qop-01).
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

// ── backend/logger mock ─────────────────────────────────────────────────────────────────────
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

// ── ../../../utils mock ──────────────────────────────────────────────────────────────────────
const mockFormatEpicStoreUrl = jest.fn(
  (title: string) => `https://store.epicgames.com/p/${title}`
)
const mockGetLegendaryBin = jest.fn((..._args: unknown[]) => ({
  dir: '/fake',
  bin: 'legendary'
}))
const mockIsEpicServiceOffline = jest.fn((..._args: unknown[]) =>
  Promise.resolve(false)
)
const mockGetFileSize = jest.fn((..._args: unknown[]) => '0.12 GB')
jest.mock('../../../utils', () => ({
  formatEpicStoreUrl: (...args: unknown[]) =>
    mockFormatEpicStoreUrl(...(args as [string])),
  getLegendaryBin: (...args: unknown[]) => mockGetLegendaryBin(...args),
  isEpicServiceOffline: (...args: unknown[]) =>
    mockIsEpicServiceOffline(...args),
  getFileSize: (...args: unknown[]) => mockGetFileSize(...args),
  axiosClient: { get: jest.fn() }
}))

// ── ../../../launcher mock ───────────────────────────────────────────────────────────────────
jest.mock('../../../launcher', () => ({
  callRunner: jest.fn()
}))

// ── backend/online_monitor mock ──────────────────────────────────────────────────────────────
const mockIsOnline = jest.fn((..._args: unknown[]) => true)
jest.mock('backend/online_monitor', () => ({
  isOnline: (...args: unknown[]) => mockIsOnline(...args),
  runOnceWhenOnline: jest.fn()
}))

// ── ../electronStores mock ───────────────────────────────────────────────────────────────────
jest.mock('../electronStores', () => ({
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

// ── ../user mock (LegendaryUser -- not on this probe's call path) ───────────────────────────
jest.mock('../user', () => ({
  LegendaryUser: {
    isLoggedIn: jest.fn(() => true),
    logout: jest.fn(),
    getUserDetails: jest.fn()
  }
}))

// ── ../games mock (LegendaryGame -- never constructed by this probe) ────────────────────────
jest.mock('../games', () => ({
  __esModule: true,
  default: class LegendaryGame {}
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────────
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import LegendaryLibraryManager from '../library'
import { legendaryConfigPath, legendaryMetadata } from '../constants'
import type {
  InstalledJsonMetadata,
  GameMetadataInner
} from 'common/types/legendary'

// Two obviously distinct, greppable sentinels -- see the sentinel-distinctness guard below.
const OLD_SENTINEL = '/qop/OLD-stale-save-path'
const NEW_SENTINEL = '/qop/NEW-fresh-save-path'

const APP_NAME = 'Iris'

/**
 * `metadata/Iris.json` fixture. Shaped to avoid ALL FIVE `loadFile()` early-return traps
 * (see the header comment's anchors): `namespace` is not `'ue'`, `categories` contains none
 * of the UE/mods category paths, `releaseInfo` is not Android/iOS-only, and the JSON is
 * valid. `Iris` / `Phoenix Point` / `Mac` is the real-world anchor this defect was filed
 * against (context doc), used here for fixture realism only -- nothing in this test reads
 * the operator's real Steam/Epic config.
 */
const metadataInner: GameMetadataInner = {
  ageGatings: {},
  applicationId: APP_NAME,
  categories: [{ path: 'games' }],
  creationDate: '2020-01-01T00:00:00.000Z',
  customAttributes: {
    CloudSaveFolder_MAC: {
      type: 'STRING',
      value: '/Users/qop/Library/Application Support/PhoenixPoint'
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

function installedJsonFixture(
  savePath: string
): Record<string, InstalledJsonMetadata> {
  return {
    [APP_NAME]: {
      app_name: APP_NAME,
      base_urls: [],
      can_run_offline: true,
      egl_guid: 'egl-guid-qop-1',
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

describe('getGameInfo(appName, forceReload=true) stale-map characterisation (quick 260912-qop)', () => {
  let manager: LegendaryLibraryManager
  let installedJsonPath: string

  beforeEach(() => {
    manager = new LegendaryLibraryManager()

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
    // Step 1 (plan): installed.json on disk starts with the OLD sentinel.
    writeFileSync(
      installedJsonPath,
      JSON.stringify(installedJsonFixture(OLD_SENTINEL))
    )

    mockIsOnline.mockReturnValue(true)
  })

  it(
    'save_path from getGameInfo(appName, true) is STALE immediately after installed.json is ' +
      'rewritten on disk, and becomes fresh only after an explicit refreshInstalled() ' +
      '(characterisation of the getDefaultLegendarySavePath() readback defect)',
    () => {
      // Guard: the two sentinels can never be trivially equal.
      expect(OLD_SENTINEL).not.toBe(NEW_SENTINEL)

      // Step 2 (plan): simulate app startup -- loadGamesInAccount() populates allGames from
      // the metadata directory, refreshInstalled() populates installedGames from disk (OLD).
      manager.loadGamesInAccount()
      manager.refreshInstalled()

      // Step 3 (plan): rewrite installed.json on disk with the NEW sentinel -- this is what
      // `legendary sync-saves --accept-path` does inside getDefaultLegendarySavePath(),
      // BEFORE the readback and with no refreshInstalled() in between (save_sync.ts L72-91).
      writeFileSync(
        installedJsonPath,
        JSON.stringify(installedJsonFixture(NEW_SENTINEL))
      )

      // WRITE-THROUGH CONTROL: the NEW value really is on disk at this point, so the
      // staleness below cannot be blamed on a fixture write that silently failed.
      const onDisk = JSON.parse(
        readFileSync(installedJsonPath, 'utf-8')
      ) as Record<string, InstalledJsonMetadata>
      expect(onDisk[APP_NAME].save_path).toBe(NEW_SENTINEL)

      // Step 4 (plan): the exact call save_sync.ts L89-91 makes.
      const staleInfo = manager.getGameInfo(APP_NAME, true)

      // TRAP GUARD (must hold first): a loadFile() early-return or a hasGame() miss would
      // yield `undefined` here, which is what stops this probe from passing for the wrong
      // reason (an empty/absent record trivially "has" the old save_path too).
      expect(staleInfo).toBeDefined()
      expect(staleInfo!.title).toBe('Phoenix Point')
      expect(staleInfo!.is_installed).toBe(true)

      // THE DEFECT (characterisation, asserted GREEN today). getGameInfo's forceReload path
      // re-reads the *metadata* file but merges install fields -- including save_path --
      // from the module-scope `installedGames` map, which nothing has refreshed since the
      // disk rewrite above. This assertion is EXPECTED TO FLIP TO RED the day someone fixes
      // getGameInfo/save_sync; that flip is the signal this probe exists to produce.
      expect(staleInfo!.save_path).toBe(OLD_SENTINEL)

      // POSITIVE CONTROL: without this arm, the "stale" assertion above would be satisfiable
      // by a probe that never wired anything up at all. After an explicit refreshInstalled(),
      // the SAME getGameInfo(appName, true) call must return the NEW save_path.
      manager.refreshInstalled()
      const freshInfo = manager.getGameInfo(APP_NAME, true)
      expect(freshInfo).toBeDefined()
      expect(freshInfo!.save_path).toBe(NEW_SENTINEL)
    }
  )
})
