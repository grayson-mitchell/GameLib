/**
 * D-15 diagnosis (69-12): the three candidate causes of the "completed
 * downloads vanish on tab return" todo, checked against the pure finished-list
 * logic that downloadqueue.ts delegates to. No module mocks.
 *
 * C1 (renderer/backend store divergence) is covered by the store-write policy:
 * storePolicy allow-lists downloadManager.finished and storeWriteHandlers
 * resolves the same registered instance the backend reads.
 */
import type { DMQueueElement } from 'common/types'
import { isWritableStoreField } from 'common/types/storePolicy'
import { keepKnownRunnerElements, upsertFinished } from '../finishedList'

function element(appName: string, runner: string): DMQueueElement {
  return {
    type: 'install',
    params: { appName, runner },
    addToQueueTime: 1,
    startTime: 2,
    endTime: 3
  } as unknown as DMQueueElement
}

describe('C1: renderer Clear writes reach the key the backend reads', () => {
  it('downloadManager.finished and .queue are renderer-writable', () => {
    expect(isWritableStoreField('downloadManager', 'finished')).toBe(true)
    expect(isWritableStoreField('downloadManager', 'queue')).toBe(true)
  })
})

describe('C2: startup pruning keeps every finished entry with a valid runner', () => {
  it('keeps epic/gog/amazon/steam/sideload and drops only unknown runners', () => {
    const list = [
      element('a', 'legendary'),
      element('b', 'gog'),
      element('c', 'nile'),
      element('d', 'steam'),
      element('e', 'sideload'),
      element('f', 'zoom')
    ]
    expect(keepKnownRunnerElements(list).map((e) => e.params.appName)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e'
    ])
  })

  it('does not empty a list of valid entries and tolerates malformed ones', () => {
    const valid = [element('d', 'steam')]
    expect(keepKnownRunnerElements(valid)).toEqual(valid)
    const malformed = [null, {}] as unknown as DMQueueElement[]
    expect(keepKnownRunnerElements(malformed)).toEqual([])
  })
})

describe('C3: Steam installs recorded through addToFinished persist', () => {
  it('appends a steam element with its status', () => {
    const out = upsertFinished([], element('d', 'steam'), 'done')
    expect(out).toHaveLength(1)
    expect(out[0]?.status).toBe('done')
  })

  it('replaces the same appName rather than duplicating, keeping others', () => {
    const list = upsertFinished([], element('d', 'steam'), 'abort')
    upsertFinished(list, element('x', 'gog'), 'done')
    upsertFinished(list, element('d', 'steam'), 'done')
    expect(list.map((e) => `${e.params.appName}:${e.status}`)).toEqual([
      'd:done',
      'x:done'
    ])
  })
})
