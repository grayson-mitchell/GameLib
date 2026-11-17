import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import { builtinSeed } from '../../customThemes/builtinTokens'
import {
  customThemeKey,
  MAX_CUSTOM_THEMES
} from '../../customThemes/customTheme'
import type { CustomTheme } from '../../../common/types/customTheme'
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
    if (!checkedResult) return Promise.resolve(false)
    config.set(key, value)
    return Promise.resolve(true)
  }
}

let checkedResult = true

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
    checkedResult = true
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

  const idOf = (n: number) => n.toString(16).padStart(16, '0')
  const theme = (n: number, over: Partial<CustomTheme> = {}): CustomTheme => ({
    id: idOf(n),
    name: `Theme ${n}`,
    base: 'dracula',
    tokens: { '--accent': '#112233' },
    ...over
  })
  const seedThemes = (themes: CustomTheme[], active?: string) => {
    useSettingsState.setState({
      customThemes: themes,
      ...(active ? { theme: active } : {})
    })
    config.set('customThemes', themes)
    calls.length = 0
  }
  const stored = () => config.get('customThemes') as CustomTheme[]

  describe('duplicateTheme limits and naming', () => {
    it('refuses at the limit and writes nothing', () => {
      seedThemes(
        Array.from({ length: MAX_CUSTOM_THEMES }, (_v, i) => theme(i + 1))
      )
      const r = useSettingsState.getState().duplicateTheme('dracula', fmt)
      expect(r).toEqual({ ok: false, reason: 'limit' })
      expect(writes()).toHaveLength(0)
      expect(useSettingsState.getState().customThemes).toHaveLength(
        MAX_CUSTOM_THEMES
      )
    })

    it('copies a custom source: same base, same tokens, new id', () => {
      const src = theme(1, {
        base: 'marine',
        tokens: { '--accent': '#445566', '--success': '#00ff00' }
      })
      seedThemes([src])
      const r = useSettingsState
        .getState()
        .duplicateTheme(customThemeKey(src.id), fmt)
      expect(r.ok).toBe(true)
      const copy = stored()[1]
      expect(copy).toMatchObject({ base: 'marine', tokens: src.tokens })
      expect(copy?.id).not.toBe(src.id)
      expect(copy?.tokens).not.toBe(src.tokens)
    })

    it('names a second copy of the same source with the next number', () => {
      useSettingsState.getState().duplicateTheme('dracula', fmt)
      useSettingsState.getState().duplicateTheme('dracula', fmt)
      useSettingsState.getState().duplicateTheme('dracula', fmt)
      expect(stored().map((t) => t.name)).toEqual(['Copy', 'Copy 2', 'Copy 3'])
      expect(new Set(stored().map((t) => t.id)).size).toBe(3)
    })
  })

  describe('renameCustomTheme', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'empty'],
      ['x'.repeat(61), 'too-long'],
      ['THEME 2', 'taken']
    ])('rejects %p as %s without writing', (name, reason) => {
      seedThemes([theme(1), theme(2)])
      expect(useSettingsState.getState().renameCustomTheme(idOf(1), name)).toBe(
        reason
      )
      expect(writes()).toHaveLength(0)
      expect(useSettingsState.getState().customThemes[0]?.name).toBe('Theme 1')
    })

    it('reports not-found for an unknown id without writing', () => {
      seedThemes([theme(1)])
      expect(useSettingsState.getState().renameCustomTheme(idOf(9), 'ok')).toBe(
        'not-found'
      )
      expect(writes()).toHaveLength(0)
    })

    it('writes the trimmed name and allows a theme to keep its own name', () => {
      seedThemes([theme(1), theme(2)])
      expect(
        useSettingsState.getState().renameCustomTheme(idOf(1), '  Renamed  ')
      ).toBe('ok')
      expect(stored()[0]?.name).toBe('Renamed')
      expect(useSettingsState.getState().customThemes[0]?.name).toBe('Renamed')
      expect(
        useSettingsState.getState().renameCustomTheme(idOf(1), 'renamed')
      ).toBe('ok')
    })
  })

  describe('deleteCustomTheme', () => {
    it('removes an inactive theme and leaves the active theme alone', () => {
      seedThemes([theme(1), theme(2)], 'nord-dark')
      const r = useSettingsState.getState().deleteCustomTheme(idOf(1))
      expect(r).toEqual({ ok: true, fellBackTo: null })
      expect(stored().map((t) => t.id)).toEqual([idOf(2)])
      expect(useSettingsState.getState().theme).toBe('nord-dark')
      expect(calls.filter((c) => c.fn === 'setTheme')).toHaveLength(0)
    })

    it('switches the active theme to its base built-in', () => {
      seedThemes(
        [theme(1, { base: 'marine' }), theme(2)],
        customThemeKey(idOf(1))
      )
      const r = useSettingsState.getState().deleteCustomTheme(idOf(1))
      expect(r).toEqual({ ok: true, fellBackTo: 'marine' })
      expect(stored().map((t) => t.id)).toEqual([idOf(2)])
      expect(useSettingsState.getState().theme).toBe('marine')
      expect(config.get('theme')).toBe('marine')
      expect(calls.filter((c) => c.fn === 'setTheme')).toEqual([
        { fn: 'setTheme', args: ['marine'] }
      ])
    })

    it('falls back to midnightMirage when the base is not a built-in', () => {
      seedThemes([theme(1, { base: 'gone' })], customThemeKey(idOf(1)))
      const r = useSettingsState.getState().deleteCustomTheme(idOf(1))
      expect(r).toEqual({ ok: true, fellBackTo: 'midnightMirage' })
      expect(useSettingsState.getState().theme).toBe('midnightMirage')
    })

    it('writes the shorter array before switching theme', () => {
      seedThemes([theme(1)], customThemeKey(idOf(1)))
      useSettingsState.getState().deleteCustomTheme(idOf(1))
      const keys = writes().map((c) => c.args[0])
      expect(keys.indexOf('customThemes')).toBeLessThan(keys.indexOf('theme'))
    })
  })

  describe('saveCustomThemeTokens', () => {
    const tokens = { '--accent': '#abcdef', '--success': 'rgba(0, 255, 0, 1)' }

    it("resolves 'failed' and changes nothing when the write is refused", async () => {
      seedThemes([theme(1)], customThemeKey(idOf(1)))
      checkedResult = false
      await expect(
        useSettingsState.getState().saveCustomThemeTokens(idOf(1), tokens)
      ).resolves.toBe('failed')
      expect(useSettingsState.getState().customThemes[0]?.tokens).toEqual({
        '--accent': '#112233'
      })
      expect(calls.filter((c) => c.fn === 'setTheme')).toHaveLength(0)
    })

    it("resolves 'applied' and re-applies when the edited theme is active", async () => {
      seedThemes([theme(1)], customThemeKey(idOf(1)))
      await expect(
        useSettingsState.getState().saveCustomThemeTokens(idOf(1), tokens)
      ).resolves.toBe('applied')
      expect(useSettingsState.getState().customThemes[0]?.tokens).toEqual({
        '--accent': '#abcdef',
        '--success': '#00ff00'
      })
      expect(calls.filter((c) => c.fn === 'setTheme')).toEqual([
        { fn: 'setTheme', args: [customThemeKey(idOf(1))] }
      ])
    })

    it("resolves 'saved' without applying when the theme is inactive", async () => {
      seedThemes([theme(1)], 'nord-dark')
      await expect(
        useSettingsState.getState().saveCustomThemeTokens(idOf(1), tokens)
      ).resolves.toBe('saved')
      expect(stored()[0]?.tokens).toMatchObject({ '--accent': '#abcdef' })
      expect(calls.filter((c) => c.fn === 'setTheme')).toHaveLength(0)
    })

    it('never stores a value that fails validation or a name outside the universe', async () => {
      seedThemes([theme(1)], 'nord-dark')
      await useSettingsState.getState().saveCustomThemeTokens(idOf(1), {
        '--accent': 'var(--x)',
        '--success': 'url(https://e.example/x)',
        '--danger': '#123456',
        '--evil': '#123456',
        '--gradient-01': 'linear-gradient(#000, url(x))'
      })
      expect(stored()[0]?.tokens).toEqual({ '--danger': '#123456' })
    })
  })

  describe('built-in themes are immutable through the store', () => {
    it.each(['nord-light', 'dracula', 'custom:nope', idOf(9)])(
      'rename, delete and save refuse %p and write nothing',
      async (key) => {
        seedThemes([theme(1)])
        const s = useSettingsState.getState()
        expect(s.renameCustomTheme(key, 'x')).toBe('not-found')
        expect(s.deleteCustomTheme(key)).toEqual({ ok: false })
        await expect(
          s.saveCustomThemeTokens(key, { '--accent': '#ffffff' })
        ).resolves.toBe('failed')
        expect(writes()).toHaveLength(0)
        expect(useSettingsState.getState().customThemes).toEqual([theme(1)])
      }
    )
  })
})
