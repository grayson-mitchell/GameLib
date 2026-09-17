import {
  attributeProgressEvent,
  clearVerbError,
  deriveRowState,
  VerbErrorMap
} from '../deriveRowState'

// A verb from NEEDS_GUI_WINETRICKS_VERBS (src/common/winetricks/verbs.ts),
// used across the precedence tests below.
const NEEDS_GUI_VERB = 'ubisoftconnect'

function flagged(verb: string): VerbErrorMap {
  return { [verb]: true }
}

describe('deriveRowState precedence', () => {
  it('Test 1: needsGui wins even when installing, installed, AND errored simultaneously', () => {
    const state = deriveRowState({
      verb: NEEDS_GUI_VERB,
      installed: [NEEDS_GUI_VERB],
      installing: true,
      installingComponent: NEEDS_GUI_VERB,
      erroredVerbs: flagged(NEEDS_GUI_VERB)
    })
    expect(state).toBe('needsGui')
  })

  it('Test 2: installing === true and installingComponent === verb returns installing', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: [],
      installing: true,
      installingComponent: 'vcrun2019',
      erroredVerbs: {}
    })
    expect(state).toBe('installing')
  })

  it('Test 3: a verb present in installed returns installed even when also flagged errored', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: ['vcrun2019'],
      installing: false,
      installingComponent: '',
      erroredVerbs: flagged('vcrun2019')
    })
    expect(state).toBe('installed')
  })

  it('Test 4: a verb flagged errored, not installed, not installing, returns errored', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: [],
      installing: false,
      installingComponent: '',
      erroredVerbs: flagged('vcrun2019')
    })
    expect(state).toBe('errored')
  })

  it('Test 5: installing another verb, not installed/errored, returns installingElsewhere', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: [],
      installing: true,
      installingComponent: 'vcrun2013',
      erroredVerbs: {}
    })
    expect(state).toBe('installingElsewhere')
  })

  it('Test 6: none of the above returns available', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: [],
      installing: false,
      installingComponent: '',
      erroredVerbs: {}
    })
    expect(state).toBe('available')
  })

  it('Test 7: installing === false with a stale non-empty installingComponent returns available', () => {
    const state = deriveRowState({
      verb: 'vcrun2019',
      installed: [],
      installing: false,
      installingComponent: 'vcrun2019',
      erroredVerbs: {}
    })
    expect(state).toBe('available')
  })
})

describe('attributeProgressEvent', () => {
  it('Test 8: empty installingComponent returns the SAME object reference, even on an error message', () => {
    const current: VerbErrorMap = {}
    const result = attributeProgressEvent(current, {
      messages: ['wine: Unhandled page fault ERR:'],
      installingComponent: ''
    })
    expect(result).toBe(current)
  })

  it('Test 9: an error message (case-insensitive) flags the installingComponent verb', () => {
    const current: VerbErrorMap = {}
    const result = attributeProgressEvent(current, {
      messages: ['wine: Unhandled page fault ERR:'],
      installingComponent: 'xact'
    })
    expect(result).not.toBe(current)
    expect(result.xact).toBe(true)
  })

  it('Test 10: non-error messages return the SAME object reference (no state churn)', () => {
    const current: VerbErrorMap = {}
    const result = attributeProgressEvent(current, {
      messages: ['Installing xact...', 'Done'],
      installingComponent: 'xact'
    })
    expect(result).toBe(current)
  })

  it('Test 11: attributing an already-flagged verb again returns the SAME object reference', () => {
    const current: VerbErrorMap = flagged('xact')
    const result = attributeProgressEvent(current, {
      messages: ['wine: Unhandled page fault ERR:'],
      installingComponent: 'xact'
    })
    expect(result).toBe(current)
  })

  it('Test 12: a " warn" message does NOT flag the verb', () => {
    const current: VerbErrorMap = {}
    const result = attributeProgressEvent(current, {
      messages: ['fixme: something not implemented WARN:'],
      installingComponent: 'xact'
    })
    expect(result).toBe(current)
    expect(result.xact).toBeUndefined()
  })

  it('Test 13: " err" requires a leading space -- "terrible"/"Error:" at position 0 does not flag', () => {
    const current: VerbErrorMap = {}
    const result = attributeProgressEvent(current, {
      messages: ['This installer is terrible', 'Error: something went wrong'],
      installingComponent: 'xact'
    })
    expect(result).toBe(current)
    expect(result.xact).toBeUndefined()
  })
})

describe('clearVerbError', () => {
  it('Test 14: clearing a flagged verb returns a new map without it', () => {
    const current: VerbErrorMap = { xact: true, vcrun2019: true }
    const result = clearVerbError(current, 'xact')
    expect(result).not.toBe(current)
    expect(result.xact).toBeUndefined()
    expect(result.vcrun2019).toBe(true)
  })

  it('Test 15: clearing an unflagged verb returns the SAME object reference', () => {
    const current: VerbErrorMap = { vcrun2019: true }
    const result = clearVerbError(current, 'xact')
    expect(result).toBe(current)
  })
})
