/**
 * 49-04 Task 2 (D-08, D-03, T-49-09, T-49-10, T-49-11): the session-epoch
 * fence, the in-memory outcome map, and its push/pull channel.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { addHandler, sendFrontendMessage } from 'backend/ipc'
import {
  __resetSignInEpochsForTests,
  bumpSignInEpoch,
  captureSignInEpoch,
  isSignInEpochCurrent
} from '../sessionEpoch'
import {
  __resetSignInProbeOutcomesForTests,
  getSignInProbeOutcomes,
  noteSignedOut,
  noteSignInSucceeded,
  publishSignInProbeOutcomes,
  recordSignInProbeOutcome,
  registerSignInProbeOutcomesHandler
} from '../outcomes'

jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))

const sendMock = sendFrontendMessage as unknown as jest.Mock
const addHandlerMock = addHandler as unknown as jest.Mock

beforeEach(() => {
  sendMock.mockReturnValue(true)
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
})

describe('sessionEpoch', () => {
  it('a bump invalidates a previously captured epoch for that store only', () => {
    const gog = captureSignInEpoch('gog')
    const nile = captureSignInEpoch('nile')
    expect(isSignInEpochCurrent('gog', gog)).toBe(true)

    bumpSignInEpoch('gog')

    expect(isSignInEpochCurrent('gog', gog)).toBe(false)
    expect(isSignInEpochCurrent('nile', nile)).toBe(true)
  })

  it('a bump of nile leaves gog current', () => {
    const gog = captureSignInEpoch('gog')
    bumpSignInEpoch('nile')
    expect(isSignInEpochCurrent('gog', gog)).toBe(true)
  })

  it('a fresh capture after a bump is current', () => {
    bumpSignInEpoch('steam')
    const after = captureSignInEpoch('steam')
    expect(isSignInEpochCurrent('steam', after)).toBe(true)
  })
})

describe('outcome map', () => {
  it('records an outcome and returns it', () => {
    recordSignInProbeOutcome('gog', 'expired')
    expect(getSignInProbeOutcomes()).toEqual({ gog: 'expired' })
  })

  it('mutating the returned object does not change the module map', () => {
    recordSignInProbeOutcome('gog', 'expired')
    const copy = getSignInProbeOutcomes()
    copy.gog = 'healthy'
    copy.nile = 'unknown'
    expect(getSignInProbeOutcomes()).toEqual({ gog: 'expired' })
  })

  it('recording undefined deletes the entry', () => {
    recordSignInProbeOutcome('gog', 'expired')
    recordSignInProbeOutcome('gog', undefined)
    expect(getSignInProbeOutcomes()).toEqual({})
  })
})

describe('publishSignInProbeOutcomes', () => {
  it('sends one signInProbeOutcomes message whose only key is outcomes', () => {
    recordSignInProbeOutcome('legendary', 'healthy')
    recordSignInProbeOutcome('humble', 'unknown')

    publishSignInProbeOutcomes()

    expect(sendMock).toHaveBeenCalledTimes(1)
    const [channel, payload] = sendMock.mock.calls[0]
    expect(channel).toBe('signInProbeOutcomes')
    expect(Object.keys(payload)).toEqual(['outcomes'])
    expect(payload.outcomes).toEqual({
      legendary: 'healthy',
      humble: 'unknown'
    })
    for (const value of Object.values(payload.outcomes)) {
      expect(['healthy', 'expired', 'unknown']).toContain(value)
    }
  })

  it('publishes an empty map as {} (all pending)', () => {
    publishSignInProbeOutcomes()
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: {}
    })
  })
})

describe('registerSignInProbeOutcomesHandler', () => {
  const registrations = () =>
    addHandlerMock.mock.calls.filter(
      (call) => call[0] === 'getSignInProbeOutcomes'
    )

  it('registers getSignInProbeOutcomes once, however many times it is called', () => {
    registerSignInProbeOutcomesHandler()
    registerSignInProbeOutcomesHandler()
    expect(registrations()).toHaveLength(1)
  })

  it('the registered handler returns the current map and starts nothing', () => {
    registerSignInProbeOutcomesHandler()
    recordSignInProbeOutcome('nile', 'expired')
    sendMock.mockClear()

    expect(registrations()).toHaveLength(1)
    const handler = registrations()[0][1] as () => unknown
    expect(handler()).toEqual({ nile: 'expired' })
    expect(sendMock).not.toHaveBeenCalled()
    expect(addHandlerMock).toHaveBeenCalledTimes(1)
  })

  it('the registered handler returns a copy, not the module map', () => {
    registerSignInProbeOutcomesHandler()
    recordSignInProbeOutcome('nile', 'expired')
    expect(registrations()).toHaveLength(1)
    const handler = registrations()[0][1] as () => Record<string, string>
    const result = handler()
    result.nile = 'healthy'
    expect(getSignInProbeOutcomes()).toEqual({ nile: 'expired' })
  })
})

describe('noteSignInSucceeded / noteSignedOut (D-03: no probe, no keyring read)', () => {
  it('noteSignInSucceeded bumps the epoch, records healthy and publishes once', () => {
    const before = captureSignInEpoch('legendary')

    noteSignInSucceeded('legendary')

    expect(isSignInEpochCurrent('legendary', before)).toBe(false)
    expect(getSignInProbeOutcomes()).toEqual({ legendary: 'healthy' })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: { legendary: 'healthy' }
    })
  })

  it('noteSignInSucceeded replaces a stale expired outcome with healthy', () => {
    recordSignInProbeOutcome('legendary', 'expired')
    noteSignInSucceeded('legendary')
    expect(getSignInProbeOutcomes()).toEqual({ legendary: 'healthy' })
  })

  it('noteSignedOut bumps the epoch, drops the entry and publishes once', () => {
    recordSignInProbeOutcome('gog', 'healthy')
    const before = captureSignInEpoch('gog')

    noteSignedOut('gog')

    expect(isSignInEpochCurrent('gog', before)).toBe(false)
    expect(getSignInProbeOutcomes()).toEqual({})
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: {}
    })
  })
})

describe('outcomes.ts source gates', () => {
  const read = (file: string) =>
    stripSourceComments(readFileSync(join(__dirname, '..', file), 'utf8'))

  it('the getSignInProbeOutcomes handler body is a pure getter (T-49-11)', () => {
    const source = read('outcomes.ts')
    const match =
      /addHandler\(\s*'getSignInProbeOutcomes',\s*\(\)\s*=>\s*([^)]*\(\))\s*\)/.exec(
        source
      )
    expect(match).not.toBeNull()
    const identifiers = (match?.[1] ?? '').match(/[A-Za-z_$][\w$]*/g)
    expect(identifiers).toEqual(['getSignInProbeOutcomes'])
  })

  it('outcomes.ts and sessionEpoch.ts spawn nothing and create no timer', () => {
    for (const file of ['outcomes.ts', 'sessionEpoch.ts']) {
      expect(read(file)).not.toMatch(
        /setTimeout|setInterval|spawn|exec\(|child_process|net\.|watch\(/
      )
    }
  })

  it('sessionEpoch.ts has at most one import and it is type-only', () => {
    const imports = read('sessionEpoch.ts')
      .split('\n')
      .filter((l) => /^import /.test(l))
    expect(imports.length).toBeLessThanOrEqual(1)
    for (const line of imports) {
      expect(line).toMatch(/^import type /)
    }
  })

  it('outcomes.ts never logs the outcome map or any captured output', () => {
    expect(read('outcomes.ts')).not.toMatch(
      /logInfo|logWarning|logError|console\./
    )
  })
})
