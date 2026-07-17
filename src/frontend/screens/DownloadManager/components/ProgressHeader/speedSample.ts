import { DownloadManagerState } from 'common/types'

export interface SpeedPoint {
  download: number
  disk: number
}

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
