import {
  __bottleLedgerSizeForTests,
  __resetBottleLedgerForTests,
  gamesRunningIn,
  markGameRunning,
  markGameStopped,
  otherGamesRunning
} from '../bottleLedger'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

describe('bottleLedger', () => {
  beforeEach(() => __resetBottleLedgerForTests())

  test('empty at load', () => {
    expect(__bottleLedgerSizeForTests()).toBe(0)
  })

  test('otherGamesRunning excludes the asking game', () => {
    markGameRunning('GameLib', 'gog:1')
    expect(otherGamesRunning('GameLib', 'legendary:A')).toEqual(['gog:1'])
    expect(otherGamesRunning('GameLib', 'gog:1')).toEqual([])
  })

  test('markGameStopped empties the entry; unknown key is a no-op', () => {
    markGameRunning('GameLib', 'gog:1')
    markGameStopped('GameLib', 'gog:2')
    expect(gamesRunningIn('GameLib')).toEqual(['gog:1'])
    markGameStopped('GameLib', 'gog:1')
    expect(__bottleLedgerSizeForTests()).toBe(0)
    markGameStopped('Nope', 'gog:1')
  })

  test('bottles are independent and double mark keeps one entry', () => {
    markGameRunning('A', '440')
    markGameRunning('A', '440')
    markGameRunning('B', '620')
    expect(gamesRunningIn('A')).toEqual(['440'])
    expect(gamesRunningIn('B')).toEqual(['620'])
  })

  test('invalid bottle or key is refused', () => {
    expect(markGameRunning('../x', 'gog:1')).toBe(false)
    expect(markGameRunning(' A', 'gog:1')).toBe(false)
    expect(markGameRunning('A', 'bogus')).toBe(false)
    expect(otherGamesRunning('../x', 'gog:1')).toEqual([])
    expect(__bottleLedgerSizeForTests()).toBe(0)
  })
})
