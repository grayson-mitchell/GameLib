/**
 * 49-08 Task 1 (T-49-25, D-10): the held-out backstop. A dismiss persisted
 * while a pass is running survives the pass's state write.
 *
 * The structural guarantee is that `src/backend/signInProbe/**` never reaches
 * AppSettings (the source gates in `verdict.test.ts` and `pass.test.ts`). This
 * test is the behavioural backstop behind it: the REAL `GlobalConfig`, over the
 * per-file disposable profile `jest.setupContainment.ts` redirects, with fake
 * registrations whose probes are deferred so a dismiss can land mid-pass. The
 * pass then latches through the real `applySignInVerdict` (against fake
 * persisted-flag stores) and the dismissed set must come out unchanged.
 *
 * A RED variant proves the assertion discriminates: a registration whose probe
 * itself rewrites the setting is the clobber the backstop exists to catch, and
 * the same assertion must fail for it.
 */
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, sep } from 'path'
import { GlobalConfig } from 'backend/config'
import { configPath } from 'backend/constants/paths'
import { configStore as gogConfigStore } from 'backend/storeManagers/gog/electronStores'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { SIGN_IN_STORES } from 'common/signInState'
import { __resetSignInEpochsForTests } from '../sessionEpoch'
import { __resetSignInProbeOutcomesForTests } from '../outcomes'
import { runSignInProbePass } from '../pass'
import type { SignInProbePassDeps, SignInProbeRegistration } from '../pass'
import type { FakeFlagStore } from './fakeFlagStore'

jest.mock('backend/logger', () => ({
  ...jest.requireActual('backend/logger'),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('backend/ipc', () => ({
  ...jest.requireActual('backend/ipc'),
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

const gogFlags = gogConfigStore as unknown as FakeFlagStore

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Every store logged in; `overrides` replaces individual registrations. */
function makeDeps(
  overrides: Partial<Record<SignInStore, Partial<SignInProbeRegistration>>>
): SignInProbePassDeps {
  const registrations = {} as Record<SignInStore, SignInProbeRegistration>
  for (const store of SIGN_IN_STORES) {
    registrations[store] = {
      isLoggedIn: () => true,
      probe: () => Promise.resolve<SignInProbeOutcome>('healthy'),
      ...overrides[store]
    }
  }
  return { registrations }
}

function realpathOfNearestAncestor(target: string): string {
  let current = target
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return realpathSync(current)
}

function dismissed(): unknown {
  return GlobalConfig.get().getSettings().dismissedSignInNotices
}

describe('T-49-25: a dismiss persisted during a running pass survives it', () => {
  beforeAll(() => {
    // Containment guard, BEFORE any write: resolving the path writes nothing.
    const tmpRoot = realpathSync(tmpdir())
    const real = realpathOfNearestAncestor(dirname(configPath))
    expect(real === tmpRoot || real.startsWith(tmpRoot + sep)).toBe(true)
  })

  beforeEach(() => {
    rmSync(configPath, { force: true })
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({ version: 'v0', defaultSettings: { language: 'en' } })
    )
    gogFlags.reset()
    __resetSignInEpochsForTests()
    __resetSignInProbeOutcomesForTests()
  })

  afterAll(() => {
    rmSync(configPath, { force: true })
  })

  it('keeps a dismiss written after the pass starts and before its probes resolve', async () => {
    const gate = deferred<SignInProbeOutcome>()
    const pass = runSignInProbePass(
      makeDeps({ gog: { probe: () => gate.promise } })
    )

    // The user dismisses the GOG notice while the probe is still in flight.
    GlobalConfig.get().setSetting('dismissedSignInNotices', ['gog'])
    gate.resolve('expired')
    await pass

    // The pass did its own write (the latch) ...
    expect(gogFlags.sets).toEqual([['expired', true]])
    // ... and the dismissed set is exactly what the user wrote.
    expect(dismissed()).toEqual(['gog'])
  })

  it('RED variant: a registration whose probe rewrites the setting does clobber a mid-pass dismiss, so the assertion discriminates', async () => {
    const gate = deferred<SignInProbeOutcome>()
    const pass = runSignInProbePass(
      makeDeps({
        gog: {
          // The defect the backstop guards against: pass-side code that writes
          // AppSettings from its stale view when the probe settles.
          probe: async () => {
            await gate.promise
            GlobalConfig.get().setSetting('dismissedSignInNotices', [])
            return 'expired'
          }
        }
      })
    )
    GlobalConfig.get().setSetting('dismissedSignInNotices', ['gog'])
    gate.resolve('expired')
    await pass

    expect(dismissed()).not.toEqual(['gog'])
  })
})
