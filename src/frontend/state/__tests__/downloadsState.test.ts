import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useDownloadsState, {
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

const fakeApi = {
  storeNew: () => undefined,
  storeGet: (_n: string, _k: string, d?: unknown) => d,
  storeSet: (name: string, key: string, value: unknown) => {
    storeWrites.push([name, key, value])
  },
  getDMQueueInformation: () => {
    pulls++
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
