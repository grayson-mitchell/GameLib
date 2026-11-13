/**
 * Sidecar exit contract: detectSteamUpdates leaves no timer behind, on a fast answer or a hang.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createSteamUpdateStateCache,
  detectSteamUpdates,
  type SteamUpdateDeps
} from '../updateDetection'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../bridgeBottle', () => ({
  findBridgeInstallBottle: jest.fn(() => 'b')
}))
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: () =>
    (globalThis as { __exitDir?: string }).__exitDir as string
}))
jest.mock('../steamClientProcess', () => ({
  listSteamClientPids: jest.fn()
}))

const timeouts = () =>
  process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length

describe('detectSteamUpdates exit contract', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'updexit-'))
    mkdirSync(dir, { recursive: true })
    ;(globalThis as { __exitDir?: string }).__exitDir = dir
    writeFileSync(
      join(dir, 'appmanifest_101.acf'),
      '"AppState"\n{\n"buildid" "1"\n}\n'
    )
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const make = (getProductInfo: () => Promise<unknown>) =>
    ({
      config: { getSettings: () => ({ defaultSteamPath: dir }) },
      paths: { userHome: dir },
      steamSession: {
        libraryState: { library: new Map([['101', { is_installed: true }]]) }
      },
      anonymousClient: { get: () => Promise.resolve({ getProductInfo }) },
      runner: { run: jest.fn() },
      steamInstallRuntime: { updateStates: createSteamUpdateStateCache() }
    }) as unknown as SteamUpdateDeps

  it('leaves no timer after a fast answer', async () => {
    const before = timeouts()
    const deps = make(
      () =>
        new Promise((r) =>
          setTimeout(
            () =>
              r({
                apps: {
                  101: {
                    appinfo: {
                      depots: { branches: { public: { buildid: '2' } } }
                    }
                  }
                }
              }),
            10
          )
        )
    )
    const r = await detectSteamUpdates(deps)
    expect(r[0]?.state).toBe('stale')
    expect(timeouts()).toBeLessThanOrEqual(before)
  })

  it('leaves no timer after a hang times out', async () => {
    const before = timeouts()
    const r = await detectSteamUpdates(
      make(() => new Promise(() => undefined)),
      { timeoutMs: 50 }
    )
    expect(r[0]?.reason).toBe('pics-timeout')
    expect(timeouts()).toBeLessThanOrEqual(before)
  })
})
