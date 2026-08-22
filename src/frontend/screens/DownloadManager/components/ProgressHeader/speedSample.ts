import { DownloadManagerState, InstallProgress } from 'common/types'

export interface SpeedPoint {
  download: number
  disk: number
}

/**
 * How often the ProgressHeader chart takes a sample, in milliseconds.
 *
 * The chart used to advance once per change in `percent`, because
 * `hasProgress` drops any progress emit whose percent matches the previous one
 * — discarding that emit's downSpeed/diskSpeed with it. GOG and Epic report a
 * fractional percent so they changed on nearly every emit, but Steam reports an
 * integer one (Math.round, steam/depot.ts), so its chart only moved once per
 * whole percent: sub-second on a small game, 10s+ on a large one, with the MB/s
 * readouts frozen in between. Sampling on a fixed interval instead makes the
 * cadence identical for every runner and turns the x-axis into a real rolling
 * window (sampleSize seconds) rather than "sampleSize percent-ticks".
 */
export const SAMPLE_INTERVAL_MS = 1000

/**
 * Computes the next download/disk speed sample for the ProgressHeader chart.
 *
 * Pure so it can be unit-tested without a DOM (jest runs in the `node`
 * environment for the frontend project — see jest.config.js).
 *
 * Bug fix: when the queue is not actively `running` (e.g. `paused`), the
 * transfer has stopped, so the sample must be 0 MB/s. The previous inline
 * logic carried the last nonzero `downSpeed` forward whenever a fresh
 * progress update was absent — which, on pause, left the header showing the
 * pre-pause rate forever and made a paused download look like it was still
 * going. `idle` is handled by a full reset in the component and never reaches
 * here.
 */
export function nextSpeedSample(
  state: DownloadManagerState,
  downSpeed: number | undefined,
  diskSpeed: number | undefined,
  lastDownload: number
): SpeedPoint {
  if (state !== 'running') {
    return { download: 0, disk: 0 }
  }

  return {
    download: downSpeed && downSpeed > 0 ? downSpeed : lastDownload,
    disk: diskSpeed ?? 0
  }
}

/**
 * The chart's zero-filled starting buffer, also used for the reset on 'idle'.
 */
export function emptySamples(sampleSize: number): SpeedPoint[] {
  return Array<SpeedPoint>(sampleSize).fill({ download: 0, disk: 0 })
}

/**
 * Appends one sample to the rolling window, dropping the oldest once the window
 * is full.
 *
 * Called once per tick of the SAMPLE_INTERVAL_MS timer with whatever the
 * install-progress store holds at that moment — `progress` is deliberately
 * allowed to be the SAME object across consecutive calls, because a sample is
 * owed for every tick regardless of whether a fresh emit landed in between.
 * Returns a new array; the caller's buffer is never mutated.
 */
export function appendSample(
  samples: SpeedPoint[],
  state: DownloadManagerState,
  progress: InstallProgress | undefined,
  sampleSize: number
): SpeedPoint[] {
  const next = nextSpeedSample(
    state,
    progress?.downSpeed,
    progress?.diskSpeed,
    samples.at(-1)?.download ?? 0
  )

  const window = [...samples, next]
  return window.length > sampleSize ? window.slice(-sampleSize) : window
}
