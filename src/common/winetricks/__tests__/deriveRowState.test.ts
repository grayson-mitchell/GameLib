import type { WinetricksQueueRun } from 'common/types'
import {
  clearVerbError,
  deriveRowState,
  foldRunOutcomes,
  VerbErrorMap,
  WinetricksRowState
} from '../deriveRowState'

type RunSlice = Pick<WinetricksQueueRun, 'outcomes' | 'currentVerb' | 'status'>

function flagged(verb: string): VerbErrorMap {
  return { [verb]: true }
}

function running(
  outcomes: WinetricksQueueRun['outcomes'],
  currentVerb = ''
): RunSlice {
  return { outcomes, currentVerb, status: 'running' }
}

// Compile-time exhaustiveness guard: adding or removing a state breaks this
// literal, so the precedence cases below cannot silently miss a new state.
const ALL_STATES: Record<WinetricksRowState, true> = {
  available: true,
  selected: true,
  queued: true,
  installing: true,
  installed: true,
  errored: true
}

describe('WinetricksRowState', () => {
  it('has exactly the six states of the checkbox model (D-10, D-13)', () => {
    expect(Object.keys(ALL_STATES).sort()).toEqual([
      'available',
      'errored',
      'installed',
      'installing',
      'queued',
      'selected'
    ])
  })
})

// One case per precedence rule that a wrong ordering would fail.
describe('deriveRowState precedence', () => {
  it('rule 1: installing beats installed for the current verb of a running run', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: ['vcrun2019'],
        selected: true,
        run: running({ vcrun2019: 'installing' }, 'vcrun2019'),
        erroredVerbs: flagged('vcrun2019')
      })
    ).toBe('installing')
  })

  it('rule 2: installed beats queued, errored and selected', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: ['vcrun2019'],
        selected: true,
        run: running({ vcrun2019: 'pending' }, 'vcrun2013'),
        erroredVerbs: flagged('vcrun2019')
      })
    ).toBe('installed')
  })

  it('rule 3: queued beats errored and selected while the run is running', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: true,
        run: running({ vcrun2019: 'pending' }, 'vcrun2013'),
        erroredVerbs: flagged('vcrun2019')
      })
    ).toBe('queued')
  })

  it('rule 4: errored beats selected', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: true,
        run: null,
        erroredVerbs: flagged('vcrun2019')
      })
    ).toBe('errored')
  })

  it('rule 5: selected when ticked and nothing outranks it', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: true,
        run: null,
        erroredVerbs: {}
      })
    ).toBe('selected')
  })

  it('rule 6: available when nothing applies', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: false,
        run: null,
        erroredVerbs: {}
      })
    ).toBe('available')
  })
})

describe('deriveRowState: the checkbox model', () => {
  it('D-10: an installed row is never selectable -- installed wins even when selected is true', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: ['vcrun2019'],
        selected: true,
        run: null,
        erroredVerbs: {}
      })
    ).toBe('installed')
  })

  it('D-13: a pending verb of a running run derives queued and the current verb derives installing', () => {
    const run = running(
      { vcrun2013: 'installing', vcrun2019: 'pending' },
      'vcrun2013'
    )
    const base = { installed: [], selected: false, run, erroredVerbs: {} }
    expect(deriveRowState({ ...base, verb: 'vcrun2019' })).toBe('queued')
    expect(deriveRowState({ ...base, verb: 'vcrun2013' })).toBe('installing')
  })

  it('a verb that is not part of the run is unaffected by it', () => {
    expect(
      deriveRowState({
        verb: 'physx',
        installed: [],
        selected: false,
        run: running({ vcrun2019: 'pending' }, 'vcrun2013'),
        erroredVerbs: {}
      })
    ).toBe('available')
  })

  it('a done run with a stale pending outcome does not lock the row as queued', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: false,
        run: {
          outcomes: { vcrun2019: 'pending' },
          currentVerb: '',
          status: 'done'
        },
        erroredVerbs: {}
      })
    ).toBe('available')
  })

  it('a done run keeps a stale currentVerb from showing installing', () => {
    expect(
      deriveRowState({
        verb: 'vcrun2019',
        installed: [],
        selected: false,
        run: {
          outcomes: { vcrun2019: 'installed' },
          currentVerb: 'vcrun2019',
          status: 'done'
        },
        erroredVerbs: {}
      })
    ).toBe('available')
  })

  it('a cancelled outcome derives available, or selected when ticked', () => {
    const run: RunSlice = {
      outcomes: { vcrun2019: 'cancelled' },
      currentVerb: '',
      status: 'done'
    }
    const base = { verb: 'vcrun2019', installed: [], run, erroredVerbs: {} }
    expect(deriveRowState({ ...base, selected: false })).toBe('available')
    expect(deriveRowState({ ...base, selected: true })).toBe('selected')
  })
})

describe('foldRunOutcomes (D-12)', () => {
  it('flags every verb whose outcome is failed', () => {
    const result = foldRunOutcomes(
      {},
      {
        verbs: ['a', 'b', 'c'],
        outcomes: { a: 'failed', b: 'installed', c: 'failed' }
      }
    )
    expect(result).toEqual({ a: true, c: true })
  })

  it('keeps unrelated flags while adding new ones', () => {
    const current = flagged('old')
    const result = foldRunOutcomes(current, {
      verbs: ['a'],
      outcomes: { a: 'failed' }
    })
    expect(result).toEqual({ old: true, a: true })
    expect(result).not.toBe(current)
  })

  it('clears a flag when the verb outcome becomes installing', () => {
    expect(
      foldRunOutcomes(flagged('a'), {
        verbs: ['a'],
        outcomes: { a: 'installing' }
      })
    ).toEqual({})
  })

  it('clears a flag when the verb outcome becomes installed', () => {
    expect(
      foldRunOutcomes(flagged('a'), {
        verbs: ['a'],
        outcomes: { a: 'installed' }
      })
    ).toEqual({})
  })

  it('leaves a flag alone while the verb is pending or cancelled', () => {
    const current = flagged('a')
    expect(
      foldRunOutcomes(current, { verbs: ['a'], outcomes: { a: 'pending' } })
    ).toBe(current)
    expect(
      foldRunOutcomes(current, { verbs: ['a'], outcomes: { a: 'cancelled' } })
    ).toBe(current)
  })

  it('returns the SAME reference for a null run', () => {
    const current = flagged('a')
    expect(foldRunOutcomes(current, null)).toBe(current)
  })

  it('returns the SAME reference when nothing changes (already flagged, or nothing failed)', () => {
    const current = flagged('a')
    expect(
      foldRunOutcomes(current, { verbs: ['a'], outcomes: { a: 'failed' } })
    ).toBe(current)
    const empty: VerbErrorMap = {}
    expect(
      foldRunOutcomes(empty, { verbs: ['b'], outcomes: { b: 'installed' } })
    ).toBe(empty)
  })

  it('a flagged verb derives errored once the run has stopped', () => {
    const run: RunSlice = {
      outcomes: { xact: 'failed' },
      currentVerb: '',
      status: 'done'
    }
    const erroredVerbs = foldRunOutcomes(
      {},
      { verbs: ['xact'], outcomes: run.outcomes }
    )
    expect(
      deriveRowState({
        verb: 'xact',
        installed: [],
        selected: false,
        run,
        erroredVerbs
      })
    ).toBe('errored')
  })
})

describe('clearVerbError', () => {
  it('clearing a flagged verb returns a new map without it', () => {
    const current: VerbErrorMap = { xact: true, vcrun2019: true }
    const result = clearVerbError(current, 'xact')
    expect(result).not.toBe(current)
    expect(result.xact).toBeUndefined()
    expect(result.vcrun2019).toBe(true)
  })

  it('clearing an unflagged verb returns the SAME object reference', () => {
    const current: VerbErrorMap = { vcrun2019: true }
    const result = clearVerbError(current, 'xact')
    expect(result).toBe(current)
  })
})
