import { autoUpdate, libraryManagerMap } from '..'
import { initHeadless } from 'backend/logger'
import type GOGGame from '../gog/games'

function fakeGame(over: { ignoreGameUpdates: boolean; available: boolean }) {
  return {
    getSettings: async () => ({ ignoreGameUpdates: over.ignoreGameUpdates }),
    getGameInfo: () => ({
      title: 'T',
      runner: 'gog',
      install: { install_path: '/g', platform: 'windows' }
    }),
    isGameAvailable: async () => over.available
  } as unknown as GOGGame
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('autoUpdate (66.1-11)', () => {
  beforeAll(() => {
    initHeadless()
  })

  it('enqueues into a queue that is assigned after its deps object was created', async () => {
    jest
      .spyOn(libraryManagerMap.gog, 'getGame')
      .mockReturnValue(fakeGame({ ignoreGameUpdates: false, available: true }))
    const addToQueue = jest.fn().mockResolvedValue(undefined)
    const built: { queue?: { addToQueue: typeof addToQueue } } = {}
    const getDownloadQueue = jest.fn(() => {
      if (!built.queue) throw new Error('queue not built')
      return built.queue
    })
    const deps = { getDownloadQueue }
    built.queue = { addToQueue }

    autoUpdate('gog', ['g1'], deps)
    await flush()

    expect(getDownloadQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue).toHaveBeenCalledTimes(1)
  })

  it('never reads the queue for a skipped game', async () => {
    jest
      .spyOn(libraryManagerMap.gog, 'getGame')
      .mockReturnValue(fakeGame({ ignoreGameUpdates: true, available: true }))
    const getDownloadQueue = jest.fn()

    autoUpdate('gog', ['g1'], { getDownloadQueue })
    await flush()

    expect(getDownloadQueue).not.toHaveBeenCalled()
  })
})
