/**
 * 49-04 Task 3 (R2, P1, D-10, D-18): `applySignInVerdict` is the single, fenced,
 * write-if-changed latch for all five stores. `unknown` never writes (the
 * 260822-vov negative); a moved session epoch refuses the write (T-49-10).
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { logInfo } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import { legendaryConfigStore } from 'backend/storeManagers/legendary/electronStores'
import { configStore as gogConfigStore } from 'backend/storeManagers/gog/electronStores'
import { configStore as nileConfigStore } from 'backend/storeManagers/nile/electronStores'
import { configStore as steamConfigStore } from 'backend/storeManagers/steam/electronStores'
import { configStore as humbleConfigStore } from 'backend/humble/electronStores'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { SIGN_IN_STORES } from 'common/signInState'
import {
  __resetSignInEpochsForTests,
  bumpSignInEpoch,
  captureSignInEpoch
} from '../sessionEpoch'
import { applySignInVerdict } from '../verdict'
import type { FakeFlagStore } from './fakeFlagStore'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  legendaryConfigStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/steam/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/humble/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))

const logInfoMock = logInfo as unknown as jest.Mock
const sendMock = sendFrontendMessage as unknown as jest.Mock

const stores: Record<SignInStore, { fake: FakeFlagStore; flag: string }> = {
  legendary: {
    fake: legendaryConfigStore as unknown as FakeFlagStore,
    flag: 'expired'
  },
  gog: { fake: gogConfigStore as unknown as FakeFlagStore, flag: 'expired' },
  nile: { fake: nileConfigStore as unknown as FakeFlagStore, flag: 'expired' },
  humble: {
    fake: humbleConfigStore as unknown as FakeFlagStore,
    flag: 'expired'
  },
  steam: {
    fake: steamConfigStore as unknown as FakeFlagStore,
    flag: 'credentialsMissing'
  }
}

beforeEach(() => {
  __resetSignInEpochsForTests()
  for (const { fake } of Object.values(stores)) {
    fake.reset()
  }
})

const allWrites = () =>
  Object.values(stores).flatMap(({ fake }) => [...fake.sets, ...fake.deletes])

describe.each(SIGN_IN_STORES)('applySignInVerdict (%s)', (store) => {
  const { fake, flag } = stores[store]
  const epoch = () => captureSignInEpoch(store)

  it('expired with the flag unset latches with exactly one set', () => {
    expect(applySignInVerdict(store, 'expired', epoch())).toBe('latched')
    expect(fake.sets).toEqual([[flag, true]])
    expect(fake.deletes).toEqual([])
  })

  it('expired again is unchanged and performs no set (R2 idempotency)', () => {
    fake.data.set(flag, true)
    expect(applySignInVerdict(store, 'expired', epoch())).toBe('unchanged')
    expect(fake.sets).toEqual([])
    expect(fake.deletes).toEqual([])
  })

  it('two identical expired results set the flag once', () => {
    applySignInVerdict(store, 'expired', epoch())
    expect(applySignInVerdict(store, 'expired', epoch())).toBe('unchanged')
    expect(fake.sets).toHaveLength(1)
  })

  it('healthy with the flag set clears it with one delete', () => {
    fake.data.set(flag, true)
    expect(applySignInVerdict(store, 'healthy', epoch())).toBe('cleared')
    expect(fake.deletes).toEqual([flag])
    expect(fake.sets).toEqual([])
  })

  it('healthy with the flag unset is unchanged and writes nothing', () => {
    expect(applySignInVerdict(store, 'healthy', epoch())).toBe('unchanged')
    expect(allWrites()).toEqual([])
  })

  it.each([true, false])(
    '260822-vov: unknown never writes (flag set: %s)',
    (flagSet) => {
      if (flagSet) {
        fake.data.set(flag, true)
      }
      expect(applySignInVerdict(store, 'unknown', epoch())).toBe('unchanged')
      expect(allWrites()).toEqual([])
      expect(fake.data.get(flag) === true).toBe(flagSet)
    }
  )

  it.each<SignInProbeOutcome>(['expired', 'healthy'])(
    'a moved epoch refuses a %s write and returns stale (R2 concurrency)',
    (outcome) => {
      const captured = epoch()
      bumpSignInEpoch(store)
      // `healthy` would clear a set flag, `expired` would latch an unset one.
      if (outcome === 'healthy') {
        fake.data.set(flag, true)
      }
      expect(applySignInVerdict(store, outcome, captured)).toBe('stale')
      expect(allWrites()).toEqual([])
    }
  )

  it('touches no other store and only its own flag key', () => {
    applySignInVerdict(store, 'expired', epoch())
    for (const other of SIGN_IN_STORES) {
      if (other === store) {
        continue
      }
      expect(stores[other].fake.sets).toEqual([])
      expect(stores[other].fake.deletes).toEqual([])
    }
    expect(fake.sets.map(([key]) => key)).toEqual([flag])
  })

  it('logs one store-and-result-only line per call', () => {
    applySignInVerdict(store, 'expired', epoch())
    expect(logInfoMock).toHaveBeenCalledTimes(1)
    expect(logInfoMock).toHaveBeenCalledWith(
      `[signInProbe] ${store} verdict=latched`,
      'Backend'
    )
  })
})

describe('applySignInVerdict (Steam writes credentialsMissing, the rest write expired)', () => {
  it('the flag key per store', () => {
    expect(stores.steam.flag).toBe('credentialsMissing')
    for (const store of ['legendary', 'gog', 'nile', 'humble'] as const) {
      expect(stores[store].flag).toBe('expired')
    }
  })
})

describe('Humble push (D-18)', () => {
  const humble = stores.humble.fake

  it('latched pushes humbleAuthState once with the cookie-free payload', () => {
    humble.data.set('userData', { username: 'ada' })
    applySignInVerdict('humble', 'expired', captureSignInEpoch('humble'))

    expect(sendMock).toHaveBeenCalledTimes(1)
    const [channel, payload] = sendMock.mock.calls[0]
    expect(channel).toBe('humbleAuthState')
    expect(payload).toEqual({
      isLoggedIn: true,
      username: 'ada',
      expired: true
    })
    expect(Object.keys(payload).sort()).toEqual([
      'expired',
      'isLoggedIn',
      'username'
    ])
    expect(JSON.stringify(payload)).not.toMatch(/sessionCookie|csrfToken/)
  })

  it('cleared pushes humbleAuthState with expired false', () => {
    humble.data.set('userData', { username: 'ada' })
    humble.data.set('expired', true)
    applySignInVerdict('humble', 'healthy', captureSignInEpoch('humble'))

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('humbleAuthState', {
      isLoggedIn: true,
      username: 'ada',
      expired: false
    })
  })

  it('unchanged pushes nothing', () => {
    humble.data.set('expired', true)
    applySignInVerdict('humble', 'expired', captureSignInEpoch('humble'))
    applySignInVerdict('humble', 'unknown', captureSignInEpoch('humble'))
    applySignInVerdict('humble', 'healthy', captureSignInEpoch('humble'))
    applySignInVerdict('humble', 'healthy', captureSignInEpoch('humble'))
    // expired->unchanged, unknown->unchanged, healthy->cleared (1 push), healthy->unchanged
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('stale pushes nothing', () => {
    const captured = captureSignInEpoch('humble')
    bumpSignInEpoch('humble')
    applySignInVerdict('humble', 'expired', captured)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('no other store pushes humbleAuthState', () => {
    for (const store of ['legendary', 'gog', 'nile', 'steam'] as const) {
      applySignInVerdict(store, 'expired', captureSignInEpoch(store))
    }
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('src/backend/signInProbe source gates', () => {
  const dir = join(__dirname, '..')
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({
      name,
      code: stripSourceComments(readFileSync(join(dir, name), 'utf8'))
    }))

  it('finds the production modules this gate is meant to cover', () => {
    const names = sources.map((s) => s.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'classify.ts',
        'outcomes.ts',
        'sessionEpoch.ts',
        'verdict.ts'
      ])
    )
  })

  it('references no GlobalConfig, setSetting or backend/config (D-10)', () => {
    for (const { name, code } of sources) {
      expect({
        name,
        hit: /GlobalConfig|setSetting|backend\/config/.test(code)
      }).toEqual({ name, hit: false })
    }
  })

  it('writes a flag to true only inside a latch lambda', () => {
    const verdict = sources.find((s) => s.name === 'verdict.ts')?.code ?? ''
    const writes = verdict.match(
      /\.set\('(expired|credentialsMissing)', true\)/g
    )
    expect(writes ?? []).toHaveLength(5)
  })
})
