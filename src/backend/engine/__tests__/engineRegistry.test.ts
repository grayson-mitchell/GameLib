import { createEngineRegistry } from '../engineRegistry'
import type { EngineSelection } from '../engineTypes'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const crossover: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/x'
}

describe('engineRegistry keys', () => {
  const { setEngineSelection, getEngineSelection } = createEngineRegistry()

  test('two registries share no selection', () => {
    const a = createEngineRegistry()
    const b = createEngineRegistry()
    a.setEngineSelection('440', crossover)
    expect(b.getEngineSelection('440')).toBeUndefined()
  })

  test('accepts a store-prefixed key and returns a copy', () => {
    expect(setEngineSelection('sideload:My Game', crossover)).toBe(true)
    const got = getEngineSelection('sideload:My Game')
    expect(got).toEqual(crossover)
    expect(got).not.toBe(crossover)
  })

  test('digits-only Steam key still works', () => {
    expect(setEngineSelection('440', crossover)).toBe(true)
    expect(getEngineSelection('440')).toEqual(crossover)
  })

  test('invalid keys are refused', () => {
    expect(setEngineSelection('gog:../x', crossover)).toBe(false)
    expect(setEngineSelection('abc', crossover)).toBe(false)
  })
})
