/**
 * The narrowing of Rust's engine decision replies at the Steam bridge (Phase 87, 87-54): a well-formed reply passes
 * through unchanged and anything else throws, so a launch never runs on a guess.
 */
import {
  creationDecisionFrom,
  launchDecisionFrom,
  preflightFrom
} from '../engine/engineDecisionReply'

describe('preflightFrom', () => {
  it.each(['healthy', 'expired', 'broken', 'missing'])(
    'passes a %s pre-flight through unchanged',
    (kind) => {
      const reply = { kind, detail: 'x' }
      expect(preflightFrom(reply)).toBe(reply)
    }
  )

  it.each([undefined, null, 'healthy', [], { kind: 'unknown' }, {}])(
    'throws for %p',
    (reply) => {
      expect(() => preflightFrom(reply)).toThrow(/pre-flight reply/)
    }
  )
})

describe('launchDecisionFrom', () => {
  const use = {
    kind: 'use',
    selection: { kind: 'crossover', reason: 'cx-healthy' },
    preflight: null,
    pin: null,
    needsDownload: false,
    override: 'automatic',
    logLines: ['engine=crossover']
  }

  it('passes a use decision and an unavailable one through unchanged', () => {
    expect(launchDecisionFrom(use)).toBe(use)
    const unavailable = { kind: 'unavailable', override: 'x', detail: 'd' }
    expect(launchDecisionFrom(unavailable)).toBe(unavailable)
  })

  it.each([
    undefined,
    null,
    'use',
    { kind: 'use' },
    { kind: 'use', selection: 1, logLines: [] },
    { kind: 'use', selection: {}, logLines: 'no' },
    { kind: 'other' }
  ])('throws for %p', (reply) => {
    expect(() => launchDecisionFrom(reply)).toThrow(/launch decision reply/)
  })
})

describe('creationDecisionFrom', () => {
  it('unwraps the decision from the op reply', () => {
    const decision = { kind: 'crossover', createTimeoutMs: 1 }
    expect(creationDecisionFrom({ decision, createCapMs: 1 })).toBe(decision)
    const pinned = { kind: 'pinned', reason: 'cx-missing', pin: {} }
    expect(creationDecisionFrom({ decision: pinned })).toBe(pinned)
  })

  it.each([
    undefined,
    null,
    {},
    { decision: { kind: 'other' } },
    { kind: 'pinned' }
  ])('throws for %p', (reply) => {
    expect(() => creationDecisionFrom(reply)).toThrow(/creation decision reply/)
  })
})
