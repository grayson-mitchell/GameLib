import { clearWikiGameInfoCache, getUmuId, getWikiGameInfo } from '../wiki'
import {
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_INFO_WIKI_GET
} from 'common/types/sidecarTransport'
import type { Game } from 'common/types/game_manager'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

function fakeDeps(answer: unknown = null): {
  deps: RustInvokeDeps
  calls: unknown[][]
} {
  const calls: unknown[][] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return { deps: { requestRustInvoke }, calls }
}

describe('getUmuId shim', () => {
  it('makes one RUST_INFO_UMU_GET call carrying { appName, runner }', async () => {
    const { deps, calls } = fakeDeps('umu-1234')
    await getUmuId(deps, 'Quail', 'legendary')
    expect(calls).toEqual([
      [RUST_INFO_UMU_GET, [{ appName: 'Quail', runner: 'legendary' }]]
    ])
  })

  it('sends arguments the channel schema accepts, for every runner', async () => {
    for (const runner of [
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ] as const) {
      const { deps, calls } = fakeDeps()
      await getUmuId(deps, 'x', runner)
      const [, args] = calls[0] ?? []
      expect(rustInvokeArgs[RUST_INFO_UMU_GET].safeParse(args).success).toBe(
        true
      )
    }
  })

  it('resolves what Rust answered, an id or null, and rejects with its failure', async () => {
    await expect(getUmuId(fakeDeps('umu-9').deps, 'a', 'gog')).resolves.toBe(
      'umu-9'
    )
    await expect(getUmuId(fakeDeps(null).deps, 'a', 'gog')).resolves.toBeNull()
    await expect(
      getUmuId(fakeDeps(new Error('boom')).deps, 'a', 'gog')
    ).rejects.toThrow('boom')
  })
})

/** Only what the resolver reads: `getGameInfo()`. Any other member throws if it is touched. */
function fakeGame(info: {
  title: string
  app_name: string
  runner: string
}): Game {
  return {
    getGameInfo: () => info
  } as unknown as Game
}

describe('getWikiGameInfo resolver', () => {
  it('declares only the title, app name and runner and makes one RUST_INFO_WIKI_GET call', async () => {
    const { deps, calls } = fakeDeps({ pcgamingwiki: null })
    const game = fakeGame({
      title: 'Hades™: Battle Out of Hell',
      app_name: 'hades-1',
      runner: 'gog'
    })
    await expect(getWikiGameInfo(deps, game)).resolves.toEqual({
      pcgamingwiki: null
    })
    expect(calls).toEqual([
      [
        RUST_INFO_WIKI_GET,
        [
          {
            title: 'Hades™: Battle Out of Hell',
            appName: 'hades-1',
            runner: 'gog',
            forceRefresh: undefined
          }
        ]
      ]
    ])
  })

  it('carries forceRefresh through, and its arguments pass the channel schema', async () => {
    const { deps, calls } = fakeDeps(null)
    const game = fakeGame({ title: 'T', app_name: 'a', runner: 'sideload' })
    await getWikiGameInfo(deps, game, true)
    await getWikiGameInfo(deps, game)
    for (const [, args] of calls) {
      expect(rustInvokeArgs[RUST_INFO_WIKI_GET].safeParse(args).success).toBe(
        true
      )
    }
    expect(
      (calls[0]?.[1] as { forceRefresh?: boolean }[])[0]?.forceRefresh
    ).toBe(true)
  })

  it('resolves null when Rust found nothing and rejects with its failure', async () => {
    const game = fakeGame({ title: 'T', app_name: 'a', runner: 'steam' })
    await expect(getWikiGameInfo(fakeDeps(null).deps, game)).resolves.toBeNull()
    await expect(
      getWikiGameInfo(fakeDeps(new Error('info_wiki_get:bad-args')).deps, game)
    ).rejects.toThrow('info_wiki_get:bad-args')
  })
})

describe('clearWikiGameInfoCache shim', () => {
  it('makes one RUST_INFO_WIKI_CACHE_CLEAR call carrying the empty object, which the schema accepts', async () => {
    const { deps, calls } = fakeDeps(null)
    await expect(clearWikiGameInfoCache(deps)).resolves.toBeNull()
    expect(calls).toEqual([[RUST_INFO_WIKI_CACHE_CLEAR, [{}]]])
    expect(
      rustInvokeArgs[RUST_INFO_WIKI_CACHE_CLEAR].safeParse(calls[0]?.[1])
        .success
    ).toBe(true)
  })

  it('rejects with the failure text', async () => {
    await expect(
      clearWikiGameInfoCache(
        fakeDeps(new Error('info_wiki_cache_clear:store-write')).deps
      )
    ).rejects.toThrow('store-write')
  })
})
