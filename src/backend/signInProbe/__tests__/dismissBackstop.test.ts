/**
 * 49-08 Task 1 (T-49-25, D-10): the held-out backstop. A dismiss persisted
 * while a pass is running survives the pass's state write.
 *
 * The structural guarantee is that `src/backend/signInProbe/**` never reaches
 * AppSettings (the source gates in `verdict.test.ts` and `pass.test.ts`). This
 * test is the behavioural backstop behind it: the REAL global config, over the
 * per-file disposable profile `jest.setupContainment.ts` redirects, with fake
 * registrations whose probes are deferred so a dismiss can land mid-pass. The
 * pass then latches through the real `applySignInVerdict` (against fake
 * persisted-flag stores) and the dismissed set must come out unchanged.
 *
 * A RED variant proves the assertion discriminates: a registration whose probe
 * itself rewrites the setting is the clobber the backstop exists to catch, and
 * the same assertion must fail for it.
 */
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, sep } from 'path'
import { createGlobalConfig } from 'backend/config'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { SIGN_IN_STORES } from 'common/signInState'
import { createTestSignInProbe } from 'backend/testUtils/testSignInProbe'
import { runSignInProbePass } from '../pass'
import type { SignInProbePassDeps, SignInProbeRegistration } from '../pass'
import { makeFakeSignInStores } from './fakeFlagStore'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createKvsStores } from 'backend/constants/key_value_stores'

const pathsModule = createContainedHomeAppPaths()
const { configPath } = pathsModule
const { configStore } = createKvsStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

jest.mock('backend/logger', () => ({
  ...jest.requireActual('backend/logger'),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
const { fakes, stores: fakeVerdictStores } = makeFakeSignInStores()
const gogFlags = fakes.gog

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
  const { epochs, outcomes } = createTestSignInProbe()
  return {
    registrations,
    stores: fakeVerdictStores,
    epochs,
    outcomes,
    aborts: { call: () => undefined },
    sendFrontendMessage: jest.fn()
  }
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

// One instance for the file, built on first use (after a test has written the config file), the
// way the boot's 'config' step builds the one instance of a process.
let globalConfig: ReturnType<typeof createGlobalConfig> | undefined
const config = () =>
  (globalConfig ??= createGlobalConfig({
    requestRustInvoke: jest.fn(),
    versioning: createTestVersioning(),
    paths: pathsModule
  }))

function dismissed(): unknown {
  return config().getSettings().dismissedSignInNotices
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
    config().setSetting('dismissedSignInNotices', ['gog'], {
      configStore
    })
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
            config().setSetting('dismissedSignInNotices', [], {
              configStore
            })
            return 'expired'
          }
        }
      })
    )
    config().setSetting('dismissedSignInNotices', ['gog'], {
      configStore
    })
    gate.resolve('expired')
    await pass

    expect(dismissed()).not.toEqual(['gog'])
  })
})
