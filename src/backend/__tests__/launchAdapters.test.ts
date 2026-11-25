/**
 * The interim prepare adapters (Phase 88.1, 88.1-15, D-01, D-30): the Launcher's `prepareLaunch` gathers the facts only
 * the TypeScript has, makes one Rust call and replays the returned log into the caller's `LogWriter`. The Rust side is
 * proven against the golden by `cargo test -p gamelib-launch`; here a fake `requestRustInvoke` answers a recorded
 * golden/prepare_launch case, and the adapter has to write that case's `log.json` in order and answer its
 * `result.json`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { GameInfo, GameSettings } from 'common/types'
import { RUST_LAUNCH_PREPARE } from 'common/types/sidecarTransport'
import type LogWriter from 'backend/logger/targetWriter'
import type { LauncherDeps } from 'backend/launcher'
import {
  prepareLaunch,
  prepareWineLaunch,
  writeLaunchLog
} from 'backend/launchAdapters'
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
