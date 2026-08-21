import type { GameInfo } from 'common/types'

import { selectConsoleGames } from '../selectors'

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: '12345',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Some Game',
    canRunOffline: true,
    ...overrides
  } as unknown as GameInfo
}

describe('ConsoleMode/selectors: selectConsoleGames', () => {
  it('excludes a game whose app_name is in the hidden list', () => {
    const hidden = makeGameInfo({ app_name: 'hidden-1', title: 'Hidden Game' })
    const kept = makeGameInfo({ app_name: 'kept-1', title: 'Kept Game' })

    const result = selectConsoleGames([hidden, kept], [{ appName: 'hidden-1' }])

    expect(result).toEqual([kept])
  })

  it('keeps a game whose app_name is NOT in the hidden list', () => {
    const kept = makeGameInfo({ app_name: 'kept-1', title: 'Kept Game' })

    const result = selectConsoleGames([kept], [{ appName: 'some-other' }])

    expect(result).toEqual([kept])
  })

  it('excludes nothing when the hidden list is empty', () => {
    const games = [
      makeGameInfo({ app_name: 'a', title: 'A' }),
      makeGameInfo({ app_name: 'b', title: 'B' })
    ]

    const result = selectConsoleGames(games, [])

    expect(result).toEqual(games)
  })

  it('is a no-op when a hidden entry names an app_name not in the library', () => {
    const unrelated = makeGameInfo({
      app_name: 'unrelated',
      title: 'Unrelated'
    })

    const result = selectConsoleGames(
      [unrelated],
      [{ appName: 'not-in-library' }]
    )

    expect(result).toEqual([unrelated])
  })

  it('still excludes DLC, third-party-managed, and delisted games when the hidden list is empty', () => {
    const dlc = makeGameInfo({
      app_name: 'dlc',
      title: 'DLC',
      install: { is_dlc: true }
    })
    const thirdParty = makeGameInfo({
      app_name: 'third-party',
      title: 'Third Party',
      thirdPartyManagedApp: 'origin'
    })
    const delisted = makeGameInfo({
      app_name: 'delisted',
      title: 'Delisted',
      is_delisted: true
    })
    const kept = makeGameInfo({ app_name: 'kept', title: 'Kept' })

    const result = selectConsoleGames([dlc, thirdParty, delisted, kept], [])

    expect(result).toEqual([kept])
  })

  it('excludes by app_name, not by title — games sharing a title but differing app_name are independent', () => {
    const hidden = makeGameInfo({ app_name: 'app-1', title: 'Same Title' })
    const kept = makeGameInfo({ app_name: 'app-2', title: 'Same Title' })

    const result = selectConsoleGames([hidden, kept], [{ appName: 'app-1' }])

    expect(result).toEqual([kept])
  })
})
