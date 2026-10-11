/**
 * Quick 261012-f05: GameSubMenu flips `hasShortcuts` only from the RESOLVED outcome of
 * `window.api.addShortcut` / `window.api.removeShortcut`, never before the write is known.
 *
 * `GameSubMenu/index.tsx` cannot be rendered under this project's `node`-environment frontend jest
 * project (no jsdom, no react-test-renderer -- see `src/frontend/jest.config.js`), so the decision
 * lives in a plain helper (`toggleShortcuts`) tested directly, plus a source-text call-site guard
 * on the real `index.tsx` (positive assertions only, on whitespace-collapsed text).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Runner } from 'common/types'
import { toggleShortcuts } from '../shortcutToggle'

interface ShortcutApi {
  addShortcut: jest.Mock
  removeShortcut: jest.Mock
}

const APP = 'toggle-test-app'
const RUNNER: Runner = 'legendary'

describe('toggleShortcuts (quick 261012-f05)', () => {
  let api: ShortcutApi
  let setHasShortcuts: jest.Mock
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    api = { addShortcut: jest.fn(), removeShortcut: jest.fn() }
    setHasShortcuts = jest.fn()
    ;(globalThis as unknown as { window: { api: ShortcutApi } }).window = {
      api
    }
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  const run = (hasShortcuts: boolean) =>
    toggleShortcuts({
      appName: APP,
      runner: RUNNER,
      hasShortcuts,
      setHasShortcuts
    })

  it('add success: flips to true exactly once, after addShortcut(appName, runner, true) resolved true', async () => {
    api.addShortcut.mockResolvedValue(true)

    await run(false)

    expect(api.addShortcut).toHaveBeenCalledTimes(1)
    expect(api.addShortcut).toHaveBeenCalledWith(APP, RUNNER, true)
    expect(api.removeShortcut).not.toHaveBeenCalled()
    expect(setHasShortcuts).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).toHaveBeenCalledWith(true)
  })

  it('add failure: addShortcut resolving false never touches the label state', async () => {
    api.addShortcut.mockResolvedValue(false)

    await run(false)

    expect(api.addShortcut).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).not.toHaveBeenCalled()
  })

  it('remove success: flips to false exactly once, after removeShortcut(appName, runner) resolved true', async () => {
    api.removeShortcut.mockResolvedValue(true)

    await run(true)

    expect(api.removeShortcut).toHaveBeenCalledTimes(1)
    expect(api.removeShortcut).toHaveBeenCalledWith(APP, RUNNER)
    expect(api.addShortcut).not.toHaveBeenCalled()
    expect(setHasShortcuts).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).toHaveBeenCalledWith(false)
  })

  it('remove failure: removeShortcut resolving false never touches the label state', async () => {
    api.removeShortcut.mockResolvedValue(false)

    await run(true)

    expect(api.removeShortcut).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).not.toHaveBeenCalled()
  })

  it('no early flip (the todo defect): the setter is not called until the invoke settles', async () => {
    let resolveAdd: (value: boolean) => void = () => {}
    api.addShortcut.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveAdd = resolve
      })
    )

    const pending = run(false)
    // Drain microtasks several times: an optimistic flip would have happened by now.
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(api.addShortcut).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).not.toHaveBeenCalled()

    resolveAdd(true)
    await pending

    expect(setHasShortcuts).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).toHaveBeenCalledWith(true)
  })

  it.each([
    ['null (the Rust Value::Null floor)', null],
    ['undefined (a stale bundle)', undefined],
    ['the truthy string "true"', 'true'],
    ['the number 1', 1]
  ])(
    'a non-boolean-true result (%s) never flips the label, add and remove',
    async (_label, result) => {
      api.addShortcut.mockResolvedValue(result)
      api.removeShortcut.mockResolvedValue(result)

      await run(false)
      await run(true)

      expect(api.addShortcut).toHaveBeenCalledTimes(1)
      expect(api.removeShortcut).toHaveBeenCalledTimes(1)
      expect(setHasShortcuts).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['addShortcut', false],
    ['removeShortcut', true]
  ] as const)(
    '%s rejection: toggleShortcuts RESOLVES, leaves state alone, and console.errors once naming the channel',
    async (channel, hasShortcuts) => {
      api[channel].mockRejectedValue(new Error('invoke timed out'))

      await expect(run(hasShortcuts)).resolves.toBeUndefined()

      expect(setHasShortcuts).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(String(consoleErrorSpy.mock.calls[0][0])).toContain(channel)
    }
  )
})

// ── Source guard on the real index.tsx (positive assertions only) ────────────────────────────
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

function blockAfter(source: string, anchor: string): string {
  const start = source.indexOf(anchor)
  if (start < 0) throw new Error(`anchor not found: ${anchor}`)
  const open = source.indexOf('{', start + anchor.length)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`unbalanced block after: ${anchor}`)
}

describe('GameSubMenu index.tsx call-site guard (quick 261012-f05)', () => {
  const source = collapse(
    readFileSync(join(__dirname, '../index.tsx'), 'utf-8')
  )

  it('imports toggleShortcuts from ./shortcutToggle', () => {
    expect(source).toMatch(
      /import \{ toggleShortcuts \} from '\.\/shortcutToggle'/
    )
  })

  it('handleShortcuts delegates to toggleShortcuts and hands it setHasShortcuts', () => {
    const body = blockAfter(source, 'async function handleShortcuts()')
    expect(body).toContain('toggleShortcuts(')
    expect(body).toContain('setHasShortcuts')
  })

  it('exactly one setHasShortcuts( call remains in the file: the mount read of shortcutsExists', () => {
    // Pre-edit count was 3 (the mount read plus the two optimistic flips in handleShortcuts).
    const calls = source.match(/setHasShortcuts\(/g) ?? []
    expect(calls).toHaveLength(1)
    expect(source).toContain(
      'window.api.shortcutsExists(appName, runner).then((added) => { setHasShortcuts(added) })'
    )
  })

  it('the label ternary still keys submenu.removeShortcut on hasShortcuts', () => {
    expect(source).toMatch(
      /\{hasShortcuts \? t\('submenu\.removeShortcut', 'Remove shortcuts'\)/
    )
  })

  it('self-test: blockAfter returns the balanced block, not the rest of the file', () => {
    const src = 'function a() { if (x) { y() } } function b() { z() }'
    expect(blockAfter(src, 'function a()')).toBe('{ if (x) { y() } }')
  })
})
