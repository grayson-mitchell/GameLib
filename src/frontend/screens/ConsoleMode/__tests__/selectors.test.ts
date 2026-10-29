import type { GameInfo } from 'common/types'

import { applyConsoleChipFilters, selectConsoleGames } from '../selectors'

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

  it('still excludes DLC and third-party-managed games when the hidden list is empty', () => {
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
    const kept = makeGameInfo({ app_name: 'kept', title: 'Kept' })

    const result = selectConsoleGames([dlc, thirdParty, kept], [])

    expect(result).toEqual([kept])
  })

  it('a delisted Steam game IS returned, and a hidden game is still excluded (REQ-37-02, D-13; over-removal guard)', () => {
    const delisted = makeGameInfo({
      app_name: 'delisted',
      title: 'Delisted',
      is_delisted: true
    })
    const hidden = makeGameInfo({ app_name: 'hidden-2', title: 'Hidden' })

    const result = selectConsoleGames(
      [delisted, hidden],
      [{ appName: 'hidden-2' }]
    )

    expect(result).toEqual([delisted])
  })

  it('excludes by app_name, not by title — games sharing a title but differing app_name are independent', () => {
    const hidden = makeGameInfo({ app_name: 'app-1', title: 'Same Title' })
    const kept = makeGameInfo({ app_name: 'app-2', title: 'Same Title' })

    const result = selectConsoleGames([hidden, kept], [{ appName: 'app-1' }])

    expect(result).toEqual([kept])
  })
})

describe('ConsoleMode/selectors: applyConsoleChipFilters', () => {
  const base = {
    installedOnly: false,
    nativeOnly: false,
    store: 'all' as const,
    hostPlatform: 'darwin'
  }

  it('installedOnly keeps only installed games', () => {
    const a = makeGameInfo({ app_name: 'a', is_installed: true })
    const b = makeGameInfo({ app_name: 'b', is_installed: false })
    expect(
      applyConsoleChipFilters([a, b], { ...base, installedOnly: true })
    ).toEqual([a])
    expect(applyConsoleChipFilters([a, b], base)).toEqual([a, b])
  })

  it('store filter keeps only that runner', () => {
    const s = makeGameInfo({ app_name: 's', runner: 'steam' })
    const g = makeGameInfo({ app_name: 'g', runner: 'gog' })
    expect(
      applyConsoleChipFilters([s, g], { ...base, store: 'steam' })
    ).toEqual([s])
    expect(applyConsoleChipFilters([s, g], base)).toEqual([s, g])
  })

  it('darwin native keeps mac-native, drops mac_arch 32, keeps 64 and absent', () => {
    const n64 = makeGameInfo({
      app_name: 'n64',
      is_mac_native: true,
      mac_arch: '64'
    } as Partial<GameInfo>)
    const nAbsent = makeGameInfo({
      app_name: 'nAbsent',
      is_mac_native: true
    } as Partial<GameInfo>)
    const n32 = makeGameInfo({
      app_name: 'n32',
      is_mac_native: true,
      mac_arch: '32'
    } as Partial<GameInfo>)
    const win = makeGameInfo({ app_name: 'win' })
    expect(
      applyConsoleChipFilters([n64, nAbsent, n32, win], {
        ...base,
        nativeOnly: true
      })
    ).toEqual([n64, nAbsent])
  })

  it('linux native keeps linux-native and ignores mac_arch', () => {
    const l = makeGameInfo({
      app_name: 'l',
      is_linux_native: true,
      mac_arch: '32'
    } as Partial<GameInfo>)
    const m = makeGameInfo({
      app_name: 'm',
      is_mac_native: true
    } as Partial<GameInfo>)
    expect(
      applyConsoleChipFilters([l, m], {
        ...base,
        hostPlatform: 'linux',
        nativeOnly: true
      })
    ).toEqual([l])
  })

  it('win32 nativeOnly is a no-op', () => {
    const a = makeGameInfo({ app_name: 'a' })
    const b = makeGameInfo({ app_name: 'b' })
    expect(
      applyConsoleChipFilters([a, b], {
        ...base,
        hostPlatform: 'win32',
        nativeOnly: true
      })
    ).toEqual([a, b])
  })

  it('combines installed + native + store on darwin', () => {
    const keep = makeGameInfo({
      app_name: 'keep',
      runner: 'gog',
      is_installed: true,
      is_mac_native: true,
      mac_arch: '64'
    } as Partial<GameInfo>)
    const notInstalled = makeGameInfo({
      app_name: 'ni',
      runner: 'gog',
      is_installed: false,
      is_mac_native: true
    } as Partial<GameInfo>)
    const wrongStore = makeGameInfo({
      app_name: 'ws',
      runner: 'steam',
      is_installed: true,
      is_mac_native: true
    } as Partial<GameInfo>)
    const is32 = makeGameInfo({
      app_name: 'is32',
      runner: 'gog',
      is_installed: true,
      is_mac_native: true,
      mac_arch: '32'
    } as Partial<GameInfo>)
    const notNative = makeGameInfo({
      app_name: 'nn',
      runner: 'gog',
      is_installed: true
    })
    expect(
      applyConsoleChipFilters(
        [notInstalled, wrongStore, is32, notNative, keep],
        { ...base, installedOnly: true, nativeOnly: true, store: 'gog' }
      )
    ).toEqual([keep])
  })

  it('preserves order and does not mutate input', () => {
    const arr = [
      makeGameInfo({ app_name: 'z', title: 'Z' }),
      makeGameInfo({ app_name: 'a', title: 'A' })
    ]
    const copy = [...arr]
    const out = applyConsoleChipFilters(arr, base)
    expect(out).toEqual(copy)
    expect(out).not.toBe(arr)
    expect(arr).toEqual(copy)
  })
})
