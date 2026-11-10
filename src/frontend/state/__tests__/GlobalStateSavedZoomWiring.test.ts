/**
 * Behavioural gate for the boot-time saved-zoom apply (quick 261015-p3q),
 * moved by Phase 69-10 from GlobalState.componentDidMount to the boot module.
 * The class is no longer involved: this drives the real initStateSubscriptions
 * and settingsState against a recording window.api.
 *
 * What it proves:
 *   - the saved zoom (read AFTER hydration) is applied through
 *     window.api.setZoomFactor, undebounced, as the first api call;
 *   - it lands before the first window.api.handle* registration;
 *   - the slider path (setZoomPercent) is still the 500 ms debounced one;
 *   - SELF-TEST (anti-vacuity): the same order check CONVICTS a log where the
 *     zoom is applied after a listener registration, or debounced.
 */
import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useSettingsState from '../settingsState'
import * as init from '../initStateSubscriptions'

const calls: string[] = []
const config: Record<string, unknown> = {}

const fakeApi = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      if (name === 'setZoomFactor') {
        return (factor: string) => calls.push(`zoom:${factor}`)
      }
      if (name === 'storeGet') {
        return (_s: string, key: string, dflt?: unknown) =>
          key in config ? config[key] : dflt
      }
      if (name === 'requestAppSettings') {
        return () => new Promise(() => undefined)
      }
      if (name === 'getCrossoverIndex' || name === 'getRunsForMeMap') {
        return () => new Promise(() => undefined)
      }
      if (name === 'humbleGetKeys') {
        return () => Promise.resolve([])
      }
      if (name === 'humbleGetSyncState') {
        return () => Promise.resolve({ syncedAt: null, syncError: 'none' })
      }
      if (name === 'getConnectivityStatus') {
        return () => new Promise(() => undefined)
      }
      if (/^(handle|on)[A-Z]/.test(name)) {
        return () => calls.push(`register:${name}`)
      }
      return () => undefined
    }
  }
)

/** The gate: wiring rules a call log violates (empty = wired). */
function zoomOrderViolations(log: string[]): string[] {
  const violations: string[] = []
  const zoomIdx = log.findIndex((c) => c.startsWith('zoom:'))
  const firstRegister = log.findIndex((c) => c.startsWith('register:'))
  if (zoomIdx === -1) violations.push('zoom applied at boot')
  if (firstRegister === -1)
    violations.push('a listener registration to order against')
  if (zoomIdx !== -1 && firstRegister !== -1 && zoomIdx > firstRegister) {
    violations.push('zoom applied before the first listener registration')
  }
  return violations
}

describe('saved-zoom boot apply (261015-p3q), behavioural', () => {
  beforeEach(() => {
    const w = window as unknown as Record<string, unknown>
    w.api = fakeApi
    w.platform = 'linux'
    w.localStorage = { getItem: () => null, setItem: () => undefined }
    const g = globalThis as unknown as Record<string, unknown>
    g.document = {
      documentElement: {},
      body: { classList: { toggle: () => undefined } }
    }
    g.getComputedStyle = () => ({ getPropertyValue: () => '' })
    calls.length = 0
    for (const k of Object.keys(config)) delete config[k]
    init.__resetInitStateSubscriptionsGuardForTests()
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
  })

  it('applies the post-hydration saved zoom first, undebounced, before any listener', () => {
    config.zoomPercent = 150
    init.initStateSubscriptions()
    expect(calls[0]).toBe('zoom:1.5')
    expect(calls.filter((c) => c.startsWith('zoom:'))).toHaveLength(1)
    expect(zoomOrderViolations(calls)).toEqual([])
  })

  it('applies 100% unconditionally when nothing is saved', () => {
    init.initStateSubscriptions()
    expect(calls[0]).toBe('zoom:1')
  })

  it('the slider path stays debounced by 500 ms', () => {
    jest.useFakeTimers()
    init.initStateSubscriptions()
    calls.length = 0
    useSettingsState.getState().setZoomPercent(120)
    expect(calls).toEqual([])
    jest.advanceTimersByTime(500)
    expect(calls).toEqual(['zoom:1.2'])
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): convicts a zoom applied after a listener registration', () => {
    expect(
      zoomOrderViolations(['register:handleInstallGame', 'zoom:1.5'])
    ).toEqual(['zoom applied before the first listener registration'])
  })

  it('SELF-TEST (anti-vacuity, REQUIRED): convicts a log with no boot zoom', () => {
    expect(zoomOrderViolations(['register:handleInstallGame'])).toEqual([
      'zoom applied at boot'
    ])
  })

  it('SELF-TEST (positive control): accepts the correct order', () => {
    expect(
      zoomOrderViolations(['zoom:1.5', 'register:handleInstallGame'])
    ).toEqual([])
  })
})
