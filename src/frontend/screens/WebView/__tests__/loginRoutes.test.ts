/**
 * Unit tests for the D-06 route classifier (`LOGIN_PATHNAMES`/
 * `isLoginPathname`). Pure — no mocks needed, unlike the rest of this
 * screen's tests (see `WebviewUnavailablePanel.test.tsx`'s docstring for
 * why other files here need `react-i18next`/`window.api` stubs).
 */
import { LOGIN_PATHNAMES, isLoginPathname } from '../loginRoutes'

describe('LOGIN_PATHNAMES', () => {
  it('exports exactly the 7 login pathnames the urls map in index.tsx defines', () => {
    expect(LOGIN_PATHNAMES).toHaveLength(7)
  })
})

describe('isLoginPathname — login pathnames (all 7 entries of the urls map)', () => {
  it.each([
    '/loginEpic',
    '/loginGOG',
    '/loginweb/legendary',
    '/loginweb/gog',
    '/loginweb/nile',
    '/loginweb/zoom',
    '/loginweb/humble'
  ])('classifies %s as a login pathname', (pathname) => {
    expect(isLoginPathname(pathname)).toBe(true)
  })
})

describe('isLoginPathname — store/wiki pathnames (all 6 remaining entries of the urls map)', () => {
  it.each([
    '/store/epic',
    '/store/gog',
    '/store/amazon',
    '/store/zoom',
    '/store/steam',
    '/wiki'
  ])('classifies %s as NOT a login pathname', (pathname) => {
    expect(isLoginPathname(pathname)).toBe(false)
  })
})

describe('isLoginPathname — pathnames outside the urls map', () => {
  it('classifies a store-page pathname as not a login pathname (its URL lives in a query param)', () => {
    expect(isLoginPathname('/store-page')).toBe(false)
  })

  it('classifies an entirely unknown pathname as not a login pathname', () => {
    expect(isLoginPathname('/something-else')).toBe(false)
  })

  it('is case-sensitive — the router emits lowercase pathnames, so a differently-cased login path is NOT classified as one', () => {
    expect(isLoginPathname('/LoginWeb/humble')).toBe(false)
  })

  it('classifies the empty string as not a login pathname', () => {
    expect(isLoginPathname('')).toBe(false)
  })
})
