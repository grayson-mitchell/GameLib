/**
 * Phase 79 (T-79-62/63, D-10): the boot steamcm_configure call and the engine-selected owed-goonline
 * boot cover, plus the step ordering that keeps configure ahead of the restore.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, k) => String(k) })
}))

type Boot = typeof import('../bootstrap')

function load(): Boot {
  let m: Boot | undefined
  jest.isolateModules(() => {
    m = require('../bootstrap') as Boot
  })
  return m as Boot
}

describe('boot steamcm wiring', () => {
  const prev = process.env.GAMELIB_STEAMCM_CM
  afterEach(() => {
    if (prev === undefined) delete process.env.GAMELIB_STEAMCM_CM
    else process.env.GAMELIB_STEAMCM_CM = prev
  })

  it('orders steamcm-configure before mac-steam-online-restore and after rpc-server', () => {
    const { BOOT_STEP_NAMES } = load() as unknown as {
      BOOT_STEP_NAMES: readonly string[]
    }
    const at = (n: string) => BOOT_STEP_NAMES.indexOf(n)
    expect(at('steamcm-configure')).toBeGreaterThan(at('rpc-server'))
    expect(at('steamcm-configure')).toBeLessThan(at('mac-steam-online-restore'))
  })

  it('configureSteamCm sends the app folder and swallows a rejection', async () => {
    const { configureSteamCm } = load()
    const req = jest.fn().mockResolvedValue({})
    configureSteamCm({ appFolder: '/app', requestRustInvoke: req })
    expect(req).toHaveBeenCalledWith('steamcm_configure', [
      { appFolder: '/app' }
    ])
    const bad = jest.fn().mockRejectedValue(new Error('boom'))
    expect(() =>
      configureSteamCm({ appFolder: '/app', requestRustInvoke: bad })
    ).not.toThrow()
    await Promise.resolve()
  })

  it('cm=rust pays the owed record through Rust, not the ts restore', () => {
    process.env.GAMELIB_STEAMCM_CM = 'rust'
    const { restoreOwedMacSteamOnlineAtBoot } = load()
    const req = jest.fn().mockResolvedValue({})
    const restoreTs = jest.fn()
    restoreOwedMacSteamOnlineAtBoot({ requestRustInvoke: req, restoreTs })
    expect(req).toHaveBeenCalledWith('steamcm_wrap_restore_if_owed', [
      { trigger: 'boot' }
    ])
    expect(restoreTs).not.toHaveBeenCalled()
  })

  it('cm=ts runs the ts restore and sends no IPC', () => {
    process.env.GAMELIB_STEAMCM_CM = 'ts'
    const { restoreOwedMacSteamOnlineAtBoot } = load()
    const req = jest.fn()
    const restoreTs = jest.fn()
    restoreOwedMacSteamOnlineAtBoot({ requestRustInvoke: req, restoreTs })
    expect(restoreTs).toHaveBeenCalledTimes(1)
    expect(req).not.toHaveBeenCalled()
  })

  it('a rejected rust restore is swallowed', async () => {
    process.env.GAMELIB_STEAMCM_CM = 'rust'
    const { restoreOwedMacSteamOnlineAtBoot } = load()
    const req = jest.fn().mockRejectedValue(new Error('boom'))
    expect(() =>
      restoreOwedMacSteamOnlineAtBoot({
        requestRustInvoke: req,
        restoreTs: jest.fn()
      })
    ).not.toThrow()
    await Promise.resolve()
  })

  it('the source names each channel once', () => {
    const src = readFileSync(join(__dirname, '../bootstrap.ts'), 'utf-8')
    expect(src.match(/RUST_STEAMCM_CONFIGURE/g)).toHaveLength(2) // import + use
    expect(src.match(/RUST_STEAMCM_WRAP_RESTORE_IF_OWED/g)).toHaveLength(2)
  })
})
