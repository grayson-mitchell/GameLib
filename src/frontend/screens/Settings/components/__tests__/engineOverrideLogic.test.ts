import type { EngineOption } from 'common/types/engine'
import {
  effectiveSelectValue,
  isUnsupportedEngineId,
  needsFreshBottleConfirm,
  visibleOptions
} from '../engineOverrideLogic'

const opt = (id: string, kind: EngineOption['kind']): EngineOption => ({
  id,
  kind,
  label: id,
  available: true,
  installed: true,
  isPreviousPin: false
})

describe('effectiveSelectValue', () => {
  it('derives when nothing is stored', () => {
    expect(effectiveSelectValue(undefined, 'legacy:Wine GPTK')).toBe(
      'legacy:Wine GPTK'
    )
  })
  it('prefers the stored pick', () => {
    expect(effectiveSelectValue('pinned:x', 'crossover')).toBe('pinned:x')
  })
  it('falls back to automatic', () => {
    expect(effectiveSelectValue(undefined, undefined)).toBe('automatic')
  })
})

describe('isUnsupportedEngineId (D-14)', () => {
  it.each(['pinned:a', 'wine-manager:b', 'legacy:c'])(
    '%s is unsupported',
    (id) => expect(isUnsupportedEngineId(id)).toBe(true)
  )
  it.each(['automatic', 'crossover'])('%s is supported', (id) =>
    expect(isUnsupportedEngineId(id)).toBe(false)
  )
})

describe('visibleOptions (D-07, D-11)', () => {
  const all = [
    opt('automatic', 'automatic'),
    opt('legacy:Wine GPTK', 'legacy'),
    opt('wine-manager:/Users/x/wine', 'wine-manager'),
    opt('pinned:p', 'pinned')
  ]
  it('hides Legacy unless current and drops any path-like id', () => {
    expect(visibleOptions(all, 'automatic').map((o) => o.id)).toEqual([
      'automatic',
      'pinned:p'
    ])
    expect(visibleOptions(all, 'legacy:Wine GPTK').map((o) => o.id)).toEqual([
      'automatic',
      'legacy:Wine GPTK',
      'pinned:p'
    ])
  })
})

describe('needsFreshBottleConfirm (D-04)', () => {
  it('asks for plain prefix to automatic or crossover', () => {
    expect(needsFreshBottleConfirm('plain', 'automatic')).toBe(true)
    expect(needsFreshBottleConfirm('plain', 'crossover')).toBe(true)
  })
  it('does not ask for pinned, bottle or unknown', () => {
    expect(needsFreshBottleConfirm('plain', 'pinned:x')).toBe(false)
    expect(needsFreshBottleConfirm('bottle', 'crossover')).toBe(false)
    expect(needsFreshBottleConfirm(null, 'crossover')).toBe(false)
  })
})
