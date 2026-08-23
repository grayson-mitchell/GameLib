/**
 * Unit tests for the D-11 send-handler observable (Phase 34.6 Plan 05 —
 * REQ-34.6-04/07/13). See `../sendChannelObservable.ts`'s module header for
 * the full contract this suite pins.
 */

const mockLogInfo = jest.fn()
jest.mock('../../logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  LogPrefix: {
    Backend: 'Backend'
  }
}))

import {
  SEND_HANDLER_MARKER,
  logSendHandlerReached
} from '../sendChannelObservable'

describe('sendChannelObservable (Phase 34.6 Plan 05 — REQ-34.6-04/07/13)', () => {
  beforeEach(() => {
    mockLogInfo.mockReset()
  })

  it('SEND_HANDLER_MARKER is the exact literal', () => {
    expect(SEND_HANDLER_MARKER).toBe('[GAMELIB_SIDECAR_SEND_HANDLER]')
  })

  it('logSendHandlerReached emits exactly one log line, matching the marker + channel name exactly', () => {
    logSendHandlerReached('frontendReady')

    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    expect(mockLogInfo).toHaveBeenCalledWith(
      '[GAMELIB_SIDECAR_SEND_HANDLER] frontendReady',
      'Backend'
    )
  })

  it('the emitted line contains ONLY the marker and channel name — no other varying content', () => {
    logSendHandlerReached('winetricksInstall')

    const [message] = mockLogInfo.mock.calls[0] as [string, string]
    expect(message).toBe('[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall')
  })

  it('never throws, even when the logger itself throws', () => {
    mockLogInfo.mockImplementation(() => {
      throw new Error('logger exploded')
    })

    expect(() => logSendHandlerReached('frontendReady')).not.toThrow()
  })

  // RED-PROOF (per acceptance criteria — proved by hand, then reverted; not a permanent test):
  // temporarily changing logSendHandlerReached's body to also interpolate a second `args`
  // parameter into the message (e.g. `${SEND_HANDLER_MARKER} ${channel} ${JSON.stringify(args)}`)
  // makes the exact-string assertions above fail, because the emitted line would then contain
  // extra content beyond the marker + channel name. This proves the args-exclusion property is
  // load-bearing, not just documentation. See SUMMARY.md for the manual proof transcript.
})
