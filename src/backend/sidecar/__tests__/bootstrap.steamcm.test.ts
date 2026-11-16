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
type Logger = typeof import('backend/logger')

/** Loads bootstrap in a fresh registry; `logWarning` is that registry's mock, the one it calls. */
function load(): Boot & { logWarning: jest.Mock } {
  let m: Boot | undefined
  let logger: Logger | undefined
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    m = require('../bootstrap') as Boot
    logger = require('backend/logger') as Logger
    /* eslint-enable @typescript-eslint/no-require-imports */
  })
  return Object.assign(Object.create(m as Boot) as Boot, {
    logWarning: (logger as Logger).logWarning as jest.Mock
  })
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('boot steamcm wiring', () => {
  it('orders steamcm-configure before mac-steam-online-restore and after rpc-server', () => {
    const { BOOT_STEP_NAMES } = load() as unknown as {
      BOOT_STEP_NAMES: readonly string[]
    }
    const at = (n: string) => BOOT_STEP_NAMES.indexOf(n)
    expect(at('steamcm-configure')).toBeGreaterThan(at('rpc-server'))
    expect(at('steamcm-configure')).toBeLessThan(at('mac-steam-online-restore'))
  })

  it('configureSteamCm sends the app folder and reports success', async () => {
    const { configureSteamCm, logWarning } = load()
    const req = jest.fn().mockResolvedValue({})
    await expect(
      configureSteamCm({ appFolder: '/app', requestRustInvoke: req })
    ).resolves.toBe(true)
    expect(req).toHaveBeenCalledWith('steamcm_configure', [
      { appFolder: '/app' }
    ])
    expect(logWarning).not.toHaveBeenCalled()
  })

  // C2/WR-06: the old `expect(() => ...).not.toThrow()` passed for any promise-returning function.
  // These await the promise and assert the warning, so removing the rejection handler fails them.
  it('configureSteamCm swallows a rejection: resolves false and logs a warning', async () => {
    const { configureSteamCm, logWarning } = load()
    const bad = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(
      configureSteamCm({ appFolder: '/app', requestRustInvoke: bad })
    ).resolves.toBe(false)
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('steamcm_configure failed'),
      expect.anything()
    )
  })

  it('configureSteamCm swallows a synchronous throw from the transport', async () => {
    const { configureSteamCm, logWarning } = load()
    const throws = jest.fn(() => {
      throw new Error('boom')
    })
    await expect(
      configureSteamCm({ appFolder: '/app', requestRustInvoke: throws })
    ).resolves.toBe(false)
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('pays the owed record through Rust', async () => {
    const { restoreOwedMacSteamOnlineAtBoot } = load()
    const req = jest.fn().mockResolvedValue({})
    restoreOwedMacSteamOnlineAtBoot({ requestRustInvoke: req })
    await new Promise((resolve) => setImmediate(resolve))
    expect(req).toHaveBeenCalledWith('steamcm_wrap_restore_if_owed', [
      { trigger: 'boot' }
    ])
  })

  it('sends the boot restore only after configure has answered', async () => {
    // The shell runs each rustInvoke on its own thread, so the restore must not race configure.
    const { configureSteamCm, restoreOwedMacSteamOnlineAtBoot } = load()
    let answerConfigure: (value: unknown) => void = () => undefined
    const req = jest.fn((channel: string) =>
      channel === 'steamcm_configure'
        ? new Promise((resolve) => {
            answerConfigure = resolve
          })
        : Promise.resolve({})
    )
    const configured = configureSteamCm({
      appFolder: '/app',
      requestRustInvoke: req
    })
    restoreOwedMacSteamOnlineAtBoot({
      requestRustInvoke: req,
      configured
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(req.mock.calls.map((call) => call[0])).toEqual(['steamcm_configure'])
    answerConfigure({})
    await new Promise((resolve) => setImmediate(resolve))
    expect(req.mock.calls.map((call) => call[0])).toEqual([
      'steamcm_configure',
      'steamcm_wrap_restore_if_owed'
    ])
  })

  it('a rejected rust restore is swallowed and logged', async () => {
    const { restoreOwedMacSteamOnlineAtBoot, logWarning } = load()
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const req = jest.fn().mockRejectedValue(new Error('boom'))
      restoreOwedMacSteamOnlineAtBoot({ requestRustInvoke: req })
      await settle()
      await settle()
      expect(req).toHaveBeenCalledTimes(1)
      expect(logWarning).toHaveBeenCalledWith(
        expect.stringContaining('steamcm_wrap_restore_if_owed failed'),
        expect.anything()
      )
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('the source names each channel once', () => {
    const src = readFileSync(join(__dirname, '../bootstrap.ts'), 'utf-8')
    expect(src.match(/RUST_STEAMCM_CONFIGURE/g)).toHaveLength(2) // import + use
    expect(src.match(/RUST_STEAMCM_WRAP_RESTORE_IF_OWED/g)).toHaveLength(2)
  })
})
