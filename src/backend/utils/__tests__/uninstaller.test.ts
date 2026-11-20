/**
 * quick 261026-avw: removeFixFile covers Steam and only ever removes the
 * downloaded `<app>-<store>.json` direct child of fixesPath.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'

const paths = createTestAppPaths(
  join(tmpdir(), `gamelib-uninstaller-test-${process.pid}`)
)
const { fixesPath, gamesConfigPath, localFixesPath } = paths

jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/utils/gameTitle', () => ({ resolveGameTitle: jest.fn() }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('i18next', () => ({ t: jest.fn((_k: string, d: string) => d) }))

import { removeFixFile, uninstallGameCallback } from '../uninstaller'
import { notify } from 'backend/dialog/dialog'
import { logInfo } from 'backend/logger'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import { fakeSafetyRustInvoke } from 'backend/testUtils/fakeSafetyRust'
import type { RequestRustInvoke } from 'backend/host'
// The managers arrive by deps now: a plain map the tests fill in per case.
const libraryManagerMap = {} as Record<string, unknown>
// Phase 82 (D-14): the guard talks to Rust through deps.requestRustInvoke; this default answers
// `yes`, the safety describe below swaps in its own transports.
const deps = {
  libraryManagers: libraryManagerMap,
  paths,
  sendFrontendMessage: jest.fn(),
  config: {
    getSettings: () => ({ defaultInstallPath: '', sharedWinePrefix: '' })
  },
  requestRustInvoke: fakeSafetyRustInvoke().requestRustInvoke
} as unknown as Parameters<typeof uninstallGameCallback>[0]
import { sendGameStatusUpdate } from 'backend/utils'

/** A library manager double; every manager must list its games, the guard reads them all. */
const manager = (
  uninstall: jest.Mock,
  getSettings: jest.Mock,
  games: unknown[] = []
) => ({
  getGame: () => ({ uninstall, getSettings }),
  getListOfGames: () => games
})

const infoText = () =>
  (logInfo as jest.Mock).mock.calls
    .flat()
    .map((a) => String(a))
    .join('\n')

beforeEach(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
  mkdirSync(localFixesPath, { recursive: true })
})

afterAll(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
})

describe('removeFixFile', () => {
  it.each([
    ['284100', 'steam', 'steam'],
    ['1207658930', 'gog', 'gog']
  ] as const)('deletes the downloaded %s file only', (app, runner, store) => {
    const downloaded = join(fixesPath, `${app}-${store}.json`)
    const local = join(localFixesPath, `${app}-${store}.json`)
    const profile = join(fixesPath, `${app}-${store}.profile.json`)
    writeFileSync(downloaded, '{}')
    writeFileSync(local, '{}')
    writeFileSync(profile, '{}')

    removeFixFile(deps, app, runner)

    expect(existsSync(downloaded)).toBe(false)
    expect(existsSync(local)).toBe(true)
    expect(existsSync(profile)).toBe(true)
  })

  it('sideload deletes nothing and does not throw', () => {
    const stray = join(fixesPath, 'x-undefined.json')
    writeFileSync(stray, '{}')
    expect(() => removeFixFile(deps, 'x', 'sideload')).not.toThrow()
    expect(existsSync(stray)).toBe(true)
  })

  it('a missing file does not throw', () => {
    expect(() => removeFixFile(deps, 'nope', 'steam')).not.toThrow()
  })
})

describe('uninstallGameCallback refusal (quick 261107-td5)', () => {
  const APP = '264160'
  const getSettings = jest.fn()
  const uninstall = jest.fn()

  const setup = () => {
    mkdirSync(gamesConfigPath, { recursive: true })
    const settings = join(gamesConfigPath, `${APP}.json`)
    const fix = join(fixesPath, `${APP}-steam.json`)
    writeFileSync(settings, '{}')
    writeFileSync(fix, '{}')
    return { settings, fix }
  }
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[1].status)

  beforeEach(() => {
    jest.clearAllMocks()
    libraryManagerMap.steam = manager(uninstall, getSettings)
  })

  it('a refused uninstall keeps settings, prefix and fix file, sends done, no notify', async () => {
    const { settings, fix } = setup()
    uninstall.mockResolvedValue({
      stdout: '',
      stderr: 'Refused: sentinel-reason',
      refused: true
    })

    await uninstallGameCallback(deps, {} as any, APP, 'steam', true, true)

    expect(existsSync(settings)).toBe(true)
    expect(existsSync(fix)).toBe(true)
    expect(getSettings).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(statuses()).toEqual(['uninstalling', 'done'])
    // quick 261110-uog: the stderr text never reaches logInfo
    expect(infoText()).not.toContain('sentinel-reason')
    expect(infoText()).toContain('Uninstall refused; keeping settings')
  })

  it('an unflagged success still cleans up and sends no done for steam', async () => {
    const { settings, fix } = setup()
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    getSettings.mockResolvedValue({ winePrefix: join(gamesConfigPath, 'nope') })

    await uninstallGameCallback(deps, {} as any, APP, 'steam', false, true)

    expect(existsSync(settings)).toBe(false)
    expect(existsSync(fix)).toBe(false)
    expect(statuses()).toEqual(['uninstalling'])
  })

  // quick 261112-90h: a bottle-eligible Steam title's winePrefix is the shared
  // CrossOver Steam bottle; an uninstall must never delete it.
  it('steam never removes a prefix even when shouldRemovePrefix is true', async () => {
    const { settings } = setup()
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    getSettings.mockResolvedValue({ winePrefix: join(gamesConfigPath, 'nope') })

    await uninstallGameCallback(deps, {} as any, APP, 'steam', true, true)

    expect(getSettings).not.toHaveBeenCalled()
    expect(existsSync(settings)).toBe(false)
  })

  it('a non-steam runner still removes its prefix when asked', async () => {
    setup()
    libraryManagerMap.legendary = manager(uninstall, getSettings)
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    getSettings.mockResolvedValue({ winePrefix: join(gamesConfigPath, 'nope') })

    await uninstallGameCallback(deps, {} as any, APP, 'legendary', true, true)

    expect(getSettings).toHaveBeenCalled()
  })

  it('a throwing uninstall still raises the generic error notify', async () => {
    const { settings } = setup()
    uninstall.mockRejectedValue(new Error('boom'))

    await uninstallGameCallback(deps, {} as any, APP, 'steam', false, true)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(existsSync(settings)).toBe(true)
  })
})

describe('uninstallGameCallback failure (quick 261108-anw)', () => {
  const APP = '264160'
  const getSettings = jest.fn()
  const uninstall = jest.fn()
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[1].status)

  beforeEach(() => {
    jest.clearAllMocks()
    libraryManagerMap.steam = manager(uninstall, getSettings)
    libraryManagerMap.legendary = manager(uninstall, getSettings)
  })

  it.each(['steam', 'legendary'] as const)(
    'a failed %s uninstall keeps settings and fix file, one done, no notify',
    async (runner) => {
      mkdirSync(gamesConfigPath, { recursive: true })
      const settings = join(gamesConfigPath, `${APP}.json`)
      const fix = join(
        fixesPath,
        `${APP}-${runner === 'steam' ? 'steam' : 'epic'}.json`
      )
      writeFileSync(settings, '{}')
      writeFileSync(fix, '{}')
      // Phase 82: a non-steam runner's prefix is read for the pre-flight check, but a failed
      // uninstall must leave the prefix on disk.
      const prefix = join(gamesConfigPath, 'failed-prefix')
      mkdirSync(join(prefix, 'drive_c'), { recursive: true })
      getSettings.mockResolvedValue({ winePrefix: prefix })
      uninstall.mockResolvedValue({
        stdout: '',
        stderr: 'Failed to remove x',
        failed: true
      })

      await uninstallGameCallback(deps, {} as any, APP, runner, true, true)

      expect(existsSync(settings)).toBe(true)
      expect(existsSync(fix)).toBe(true)
      expect(existsSync(prefix)).toBe(true)
      if (runner === 'steam') expect(getSettings).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
      expect(statuses()).toEqual(['uninstalling', 'done'])
      // quick 261110-uog: the stderr text never reaches logInfo
      expect(infoText()).not.toContain('Failed to remove x')
      expect(infoText()).toContain('Uninstall failed; keeping settings')
    }
  )
})

// Phase 82 (FND-02, D-10/D-11/D-12/D-14): the prefix delete goes through the Rust guard, checked
// BEFORE the install is uninstalled. Real tmp dirs, an injected transport, no module mocked.
describe('uninstallGameCallback prefix guard (82-07)', () => {
  const APP = 'abc123'
  const getSettings = jest.fn()
  const uninstall = jest.fn()
  const prefixRoot = join(tmpdir(), `gamelib-uninstaller-prefix-${process.pid}`)
  const prefix = join(prefixRoot, 'pfx-game')
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[1].status)
  const notices = () =>
    (deps.sendFrontendMessage as jest.Mock).mock.calls
      .filter((c) => c[0] === 'removalRefusedNotice')
      .map((c) => c[1])
  const withRust = (requestRustInvoke: RequestRustInvoke) =>
    ({ ...deps, requestRustInvoke }) as typeof deps

  beforeEach(() => {
    jest.clearAllMocks()
    rmSync(prefixRoot, { recursive: true, force: true })
    mkdirSync(join(prefix, 'drive_c'), { recursive: true })
    getSettings.mockResolvedValue({ winePrefix: prefix })
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    ;(resolveGameTitle as jest.Mock).mockImplementation(
      (_m: unknown, _r: string, app: string) =>
        app === 'other' ? 'Other Game' : 'Test Game'
    )
    libraryManagerMap.legendary = manager(uninstall, getSettings)
    libraryManagerMap.nile = manager(uninstall, getSettings)
    libraryManagerMap.gog = manager(uninstall, getSettings)
  })

  afterAll(() => {
    rmSync(prefixRoot, { recursive: true, force: true })
  })

  it('rejects when the check rejects: nothing uninstalled, prefix kept, notice and done sent', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      true,
      true
    )

    expect(uninstall).not.toHaveBeenCalled()
    expect(existsSync(prefix)).toBe(true)
    expect(notices()).toEqual([
      {
        kind: 'uninstall',
        outcome: 'refused',
        reason: 'rust-invoke-failed',
        title: 'Test Game',
        appName: APP,
        runner: 'legendary'
      }
    ])
    expect(statuses()).toEqual(['uninstalling', 'done'])
    expect(notify).not.toHaveBeenCalled()
  })

  it('a no verdict naming a nested install carries the other game title', async () => {
    const inner = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'nested-known-install'
    }).requestRustInvoke
    const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
      const reply = (await inner(channel, args)) as {
        items: Record<string, unknown>[]
      }
      return {
        ...reply,
        items: reply.items.map((i) => ({ ...i, otherKey: 'gog:other' }))
      }
    }

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      true,
      false
    )

    expect(uninstall).not.toHaveBeenCalled()
    expect(existsSync(prefix)).toBe(true)
    expect(notices()).toHaveLength(1)
    expect(notices()[0]).toMatchObject({
      kind: 'uninstall',
      outcome: 'refused',
      reason: 'nested-known-install',
      otherTitle: 'Other Game'
    })
  })

  it('a yes verdict uninstalls, then removes the prefix before the done status', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()
    const order: string[] = []
    uninstall.mockImplementation(() => {
      order.push('uninstall')
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      true,
      false
    )

    expect(order).toEqual(['uninstall'])
    expect(existsSync(prefix)).toBe(false)
    expect(notices()).toEqual([])
    expect(statuses()).toEqual(['uninstalling', 'done'])
    // pre-flight check, then the guarded delete's own check and remove
    expect(calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'safety_check_removal',
      'safety_remove_tree'
    ])
  })

  it('a prefix delete refused after the uninstall pushes remove-prefix and still sends done', async () => {
    const yes = fakeSafetyRustInvoke()
    const no = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'not-a-prefix'
    })
    let checks = 0
    const requestRustInvoke: RequestRustInvoke = (channel, args) =>
      channel === 'safety_check_removal' && checks++ > 0
        ? no.requestRustInvoke(channel, args)
        : yes.requestRustInvoke(channel, args)

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      true,
      false
    )

    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(existsSync(prefix)).toBe(true)
    expect(notices()).toEqual([
      {
        kind: 'remove-prefix',
        outcome: 'refused',
        reason: 'not-a-prefix',
        title: 'Test Game',
        appName: APP,
        runner: 'legendary'
      }
    ])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('a prefix delete that rejects after the uninstall reports failed, never "refused"', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      true,
      false
    )

    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'remove-prefix',
        outcome: 'failed',
        reason: 'rust-invoke-failed'
      })
    ])
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('a refused uninstall changes nothing, so a second click gives the same verdict', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })
    const guarded = withRust(requestRustInvoke)

    await uninstallGameCallback(
      guarded,
      {} as any,
      APP,
      'legendary',
      true,
      true
    )
    const first = notices()
    await uninstallGameCallback(
      guarded,
      {} as any,
      APP,
      'legendary',
      true,
      true
    )

    expect(notices()).toEqual([...first, ...first])
    expect(uninstall).not.toHaveBeenCalled()
    expect(existsSync(prefix)).toBe(true)
    expect(statuses()).toEqual(['uninstalling', 'done', 'uninstalling', 'done'])
  })

  it.each(['legendary', 'nile'] as const)(
    '%s goes through the same prefix guard (rejection keeps the prefix)',
    async (runner) => {
      const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })

      await uninstallGameCallback(
        withRust(requestRustInvoke),
        {} as any,
        APP,
        runner,
        true,
        true
      )

      expect(uninstall).not.toHaveBeenCalled()
      expect(existsSync(prefix)).toBe(true)
      expect(notices()).toEqual([
        expect.objectContaining({ kind: 'uninstall', runner })
      ])
    }
  )

  it('shouldRemovePrefix false never asks Rust about a prefix', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      rejectCheck: true
    })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      APP,
      'legendary',
      false,
      false
    )

    expect(calls).toEqual([])
    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(existsSync(prefix)).toBe(true)
  })
})
