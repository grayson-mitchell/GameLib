import { createBottleLedger } from '../bottleLedger'
import type { BottleLedger } from '../bottleLedger'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

describe('bottleLedger', () => {
  let ledger: BottleLedger
  beforeEach(() => {
    ledger = createBottleLedger()
  })

  test('empty at construction; two ledgers share nothing', () => {
    expect(ledger.size()).toBe(0)
    ledger.markGameRunning('GameLib', 'gog:1')
    expect(createBottleLedger().gamesRunningIn('GameLib')).toEqual([])
  })

  test('otherGamesRunning excludes the asking game', () => {
    ledger.markGameRunning('GameLib', 'gog:1')
    expect(ledger.otherGamesRunning('GameLib', 'legendary:A')).toEqual([
      'gog:1'
    ])
    expect(ledger.otherGamesRunning('GameLib', 'gog:1')).toEqual([])
  })

  test('markGameStopped empties the entry; unknown key is a no-op', () => {
    ledger.markGameRunning('GameLib', 'gog:1')
    ledger.markGameStopped('GameLib', 'gog:2')
    expect(ledger.gamesRunningIn('GameLib')).toEqual(['gog:1'])
    ledger.markGameStopped('GameLib', 'gog:1')
    expect(ledger.size()).toBe(0)
    ledger.markGameStopped('Nope', 'gog:1')
  })

  test('bottles are independent and double mark keeps one entry', () => {
    ledger.markGameRunning('A', '440')
    ledger.markGameRunning('A', '440')
    ledger.markGameRunning('B', '620')
    expect(ledger.gamesRunningIn('A')).toEqual(['440'])
    expect(ledger.gamesRunningIn('B')).toEqual(['620'])
  })

  test('invalid bottle or key is refused', () => {
    expect(ledger.markGameRunning('../x', 'gog:1')).toBe(false)
    expect(ledger.markGameRunning(' A', 'gog:1')).toBe(false)
    expect(ledger.markGameRunning('A', 'bogus')).toBe(false)
    expect(ledger.otherGamesRunning('../x', 'gog:1')).toEqual([])
    expect(ledger.size()).toBe(0)
  })
})
