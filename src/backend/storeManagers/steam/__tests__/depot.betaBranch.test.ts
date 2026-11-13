import {
  chooseInstallBranch,
  isValidBetaKey,
  readAcfBetaKey,
  readLocalConfigBetaKey,
  resolveUserBetaKey,
  steamId64ToAccountId
} from '../depot/betaBranch'
import { selectDepots } from '../depot/select'
import {
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY
} from 'common/types/sidecarTransport'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'

const noRust = stubRustSteamFiles({})

// The real logger dereferences a writer only a full init assigns; spy the loaded module's
// functions (no jest.mock: backend-di-ceilings ratchet).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loggerModule = require('../../../logger')
beforeAll(() => {
  for (const fn of ['logInfo', 'logWarning', 'logError', 'logDebug']) {
    jest.spyOn(loggerModule, fn).mockImplementation(() => undefined)
  }
})

describe('steamId64ToAccountId', () => {
  it('maps an id64 and rejects non-ids', () => {
    expect(steamId64ToAccountId('76561197995867096')).toBe('35601368')
    expect(steamId64ToAccountId('abc')).toBeUndefined()
    expect(steamId64ToAccountId('123')).toBeUndefined()
  })
})

describe('isValidBetaKey', () => {
  it('accepts and rejects', () => {
    expect(isValidBetaKey('release-101')).toBe(true)
    expect(isValidBetaKey('')).toBe(false)
    expect(isValidBetaKey(5)).toBe(false)
  })
})

describe('chooseInstallBranch', () => {
  const info = (branches: unknown) => ({ depots: { branches } })
  it('handles public, present, absent, password-protected', () => {
    expect(chooseInstallBranch(info({}), 'public', '1')).toBe('public')
    expect(
      chooseInstallBranch(info({ beta: { buildid: 2 } }), 'beta', '1')
    ).toBe('beta')
    expect(chooseInstallBranch(info({ public: {} }), 'beta', '1')).toBe(
      'public'
    )
    expect(
      chooseInstallBranch(info({ beta: { pwdrequired: '1' } }), 'beta', '1')
    ).toBe('public')
    expect(
      chooseInstallBranch(info({ beta: { pwdrequired: 1 } }), 'beta', '1')
    ).toBe('public')
    expect(chooseInstallBranch({}, 'beta', '1')).toBe('public')
  })
})

describe('selectDepots on a beta branch', () => {
  const owned = { apps: new Set<number>(), depots: new Set<number>([1, 2]) }
  const appinfo = {
    depots: {
      '1': { manifests: { public: '111', beta: '222' } },
      '2': { manifests: { public: '333' } }
    }
  }
  it('uses the branch manifest, falling back to public per depot', () => {
    const out = selectDepots(
      appinfo,
      owned,
      { os: 'windows', branch: 'beta' },
      '10'
    )
    expect(out.find((d) => d.id === '1')?.manifest).toBe('222')
    expect(out.find((d) => d.id === '2')?.manifest).toBe('333')
  })
  it('public ignores beta manifests', () => {
    const out = selectDepots(appinfo, owned, { os: 'windows' }, '10')
    expect(out.find((d) => d.id === '1')?.manifest).toBe('111')
  })
})

describe('beta keys on Rust', () => {
  const acf = (betaKey: string | null) => ({
    exists: true,
    parsed: true,
    readError: null,
    record: { betaKey }
  })

  it('reads the ACF beta key and maps absent, empty and rejected to undefined', async () => {
    const some = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () => acf('release-101') as never
    })
    expect(await readAcfBetaKey(some, '/s', '1')).toBe('release-101')
    const none = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () => acf(null) as never
    })
    expect(await readAcfBetaKey(none, '/s', '1')).toBeUndefined()
    expect(await readAcfBetaKey(noRust, '/s', '1')).toBeUndefined()
  })

  it('reads the localconfig beta key and rejects a non-numeric app id before invoking', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY]: () => ({
        betaKey: 'from-local'
      })
    })
    expect(await readLocalConfigBetaKey(stub, '/l.vdf', '333300')).toBe(
      'from-local'
    )
    expect(await readLocalConfigBetaKey(stub, '/l.vdf', 'abc')).toBeUndefined()
    expect(stub.calls).toHaveLength(1)
    expect(await readLocalConfigBetaKey(noRust, '/l.vdf', '1')).toBeUndefined()
  })

  it('resolveUserBetaKey keeps order and still guards the key with isValidBetaKey', async () => {
    const base = {
      appId: '333300',
      steamappsDir: '/s',
      steamRoot: '/steam',
      steamId64: '76561197995867096'
    }
    const both = (acfKey: string | null, localKey: string | null) =>
      stubRustSteamFiles({
        [RUST_STEAMFILES_READ_ACF]: () => acf(acfKey) as never,
        [RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY]: () => ({
          betaKey: localKey
        })
      })
    expect(await resolveUserBetaKey(both(null, 'from-local'), base)).toBe(
      'from-local'
    )
    expect(await resolveUserBetaKey(both('release-101', 'x'), base)).toBe(
      'release-101'
    )
    expect(await resolveUserBetaKey(both('bad"key', 'x'), base)).toBe('public')
    expect(await resolveUserBetaKey(both(null, null), base)).toBe('public')
  })
})
