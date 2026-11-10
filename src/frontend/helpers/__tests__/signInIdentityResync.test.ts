import '../../testUtils/tauriWindow'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveSignInState } from 'common/signInState'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  resyncSignInIdentity,
  SignInIdentityCurrent,
  SignInIdentityReaders
} from '../signInIdentityResync'

const emptyCurrent = (): SignInIdentityCurrent => ({
  epic: {},
  gog: {},
  amazon: {},
  humble: {},
  steam: {}
})

const readers = (
  over: Partial<SignInIdentityReaders> = {}
): SignInIdentityReaders => ({
  legendaryDisplayName: () => undefined,
  gogUsername: () => undefined,
  nileUserId: () => undefined,
  nileName: () => undefined,
  humbleIsLoggedIn: () => undefined,
  humbleUsername: () => undefined,
  humbleExpired: () => undefined,
  steamUsername: () => undefined,
  ...over
})

describe('resyncSignInIdentity', () => {
  it('heals a steam row stuck on not-connected after a login without a username', () => {
    const current = emptyCurrent()
    const read = readers({ steamUsername: () => 'gabe' })
    const patch = resyncSignInIdentity(current, read)
    expect(patch).toEqual({ steam: { username: 'gabe' } })

    // Same rule the notice applies: loggedIn is Boolean(steam.username).
    const stateFor = (c: SignInIdentityCurrent) =>
      resolveSignInState({
        loggedIn: Boolean(c.steam?.username),
        expiredFlag: false,
        outcome: undefined
      })
    expect(stateFor(current)).toBe('not-connected')
    const healed = { ...current, steam: { ...current.steam, ...patch.steam } }
    expect(stateFor(healed)).not.toBe('not-connected')
  })

  it('patches amazon.user_id from the store', () => {
    const patch = resyncSignInIdentity(
      emptyCurrent(),
      readers({ nileUserId: () => 'amzn1' })
    )
    expect(patch.amazon?.user_id).toBe('amzn1')
  })

  it('reflects humble isLoggedIn and expired', () => {
    const patch = resyncSignInIdentity(
      { ...emptyCurrent(), humble: { isLoggedIn: true, expired: false } },
      readers({ humbleIsLoggedIn: () => false, humbleExpired: () => true })
    )
    expect(patch).toEqual({ humble: { isLoggedIn: false, expired: true } })
  })

  it('returns {} when context already matches the store for all five stores', () => {
    const current: SignInIdentityCurrent = {
      epic: { username: 'e' },
      gog: { username: 'g' },
      amazon: { user_id: 'u', username: 'n' },
      humble: { isLoggedIn: true, username: 'h', expired: false },
      steam: { username: 's' }
    }
    const read = readers({
      legendaryDisplayName: () => 'e',
      gogUsername: () => 'g',
      nileUserId: () => 'u',
      nileName: () => 'n',
      humbleIsLoggedIn: () => true,
      humbleUsername: () => 'h',
      humbleExpired: () => false,
      steamUsername: () => 's'
    })
    expect(resyncSignInIdentity(current, read)).toEqual({})
  })

  it('treats null, undefined and empty string as the same absent identity (no loop)', () => {
    const current: SignInIdentityCurrent = {
      epic: { username: null },
      gog: { username: '' },
      amazon: { user_id: null, username: null },
      humble: { isLoggedIn: false, username: null, expired: undefined },
      steam: { username: null }
    }
    expect(resyncSignInIdentity(current, readers())).toEqual({})
  })

  it('heals logout: a stale username with an empty store is cleared', () => {
    const patch = resyncSignInIdentity(
      { ...emptyCurrent(), gog: { username: 'x' } },
      readers()
    )
    expect(patch).toEqual({ gog: { username: undefined } })
    expect('username' in (patch.gog ?? {})).toBe(true)
  })
})

describe('resync wiring gate', () => {
  const read = (...parts: string[]) =>
    stripSourceComments(
      readFileSync(join(__dirname, '..', '..', ...parts), 'utf8')
    )
  const authSrc = read('state', 'authState.ts')
  const librarySrc = read('state', 'libraryState.ts')
  const AUTH_CALL = 'get().resyncSignInIdentityFromStores()'
  const LIBRARY_CALL =
    'useAuthState.getState().resyncSignInIdentityFromStores()'

  // Body of the member `name` up to the next member at the same indent: the
  // login paths and refreshLibrary are store actions (`name: ...` at 6 spaces).
  const memberBody = (
    source: string,
    name: string,
    kind: 'store' | 'class'
  ) => {
    const [lead, sep, next] =
      kind === 'store'
        ? ['\n      ', ': ', /\n {6}\w+: /]
        : ['\n  ', ' = ', /\n {2}(?:private )?\w+ = /]
    const start = source.indexOf(`${lead}${name}${sep}`)
    if (start === -1) throw new Error(`member ${name} not found`)
    const rest = source.slice(start + 1)
    const end = rest.slice(2).search(next)
    return end === -1 ? rest : rest.slice(0, end + 2)
  }
  const MEMBERS: Array<[string, string, 'store' | 'class', string]> = [
    ['handleSuccessfulLogin', 'auth', 'store', AUTH_CALL],
    ['steamLogin', 'auth', 'store', AUTH_CALL],
    ['humbleLogin', 'auth', 'store', AUTH_CALL],
    ['refreshLibrary', 'library', 'store', LIBRARY_CALL]
  ]
  const sourceOf = (which: string) => (which === 'auth' ? authSrc : librarySrc)

  it.each(MEMBERS)(
    '%s reaches the single resync method',
    (name, which, kind, call) => {
      expect(memberBody(sourceOf(which), name, kind)).toContain(call)
    }
  )

  it('RED specimen: deleting the call from the real source trips the gate', () => {
    for (const [name, which, kind, call] of MEMBERS) {
      const src = sourceOf(which)
      const body = memberBody(src, name, kind)
      const mutated = src.replace(body, body.split(call).join(''))
      expect(memberBody(mutated, name, kind)).not.toContain(call)
    }
  })
})

describe('authState.resyncSignInIdentityFromStores applies the patch, then rearms', () => {
  const stored: Record<string, unknown> = {}
  const fakeApi = {
    storeNew: () => undefined,
    storeHas: () => false,
    storeGet: (name: string, key: string, fallback?: unknown) =>
      stored[`${name}|${key}`] ?? fallback,
    setSetting: () => undefined,
    logError: () => undefined
  }

  afterEach(async () => {
    const { resetAllStores } = await import('../../state/storeKit')
    resetAllStores()
  })

  it('a stale identity is healed before the dismissed set is pruned', async () => {
    const { default: useAuthState } = await import('../../state/authState')
    ;(window as unknown as { api: unknown }).api = fakeApi
    stored['humbleConfigStore|isLoggedIn'] = true
    stored['humbleConfigStore|expired'] = true
    useAuthState.setState({
      humble: { isLoggedIn: false, expired: false },
      dismissedSignInNotices: ['humble']
    })

    useAuthState.getState().resyncSignInIdentityFromStores()

    // Only an already-patched Humble identity reads as expired, so a pruned
    // dismissal proves the patch landed before the rearm.
    expect(useAuthState.getState().humble.expired).toBe(true)
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([])
    delete stored['humbleConfigStore|isLoggedIn']
    delete stored['humbleConfigStore|expired']
  })
})
