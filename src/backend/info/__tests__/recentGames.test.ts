import { addRecentGame, removeRecentGame } from '../recentGames'
import {
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS,
  RUST_INFO_CHANNELS,
  RUST_INFO_CROSSOVER_RATING_MAP,
  RUST_INFO_GOG_DISCOUNTS,
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET,
  RUST_INFO_RECENT_ADD,
  RUST_INFO_RECENT_REMOVE,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/** A fake transport that records the channel and arguments and answers with a promise it owns. */
function fakeDeps(): {
  deps: RustInvokeDeps
  calls: unknown[][]
  settle: (error?: Error) => void
} {
  const calls: unknown[][] = []
  let resolve: (value: unknown) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const pending = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return pending
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return {
    deps: { requestRustInvoke },
    calls,
    settle: (error) => (error ? reject(error) : resolve(undefined))
  }
}

const GAME = {
  app_name: 'Quail',
  title: 'Quail Quest',
  runner: 'legendary' as const,
  install: {}
}

describe('addRecentGame shim', () => {
  it('sends exactly RUST_INFO_RECENT_ADD with the appName, title and runner', async () => {
    const { deps, calls, settle } = fakeDeps()
    const done = addRecentGame(deps, GAME as never)
    settle()
    await done
    expect(calls).toEqual([
      [
        RUST_INFO_RECENT_ADD,
        [{ appName: 'Quail', title: 'Quail Quest', runner: 'legendary' }]
      ]
    ])
  })

  it('carries the Rust rejection to the caller, which launchDispatch swallows', async () => {
    const { deps, settle } = fakeDeps()
    const done = addRecentGame(deps, GAME as never)
    settle(new Error('rust said no'))
    await expect(done).rejects.toThrow('rust said no')
  })
})

describe('removeRecentGame shim', () => {
  it('sends exactly RUST_INFO_RECENT_REMOVE with the appName', async () => {
    const { deps, calls, settle } = fakeDeps()
    const done = removeRecentGame(deps, 'Quail')
    settle()
    await done
    expect(calls).toEqual([[RUST_INFO_RECENT_REMOVE, [{ appName: 'Quail' }]]])
  })

  it('carries the Rust rejection to the caller', async () => {
    const { deps, settle } = fakeDeps()
    const done = removeRecentGame(deps, 'Quail')
    settle(new Error('gone'))
    await expect(done).rejects.toThrow('gone')
  })
})

describe('the info channel list', () => {
  it('names exactly the recent-games, overrides, anticheat, GOG discounts and CrossOver rating map channels, each one allowed on the Rust invoke leg', () => {
    expect([...RUST_INFO_CHANNELS].sort()).toEqual(
      [
        RUST_INFO_RECENT_ADD,
        RUST_INFO_RECENT_REMOVE,
        RUST_INFO_OVERRIDES_GET,
        RUST_INFO_OVERRIDES_GET_ALL,
        RUST_INFO_OVERRIDES_SET,
        RUST_INFO_OVERRIDES_ATTACH,
        RUST_INFO_ANTICHEAT_INFO,
        RUST_INFO_ANTICHEAT_STATUS,
        RUST_INFO_ANTICHEAT_DOWNLOAD,
        RUST_INFO_GOG_DISCOUNTS,
        RUST_INFO_CROSSOVER_RATING_MAP
      ].sort()
    )
    for (const channel of RUST_INFO_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS).toContain(channel)
    }
  })
})
