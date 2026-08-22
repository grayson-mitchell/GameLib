/**
 * Regression: a paused download must report 0 MB/s in the ProgressHeader.
 *
 * The previous inline logic only reset the speed on 'idle' and otherwise
 * carried the last nonzero downSpeed forward whenever a fresh progress update
 * was absent. On 'paused' that left the header frozen at the pre-pause rate, so
 * a paused download never looked paused. nextSpeedSample fixes this by
 * returning 0 for any non-'running' state.
 *
 * Regression: the chart must sample on a fixed timer, not once per change in
 * `percent`. hasProgress drops any emit whose percent equals the previous one,
 * discarding that emit's speeds too. Steam reports an integer percent, so its
 * chart only advanced once per whole percent — 10s+ apart on a large install —
 * while GOG/Epic (fractional percent) advanced on nearly every emit. The
 * appendSample cases below pin the property that makes the cadence uniform:
 * a sample is owed per CALL, never per percent change.
 */
import { InstallProgress } from 'common/types'
import {
  appendSample,
  emptySamples,
  nextSpeedSample,
  SAMPLE_INTERVAL_MS,
  SpeedPoint
} from '../speedSample'

describe('nextSpeedSample', () => {
  it('returns 0 MB/s (download and disk) when paused, ignoring the last speed', () => {
    expect(nextSpeedSample('paused', 12.5, 8, 12.5)).toEqual({
      download: 0,
      disk: 0
    })
  })

  it('returns 0 MB/s when idle', () => {
    expect(nextSpeedSample('idle', 30, 20, 30)).toEqual({
      download: 0,
      disk: 0
    })
  })

  it('uses the live downSpeed while running', () => {
    expect(nextSpeedSample('running', 25.4, 10, 5)).toEqual({
      download: 25.4,
      disk: 10
    })
  })

  it('carries the last speed forward while running when no fresh sample arrives', () => {
    // downSpeed 0/undefined mid-download = momentary gap, not a stop — smooth
    // the chart by holding the previous value (only while running).
    expect(nextSpeedSample('running', 0, undefined, 18.2)).toEqual({
      download: 18.2,
      disk: 0
    })
    expect(nextSpeedSample('running', undefined, undefined, 7)).toEqual({
      download: 7,
      disk: 0
    })
  })
})

describe('SAMPLE_INTERVAL_MS', () => {
  it('is one second', () => {
    expect(SAMPLE_INTERVAL_MS).toBe(1000)
  })
})

describe('emptySamples', () => {
  it('produces a zero-filled buffer of the requested size', () => {
    expect(emptySamples(3)).toEqual([
      { download: 0, disk: 0 },
      { download: 0, disk: 0 },
      { download: 0, disk: 0 }
    ])
  })
})

describe('appendSample', () => {
  // An integer percent is what Steam emits (Math.round in steam/depot.ts) —
  // the exact payload shape that used to starve the chart.
  const steamProgress: InstallProgress = {
    percent: 42,
    bytes: '1024.00MB',
    eta: '00:12:00',
    downSpeed: 30,
    diskSpeed: 45
  }

  // GOG parses a fractional percent out of gogdl's output (gog/games.ts).
  const gogProgress: InstallProgress = {
    percent: 42.37,
    bytes: '1024.00MB',
    eta: '00:12:00',
    downSpeed: 30,
    diskSpeed: 45
  }

  const tick = (
    samples: SpeedPoint[],
    progress: InstallProgress,
    ticks: number
  ) => {
    let out = samples
    for (let i = 0; i < ticks; i++) {
      out = appendSample(out, 'running', progress, 100)
    }
    return out
  }

  it('accrues a sample per call even when percent never changes', () => {
    // The core regression. Ten ticks against ONE unchanging progress object —
    // the percent-gated implementation would have produced a single sample.
    const samples = tick(emptySamples(0), steamProgress, 10)

    expect(samples).toHaveLength(10)
    expect(samples.every((s) => s.download === 30 && s.disk === 45)).toBe(true)
  })

  it('samples at the same rate for an integer and a fractional percent', () => {
    const steam = tick(emptySamples(0), steamProgress, 6)
    const gog = tick(emptySamples(0), gogProgress, 6)

    expect(steam).toHaveLength(gog.length)
    expect(steam).toEqual(gog)
  })

  it('drops the oldest sample once the window is full, newest last', () => {
    const full = emptySamples(3)
    const shifted = appendSample(full, 'running', steamProgress, 3)

    expect(shifted).toHaveLength(3)
    expect(shifted.at(-1)).toEqual({ download: 30, disk: 45 })
    expect(shifted.slice(0, 2)).toEqual([
      { download: 0, disk: 0 },
      { download: 0, disk: 0 }
    ])
  })

  it('does not mutate the buffer it is given', () => {
    const original = emptySamples(2)
    const snapshot = [...original]

    appendSample(original, 'running', steamProgress, 2)

    expect(original).toEqual(snapshot)
    expect(original).toHaveLength(2)
  })

  it('holds the last download speed when a tick finds no progress at all', () => {
    // The store has nothing for this game yet, or the backend went quiet
    // between ticks — mid-download that is a gap, not a stop.
    const samples = tick(emptySamples(0), steamProgress, 1)
    const gap = appendSample(samples, 'running', undefined, 100)

    expect(gap.at(-1)).toEqual({ download: 30, disk: 0 })
  })

  it('decays to 0 MB/s on every tick while paused', () => {
    const running = tick(emptySamples(0), steamProgress, 2)
    const paused = [
      appendSample(running, 'paused', steamProgress, 100),
      appendSample(
        appendSample(running, 'paused', steamProgress, 100),
        'paused',
        steamProgress,
        100
      )
    ]

    // Keeps ticking while paused (samples accrue) and every one reads zero,
    // so the chart walks down to the floor instead of freezing.
    expect(paused[0]).toHaveLength(3)
    expect(paused[1]).toHaveLength(4)
    expect(paused[0].at(-1)).toEqual({ download: 0, disk: 0 })
    expect(paused[1].at(-1)).toEqual({ download: 0, disk: 0 })
  })
})
