/**
 * Regression: a paused download must report 0 MB/s in the ProgressHeader.
 *
 * The previous inline logic only reset the speed on 'idle' and otherwise
 * carried the last nonzero downSpeed forward whenever a fresh progress update
 * was absent. On 'paused' that left the header frozen at the pre-pause rate, so
 * a paused download never looked paused. nextSpeedSample fixes this by
 * returning 0 for any non-'running' state.
 */
import { nextSpeedSample } from '../speedSample'

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
