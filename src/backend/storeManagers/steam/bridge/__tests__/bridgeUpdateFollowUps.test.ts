/**
 * 74-07: bridge update follow-ups. placeShimForGame is replaced by a fake that
 * runs the REAL backupOriginalBeforeOverwrite and then writes shim bytes, so
 * the handover (new genuine DLL -> .gamelib-orig, shim restored) is pinned
 * against the real backup rule on a real tmp tree.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isSteamApiDllPath,
  runBridgeUpdateFollowUps
} from '../bridgeUpdateFollowUps'
import { backupOriginalBeforeOverwrite } from '../shimOriginals'
import { placeShimForGame } from '../shimGenerate'
import { resolveBridgeLaunchExe } from '../launchTarget'
import { prefetchBridgeDrmDownloads } from '../../gameLaunch'
import { resolveInstallEngineSettings } from '../../gameInstallBridge'
import { removePerGameBridgeBottle } from '../../bridgeBottleLifecycle'
import type SteamGame from '../../games'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../shimGenerate', () => ({ placeShimForGame: jest.fn() }))
jest.mock('../launchTarget', () => ({ resolveBridgeLaunchExe: jest.fn() }))
jest.mock('../bridgeVerdict', () => ({
  writeBridgeScanVerdict: jest.fn(),
  setBridgeSteamApiPrescreen: jest.fn()
}))
jest.mock('../../bridgeInstallState', () => ({
  persistBridgeDrmSignal: jest.fn(),
  reconcileBridgePrescreen: jest.fn(),
  resolveBridgeGameInstallRoot: jest.fn()
}))
jest.mock('../../gameLaunch', () => ({
  prefetchBridgeDrmDownloads: jest.fn()
}))
jest.mock('../../gameInstallBridge', () => ({
  resolveInstallEngineSettings: jest.fn(),
  // The real owner of the logon-permitted redist run, routed to this file's deps mock.
  // A plain function, not jest.fn: resetMocks would wipe a mock implementation.
  installSharedRedistsWithLogon: (game: SteamGame, settings: unknown) =>
    game.deps.bridgeRuntime.sharedRedist.installSteamBridgeSharedRedists(
      game.deps,
      game.appId,
      settings as never,
      undefined,
      { allowLogon: true }
    )
}))
jest.mock('../../bridgeBottleLifecycle', () => ({
  removePerGameBridgeBottle: jest.fn()
}))

const SHIM = Buffer.from('xxGameLibSteamBridgeShim/2xx')
const installRedists = jest.fn()
const markFailed = jest.fn()

function makeGame(): SteamGame {
  return {
    appId: '123',
    deps: {
      paths: { userHome: '/h' },
      steamSession: {
        gameSession: { markBridgeFailedThisSession: markFailed }
      },
      bridgeRuntime: {
        sharedRedist: { installSteamBridgeSharedRedists: installRedists }
      }
    }
  } as unknown as SteamGame
}

describe('isSteamApiDllPath', () => {
  it.each([
    ['Game\\Binaries\\Win64\\steam_api64.dll', true],
    ['STEAM_API.DLL', true],
    ['steam_api64.dll.gamelib-orig', false],
    ['steam_api64.dll.bak', false]
  ])('%s -> %s', (p, expected) => {
    expect(isSteamApiDllPath(p)).toBe(expected)
  })
})

describe('runBridgeUpdateFollowUps', () => {
  let root: string
  let dll: string
  let exe: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bridge-followups-'))
    mkdirSync(join(root, 'game'), { recursive: true })
    dll = join(root, 'game', 'steam_api64.dll')
    exe = join(root, 'game', 'game.exe')
    writeFileSync(exe, 'exe')
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(exe)
    ;(placeShimForGame as jest.Mock).mockImplementation(() => {
      const r = backupOriginalBeforeOverwrite(root, dll, '123')
      if (!r.ok) return Promise.resolve({ status: 'error', error: r.error })
      writeFileSync(dll, SHIM)
      return Promise.resolve({ status: 'placed', shimPath: dll })
    })
    ;(resolveInstallEngineSettings as jest.Mock).mockResolvedValue({
      settings: {}
    })
    installRedists.mockResolvedValue(undefined)
    ;(prefetchBridgeDrmDownloads as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('hands the new genuine DLL to .gamelib-orig and restores the shim', async () => {
    writeFileSync(dll, 'new genuine')
    writeFileSync(dll + '.gamelib-orig', 'old genuine')
    const report = await runBridgeUpdateFollowUps(makeGame(), {
      changedPaths: ['game/steam_api64.dll'],
      fullReconcile: false,
      bridgeBottleName: 'B'
    })
    expect(readFileSync(dll + '.gamelib-orig', 'utf8')).toBe('new genuine')
    expect(readFileSync(dll)).toEqual(SHIM)
    expect(report.shimTouched).toBe(true)
  })

  it('leaves the shim and backup byte-identical when the DLL was untouched', async () => {
    writeFileSync(dll, SHIM)
    writeFileSync(dll + '.gamelib-orig', 'old genuine')
    const report = await runBridgeUpdateFollowUps(makeGame(), {
      changedPaths: ['game/game.exe'],
      fullReconcile: false,
      bridgeBottleName: 'B'
    })
    expect(readFileSync(dll)).toEqual(SHIM)
    expect(readFileSync(dll + '.gamelib-orig', 'utf8')).toBe('old genuine')
    expect(report.shimTouched).toBe(false)
  })

  it('treats a full reconcile as shim-touched and hands over', async () => {
    writeFileSync(dll, 'new genuine')
    writeFileSync(dll + '.gamelib-orig', 'old genuine')
    const report = await runBridgeUpdateFollowUps(makeGame(), {
      changedPaths: [],
      fullReconcile: true,
      bridgeBottleName: 'B'
    })
    expect(readFileSync(dll + '.gamelib-orig', 'utf8')).toBe('new genuine')
    expect(report.shimTouched).toBe(true)
  })

  it('attempts every step when one throws and never removes the bottle', async () => {
    writeFileSync(dll, SHIM)
    installRedists.mockRejectedValue(new Error('redist boom'))
    const report = await runBridgeUpdateFollowUps(makeGame(), {
      changedPaths: [],
      fullReconcile: false,
      bridgeBottleName: 'B'
    })
    expect(report.errors).toHaveLength(1)
    expect(prefetchBridgeDrmDownloads).toHaveBeenCalled()
    expect(report.drmPrefetched).toBe(true)
    expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
    expect(markFailed).not.toHaveBeenCalled()
  })

  it('records an error and skips the shim when no launch exe resolves', async () => {
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(null)
    const report = await runBridgeUpdateFollowUps(makeGame(), {
      changedPaths: [],
      fullReconcile: false,
      bridgeBottleName: 'B'
    })
    expect(report.exePath).toBeNull()
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(report.errors.length).toBeGreaterThan(0)
  })
})
