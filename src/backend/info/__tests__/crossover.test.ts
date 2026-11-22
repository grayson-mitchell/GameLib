import { getCrossoverIndex } from '../crossover'
import { RUST_INFO_CROSSOVER_RATING_MAP } from 'common/types/sidecarTransport'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { ManagerDeps } from 'backend/services/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

type Games = { app_name: string; title: string; runner: string }[]

/** Library managers that list `games`, in the order the object lists them. */
function fakeDeps(
  library: Record<string, Games>,
  answer: unknown = {}
): {
  deps: Pick<ManagerDeps, 'libraryManagers'> & RustInvokeDeps
  calls: unknown[][]
} {
  const calls: unknown[][] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  const libraryManagers = Object.fromEntries(
    Object.entries(library).map(([runner, games]) => [
      runner,
      { getListOfGames: () => games }
    ])
  ) as unknown as ManagerDeps['libraryManagers']
  return { deps: { libraryManagers, requestRustInvoke }, calls }
}

describe('getCrossoverIndex resolver', () => {
  it('sends every manager’s games, in order, as { appName, title, runner } in one Rust call', async () => {
    const { deps, calls } = fakeDeps({
      steam: [
        { app_name: '1245620', title: 'Elden Ring', runner: 'steam' },
        { app_name: '292030', title: 'The Witcher 3', runner: 'steam' }
      ],
      gog: [{ app_name: 'gog-1', title: 'Chrono Trigger', runner: 'gog' }],
      sideload: []
    })
    await getCrossoverIndex(deps)
    expect(calls).toEqual([
      [
        RUST_INFO_CROSSOVER_RATING_MAP,
        [
          {
            games: [
              { appName: '1245620', title: 'Elden Ring', runner: 'steam' },
              { appName: '292030', title: 'The Witcher 3', runner: 'steam' },
              { appName: 'gog-1', title: 'Chrono Trigger', runner: 'gog' }
            ]
          }
        ]
      ]
    ])
  })

  it('still makes the one call for an empty library, and sends no other field of a game', async () => {
    const empty = fakeDeps({ steam: [] })
    await getCrossoverIndex(empty.deps)
    expect(empty.calls).toEqual([
      [RUST_INFO_CROSSOVER_RATING_MAP, [{ games: [] }]]
    ])

    const { deps, calls } = fakeDeps({
      steam: [
        {
          app_name: '1',
          title: 'A',
          runner: 'steam',
          install: { install_path: '/home/someone/Games/A' }
        } as unknown as Games[number]
      ]
    })
    await getCrossoverIndex(deps)
    expect(JSON.stringify(calls)).not.toContain('install_path')
  })

  it('resolves what Rust answered and carries a rejection', async () => {
    const map = { '1245620': 5, '9999992': null }
    await expect(
      getCrossoverIndex(fakeDeps({ steam: [] }, map).deps)
    ).resolves.toEqual(map)
    await expect(
      getCrossoverIndex(
        fakeDeps({ steam: [] }, new Error('info_crossover_rating_map:bad-args'))
          .deps
      )
    ).rejects.toThrow('info_crossover_rating_map:bad-args')
  })

  it('every argument it sends passes the strict schema, and the schema refuses a stray key and an over-long list', async () => {
    const { deps, calls } = fakeDeps({
      steam: [{ app_name: '1', title: 'A', runner: 'steam' }]
    })
    await getCrossoverIndex(deps)
    const schema = rustInvokeArgs[RUST_INFO_CROSSOVER_RATING_MAP]
    expect(schema.safeParse((calls[0] as unknown[])[1]).success).toBe(true)
    expect(schema.safeParse([{ games: [], extra: true }]).success).toBe(false)
    expect(
      schema.safeParse([
        {
          games: Array.from({ length: 20001 }, () => ({
            appName: '1',
            title: 'A',
            runner: 'steam'
          }))
        }
      ]).success
    ).toBe(false)
  })
})
