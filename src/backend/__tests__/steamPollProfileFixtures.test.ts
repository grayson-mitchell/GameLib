/**
 * Fixtures the Rust gamelib-steampoll crate (plan 80-07) asserts against: where the sidecar keeps
 * userData / config.json / the steam_restart_hold store on each OS, and the exact file the real
 * CacheStore writes for two restart-hold records. Rust derives the same paths before the sidecar
 * exists, and reads and writes the same file layout (D-16 dual-readable).
 *
 * Regenerate (deliberately, then review the diff):
 *   UPDATE_STEAMPOLL_GOLDENS=1 pnpm exec jest src/backend/__tests__/steamPollProfileFixtures.test.ts
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import CacheStore from '../cache'
import { createStoreRoot } from '../stores/storeRoot'
import { recordSteamRestartHold } from '../storeManagers/steam/steamRestartHold'
import type { AppPathRoots } from '../process/appPaths'

const UPDATE = process.env.UPDATE_STEAMPOLL_GOLDENS === '1'
const FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-steampoll',
  'tests',
  'fixtures'
)
const PATHS_FILE = join(FIXTURES, 'profile', 'app-paths.json')
const HOLD_FILE = join(FIXTURES, 'restart_hold', 'ts-written.json')

interface PathCase {
  platform: 'darwin' | 'win32' | 'linux'
  home: string
  env: Record<string, string>
}

const CASES: PathCase[] = [
  { platform: 'darwin', home: '/Users/gamer', env: {} },
  {
    platform: 'win32',
    home: 'C:\\Users\\gamer',
    env: { APPDATA: 'D:\\Roaming' }
  },
  { platform: 'win32', home: 'C:\\Users\\gamer', env: {} },
  { platform: 'linux', home: '/home/gamer', env: {} },
  {
    platform: 'linux',
    home: '/home/gamer',
    env: { XDG_CONFIG_HOME: '/data/xdg' }
  }
]

/** The real createAppPaths pieces, run with the target platform's path module. */
function derive(c: PathCase) {
  let out:
    | { userData: string; configPath: string; restartHoldStorePath: string }
    | undefined
  jest.isolateModules(() => {
    const nodePath = jest.requireActual<typeof import('path')>('path')
    const flavour = c.platform === 'win32' ? nodePath.win32 : nodePath.posix
    jest.doMock('path', () => flavour)
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../process/appPaths') as typeof import('../process/appPaths')
    const appData = mod.resolveAppDataDir(
      c.platform,
      c.env as NodeJS.ProcessEnv,
      c.home
    )
    const roots: AppPathRoots = {
      appData,
      configRoot: appData,
      home: c.home,
      userHome: c.home,
      flatpakHome: c.home,
      appRoot: '/R',
      assetDir: 'public',
      arch: 'x64',
      tempDir: '/T'
    }
    const p = mod.derivePaths(roots)
    out = {
      userData: p.userData,
      configPath: p.configPath,
      // fileStore.resolveStorePath: <userData>/store_cache/<name>.json
      restartHoldStorePath: flavour.join(
        p.userData,
        'store_cache',
        'steam_restart_hold.json'
      )
    }
    jest.dontMock('path')
  })
  if (!out) throw new Error('derive failed')
  return out
}

/** Compares parsed JSON, so prettier may reformat the checked-in fixture. */
function compareOrWrite(file: string, value: unknown) {
  if (UPDATE) {
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
    return
  }
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(value)
}

describe('steampoll profile fixtures', () => {
  let tmp: string
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'steampoll-profile-'))
  })
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  test('app-paths.json matches createAppPaths on all three platforms', () => {
    const rows = CASES.map((c) => ({
      platform: c.platform,
      home: c.home,
      env: c.env,
      ...derive(c)
    }))
    compareOrWrite(PATHS_FILE, rows)
  })

  test('ts-written.json is what the real CacheStore writes for two hold records', () => {
    const root = createStoreRoot({ userData: tmp })
    const store = new CacheStore<unknown>('steam_restart_hold', null, {
      root,
      kind: 'user-state'
    })
    recordSteamRestartHold(
      '43160',
      {
        pids: [{ pid: 4242, startToken: 'Mon Nov 16 09:12:03 2026' }],
        recordedAt: 1_700_000_000_000,
        macNativeRoute: true,
        skippedDepots: ['43161']
      },
      store as never
    )
    recordSteamRestartHold(
      '238320',
      {
        pids: [
          { pid: 77, startToken: '638000000000000000' },
          { pid: 78, startToken: '638000000000000001' }
        ],
        recordedAt: 1_700_000_100_000,
        macNativeRoute: false,
        skippedDepots: []
      },
      store as never
    )
    const written = JSON.parse(
      readFileSync(join(tmp, 'store_cache', 'steam_restart_hold.json'), 'utf8')
    ) as Record<string, unknown>
    // Timestamps are wall-clock text: pin them so the fixture is stable.
    const ts = written.__timestamp as Record<string, unknown> | undefined
    if (ts)
      for (const k of Object.keys(ts))
        ts[k] = 'Mon Nov 16 2026 09:12:03 GMT+0000 (UTC)'
    compareOrWrite(HOLD_FILE, written)
  })
})
