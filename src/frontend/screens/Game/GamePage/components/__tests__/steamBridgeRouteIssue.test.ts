import {
  capSymbols,
  cappedSymbolList,
  resolveBridgeRouteIssue,
  SYMBOL_CAP
} from '../steamBridgeRouteIssue'

const R = 'steam.bridge.route.reason.'
const syms = (n: number) => Array.from({ length: n }, (_, i) => `sym${i}`)

describe('capSymbols', () => {
  it('caps at 10 and counts the rest', () => {
    const r = capSymbols(syms(25))
    expect(SYMBOL_CAP).toBe(10)
    expect(r.shown).toEqual(syms(25).slice(0, 10))
    expect(r.hiddenCount).toBe(15)
  })
  it('keeps short lists whole', () => {
    expect(capSymbols(syms(3))).toEqual({ shown: syms(3), hiddenCount: 0 })
    expect(capSymbols([])).toEqual({ shown: [], hiddenCount: 0 })
  })
})

describe('resolveBridgeRouteIssue', () => {
  it('notCovered wins when symbols exist', () => {
    expect(
      resolveBridgeRouteIssue({
        reasonKey: `${R}scanMiss`,
        missingSymbols: syms(25)
      })
    ).toEqual({ kind: 'notCovered', count: 25 })
    expect(
      resolveBridgeRouteIssue({ reasonKey: null, missingSymbols: syms(2) })
    ).toEqual({ kind: 'notCovered', count: 2 })
  })
  it.each([
    ['knownBad', 'knownBad'],
    ['failedThisSession', 'failedThisSession'],
    ['win64NoShim', 'win64NoShim'],
    ['scanMiss', 'scanMiss']
  ])('maps %s with no symbols', (name, kind) => {
    expect(
      resolveBridgeRouteIssue({ reasonKey: `${R}${name}`, missingSymbols: [] })
    ).toEqual({ kind, count: 0 })
  })
  it.each([
    'seed',
    'scanClean',
    'pendingScan',
    'noSteamApi',
    'userForcedBridge',
    'userForcedBottle'
  ])('no badge for benign %s', (name) => {
    expect(
      resolveBridgeRouteIssue({ reasonKey: `${R}${name}`, missingSymbols: [] })
    ).toBeNull()
  })
  it('no badge for null reason', () => {
    expect(
      resolveBridgeRouteIssue({ reasonKey: null, missingSymbols: [] })
    ).toBeNull()
  })
})

describe('cappedSymbolList', () => {
  it('joins everything when within the cap', () => {
    expect(cappedSymbolList(syms(2), () => 'x')).toBe('sym0, sym1')
  })
  it('appends the more suffix past the cap', () => {
    expect(cappedSymbolList(syms(12), (n) => `and ${n} more`)).toBe(
      `${syms(10).join(', ')}, and 2 more`
    )
  })
})
