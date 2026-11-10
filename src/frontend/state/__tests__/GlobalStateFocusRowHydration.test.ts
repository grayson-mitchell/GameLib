/**
 * Behavioural gate for CR-01 (Phase 48 Plan 07): the renderer hydrates the
 * migrated `focusRow` on the FIRST launch of a legacy profile. Phase 69-10
 * moved the wiring from GlobalState.componentDidMount to the boot module and
 * the state to settingsState, so this drives those directly.
 *
 * What it proves:
 *   - with a mirror that lacks `focusRow` (needsMigratedValue), boot asks the
 *     backend once, applies a valid migrated value, and writes it back once;
 *   - a malformed migrated value hydrates `null` rather than garbage;
 *   - a pick made while the backend answer is in flight is never overwritten
 *     and hydration never writes;
 *   - SELF-TEST (anti-vacuity): the harness detects an overwrite, so a
 *     hydration that ignores the session pick would fail these tests.
 */
import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useSettingsState, { focusRowMirrorSeed } from '../settingsState'
import { hydrateFocusRowSelection } from 'common/focusRowMigration'
import * as init from '../initStateSubscriptions'

const settingsWrites: unknown[] = []
let pendingSettings: ((value: unknown) => void) | undefined

const fakeApi = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      if (name === 'requestAppSettings') {
        return () =>
          new Promise((resolve) => {
            pendingSettings = resolve
          })
      }
      if (name === 'setSetting') {
        return (payload: unknown) => settingsWrites.push(payload)
      }
      if (name === 'storeGet') {
        return (_s: string, _k: string, dflt?: unknown) => dflt
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
      return () => undefined
    }
  }
)

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('focusRow first-launch hydration (CR-01, 48-07), behavioural', () => {
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
    settingsWrites.length = 0
    pendingSettings = undefined
    init.__resetInitStateSubscriptionsGuardForTests()
  })

  afterEach(() => {
    resetAllStores()
  })

  it('the import-time mirror (no focusRow key) arms hydration', () => {
    expect(focusRowMirrorSeed.needsMigratedValue).toBe(true)
  })

  it('hydrates the migrated value once and writes it back once', async () => {
    const value = { kind: 'view', value: 'installed' }
    init.initStateSubscriptions()
    expect(pendingSettings).toBeDefined()
    pendingSettings?.({ focusRow: value })
    await flush()
    expect(useSettingsState.getState().focusRow).toEqual(value)
    expect(settingsWrites).toEqual([
      { appName: 'default', key: 'focusRow', value }
    ])
  })

  it('hydrates null for a malformed migrated value', async () => {
    useSettingsState.setState({ focusRow: { kind: 'view', value: 'all' } })
    init.initStateSubscriptions()
    pendingSettings?.({ focusRow: { kind: 'view', value: 'bogus' } })
    await flush()
    expect(useSettingsState.getState().focusRow).toBeNull()
  })

  it('never overwrites a pick made while the backend answer is in flight', async () => {
    const pick = { kind: 'view', value: 'favourites' } as never
    init.initStateSubscriptions()
    useSettingsState.getState().handleFocusRow(pick)
    pendingSettings?.({ focusRow: { kind: 'view', value: 'installed' } })
    await flush()
    expect(useSettingsState.getState().focusRow).toEqual(pick)
    // only the user's own write; hydration wrote nothing
    expect(settingsWrites).toHaveLength(1)
  })

  it('SELF-TEST (near-miss): a hydration that ignores the pick WOULD overwrite it', async () => {
    const pick = { kind: 'view', value: 'favourites' } as never
    useSettingsState.getState().handleFocusRow(pick)
    await hydrateFocusRowSelection({
      requestAppSettings: () =>
        Promise.resolve({ focusRow: { kind: 'view', value: 'installed' } }),
      setSetting: () => undefined,
      applyFocusRow: (value) => useSettingsState.setState({ focusRow: value }),
      hasUserPicked: () => false,
      onError: () => undefined
    })
    expect(useSettingsState.getState().focusRow).not.toEqual(pick)
  })
})
