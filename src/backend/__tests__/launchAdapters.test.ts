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
import { prepareLaunch, writeLaunchLog } from 'backend/launchAdapters'

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
