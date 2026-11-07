import { offlineLaunchCertainlyBlocked } from '../offlineRefusal'
import type { OfflineRefusalInput } from '../offlineRefusal'

const base: OfflineRefusalInput = {
  offline: true,
  override: 'automatic',
  crossoverMissing: false,
  markerKind: 'non-crossover',
  currentPinInstalled: false,
  restoreNeedsAbsentPin: true
}

describe('offlineLaunchCertainlyBlocked', () => {
  it('G25: UAT 34 run 1 (CrossOver missing, non-crossover marker, DXVK copy present) is blocked', () => {
    expect(
      offlineLaunchCertainlyBlocked({
        ...base,
        crossoverMissing: true,
        restoreNeedsAbsentPin: false
      })
    ).toEqual({ blocked: true, arm: 'crossover-missing' })
  })
  it('G25: UAT 34 run 2 (CrossOver present, DXVK copy present) is not blocked', () => {
    expect(
      offlineLaunchCertainlyBlocked({ ...base, restoreNeedsAbsentPin: false })
    ).toEqual({ blocked: false })
  })
  it('G25: CrossOver present, restore needs the absent pin, is blocked', () => {
    expect(offlineLaunchCertainlyBlocked(base)).toEqual({
      blocked: true,
      arm: 'restore-needs-pin'
    })
  })

  const markers = ['crossover', 'non-crossover', null] as const
  const cases: [string, Partial<OfflineRefusalInput>, boolean][] = []
  for (const markerKind of markers) {
    for (const r of [true, false]) {
      cases.push([
        `missing, automatic, pin absent, marker ${markerKind}, restore ${r}`,
        { crossoverMissing: true, markerKind, restoreNeedsAbsentPin: r },
        true
      ])
    }
  }
  cases.push(
    ['online', { offline: false, crossoverMissing: true }, false],
    [
      'pinned override',
      { override: 'pinned:x', crossoverMissing: true },
      false
    ],
    [
      'wine-manager override',
      { override: 'wine-manager:9', crossoverMissing: true },
      false
    ],
    [
      'missing, pin installed',
      { crossoverMissing: true, currentPinInstalled: true },
      false
    ],
    [
      'missing, crossover override',
      { crossoverMissing: true, override: 'crossover' },
      false
    ],
    [
      'present, crossover override, restore needs pin',
      { override: 'crossover' },
      true
    ],
    ['present, marker crossover', { markerKind: 'crossover' }, false],
    ['present, marker null', { markerKind: null }, false],
    ['present, pin installed', { currentPinInstalled: true }, false]
  )
  it.each(cases)('G25: %s', (_n, over, expected) => {
    expect(offlineLaunchCertainlyBlocked({ ...base, ...over }).blocked).toBe(
      expected
    )
  })

  it('WR-02: crossover override, pin installed, restore needs absent pin -> blocked', () => {
    expect(
      offlineLaunchCertainlyBlocked({
        ...base,
        override: 'crossover',
        currentPinInstalled: true
      })
    ).toEqual({ blocked: true, arm: 'restore-needs-pin' })
  })
  it('WR-02: automatic, pin installed, restore needs absent pin -> not blocked', () => {
    expect(
      offlineLaunchCertainlyBlocked({ ...base, currentPinInstalled: true })
    ).toEqual({ blocked: false })
  })
  it('WR-02: crossover override, CrossOver missing, pin installed -> not blocked', () => {
    expect(
      offlineLaunchCertainlyBlocked({
        ...base,
        override: 'crossover',
        crossoverMissing: true,
        currentPinInstalled: true
      })
    ).toEqual({ blocked: false })
  })
})
