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
import { logInfo, logWarning } from 'backend/logger'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import {
  fakeSafetyRustInvoke as fakeSafety,
  type FakeSafetyOptions
} from 'backend/testUtils/fakeSafetyRust'
import type { RequestRustInvoke } from 'backend/host'
import { RUST_ENGINE_BOTTLE_REMOVE_PER_GAME } from 'common/types/sidecarTransport'

/**
 * 87-70: `removePrefix` asks the crate's per-game bottle removal first. Every test that is not about that route
 * answers it the way a game with no per-game bottle of its own gets answered, so the stored-prefix path runs as before.
 */
const bottleOp =
  (reply: unknown): RequestRustInvoke =>
  async (channel) => {
    if (channel === RUST_ENGINE_BOTTLE_REMOVE_PER_GAME) return reply
    throw new Error(`unexpected channel ${channel}`)
  }
const fakeSafetyRustInvoke = (options: FakeSafetyOptions = {}) =>
  fakeSafety({ base: bottleOp({ outcome: 'not-bottle-backed' }), ...options })
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
  ] as const)(
    'deletes the downloaded %s file only',
    async (app, runner, store) => {
      const downloaded = join(fixesPath, `${app}-${store}.json`)
      const local = join(localFixesPath, `${app}-${store}.json`)
      const profile = join(fixesPath, `${app}-${store}.profile.json`)
      writeFileSync(downloaded, '{}')
      writeFileSync(local, '{}')
      writeFileSync(profile, '{}')

      await removeFixFile(deps, app, runner)

      expect(existsSync(downloaded)).toBe(false)
      expect(existsSync(local)).toBe(true)
      expect(existsSync(profile)).toBe(true)
    }
  )

  it('sideload deletes nothing and does not throw', async () => {
    const stray = join(fixesPath, 'x-undefined.json')
    writeFileSync(stray, '{}')
    await expect(removeFixFile(deps, 'x', 'sideload')).resolves.toBeUndefined()
    expect(existsSync(stray)).toBe(true)
  })

  it('a missing file does not throw', async () => {
    await expect(removeFixFile(deps, 'nope', 'steam')).resolves.toBeUndefined()
  })
})

// quick 261120-ux8: the fake transport does not enforce trust roots, so these tests prove the
// request shape and the refusal handling; the crate row in gamelib-safety's adversarial.rs
// (app_data_file_outside_its_trust_root_is_refused_and_kept) proves the real outside-trust-root
// semantics.
describe('fix-file guard (261120-ux8)', () => {
  const warnings = () =>
    (logWarning as jest.Mock).mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n')
  const removalNotices = () =>
    (deps.sendFrontendMessage as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'removalRefusedNotice'
    )
  const withRust = (requestRustInvoke: RequestRustInvoke) =>
    ({ ...deps, requestRustInvoke }) as typeof deps

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('a traversal appName sends one guarded app-data request and keeps the escaped file', async () => {
    const escaped = join(fixesPath, '..', 'escape-steam.json')
    writeFileSync(escaped, '{}')
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'outside-trust-root'
    })

    const result = await removeFixFile(
      withRust(requestRustInvoke),
      '../escape',
      'steam'
    )

    expect(existsSync(escaped)).toBe(true)
    expect(calls.map((c) => c.channel)).toEqual(['safety_check_removal'])
    const req = calls[0]?.args[0] as {
      targets: unknown[]
      knownInstalls: unknown
      protectedRoots: string[]
    }
    expect(req.targets).toMatchObject([
      { kind: 'app-data', trustRoot: fixesPath, path: escaped }
    ])
    expect(Array.isArray(req.knownInstalls)).toBe(true)
    expect(req.protectedRoots.length).toBeGreaterThan(0)
    expect(result).toMatchObject({
      outcome: 'refused',
      reason: 'outside-trust-root'
    })
    expect(warnings()).toContain(
      '[safety] remove-fix-file refused: outside-trust-root'
    )
    expect(warnings()).not.toMatch(/escape|264160|fixes/)
    expect(removalNotices()).toEqual([])
  })

  it('an injected check rejection deletes nothing', async () => {
    const fix = join(fixesPath, '264160-steam.json')
    writeFileSync(fix, '{}')
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })

    const result = await removeFixFile(
      withRust(requestRustInvoke),
      '264160',
      'steam'
    )

    expect(existsSync(fix)).toBe(true)
    expect(result).toMatchObject({
      outcome: 'refused',
      reason: 'rust-invoke-failed'
    })
    expect(warnings()).toContain(
      '[safety] remove-fix-file refused: rust-invoke-failed'
    )
    expect(warnings()).not.toMatch(/escape|264160|fixes/)
    expect(removalNotices()).toEqual([])
  })

  it('an injected remove rejection reports failed and pushes no notice', async () => {
    const fix = join(fixesPath, '264160-steam.json')
    writeFileSync(fix, '{}')
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })

    const result = await removeFixFile(
      withRust(requestRustInvoke),
      '264160',
      'steam'
    )

    expect(existsSync(fix)).toBe(true)
    expect(result).toMatchObject({
      outcome: 'failed',
      reason: 'rust-invoke-failed'
    })
    expect(warnings()).toContain(
      '[safety] remove-fix-file failed: rust-invoke-failed'
    )
    expect(removalNotices()).toEqual([])
  })

  it('no candidate file makes no safety call at all', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()

    await expect(
      removeFixFile(withRust(requestRustInvoke), '264160', 'steam')
    ).resolves.toBeUndefined()

    expect(calls).toEqual([])
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
    // pre-flight check, the per-game bottle op (not-bottle-backed), then the guarded delete's own check and remove
    expect(calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'engine_bottle_remove_per_game',
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

// quick 261120-ux8: `'../config'` resolves to `appFolder/config.json`, GameLib's own global
// settings file, which is the concrete stake of this fix. The fake transport does not enforce
// trust roots, so Test E proves the request shape and that a refusal deletes nothing.
describe('settings guard (261120-ux8)', () => {
  const getSettings = jest.fn()
  const uninstall = jest.fn()
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[1].status)
  const removalNotices = () =>
    (deps.sendFrontendMessage as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'removalRefusedNotice'
    )
  const warnings = () =>
    (logWarning as jest.Mock).mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n')
  const withRust = (requestRustInvoke: RequestRustInvoke) =>
    ({ ...deps, requestRustInvoke }) as typeof deps
  const gameFiles = (app: string) => [
    join(gamesConfigPath, `${app}.json`),
    join(gamesConfigPath, `${app}.log`),
    join(gamesConfigPath, `${app}-lastPlay.log`)
  ]
  const writeAll = (files: string[]) => {
    mkdirSync(gamesConfigPath, { recursive: true })
    for (const f of files) writeFileSync(f, '{}')
  }

  beforeEach(() => {
    jest.clearAllMocks()
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    libraryManagerMap.legendary = manager(uninstall, getSettings)
  })

  it('a ../config appName never deletes GameLib config.json (one guarded app-data request)', async () => {
    const files = [
      paths.configPath,
      join(gamesConfigPath, '..', 'config.log'),
      join(gamesConfigPath, '..', 'config-lastPlay.log')
    ]
    mkdirSync(join(gamesConfigPath, '..'), { recursive: true })
    for (const f of files) writeFileSync(f, '{}')
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'outside-trust-root'
    })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      '../config',
      'legendary',
      false,
      true
    )

    for (const f of files) expect(existsSync(f)).toBe(true)
    expect(calls.map((c) => c.channel)).toEqual(['safety_check_removal'])
    const req = calls[0]?.args[0] as { targets: { path: string }[] }
    expect(req.targets).toHaveLength(3)
    expect(req.targets.map((t) => t.path)).toEqual(files)
    for (const t of req.targets) {
      expect(t).toMatchObject({ kind: 'app-data', trustRoot: gamesConfigPath })
    }
    expect(warnings()).toContain(
      '[safety] remove-settings refused: outside-trust-root'
    )
    expect(warnings()).not.toMatch(/config|264160|GamesConfig/)
  })

  it('an injected check rejection deletes nothing and the uninstall still completes', async () => {
    const files = gameFiles('264160')
    writeAll(files)
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      '264160',
      'legendary',
      false,
      true
    )

    for (const f of files) expect(existsSync(f)).toBe(true)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(statuses()).toEqual(['uninstalling', 'done'])
    expect(removalNotices()).toEqual([])
    expect(warnings()).toContain(
      '[safety] remove-settings refused: rust-invoke-failed'
    )
    expect(warnings()).not.toMatch(/config|264160|GamesConfig/)
  })

  it('a legitimate appName removes all three files in one guarded request', async () => {
    const files = gameFiles('264160')
    writeAll(files)
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      '264160',
      'legendary',
      false,
      true
    )

    for (const f of files) expect(existsSync(f)).toBe(false)
    expect(calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'safety_remove_tree'
    ])
  })

  it('an injected remove rejection reports failed and the uninstall still completes', async () => {
    const files = gameFiles('264160')
    writeAll(files)
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })

    await uninstallGameCallback(
      withRust(requestRustInvoke),
      {} as any,
      '264160',
      'legendary',
      false,
      true
    )

    for (const f of files) expect(existsSync(f)).toBe(true)
    expect(warnings()).toContain(
      '[safety] remove-settings failed: rust-invoke-failed'
    )
    expect(warnings()).not.toMatch(/config|264160|GamesConfig/)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(statuses()).toEqual(['uninstalling', 'done'])
    expect(removalNotices()).toEqual([])
  })
})

// 87-70 (F5, D-14, D-19): a non-Steam game's own per-game bottle is removed by the crate op; the caller supplies the
// stored settings and the guard's inputs and handles the four answers. Real tmp dirs, an injected transport.
describe('uninstallGameCallback per-game bottle (87-70)', () => {
  const APP = 'abc123'
  const BOTTLE = 'GameLib-legendary-abc123'
  const getSettings = jest.fn()
  const uninstall = jest.fn()
  const prefixRoot = join(tmpdir(), `gamelib-uninstaller-bottle-${process.pid}`)
  const prefix = join(prefixRoot, 'pfx-game')
  const stored = { winePrefix: prefix, wineCrossoverBottle: BOTTLE }
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[1].status)
  const notices = () =>
    (deps.sendFrontendMessage as jest.Mock).mock.calls
      .filter((c) => c[0] === 'removalRefusedNotice')
      .map((c) => c[1])
  const warningText = () =>
    (logWarning as jest.Mock).mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n')
  /** The transport answering the bottle op with `reply` (or rejecting it) and the guard with `yes`. */
  const transport = (reply: unknown | Error) => {
    const fake = fakeSafety({
      base: async (channel) => {
        if (channel !== RUST_ENGINE_BOTTLE_REMOVE_PER_GAME) {
          throw new Error(`unexpected channel ${channel}`)
        }
        if (reply instanceof Error) throw reply
        return reply
      }
    })
    return {
      ...fake,
      deps: {
        ...deps,
        requestRustInvoke: fake.requestRustInvoke
      } as typeof deps
    }
  }
  const run = (d: typeof deps, runner = 'legendary' as const) =>
    uninstallGameCallback(d, {} as any, APP, runner, true, false)

  beforeEach(() => {
    jest.clearAllMocks()
    rmSync(prefixRoot, { recursive: true, force: true })
    mkdirSync(join(prefix, 'drive_c'), { recursive: true })
    getSettings.mockResolvedValue(stored)
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    ;(resolveGameTitle as jest.Mock).mockImplementation(
      (_m: unknown, _r: string, app: string) =>
        app === 'other' ? 'Other Game' : 'Test Game'
    )
    libraryManagerMap.legendary = manager(uninstall, getSettings)
    libraryManagerMap.gog = manager(uninstall, getSettings)
  })

  afterAll(() => {
    rmSync(prefixRoot, { recursive: true, force: true })
  })

  it('asks the op once with the stored settings and the guard inputs, and a removed bottle skips the prefix delete', async () => {
    const t = transport({ outcome: 'removed' })

    await run(t.deps)

    const opCalls = t.calls.filter(
      (c) => c.channel === RUST_ENGINE_BOTTLE_REMOVE_PER_GAME
    )
    expect(opCalls).toHaveLength(1)
    expect(opCalls[0]?.args).toHaveLength(1)
    expect(opCalls[0]?.args[0]).toEqual({
      runner: 'legendary',
      appName: APP,
      stored,
      knownInstalls: [],
      selfKey: `legendary:${APP}`,
      protectedRoots: expect.any(Array)
    })
    // The pre-flight check and the op; no stored-prefix check or delete after it.
    expect(t.calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'engine_bottle_remove_per_game'
    ])
    expect(existsSync(prefix)).toBe(true)
    expect(notices()).toEqual([])
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('not-bottle-backed with a custom prefix runs the stored-prefix removal as before', async () => {
    const t = transport({ outcome: 'not-bottle-backed' })

    await run(t.deps)

    expect(t.calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'engine_bottle_remove_per_game',
      'safety_check_removal',
      'safety_remove_tree'
    ])
    expect(existsSync(prefix)).toBe(false)
    expect(notices()).toEqual([])
  })

  it('not-bottle-backed with the default prefix deletes nothing and logs one fixed line (T-87-133)', async () => {
    const t = transport({ outcome: 'not-bottle-backed' })
    const withDefault = {
      ...t.deps,
      config: {
        getSettings: () => ({
          defaultInstallPath: '',
          sharedWinePrefix: '',
          winePrefix: prefix
        })
      }
    } as typeof deps

    await run(withDefault)

    expect(t.calls.map((c) => c.channel)).toEqual([
      'safety_check_removal',
      'engine_bottle_remove_per_game'
    ])
    expect(existsSync(prefix)).toBe(true)
    expect(notices()).toEqual([])
    const lines = (logInfo as jest.Mock).mock.calls
      .flat()
      .map((a) => String(a))
      .filter((l) => l.includes('shared default prefix'))
    expect(lines).toEqual([
      'Keeping the shared default Wine prefix: the game has no prefix of its own'
    ])
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('a refusal pushes the remove-bottle notice with the reason and the other game', async () => {
    const t = transport({
      outcome: 'refused',
      reason: 'nested-known-install',
      otherKey: 'gog:other'
    })

    await run(t.deps)

    expect(notices()).toEqual([
      {
        kind: 'remove-bottle',
        outcome: 'refused',
        reason: 'nested-known-install',
        title: 'Test Game',
        appName: APP,
        runner: 'legendary',
        otherTitle: 'Other Game'
      }
    ])
    expect(existsSync(prefix)).toBe(true)
    expect(t.calls.map((c) => c.channel)).not.toContain('safety_remove_tree')
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('a crate-only refusal word reads as bad-reply in the closed notice vocabulary', async () => {
    const t = transport({ outcome: 'refused', reason: 'in-use' })

    await run(t.deps)

    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'remove-bottle',
        outcome: 'refused',
        reason: 'bad-reply'
      })
    ])
  })

  it('a failed removal pushes a failed remove-bottle notice and keeps the prefix', async () => {
    const t = transport({ outcome: 'failed', reason: 'delete-failed' })

    await run(t.deps)

    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'remove-bottle',
        outcome: 'failed',
        reason: 'delete-failed'
      })
    ])
    expect(existsSync(prefix)).toBe(true)
  })

  it('a rejected call is logged with fixed text, reads as failed and does not undo the uninstall', async () => {
    const t = transport(new Error(`boom ${prefix} secret`))

    await run(t.deps)

    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'remove-bottle',
        outcome: 'failed',
        reason: 'rust-invoke-failed'
      })
    ])
    expect(warningText()).toContain(
      'removePrefix: the per-game bottle removal did not answer'
    )
    expect(warningText()).not.toMatch(/boom|secret|pfx-game/)
    expect(existsSync(prefix)).toBe(true)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(statuses()).toEqual(['uninstalling', 'done'])
  })

  it('a reply that is not an outcome reads as failed bad-reply', async () => {
    const t = transport({ outcome: 'exploded' })

    await run(t.deps)

    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'remove-bottle',
        outcome: 'failed',
        reason: 'bad-reply'
      })
    ])
    expect(existsSync(prefix)).toBe(true)
  })

  it('a Steam game never reaches the op', async () => {
    const t = transport({ outcome: 'removed' })
    libraryManagerMap.steam = manager(uninstall, getSettings)

    await uninstallGameCallback(t.deps, {} as any, APP, 'steam', true, false)

    expect(t.calls).toEqual([])
  })
})
