import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useDownloadsState, {
  ensureFinishedLoaded,
  refreshFinished,
  registerDownloadsListeners
} from '../downloadsState'
import type { DMQueueElement } from 'common/types'

type QueueHandler = (e: unknown, elements: DMQueueElement[]) => void

const el = (appName: string, endTime = 1): DMQueueElement =>
  ({
    type: 'install',
    params: { appName, runner: 'gog' },
    addToQueueTime: 0,
    startTime: 0,
    endTime
  }) as unknown as DMQueueElement

let backendFinished: DMQueueElement[] = []
let pulls = 0
let handlers: QueueHandler[] = []
const storeWrites: Array<[string, string, unknown]> = []

let pullImpl: (() => Promise<unknown>) | undefined
const loggedErrors: string[] = []

const fakeApi = {
  logError: (m: string) => {
    loggedErrors.push(m)
  },
  storeNew: () => undefined,
  storeGet: (_n: string, _k: string, d?: unknown) => d,
  storeSet: (name: string, key: string, value: unknown) => {
    storeWrites.push([name, key, value])
  },
  getDMQueueInformation: () => {
    pulls++
    if (pullImpl) return pullImpl()
    return Promise.resolve({
      elements: [],
      finished: backendFinished,
      state: 'idle'
    })
  },
  handleDMQueueInformation: (fn: QueueHandler) => {
    handlers.push(fn)
    return () => undefined
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('downloadsState', () => {
  beforeEach(() => {
    // importing the stores pulls tauriAttach, which can overwrite window.api
    ;(window as unknown as { api: unknown }).api = fakeApi
    backendFinished = []
    pulls = 0
    handlers = []
    storeWrites.length = 0
    loggedErrors.length = 0
    pullImpl = undefined
  })

  afterEach(() => {
    resetAllStores()
  })

  it('refreshFinished pulls the backend list into the store', async () => {
    backendFinished = [el('a'), el('b')]
    await refreshFinished()
    expect(useDownloadsState.getState().finished).toEqual(backendFinished)
  })

  it('clearFinished empties the store and writes downloadManager finished []', () => {
    useDownloadsState.setState({ finished: [el('a')] })
    useDownloadsState.getState().clearFinished()
    expect(useDownloadsState.getState().finished).toEqual([])
    expect(storeWrites).toEqual([['downloadManager', 'finished', []]])
  })

  it('clearFinishedItem filters, sets and writes the filtered list', () => {
    useDownloadsState.setState({ finished: [el('a'), el('b')] })
    useDownloadsState.getState().clearFinishedItem('a')
    expect(
      useDownloadsState.getState().finished?.map((e) => e.params.appName)
    ).toEqual(['b'])
    expect(storeWrites).toHaveLength(1)
    expect(storeWrites[0]?.[1]).toBe('finished')
    expect(storeWrites[0]?.[2]).toEqual([el('b')])
  })

  it('clearFinishedItem on an unloaded list writes []', () => {
    useDownloadsState.getState().clearFinishedItem('a')
    expect(storeWrites).toEqual([['downloadManager', 'finished', []]])
  })

  describe('failed and out-of-order pulls', () => {
    it('a rejected pull is logged, not thrown, and leaves the list unloaded', async () => {
      pullImpl = () => Promise.reject(new Error('timeout'))
      await expect(refreshFinished()).resolves.toBeUndefined()
      expect(useDownloadsState.getState().finished).toBeUndefined()
      expect(loggedErrors).toEqual([
        'finished-downloads pull failed: Error: timeout'
      ])
    })

    it('ensureFinishedLoaded re-pulls only while the list was never loaded', async () => {
      pullImpl = () => Promise.reject(new Error('boot'))
      await refreshFinished()
      pullImpl = undefined
      backendFinished = [el('a')]
      pulls = 0
      ensureFinishedLoaded()
      await flush()
      expect(pulls).toBe(1)
      expect(useDownloadsState.getState().finished).toEqual([el('a')])

      ensureFinishedLoaded()
      await flush()
      expect(pulls).toBe(1)
    })

    it('an older pull that resolves last does not overwrite a newer one', async () => {
      const resolvers: Array<(v: unknown) => void> = []
      pullImpl = () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        })
      const first = refreshFinished()
      const second = refreshFinished()
      const reply = (finished: DMQueueElement[]) => ({
        elements: [],
        finished,
        state: 'idle'
      })
      resolvers[1]?.(reply([el('new')]))
      await second
      resolvers[0]?.(reply([el('old')]))
      await first
      expect(useDownloadsState.getState().finished).toEqual([el('new')])
    })

    it('a pull in flight when Clear is clicked does not refill the list', async () => {
      let resolve: (v: unknown) => void = () => undefined
      pullImpl = () =>
        new Promise((r) => {
          resolve = r
        })
      const pending = refreshFinished()
      useDownloadsState.getState().clearFinished()
      resolve({ elements: [], finished: [el('stale')], state: 'idle' })
      await pending
      expect(useDownloadsState.getState().finished).toEqual([])
    })
  })

  describe('boot listeners', () => {
    it('pulls once at registration and registers one listener', async () => {
      backendFinished = [el('a')]
      registerDownloadsListeners()
      await flush()
      expect(pulls).toBe(1)
      expect(handlers).toHaveLength(1)
      expect(useDownloadsState.getState().finished).toEqual([el('a')])
    })

    it('refreshes on length or head-appName change, never on unrelated pushes', async () => {
      registerDownloadsListeners()
      await flush()
      const push = handlers[0] as QueueHandler
      expect(pulls).toBe(1)

      push({}, [el('x')])
      await flush()
      expect(pulls).toBe(2)

      // same length, same head: progress-style push, no refresh
      push({}, [el('x')])
      push({}, [el('x')])
      await flush()
      expect(pulls).toBe(2)

      // head changes
      push({}, [el('y')])
      await flush()
      expect(pulls).toBe(3)

      // length changes
      push({}, [el('y'), el('z')])
      await flush()
      expect(pulls).toBe(4)

      // finished everything
      push({}, [])
      await flush()
      expect(pulls).toBe(5)
    })

    it('ignores a push without elements', async () => {
      registerDownloadsListeners()
      await flush()
      const push = handlers[0] as unknown as (e: unknown, x: undefined) => void
      push({}, undefined)
      await flush()
      expect(pulls).toBe(1)
    })
  })

  it('the list survives a remount: nothing in the store reacts to unmount', async () => {
    backendFinished = [el('a')]
    await refreshFinished()
    const before = useDownloadsState.getState().finished
    // a "remount" is a component re-reading the store; there is no mount effect
    const after = useDownloadsState.getState().finished
    expect(after).toBe(before)
    expect(pulls).toBe(1)
  })
})
