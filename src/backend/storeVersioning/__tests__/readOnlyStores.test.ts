import {
  areaForStoreKey,
  createReadOnlyStores,
  type ReadOnlyStores
} from '../readOnlyStores'

// One tracker per test (the module reset's replacement).
let tracker: ReadOnlyStores
const recordReadOnly: ReadOnlyStores['record'] = (e) => tracker.record(e)
const flushReadOnlyStores: ReadOnlyStores['flush'] = (s) => tracker.flush(s)

const entry = (storeKey: string, file = 'a.json') => ({
  storeKey,
  file,
  reason: 'newer' as const,
  detail: 'v9 > v1'
})

describe('readOnlyStores', () => {
  beforeEach(() => {
    tracker = createReadOnlyStores()
  })

  it('maps store keys to areas', () => {
    const table: Record<string, string> = {
      'store_cache/steam_library': 'steam-library',
      'store_cache/gog_library': 'gog-library',
      'gog_store/installed': 'gog-library',
      'store_cache/legendary_library': 'epic-library',
      'store_cache/nile_library': 'amazon-library',
      'sideload_apps/library': 'sideload-library',
      'steam_store/config': 'steam-account',
      'gog_store/config': 'gog-account',
      'legendary_store/config': 'epic-account',
      'nile_store/config': 'amazon-account',
      'humble_store/config': 'humble',
      'store_cache/humble_orders': 'humble',
      'store/download-manager': 'downloads',
      'store/timestamp': 'play-history',
      'gog_store/saveTimestamps': 'play-history',
      'store_cache/gog_playtime_sync_queue': 'play-history',
      'store/config': 'preferences',
      'settings/global': 'settings',
      'settings/game': 'game-settings',
      'something/else': 'app-data'
    }
    for (const [k, v] of Object.entries(table))
      expect(areaForStoreKey(k)).toBe(v)
  })

  it('flush with nothing sends and logs nothing; with entries sends once, deduped, logs per entry', () => {
    const send = jest.fn()
    const log = jest.fn()
    flushReadOnlyStores({ send, log })
    expect(send).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()

    tracker = createReadOnlyStores()
    recordReadOnly(entry('store_cache/gog_library'))
    recordReadOnly(entry('gog_store/installed', 'b.json'))
    flushReadOnlyStores({ send, log })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      entries: [{ area: 'gog-library', reason: 'newer' }]
    })
    expect(log).toHaveBeenCalledTimes(2)
    const line = String(log.mock.calls[0]?.[0])
    expect(line).toContain('store_cache/gog_library')
    expect(line).toContain('a.json')
    expect(line).toContain('newer')
    expect(line).toContain('v9 > v1')
  })

  it('re-publishes after a flush, and neither sink runs before it', () => {
    const send = jest.fn()
    const log = jest.fn()
    recordReadOnly(entry('settings/global'))
    expect(send).not.toHaveBeenCalled()
    flushReadOnlyStores({ send, log })
    send.mockClear()
    log.mockClear()
    recordReadOnly(entry('settings/game', 'g.json'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0].entries).toHaveLength(2)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('payload entries carry only area and reason', () => {
    const send = jest.fn()
    recordReadOnly(entry('settings/global'))
    flushReadOnlyStores({ send, log: jest.fn() })
    const entries = send.mock.calls[0]?.[0]?.entries
    expect(entries).toEqual(expect.any(Array))
    for (const e of entries ?? []) {
      expect(Object.keys(e).sort()).toEqual(['area', 'reason'])
    }
  })

  it('two trackers never share entries, and a construction sink receives records at once', () => {
    const send = jest.fn()
    const log = jest.fn()
    const early = createReadOnlyStores({ sinks: { send, log } })
    early.record(entry('settings/global'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(1)
    expect(tracker.list()).toEqual([])
  })

  it('swallows throwing sinks', () => {
    const send = jest.fn(() => {
      throw new Error('boom')
    })
    const log = jest.fn(() => {
      throw new Error('boom')
    })
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    recordReadOnly(entry('settings/global'))
    expect(() => flushReadOnlyStores({ send, log })).not.toThrow()
    expect(() => recordReadOnly(entry('settings/game', 'g.json'))).not.toThrow()
    stderr.mockRestore()
  })
})
