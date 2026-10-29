import {
  rememberTabLocation,
  resolveTabTarget,
  resetTabLocationMemoryForTests
} from '../tabLocationMemory'

const G = { app_name: '620' }

beforeEach(() => {
  resetTabLocationMemoryForTests()
})

describe('tabLocationMemory', () => {
  it('fresh memory targets the root with no state', () => {
    expect(resolveTabTarget('games', '/', 'stores')).toEqual({ to: '/' })
  })

  it('restores a remembered game page with the same state reference', () => {
    const state = { gameInfo: G }
    rememberTabLocation({
      pathname: '/gamepage/steam/620',
      search: '',
      state
    })
    const target = resolveTabTarget('games', '/', 'stores')
    expect(target.to).toBe('/gamepage/steam/620')
    expect(target.state).toBe(state)
  })

  it('the active tab always goes to its root', () => {
    rememberTabLocation({
      pathname: '/gamepage/steam/620',
      state: { gameInfo: G }
    })
    expect(resolveTabTarget('games', '/', 'games')).toEqual({ to: '/' })
  })

  it('does not remember a game page without gameInfo', () => {
    rememberTabLocation({
      pathname: '/gamepage/steam/620',
      state: { gameInfo: G }
    })
    rememberTabLocation({
      pathname: '/gamepage/gog/1',
      state: { fromGameCard: false }
    })
    rememberTabLocation({ pathname: '/gamepage/gog/2' })
    expect(resolveTabTarget('games', '/', 'stores').to).toBe(
      '/gamepage/steam/620'
    )
    resetTabLocationMemoryForTests()
    rememberTabLocation({
      pathname: '/gamepage/gog/1',
      state: { fromGameCard: false }
    })
    expect(resolveTabTarget('games', '/', 'stores')).toEqual({ to: '/' })
  })

  it('keeps the search string', () => {
    rememberTabLocation({ pathname: '/store-page', search: '?store-url=x' })
    expect(resolveTabTarget('stores', '/store/epic', 'games').to).toBe(
      '/store-page?store-url=x'
    )
  })

  it('last write wins per tab and tabs are independent', () => {
    rememberTabLocation({
      pathname: '/gamepage/steam/620',
      state: { gameInfo: G }
    })
    rememberTabLocation({ pathname: '/settings/wine' })
    rememberTabLocation({ pathname: '/wine-manager' })
    expect(resolveTabTarget('settings', '/settings/general', 'games').to).toBe(
      '/wine-manager'
    )
    expect(resolveTabTarget('games', '/', 'settings').to).toBe(
      '/gamepage/steam/620'
    )
  })

  it('ignores unrouted paths, /library and /loginweb', () => {
    rememberTabLocation({ pathname: '/library' })
    rememberTabLocation({ pathname: '/nowhere' })
    rememberTabLocation({ pathname: '/loginweb/epic' })
    expect(resolveTabTarget('games', '/', 'stores')).toEqual({ to: '/' })
    expect(resolveTabTarget('accounts', '/login', 'stores')).toEqual({
      to: '/login'
    })
  })

  it('reset empties memory', () => {
    rememberTabLocation({ pathname: '/settings/wine' })
    resetTabLocationMemoryForTests()
    expect(resolveTabTarget('settings', '/settings/general', 'games')).toEqual({
      to: '/settings/general'
    })
  })
})
