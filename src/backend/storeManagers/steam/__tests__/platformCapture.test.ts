/**
 * Unit tests for the per-boot platform capture queue (D-05). The PICS capture
 * and merge it once serialised moved to Rust (79-41); the Rust tests in
 * gamelib-steamcm refresh::capture carry that behaviour.
 */

import { createPlatformCaptureQueue } from '../platformCapture'

describe('createPlatformCaptureQueue', () => {
  it('runs sections one at a time, in order', async () => {
    const { withPlatformCaptureLock } = createPlatformCaptureQueue()
    const order: string[] = []
    let releaseFirst: () => void = () => undefined
    const first = withPlatformCaptureLock(async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first:end')
    })
    const second = withPlatformCaptureLock(async () => {
      order.push('second')
    })
    await Promise.resolve()
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('does not wedge: a throwing section still lets the NEXT section run', async () => {
    const { withPlatformCaptureLock } = createPlatformCaptureQueue()
    await expect(
      withPlatformCaptureLock(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    await expect(
      withPlatformCaptureLock(() => Promise.resolve('ok'))
    ).resolves.toBe('ok')
  })
})
