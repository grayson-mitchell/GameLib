import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import { builtinSeed } from '../../customThemes/builtinTokens'
import { customThemeKey } from '../../customThemes/customTheme'
import useSettingsState from '../settingsState'

type Call = { fn: string; args: unknown[] }

const calls: Call[] = []
const config = new Map<string, unknown>()

const fakeApi = {
  storeNew: () => undefined,
  storeGet: (_name: string, key: string, dflt?: unknown) =>
    config.has(key) ? config.get(key) : dflt,
  storeSet: (_name: string, key: string, value: unknown) => {
    calls.push({ fn: 'storeSet', args: [key, value] })
    config.set(key, value)
  },
  storeSetChecked: (_name: string, key: string, value: unknown) => {
    calls.push({ fn: 'storeSetChecked', args: [key, value] })
    config.set(key, value)
    return Promise.resolve(true)
  }
}

const fmt = (n: number | null) => (n === null ? 'Copy' : `Copy ${n}`)
const writes = () =>
  calls.filter((c) => c.fn === 'storeSet' || c.fn === 'storeSetChecked')

describe('custom themes slice', () => {
  beforeEach(() => {
    const w = window as unknown as Record<string, unknown>
    w.api = fakeApi
    w.setTheme = (name: string) => calls.push({ fn: 'setTheme', args: [name] })
    calls.length = 0
    config.clear()
  })

  afterEach(() => {
    resetAllStores()
  })

  it('starts with no custom themes', () => {
    expect(useSettingsState.getState().customThemes).toEqual([])
  })

  it('duplicates a built-in as a frozen token copy without applying it', () => {
    const r = useSettingsState.getState().duplicateTheme('nord-light', fmt)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const stored = config.get('customThemes') as Array<{
      id: string
      name: string
      base: string
      tokens: Record<string, string>
    }>
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: r.id,
      name: 'Copy',
      base: 'nord-light'
    })
    expect(stored[0]?.id).toMatch(/^[0-9a-f]{16}$/)
    expect(stored[0]?.tokens).toEqual(builtinSeed('nord-light'))
    // a frozen copy: not the seed object itself
    expect(stored[0]?.tokens).not.toBe(builtinSeed('nord-light'))
    expect(useSettingsState.getState().customThemes).toEqual(stored)
    expect(useSettingsState.getState().theme).toBe('midnightMirage')
    expect(calls.filter((c) => c.fn === 'setTheme')).toHaveLength(0)
  })

  it('stores custom:<id> and applies it through window.setTheme', () => {
    const r = useSettingsState.getState().duplicateTheme('nord-light', fmt)
    if (!r.ok) throw new Error('duplicate failed')
    useSettingsState.getState().setTheme(customThemeKey(r.id))
    expect(config.get('theme')).toBe(`custom:${r.id}`)
    expect(calls.filter((c) => c.fn === 'setTheme')).toEqual([
      { fn: 'setTheme', args: [`custom:${r.id}`] }
    ])
    expect(writes().length).toBeGreaterThan(0)
  })

  it('refuses an unknown source and writes nothing', () => {
    const r = useSettingsState.getState().duplicateTheme('custom:nope', fmt)
    expect(r).toEqual({ ok: false, reason: 'unknown-source' })
    expect(writes()).toHaveLength(0)
  })
})
