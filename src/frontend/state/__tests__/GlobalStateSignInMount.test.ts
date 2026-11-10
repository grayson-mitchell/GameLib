/**
 * Behavioural gate for Phase 49 Plan 07 (D-08, D-10, D-16) and Phase 69-13: the
 * renderer half of the sign-in state, now owned by `authState` and driven from
 * `initStateSubscriptions` plus the mount functions GlobalState still calls.
 *
 * The 49-07 version of this file pinned the wiring by source text over
 * GlobalState.tsx. The code moved into importable modules, so the same rules
 * are proven by running them against a fake `window.api` that records every
 * call and captures every registered listener:
 *   - D-16 / R3: nothing in boot calls `humbleCheckHealth` (the health check
 *     lives in the sidecar boot pass; a renderer call is a second expiry latch);
 *   - D-08 / T-49-20: the outcome push AND the mount-time pull each reach the
 *     store sanitised;
 *   - D-10 / T-69-32: `dismissedSignInNotices` is persisted by exactly two
 *     writers (dismiss and re-arm); the requestAppSettings hydration is a read;
 *   - P3: the only probe-named `window.api` members are the push listener and
 *     the read-only pull -- nothing starts a probe;
 *   - F-49-R1-1: `getUserInfo` is asked on every boot, never gated.
 * RED specimens (a fake mount that calls humbleCheckHealth, a renderer-started
 * probe, an unsanitised push) must be convicted by the same violation check,
 * and a SELF-TEST proves the check is not vacuous.
 */
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { AuthState } from '../authState'
import type * as InitModule from '../initStateSubscriptions'
import { SIGN_IN_STORES } from 'common/signInState'

type Handler = (...args: unknown[]) => unknown

const called: string[] = []
const handlers = new Map<string, Handler[]>()
const values: Record<string, unknown> = {}
const config: Record<string, unknown> = {}
let settingWrites: Array<{ key: string; value: unknown }> = []

const fakeApi = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      const record = (): void => {
        called.push(name)
      }
      switch (name) {
        case 'storeGet':
          return (_store: string, key: string, dflt?: unknown) =>
            key in config ? config[key] : dflt
        case 'setSetting':
          return (payload: { key: string; value: unknown }) => {
            record()
            settingWrites.push(payload)
          }
        case 'requestAppSettings':
          return () => {
            record()
            return Promise.resolve(values.appSettings ?? {})
          }
        case 'getSignInProbeOutcomes':
          return () => {
            record()
            return Promise.resolve(values.outcomes ?? {})
          }
        case 'getUserInfo':
          return () => {
            record()
            return Promise.resolve(values.userInfo)
          }
        case 'getAmazonUserInfo':
          return () => {
            record()
            return Promise.resolve(undefined)
          }
        case 'getCrossoverIndex':
        case 'getRunsForMeMap':
          return () => new Promise(() => undefined)
        case 'humbleGetKeys':
          return () => Promise.resolve([])
        case 'humbleGetSyncState':
          return () => Promise.resolve({ syncedAt: null, syncError: 'none' })
        case 'getDMQueueInformation':
          return () =>
            Promise.resolve({ elements: [], finished: [], state: 'idle' })
        case 'getConnectivityStatus':
          return () => new Promise(() => undefined)
        case 'storeNew':
        case 'storeHas':
          return () => false
      }
      if (/^(handle|on)[A-Z]/.test(name)) {
        return (fn: Handler) => {
          record()
          handlers.set(name, [...(handlers.get(name) ?? []), fn])
        }
      }
      return () => {
        record()
      }
    }
  }
)

// Node-env frontend project (no jsdom): give the modules a window first.
;(globalThis as unknown as { window: object }).window = {
  platform: 'linux',
  api: fakeApi,
  localStorage: { getItem: () => null, setItem: () => undefined },
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}
;(globalThis as unknown as Record<string, unknown>).document = {
  documentElement: {},
  body: { classList: { toggle: () => undefined } }
}
;(globalThis as unknown as Record<string, unknown>).getComputedStyle = () => ({
  getPropertyValue: () => ''
})

const ALLOWED_PROBE_MEMBERS = [
  'handleSignInProbeOutcomes',
  'getSignInProbeOutcomes'
]

/** The gate: wiring rules a run of boot violates (empty = wired). */
function signInBootViolations(
  apiCalls: readonly string[],
  outcomesInStore: Record<string, unknown>
): string[] {
  const violations: string[] = []
  if (apiCalls.includes('humbleCheckHealth')) {
    violations.push(
      'D-16: boot must not call humbleCheckHealth (second expiry latch)'
    )
  }
  for (const member of apiCalls) {
    if (/Probe/.test(member) && !ALLOWED_PROBE_MEMBERS.includes(member)) {
      violations.push(`P3: unexpected probe-named window.api.${member}`)
    }
  }
  const known: readonly string[] = SIGN_IN_STORES
  if (Object.keys(outcomesInStore).some((key) => !known.includes(key))) {
    violations.push('outcomes are sanitised')
  }
  return violations
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const dismissedWrites = () =>
  settingWrites.filter((w) => w.key === 'dismissedSignInNotices')

describe('sign-in renderer state wiring (49-07: D-08, D-10, D-16; 69-13)', () => {
  let init: typeof InitModule
  let useAuthState: StoreHooks<AuthState>

  beforeAll(async () => {
    init = await import('../initStateSubscriptions')
    useAuthState = (await import('../authState')).default
  })

  beforeEach(() => {
    // importing the stores pulls tauriAttach, which can overwrite window.api
    ;(window as unknown as { api: unknown }).api = fakeApi
    called.length = 0
    handlers.clear()
    for (const k of Object.keys(values)) delete values[k]
    for (const k of Object.keys(config)) delete config[k]
    settingWrites = []
    init.__resetInitStateSubscriptionsGuardForTests()
  })

  afterEach(() => {
    resetAllStores()
  })

  /** Boot, then the awaited mount tail GlobalState runs, in its order. */
  async function runBoot(): Promise<void> {
    init.initStateSubscriptions()
    await init.seedEpicUserInfo()
    await init.refreshAmazonUserInfo(true)
    init.pullSignInProbeOutcomes()
    void init.hydrateDismissedSignInNotices()
    useAuthState.getState().rearmFromCurrentState()
    await flush()
  }

  it('the real boot is wired: push + pull sanitised, no Humble health call, no renderer probe', async () => {
    values.outcomes = { gog: 'healthy', pulledBogus: 'healthy' }
    await runBoot()
    handlers.get('handleSignInProbeOutcomes')?.[0]?.(
      {},
      { outcomes: { steam: 'expired', pushedBogus: 'healthy' } }
    )
    expect(
      signInBootViolations(called, useAuthState.getState().signInProbeOutcomes)
    ).toEqual([])
  })

  it('the mount-time pull is sanitised', async () => {
    values.outcomes = { gog: 'healthy', pulledBogus: 'healthy', nile: 'nope' }
    await runBoot()
    expect(useAuthState.getState().signInProbeOutcomes).toEqual({
      gog: 'healthy'
    })
  })

  it('the outcome push is sanitised', async () => {
    await runBoot()
    handlers.get('handleSignInProbeOutcomes')?.[0]?.(
      {},
      { outcomes: { steam: 'expired', pushedBogus: 'healthy' } }
    )
    expect(useAuthState.getState().signInProbeOutcomes).toEqual({
      steam: 'expired'
    })
  })

  it('persists the dismissed set from exactly two writers (dismiss and re-arm)', async () => {
    await runBoot()
    useAuthState.getState().handleDismissSignInNotice('steam')
    useAuthState.setState({ humble: { isLoggedIn: true, expired: true } })
    useAuthState.getState().handleDismissSignInNotice('humble')
    useAuthState.getState().rearmFromCurrentState()
    expect(dismissedWrites().map((w) => w.value)).toEqual([
      ['steam'],
      ['humble', 'steam'],
      ['steam']
    ])
  })

  it('hydrates the dismissed set from requestAppSettings on mount, as a read, not a third writer (F-49-R1-3)', async () => {
    // Phase 49 live gate Run 1, item 10d FAIL: the import-time seed was `[]` on
    // a cold boot, so a dismissed not-connected row returned on every
    // relaunch. The mount hydrates from the backend's settings and MERGES with
    // the in-session set, never setSetting.
    values.appSettings = { dismissedSignInNotices: ['gog'] }
    useAuthState.setState({ dismissedSignInNotices: ['steam'] })
    await runBoot()
    expect(called).toContain('requestAppSettings')
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([
      'gog',
      'steam'
    ])
    expect(dismissedWrites()).toEqual([])
  })

  it('a failing hydration is logged, not thrown, and leaves the set alone', async () => {
    useAuthState.setState({ dismissedSignInNotices: ['steam'] })
    ;(window as unknown as { api: Record<string, unknown> }).api = new Proxy(
      {},
      {
        get: (_t, name: string) =>
          name === 'requestAppSettings'
            ? () => Promise.reject(new Error('down'))
            : (fakeApi as Record<string, unknown>)[name]
      }
    )
    await init.hydrateDismissedSignInNotices()
    expect(useAuthState.getState().dismissedSignInNotices).toEqual(['steam'])
    expect(called).toContain('logError')
  })

  it('asks the backend for Epic user info on every boot and seeds the username only when empty (F-49-R1-1)', async () => {
    // legendary deleted user.json and the backend purged userInfo: nothing
    // asked for it back when the call was gated on the mirror holding it.
    values.userInfo = { displayName: 'epicUser' }
    await runBoot()
    expect(called).toContain('getUserInfo')
    expect(useAuthState.getState().epicUsername).toBe('epicUser')

    called.length = 0
    useAuthState.setState({ epicUsername: 'kept' })
    values.userInfo = { displayName: 'other' }
    expect(await init.seedEpicUserInfo()).toBe(true)
    expect(called).toContain('getUserInfo')
    expect(useAuthState.getState().epicUsername).toBe('kept')

    values.userInfo = undefined
    expect(await init.seedEpicUserInfo()).toBe(false)
  })

  it('refreshAmazonUserInfo only asks when an Amazon user exists', async () => {
    await init.refreshAmazonUserInfo(false)
    expect(called).not.toContain('getAmazonUserInfo')
    await init.refreshAmazonUserInfo(true)
    expect(called).toContain('getAmazonUserInfo')
  })

  it('syncs Humble on boot for a connected session and never calls humbleCheckHealth', async () => {
    config.isLoggedIn = true
    await runBoot()
    expect(called).toContain('humbleSync')
    expect(called).not.toContain('humbleCheckHealth')
  })

  it('RED specimen (D-16, REQUIRED): a boot that calls humbleCheckHealth is convicted', () => {
    const specimen = [...called, 'humbleCheckHealth', 'humbleSync']
    expect(signInBootViolations(specimen, {})).toEqual([
      'D-16: boot must not call humbleCheckHealth (second expiry latch)'
    ])
  })

  it('RED specimen (P3): a renderer-started probe is convicted', () => {
    expect(signInBootViolations(['startSignInProbe'], {})).toEqual([
      'P3: unexpected probe-named window.api.startSignInProbe'
    ])
  })

  it('RED specimen (D-08): an unsanitised outcome push is convicted', async () => {
    await runBoot()
    // What an unsanitised listener would have left in the store.
    const unsanitised = { gog: 'healthy', bogus: 'healthy' }
    expect(signInBootViolations(called, unsanitised)).toContain(
      'outcomes are sanitised'
    )
    // The real store, fed the same raw map, passes.
    handlers.get('handleSignInProbeOutcomes')?.[0]?.(
      {},
      { outcomes: unsanitised }
    )
    expect(
      signInBootViolations(called, useAuthState.getState().signInProbeOutcomes)
    ).toEqual([])
  })

  it('SELF-TEST (anti-vacuity): the check REJECTS a bad run and ACCEPTS a clean one', () => {
    expect(
      signInBootViolations(['humbleCheckHealth', 'runProbe'], { x: 1 })
    ).toEqual([
      'D-16: boot must not call humbleCheckHealth (second expiry latch)',
      'P3: unexpected probe-named window.api.runProbe',
      'outcomes are sanitised'
    ])
    expect(
      signInBootViolations(
        ['humbleSync', 'handleSignInProbeOutcomes', 'getSignInProbeOutcomes'],
        { gog: 'healthy' }
      )
    ).toEqual([])
  })
})
