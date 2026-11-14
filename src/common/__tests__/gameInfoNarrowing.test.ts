import { asStoreGame, isStoreGame } from '../gameInfoNarrowing'
import type { GameInfo, GameInfoByRunner, GameInfoCore, Runner } from '../types'
import type { SteamGameInfo } from '../types/steam'
import type { GogGameInfo } from '../types/gog'
import type { LegendaryGameInfo } from '../types/legendary'
import type { NileGameInfo } from '../types/nile'
import type { SideloadGameInfo } from '../types/sideload'

const RUNNERS: Runner[] = ['legendary', 'gog', 'sideload', 'nile', 'steam']

const base = {
  app_name: 'x',
  title: 'X',
  art_cover: '',
  art_square: '',
  is_installed: false,
  canRunOffline: false,
  install: {}
}

const steam: SteamGameInfo = { ...base, runner: 'steam' }
const gog: GogGameInfo = { ...base, runner: 'gog' }
const legendary: LegendaryGameInfo = { ...base, runner: 'legendary' }
const nile: NileGameInfo = { ...base, runner: 'nile' }
const sideload: SideloadGameInfo = { ...base, runner: 'sideload' }

const fixtures: Record<Runner, GameInfoCore> = {
  steam,
  gog,
  legendary,
  nile,
  sideload
}

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T

// Drift guard (T-70-21, D-10 technique on the union): a member added to the
// union without a GameInfoByRunner entry (or vice versa) fails to compile.
type _NoDrift = Expect<Equal<GameInfoByRunner[Runner], GameInfo>>
// Negative control: the guard must reject a union that differs.
type _Widened = GameInfo | { runner: 'steam'; extra_key: string }
// @ts-expect-error the guard must reject a union that differs
type _DriftControl = Expect<Equal<GameInfoByRunner[Runner], _Widened>>

// Type level: members are assignable to the GameInfo union and to the core.
const asFat: GameInfo[] = [steam, gog, legendary, nile, sideload]
const asCore: GameInfoCore[] = [steam, gog, legendary, nile, sideload]

const fat: GameInfo = { ...base, runner: 'steam' }
export type { _NoDrift, _DriftControl }
const _narrowed = asStoreGame(fat, 'steam')
type _DelistedType = Expect<
  Equal<NonNullable<typeof _narrowed>['is_delisted'], boolean | undefined>
>

describe('gameInfoNarrowing', () => {
  it('keeps type-level fixtures alive', () => {
    const marker: _DelistedType = true
    expect(marker).toBe(true)
    expect(asFat).toHaveLength(5)
    expect(asCore).toHaveLength(5)
  })

  describe.each(RUNNERS)('game with runner %s', (actual) => {
    it.each(RUNNERS)('against %s', (wanted) => {
      const game = fixtures[actual]
      expect(isStoreGame(game, wanted)).toBe(actual === wanted)
      expect(asStoreGame(game, wanted)).toBe(
        actual === wanted ? game : undefined
      )
    })
  })

  it('is false for null, undefined and {}', () => {
    expect(isStoreGame(null, 'steam')).toBe(false)
    expect(isStoreGame(undefined, 'steam')).toBe(false)
    expect(isStoreGame({} as GameInfo, 'steam')).toBe(false)
    expect(asStoreGame(null, 'steam')).toBeUndefined()
    expect(asStoreGame(undefined, 'steam')).toBeUndefined()
    expect(asStoreGame({} as GameInfo, 'steam')).toBeUndefined()
  })
})
