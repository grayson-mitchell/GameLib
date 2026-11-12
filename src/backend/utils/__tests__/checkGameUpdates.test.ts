import { checkGameUpdates } from '../checkGameUpdates'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

type Lib = {
  listUpdateableGames: jest.Mock
  listAutoUpdateableGames?: jest.Mock
}

function run(library: Record<string, Lib>, autoUpdateGames: boolean) {
  const autoUpdate = jest.fn((_r: string, g: string[]) => g)
  const deps = {
    managers: { library, autoUpdate },
    config: { getSettings: () => ({ autoUpdateGames }) }
  } as never
  return { autoUpdate, result: checkGameUpdates(deps) }
}

const steam = (): Lib => ({
  listUpdateableGames: jest.fn().mockResolvedValue(['A', 'B']),
  listAutoUpdateableGames: jest.fn().mockResolvedValue(['A'])
})

describe('checkGameUpdates', () => {
  it('auto-queues only the auto list but badges every stale game', async () => {
    const { autoUpdate, result } = run({ steam: steam() }, true)
    expect(await result).toEqual(['A', 'B'])
    expect(autoUpdate).toHaveBeenCalledWith('steam', ['A'])
  })

  it('never queues when autoUpdateGames is off', async () => {
    const { autoUpdate, result } = run({ steam: steam() }, false)
    expect(await result).toEqual(['A', 'B'])
    expect(autoUpdate).not.toHaveBeenCalled()
  })

  it('never queues a registered stale app (D-02)', async () => {
    const lib = steam()
    lib.listAutoUpdateableGames = jest.fn().mockResolvedValue([])
    const { autoUpdate, result } = run({ steam: lib }, true)
    await result
    expect(autoUpdate).toHaveBeenCalledWith('steam', [])
  })

  it('a runner without listAutoUpdateableGames queues its full list', async () => {
    const legendary: Lib = {
      listUpdateableGames: jest.fn().mockResolvedValue(['X', 'Y'])
    }
    const { autoUpdate, result } = run({ legendary }, true)
    expect(await result).toEqual(['X', 'Y'])
    expect(autoUpdate).toHaveBeenCalledWith('legendary', ['X', 'Y'])
  })

  it('ignores auto entries not in the badge list', async () => {
    const lib = steam()
    lib.listAutoUpdateableGames = jest.fn().mockResolvedValue(['A', 'Z'])
    const { autoUpdate, result } = run({ steam: lib }, true)
    await result
    expect(autoUpdate).toHaveBeenCalledWith('steam', ['A'])
  })

  it('one runner throwing keeps the others (WR-05)', async () => {
    const bad: Lib = {
      listUpdateableGames: jest.fn().mockRejectedValue(new Error('x'))
    }
    const { result } = run({ gog: bad, steam: steam() }, false)
    expect(await result).toEqual(['A', 'B'])
  })
})
