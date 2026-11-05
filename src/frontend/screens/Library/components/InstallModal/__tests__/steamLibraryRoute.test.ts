import {
  deriveSteamLibraryOwnership,
  resolveSteamLibraryRoute
} from '../steamLibraryRoute'
import { resolveSteamSectionGating } from '../steamSectionGating'

/**
 * quick 261105-upw -- the InstallApp-route discriminator the install modal
 * feeds to the section-gating resolver. Pure: no jsdom, a fake api object.
 */

const libA = {
  path: '/lib/a',
  steamappsDir: '/lib/a/steamapps',
  isPrimary: true
}
const libB = {
  path: '/lib/b',
  steamappsDir: '/lib/b/steamapps',
  isPrimary: false
}

function makeApi(reply?: unknown, reject?: boolean) {
  return {
    getSteamInstallAppTargets: jest.fn(async () => {
      if (reject) throw new Error('boom')
      return reply as never
    }),
    logError: jest.fn()
  }
}

describe('resolveSteamLibraryRoute', () => {
  it('a non-empty first list resolves immediately and never asks again', async () => {
    const api = makeApi()
    expect(await resolveSteamLibraryRoute(api, '570', [libA])).toEqual({
      targets: [libA],
      installAppRoute: false
    })
    expect(api.getSteamInstallAppTargets).not.toHaveBeenCalled()
  })

  it('an empty first list + InstallApp reply -> route with libraries', async () => {
    const api = makeApi({ installAppRoute: true, libraries: [libA, libB] })
    expect(await resolveSteamLibraryRoute(api, '570', [])).toEqual({
      targets: [libA, libB],
      installAppRoute: true
    })
    expect(api.getSteamInstallAppTargets).toHaveBeenCalledWith('570')
  })

  it('a closed reply -> no route', async () => {
    const api = makeApi({ installAppRoute: false, libraries: [] })
    expect(await resolveSteamLibraryRoute(api, '570', [])).toEqual({
      targets: [],
      installAppRoute: false
    })
  })

  it('a rejection resolves closed and logs the appName only', async () => {
    const api = makeApi(undefined, true)
    expect(await resolveSteamLibraryRoute(api, '570', [])).toEqual({
      targets: [],
      installAppRoute: false
    })
    expect(api.logError).toHaveBeenCalledTimes(1)
    const msg = String(api.logError.mock.calls[0][0])
    expect(msg).toContain('570')
    expect(msg).not.toContain('/lib')
  })

  it.each([
    [null],
    [{}],
    [{ installAppRoute: true, libraries: 'x' }],
    [{ installAppRoute: 'yes', libraries: [libA] }]
  ])('a malformed reply (%p) fails closed', async (reply) => {
    const api = makeApi(reply)
    expect(await resolveSteamLibraryRoute(api, '570', [])).toEqual({
      targets: [],
      installAppRoute: false
    })
  })
})

describe('deriveSteamLibraryOwnership', () => {
  it('native route: both true', () => {
    expect(
      deriveSteamLibraryOwnership({ targets: [libA], installAppRoute: false })
    ).toEqual({ nativeInstallOn: true, libraryChoiceOwned: true })
  })
  it('InstallApp route: choice owned, native signal stays false', () => {
    expect(
      deriveSteamLibraryOwnership({
        targets: [libA, libB],
        installAppRoute: true
      })
    ).toEqual({ nativeInstallOn: false, libraryChoiceOwned: true })
  })
  it('no route: both false', () => {
    expect(
      deriveSteamLibraryOwnership({ targets: [], installAppRoute: false })
    ).toEqual({ nativeInstallOn: false, libraryChoiceOwned: false })
  })
  it('pending or failed fetch: both false', () => {
    expect(deriveSteamLibraryOwnership(undefined)).toEqual({
      nativeInstallOn: false,
      libraryChoiceOwned: false
    })
  })

  it('matrix tie-in: the InstallApp route yields dropdown + free-space on a Mac', () => {
    const base = {
      hostPlatform: 'darwin' as const,
      selectedPlatform: 'Mac' as const,
      depotSignalResolved: true,
      hasWindowsDepot: false,
      bottleRequired: false
    }
    const owned = deriveSteamLibraryOwnership({
      targets: [libA, libB],
      installAppRoute: true
    })
    const on = resolveSteamSectionGating({
      ...base,
      nativeInstallOn: owned.libraryChoiceOwned,
      libraryCount: 2
    })
    expect(on.libraryDropdown).toBe(true)
    expect(on.freeSpaceLine).toBe(true)
    expect(on.contentLightNotice).toBe(false)

    const closed = deriveSteamLibraryOwnership({
      targets: [],
      installAppRoute: false
    })
    const off = resolveSteamSectionGating({
      ...base,
      nativeInstallOn: closed.libraryChoiceOwned,
      libraryCount: 0
    })
    expect(off.libraryDropdown).toBe(false)
    expect(off.freeSpaceLine).toBe(false)
  })
})
