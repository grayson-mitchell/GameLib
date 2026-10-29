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

describe('GlobalState wiring source gate', () => {
  const src = stripSourceComments(
    readFileSync(
      join(__dirname, '..', '..', 'state', 'GlobalState.tsx'),
      'utf8'
    )
  )
  const CALL = 'this.resyncSignInIdentityFromStores()'

  // Body of `name = ...` up to the next two-space-indented class member.
  const memberBody = (source: string, name: string): string => {
    const plain = source.indexOf(`\n  ${name} = `)
    const start =
      plain === -1 ? source.indexOf(`\n  private ${name} = `) : plain
    if (start === -1) throw new Error(`member ${name} not found`)
    const rest = source.slice(start + 1)
    const end = rest.slice(2).search(/\n {2}(?:private )?\w+ = /)
    return end === -1 ? rest : rest.slice(0, end + 2)
  }
  const MEMBERS = [
    'handleSuccessfulLogin',
    'steamLogin',
    'humbleLogin',
    'refreshLibrary'
  ]

  it.each(MEMBERS)('%s reaches the single resync method', (name) => {
    expect(memberBody(src, name)).toContain(CALL)
  })

  it('the private method applies resyncSignInIdentity then rearms', () => {
    const body = memberBody(src, 'resyncSignInIdentityFromStores')
    expect(body).toContain('resyncSignInIdentity(')
    expect(body.indexOf('resyncSignInIdentity(')).toBeLessThan(
      body.indexOf('this.rearmFromCurrentState()')
    )
  })

  it('RED specimen: deleting the call from the real source trips the gate', () => {
    for (const name of MEMBERS) {
      const mutated = src.replace(
        memberBody(src, name),
        memberBody(src, name).split(CALL).join('')
      )
      expect(memberBody(mutated, name)).not.toContain(CALL)
    }
  })
})
