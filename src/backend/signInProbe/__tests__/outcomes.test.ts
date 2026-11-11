/**
 * 49-04 Task 2 (D-08, D-03, T-49-09, T-49-10, T-49-11): the session-epoch
 * fence, the in-memory outcome map, and its push/pull channel. 66.3-13: both are
 * boot-owned instances, so every case builds its own and no reset hook exists.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createSignInEpochs } from '../sessionEpoch'
import { createSignInProbeOutcomes } from '../outcomes'

function build() {
  const ipc = createIpcRegistry()
  const push = jest.fn()
  const epochs = createSignInEpochs()
  const outcomes = createSignInProbeOutcomes({ ipc, push, epochs })
  return { ipc, push, epochs, outcomes }
}

describe('sessionEpoch', () => {
  it('a bump invalidates a previously captured epoch for that store only', () => {
    const { epochs } = build()
    const gog = epochs.capture('gog')
    const nile = epochs.capture('nile')
    expect(epochs.isCurrent('gog', gog)).toBe(true)

    epochs.bump('gog')

    expect(epochs.isCurrent('gog', gog)).toBe(false)
    expect(epochs.isCurrent('nile', nile)).toBe(true)
  })

  it('a bump of nile leaves gog current', () => {
    const { epochs } = build()
    const gog = epochs.capture('gog')
    epochs.bump('nile')
    expect(epochs.isCurrent('gog', gog)).toBe(true)
  })

  it('a fresh capture after a bump is current', () => {
    const { epochs } = build()
    epochs.bump('steam')
    const after = epochs.capture('steam')
    expect(epochs.isCurrent('steam', after)).toBe(true)
  })

  it('a capture taken before a bump on another instance is unaffected (one instance per boot)', () => {
    const a = createSignInEpochs()
    const b = createSignInEpochs()
    const capture = a.capture('humble')
    b.bump('humble')
    expect(a.isCurrent('humble', capture)).toBe(true)
  })
})

describe('outcome map', () => {
  it('records an outcome and returns it', () => {
    const { outcomes } = build()
    outcomes.record('gog', 'expired')
    expect(outcomes.get()).toEqual({ gog: 'expired' })
  })

  it('mutating the returned object does not change the instance map', () => {
    const { outcomes } = build()
    outcomes.record('gog', 'expired')
    const copy = outcomes.get()
    copy.gog = 'healthy'
    copy.nile = 'unknown'
    expect(outcomes.get()).toEqual({ gog: 'expired' })
  })

  it('recording undefined deletes the entry', () => {
    const { outcomes } = build()
    outcomes.record('gog', 'expired')
    outcomes.record('gog', undefined)
    expect(outcomes.get()).toEqual({})
  })

  it('two instances never share a map', () => {
    const one = build()
    const two = build()
    one.outcomes.record('gog', 'expired')
    expect(two.outcomes.get()).toEqual({})
  })
})

describe('publish', () => {
  it('pushes one signInProbeOutcomes message whose only key is outcomes', () => {
    const { outcomes, push } = build()
    outcomes.record('legendary', 'healthy')
    outcomes.record('humble', 'unknown')

    outcomes.publish()

    expect(push).toHaveBeenCalledTimes(1)
    const [channel, payload] = push.mock.calls[0]
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
    const { outcomes, push } = build()
    outcomes.publish()
    expect(push).toHaveBeenCalledWith('signInProbeOutcomes', { outcomes: {} })
  })
})

describe('registerHandler', () => {
  it('registers getSignInProbeOutcomes once, however many times it is called', () => {
    const { outcomes, ipc } = build()
    const handle = jest.spyOn(ipc, 'handle')
    outcomes.registerHandler()
    outcomes.registerHandler()
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0]?.[0]).toBe('getSignInProbeOutcomes')
  })

  it('the registered handler returns the current map and starts nothing', () => {
    const { outcomes, ipc, push } = build()
    outcomes.registerHandler()
    outcomes.record('nile', 'expired')

    const handler = ipc
      .handlerMap()
      .get('getSignInProbeOutcomes') as () => unknown
    expect(handler()).toEqual({ nile: 'expired' })
    expect(push).not.toHaveBeenCalled()
  })

  it('the registered handler returns a copy, not the instance map', () => {
    const { outcomes, ipc } = build()
    outcomes.registerHandler()
    outcomes.record('nile', 'expired')
    const handler = ipc
      .handlerMap()
      .get('getSignInProbeOutcomes') as () => Record<string, string>
    const result = handler()
    result.nile = 'healthy'
    expect(outcomes.get()).toEqual({ nile: 'expired' })
  })
})

describe('noteSignInSucceeded / noteSignedOut (D-03: no probe, no keyring read)', () => {
  it('noteSignInSucceeded bumps the epoch, records healthy and publishes once', () => {
    const { outcomes, epochs, push } = build()
    const before = epochs.capture('legendary')

    outcomes.noteSignInSucceeded('legendary')

    expect(epochs.isCurrent('legendary', before)).toBe(false)
    expect(outcomes.get()).toEqual({ legendary: 'healthy' })
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: { legendary: 'healthy' }
    })
  })

  it('noteSignInSucceeded replaces a stale expired outcome with healthy', () => {
    const { outcomes } = build()
    outcomes.record('legendary', 'expired')
    outcomes.noteSignInSucceeded('legendary')
    expect(outcomes.get()).toEqual({ legendary: 'healthy' })
  })

  it('noteSignedOut bumps the epoch, drops the entry and publishes once', () => {
    const { outcomes, epochs, push } = build()
    outcomes.record('gog', 'healthy')
    const before = epochs.capture('gog')

    outcomes.noteSignedOut('gog')

    expect(epochs.isCurrent('gog', before)).toBe(false)
    expect(outcomes.get()).toEqual({})
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('signInProbeOutcomes', { outcomes: {} })
  })

  it('a bump through one store does not move another store epoch', () => {
    const { outcomes, epochs } = build()
    const nile = epochs.capture('nile')
    outcomes.noteSignInSucceeded('gog')
    expect(epochs.isCurrent('nile', nile)).toBe(true)
  })
})

describe('outcomes.ts source gates', () => {
  const read = (file: string) =>
    stripSourceComments(readFileSync(join(__dirname, '..', file), 'utf8'))

  it('the getSignInProbeOutcomes handler body is a pure getter (T-49-11)', () => {
    const source = read('outcomes.ts')
    const match =
      /handleTyped\(\s*deps\.ipc,\s*'getSignInProbeOutcomes',\s*\(\)\s*=>\s*([^)]*\(\))\s*\)/.exec(
        source
      )
    expect(match).not.toBeNull()
    const identifiers = (match?.[1] ?? '').match(/[A-Za-z_$][\w$]*/g)
    expect(identifiers).toEqual(['get'])
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
