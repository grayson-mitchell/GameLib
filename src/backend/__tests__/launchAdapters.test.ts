/**
 * The interim prepare adapters (Phase 88.1, 88.1-15, D-01, D-30): the Launcher's `prepareLaunch` gathers the facts only
 * the TypeScript has, makes one Rust call and replays the returned log into the caller's `LogWriter`. The Rust side is
 * proven against the golden by `cargo test -p gamelib-launch`; here a fake `requestRustInvoke` answers a recorded
 * golden/prepare_launch case, and the adapter has to write that case's `log.json` in order and answer its
 * `result.json`.
 */
import { defined } from 'backend/testUtils/indexed'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { GameInfo, GameSettings, WineInstallation } from 'common/types'
import {
  RUST_LAUNCH_CHECK_WINE_BEFORE_LAUNCH,
  RUST_LAUNCH_PREPARE
} from 'common/types/sidecarTransport'
import type LogWriter from 'backend/logger/targetWriter'
import type { LauncherDeps } from 'backend/launcher'
import {
  checkWineBeforeLaunch,
  prepareLaunch,
  prepareWineLaunch,
  writeLaunchLog
} from 'backend/launchAdapters'
import type { CheckWineBeforeLaunchDeps } from 'backend/launchAdapters'
import type { Game } from 'common/types/game_manager'
import {
  RUST_LAUNCH_PREPARE_WINE_BEGIN,
  RUST_LAUNCH_PREPARE_WINE_FINISH
} from 'common/types/sidecarTransport'

const GOLDEN = join(
  __dirname,
  '../../../src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_launch/expected'
)

function readCase(id: string): {
  input: {
    gameSettings: GameSettings
    gameInfo: GameInfo
    isNative: boolean
    storeExpired: boolean
  }
  log: Array<{ level: 'info' | 'warning'; parts: unknown[] }>
  result: Record<string, unknown>
} {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(join(GOLDEN, id, name), 'utf-8'))
  return {
    input: read('input.json') as never,
    log: read('log.json') as never,
    result: read('result.json') as never
  }
}

interface Written {
  level: string
  args: unknown[]
}

function recordingWriter(): { writer: LogWriter; written: Written[] } {
  const written: Written[] = []
  const method =
    (level: string) =>
    (...args: unknown[]) => {
      written.push({ level, args })
      return Promise.resolve()
    }
  const writer = {
    logDebug: method('debug'),
    logInfo: method('info'),
    logWarning: method('warning'),
    logError: method('error')
  } as unknown as LogWriter
  return { writer, written }
}

function fakeDeps(options: {
  reply: unknown
  isNative: boolean
  storeExpired?: boolean
}): {
  deps: LauncherDeps
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  const getGame = jest.fn(() => ({ isNative: () => options.isNative }))
  const storeExpired =
    options.storeExpired === undefined ? undefined : () => options.storeExpired
  const deps = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(options.reply)
    },
    libraryManagers: new Proxy({}, { get: () => ({ getGame }) }),
    launchHooks: new Proxy({}, { get: () => ({ storeExpired }) })
  } as unknown as LauncherDeps
  return { deps, calls }
}

describe('prepareLaunch adapter', () => {
  const { input, log, result } = readCase('linux-gog-023')

  it('replays the golden log into the writer in order and answers the golden result', async () => {
    const { deps, calls } = fakeDeps({
      reply: { ...result, log },
      isNative: input.isNative
    })
    const { writer, written } = recordingWriter()

    const answer = await prepareLaunch(
      deps,
      input.gameSettings,
      writer,
      input.gameInfo
    )

    expect(answer).toEqual(result)
    expect(answer).not.toHaveProperty('rpcClient')
    expect(written).toEqual(
      log.map((entry) => ({ level: entry.level, args: entry.parts }))
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(RUST_LAUNCH_PREPARE)
  })

  it('sends the facts only the TypeScript has', async () => {
    const { deps, calls } = fakeDeps({
      reply: { ...result, log: [] },
      isNative: true,
      storeExpired: true
    })
    const { writer } = recordingWriter()
    const gameInfo = {
      ...input.gameInfo,
      runner: 'legendary',
      namespace: 'ns-1',
      thirdPartyManagedApp: 'Ubisoft'
    } as unknown as GameInfo

    await prepareLaunch(deps, input.gameSettings, writer, gameInfo)

    expect(calls[0]?.[1]).toEqual([
      {
        settings: input.gameSettings,
        runner: 'legendary',
        appName: gameInfo.app_name,
        title: gameInfo.title,
        canRunOffline: false,
        thirdPartyManagedApp: 'Ubisoft',
        installPath: input.gameInfo.install.install_path,
        isNative: true,
        storeExpired: true,
        namespace: 'ns-1'
      }
    ])
  })

  it('sends a sideload game its folder as the install path, and an absent store fact as not expired', async () => {
    const { deps, calls } = fakeDeps({
      reply: { success: true, log: [] },
      isNative: false
    })
    const { writer } = recordingWriter()
    const gameInfo = {
      ...input.gameInfo,
      runner: 'sideload',
      folder_name: '/games/side'
    } as unknown as GameInfo

    await prepareLaunch(deps, input.gameSettings, writer, gameInfo)

    const [sent] = (calls[0]?.[1] ?? []) as Array<Record<string, unknown>>
    expect(sent).toMatchObject({
      installPath: '/games/side',
      storeExpired: false,
      isNative: false
    })
  })

  it('refuses a reply that is not a prepare result, and a log it cannot replay', async () => {
    const { writer } = recordingWriter()
    for (const reply of [
      null,
      { success: 'yes', log: [] },
      { success: true },
      { success: true, log: [{ level: 'loud', parts: [] }] }
    ]) {
      const { deps } = fakeDeps({ reply, isNative: false })
      await expect(
        prepareLaunch(deps, input.gameSettings, writer, input.gameInfo)
      ).rejects.toThrow(/prepareLaunch/)
    }
  })
})

describe('writeLaunchLog', () => {
  it('writes each level through its own method and fills a slot, skipping one that answers undefined', () => {
    const { writer, written } = recordingWriter()
    writeLaunchLog(
      writer,
      [
        { level: 'info', parts: ['a'] },
        { slot: 'eosOverlay' },
        { level: 'warning', parts: [['b', 1]] },
        { slot: 'other' }
      ],
      (slot) => (slot === 'eosOverlay' ? 'EOS Overlay: Enabled' : undefined)
    )
    expect(written).toEqual([
      { level: 'info', args: ['a'] },
      { level: 'info', args: ['EOS Overlay: Enabled'] },
      { level: 'warning', args: [['b', 1]] }
    ])
  })
})

describe('prepareWineLaunch adapter', () => {
  const { input } = readCase('linux-gog-023')
  const stored = input.gameSettings
  const launchSettings = { ...stored, winePrefix: '/overlaid/prefix' }

  /** A fake Rust that answers the begin then the finish call and records every event in one ordered list. */
  function setup(options: {
    begin: Record<string, unknown>
    finish?: Record<string, unknown>
    overlayEnabled?: boolean
  }): {
    deps: LauncherDeps
    game: Game
    events: string[]
    sent: Array<[string, Record<string, unknown>]>
    written: Written[]
    writer: LogWriter
  } {
    const events: string[] = []
    const sent: Array<[string, Record<string, unknown>]> = []
    const { writer, written } = recordingWriter()
    const hooks = {
      prepareLaunch: jest.fn((appName: string, w: LogWriter) => {
        events.push(`hook:${appName}:${w === writer}`)
        return Promise.resolve()
      }),
      isOverlayEnabled:
        options.overlayEnabled === undefined
          ? undefined
          : jest.fn(() => Promise.resolve(options.overlayEnabled))
    }
    const deps = {
      requestRustInvoke: (channel: string, args: unknown[]) => {
        events.push(`rust:${channel}`)
        sent.push([channel, args[0] as Record<string, unknown>])
        return Promise.resolve(
          channel === RUST_LAUNCH_PREPARE_WINE_BEGIN
            ? options.begin
            : options.finish
        )
      },
      launchHooks: new Proxy({}, { get: () => hooks }),
      config: {
        getSettings: () => ({ experimentalFeatures: { cometSupport: false } })
      }
    } as unknown as LauncherDeps
    const game = {
      getGameInfo: () => ({ ...input.gameInfo, folder_name: 'folder' }),
      getSettings: () => Promise.resolve(stored)
    } as unknown as Game
    return { deps, game, events, sent, written, writer }
  }

  it('awaits the store-setup hook after the begin call and before the finish call, and replays both logs in order', async () => {
    const { deps, game, events, sent, written, writer } = setup({
      overlayEnabled: true,
      begin: {
        success: true,
        prefixUpdated: true,
        settings: launchSettings,
        log: [
          { level: 'info', parts: ['Winetricks packages: a\n\n'] },
          { slot: 'eosOverlay' },
          { level: 'warning', parts: ['offline warning'] }
        ]
      },
      finish: {
        success: true,
        envVars: { WINEPREFIX: '/overlaid/prefix', FIX: '1' },
        knownFixEnv: { FIX: '1' },
        log: [{ level: 'info', parts: [['Known fixes env', 'FIX']] }]
      }
    })

    const answer = await prepareWineLaunch(deps, game, writer, {
      mergesTier1Env: false
    })

    expect(events).toEqual([
      `rust:${RUST_LAUNCH_PREPARE_WINE_BEGIN}`,
      `hook:${input.gameInfo.app_name}:true`,
      `rust:${RUST_LAUNCH_PREPARE_WINE_FINISH}`
    ])
    expect(answer).toEqual({
      success: true,
      envVars: { WINEPREFIX: '/overlaid/prefix', FIX: '1' },
      knownFixEnv: { FIX: '1' }
    })
    const resolved = await Promise.all(
      written.map(async (w) => ({
        level: w.level,
        args: await Promise.all(w.args)
      }))
    )
    expect(resolved).toEqual([
      { level: 'info', args: ['Winetricks packages: a\n\n'] },
      { level: 'info', args: ['EOS Overlay: Enabled'] },
      { level: 'warning', args: ['offline warning'] },
      { level: 'info', args: [['Known fixes env', 'FIX']] }
    ])
    // the begin step is told the stored settings, the finish step gets begin's settings back unmodified
    expect(sent[0]?.[1]).toMatchObject({
      runner: input.gameInfo.runner,
      appName: input.gameInfo.app_name,
      folderName: 'folder',
      storedSettings: stored
    })
    expect(sent[1]?.[1]).toMatchObject({
      settings: launchSettings,
      storedSettings: stored,
      prefixUpdated: true,
      mergesTier1Env: false,
      isGog: input.gameInfo.runner === 'gog',
      cometSupport: false
    })
  })

  it('runs no hook and prints no overlay line when the prefix did not change', async () => {
    const { deps, game, events, written, writer } = setup({
      begin: {
        success: true,
        prefixUpdated: false,
        settings: launchSettings,
        log: []
      },
      finish: { success: true, envVars: {}, knownFixEnv: {}, log: [] }
    })
    await prepareWineLaunch(deps, game, writer)
    expect(events.some((e) => e.startsWith('hook:'))).toBe(false)
    expect(written).toEqual([])
  })

  it('answers the failure reason and never makes the finish call when the begin step refuses', async () => {
    const { deps, game, events, written, writer } = setup({
      begin: {
        success: false,
        failureReason: 'CrossOver bottle "x" does not exist',
        prefixUpdated: false,
        log: [{ level: 'warning', parts: ['w'] }]
      }
    })
    expect(await prepareWineLaunch(deps, game, writer)).toEqual({
      success: false,
      failureReason: 'CrossOver bottle "x" does not exist'
    })
    expect(events).toEqual([`rust:${RUST_LAUNCH_PREPARE_WINE_BEGIN}`])
    expect(written).toEqual([{ level: 'warning', args: ['w'] }])
  })

  it('answers a bare failure when the begin step has no reason', async () => {
    const { deps, game, writer } = setup({
      begin: { success: false, prefixUpdated: false, log: [] }
    })
    expect(await prepareWineLaunch(deps, game, writer)).toEqual({
      success: false
    })
  })

  it('refuses a begin or finish reply of the wrong shape', async () => {
    for (const begin of [
      null,
      { success: true, prefixUpdated: false, log: [] },
      { success: true, prefixUpdated: false, settings: {}, log: 'x' }
    ]) {
      const { deps, game, writer } = setup({
        begin: begin as Record<string, unknown>
      })
      await expect(prepareWineLaunch(deps, game, writer)).rejects.toThrow(
        /prepareWineLaunch/
      )
    }
    const { deps, game, writer } = setup({
      begin: {
        success: true,
        prefixUpdated: false,
        settings: launchSettings,
        log: []
      },
      finish: { success: true, envVars: { A: 1 }, knownFixEnv: {}, log: [] }
    })
    await expect(prepareWineLaunch(deps, game, writer)).rejects.toThrow(
      /prepareWineLaunch/
    )
  })
})

/**
 * The `checkWineBeforeLaunch` adapter (88.1-16, D-28, T-88.1-40). `cargo test -p gamelib-launch` proves the Rust check against
 * golden/check_wine; here a fake `requestRustInvoke` answers the reply that case's recorded outcome implies (`ok` and the wine
 * the caller ends with from `result.json`, the game and global writes from `writes.json`, the lines from `log.json`), and the
 * adapter has to make exactly the recorded writes, leave `gameSettings.wineVersion` as `result.json` says, and write the
 * recorded log in order.
 */
const CHECK_WINE_GOLDEN = join(
  __dirname,
  '../../../src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine/expected'
)

interface CheckWineCase {
  id: string
  input: {
    call: string
    gameInfo: { app_name: string; runner: GameInfo['runner'] }
    storedSettings: { wineVersion: WineInstallation; verboseLogs: boolean }
    globalSettings: { disableLogs: boolean }
  }
  log: Array<{ level: 'info' | 'warning' | 'error'; parts: unknown[] }>
  writes: Array<{
    target: 'game' | 'global'
    appName?: string
    key: string
    value: WineInstallation
    store?: string
  }>
  result: { ok?: boolean; wineVersionAfter: WineInstallation }
}

function readCheckWineCases(): CheckWineCase[] {
  return readdirSync(CHECK_WINE_GOLDEN)
    .sort()
    .map((id) => {
      const read = (name: string): unknown =>
        JSON.parse(readFileSync(join(CHECK_WINE_GOLDEN, id, name), 'utf-8'))
      return {
        id,
        input: read('input.json'),
        log: read('log.json'),
        writes: read('writes.json'),
        result: read('result.json')
      } as CheckWineCase
    })
    .filter((c) => c.input.call === 'check' && c.result.ok !== undefined)
}

/** The Rust reply a case's recorded outcome implies (the crate's `CheckWineReply`). */
function replyOf(c: CheckWineCase): Record<string, unknown> {
  const game = c.writes.find((w) => w.target === 'game')
  const global = c.writes.find((w) => w.target === 'global')
  return {
    ok: c.result.ok,
    ...(game ? { wineVersion: game.value } : {}),
    persistGameWine: game !== undefined,
    ...(global ? { globalWineVersion: global.value } : {}),
    log: c.log
  }
}

function checkWineDeps(
  reply: unknown,
  disableLogs: boolean
): {
  deps: CheckWineBeforeLaunchDeps
  calls: Array<[string, unknown[]]>
  globalWrites: unknown[][]
  gameWrites: Array<{ appName: string; key: string; value: unknown }>
  kvs: object
} {
  const calls: Array<[string, unknown[]]> = []
  const globalWrites: unknown[][] = []
  const gameWrites: Array<{ appName: string; key: string; value: unknown }> = []
  const kvs = { marker: 'kvs' }
  const deps = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve(reply)
    },
    config: {
      getSettings: () => ({ disableLogs }),
      setSetting: (...args: unknown[]) => {
        globalWrites.push(args)
      }
    },
    gameConfigs: {
      get: (appName: string) => ({
        setSetting: (key: string, value: unknown) => {
          gameWrites.push({ appName, key, value })
        }
      })
    },
    stores: { kvs }
  } as unknown as CheckWineBeforeLaunchDeps
  return { deps, calls, globalWrites, gameWrites, kvs }
}

describe('checkWineBeforeLaunch adapter', () => {
  const cases = readCheckWineCases()

  it('covers a Yes case, a No case and a download case of the golden', () => {
    const ids = cases.map((c) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'check-default-valid-yes',
        'check-default-valid-no',
        'check-alternatives-empty-download-success'
      ])
    )
    expect(cases.length).toBeGreaterThanOrEqual(25)
  })

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s: makes the recorded writes, leaves the recorded wine in the settings and writes the recorded log',
    async (_id, c) => {
      const { deps, calls, globalWrites, gameWrites, kvs } = checkWineDeps(
        replyOf(c),
        c.input.globalSettings.disableLogs
      )
      const { writer, written } = recordingWriter()
      const gameSettings = {
        wineVersion: c.input.storedSettings.wineVersion,
        verboseLogs: c.input.storedSettings.verboseLogs
      } as unknown as GameSettings
      const gameInfo = {
        app_name: c.input.gameInfo.app_name,
        runner: c.input.gameInfo.runner
      } as GameInfo

      const ok = await checkWineBeforeLaunch(
        deps,
        gameInfo,
        gameSettings,
        writer
      )

      expect(calls).toEqual([
        [
          RUST_LAUNCH_CHECK_WINE_BEFORE_LAUNCH,
          [
            {
              appName: c.input.gameInfo.app_name,
              runner: c.input.gameInfo.runner,
              wineVersion: c.input.storedSettings.wineVersion,
              verboseLogs: c.input.storedSettings.verboseLogs,
              disableLogs: c.input.globalSettings.disableLogs
            }
          ]
        ]
      ])
      expect(ok).toBe(c.result.ok)
      expect(gameSettings.wineVersion).toEqual(c.result.wineVersionAfter)
      expect(gameWrites).toEqual(
        c.writes
          .filter((w) => w.target === 'game')
          .map((w) => ({ appName: w.appName, key: w.key, value: w.value }))
      )
      expect(globalWrites).toEqual(
        c.writes
          .filter((w) => w.target === 'global')
          .map((w) => [w.key, w.value, kvs])
      )
      expect(written).toEqual(
        c.log.map((entry) => ({ level: entry.level, args: entry.parts }))
      )
    }
  )

  it('writes the global wine before the game wine, as the TypeScript set the downloaded default first', async () => {
    const c = defined(
      cases.find((x) => x.id === 'check-alternatives-empty-download-success'),
      'the download case'
    )
    const order: string[] = []
    const { deps } = checkWineDeps(replyOf(c), false)
    deps.config.setSetting = (() => {
      order.push('global')
    }) as never
    deps.gameConfigs.get = (() => ({
      setSetting: () => {
        order.push('game')
      }
    })) as never
    const { writer } = recordingWriter()
    await checkWineBeforeLaunch(
      deps,
      { app_name: 'a', runner: 'legendary' } as GameInfo,
      { wineVersion: c.input.storedSettings.wineVersion } as GameSettings,
      writer
    )
    expect(order).toEqual(['global', 'game'])
  })

  it('writes no config and keeps the game wine when Rust answers no change', async () => {
    const { deps, globalWrites, gameWrites } = checkWineDeps(
      { ok: true, persistGameWine: false, log: [] },
      false
    )
    const { writer } = recordingWriter()
    const wine = { name: 'W', type: 'wine', bin: '/w' } as WineInstallation
    const gameSettings = { wineVersion: wine } as GameSettings
    expect(
      await checkWineBeforeLaunch(
        deps,
        { app_name: 'a', runner: 'gog' } as GameInfo,
        gameSettings,
        writer
      )
    ).toBe(true)
    expect(gameSettings.wineVersion).toBe(wine)
    expect(globalWrites).toEqual([])
    expect(gameWrites).toEqual([])
  })

  it('refuses a reply of the wrong shape and a wine that is no installation, and rejects when the call could not be made', async () => {
    const wine = { name: 'W', type: 'wine', bin: '/w' } as WineInstallation
    const gameInfo = { app_name: 'a', runner: 'gog' } as GameInfo
    const { writer } = recordingWriter()
    for (const reply of [
      null,
      { log: [] },
      { ok: true },
      { ok: true, log: [{ level: 'trace', parts: [] }] },
      { ok: true, wineVersion: { name: 'x' }, persistGameWine: true, log: [] }
    ]) {
      const { deps, globalWrites, gameWrites } = checkWineDeps(reply, false)
      await expect(
        checkWineBeforeLaunch(
          deps,
          gameInfo,
          { wineVersion: wine } as GameSettings,
          writer
        )
      ).rejects.toThrow('checkWineBeforeLaunch')
      expect([globalWrites, gameWrites]).toEqual([[], []])
    }
    const { deps } = checkWineDeps(new Error('not-ready'), false)
    await expect(
      checkWineBeforeLaunch(
        deps,
        gameInfo,
        { wineVersion: wine } as GameSettings,
        writer
      )
    ).rejects.toThrow('not-ready')
  })
})
