/**
 * Todo `2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known` (quick
 * 261012-ca6).
 *
 * GameSubMenu used to flip `hasShortcuts` the moment it fired the send-kind `addShortcut` /
 * `removeShortcut`, before anyone knew whether the write worked. `toggleShortcuts` awaits the
 * invoke-kind channel instead and sets the state from the sidecar's answer, "do shortcuts exist
 * on disk now". This file proves that for each outcome, plus the busy flag and the rejection path.
 *
 * No jsdom is installed (testEnvironment: 'node'), so the helper is called directly and
 * `window.api` is a plain object of jest mocks (same approach as repairFailure.test.ts). The
 * component itself cannot be rendered, so a source gate pins that `handleShortcuts` delegates.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { toggleShortcuts } from '../shortcutsToggle'

const FRONTEND = join(__dirname, '..', '..', '..', '..')

/** The brace-balanced block that opens at the first `{` after `anchor`. */
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

describe('toggleShortcuts (261012-ca6)', () => {
  let addShortcut: jest.Mock
  let removeShortcut: jest.Mock
  let logError: jest.Mock
  let setHasShortcuts: jest.Mock
  let setBusy: jest.Mock
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    addShortcut = jest.fn()
    removeShortcut = jest.fn()
    logError = jest.fn()
    setHasShortcuts = jest.fn()
    setBusy = jest.fn()

    const globalWithWindow = globalThis as unknown as { window?: unknown }
    if (!globalWithWindow.window) {
      globalWithWindow.window = {}
    }
    ;(globalThis as unknown as { window: { api: unknown } }).window.api = {
      addShortcut,
      removeShortcut,
      logError
    }
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  const run = (hasShortcuts: boolean) =>
    toggleShortcuts({
      hasShortcuts,
      appName: 'MyGame',
      runner: 'legendary',
      setHasShortcuts,
      setBusy
    })

  it('add, write fails: the sidecar answers false, so the state is set to false and never to true', async () => {
    addShortcut.mockResolvedValue(false)

    await run(false)

    expect(setHasShortcuts).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).toHaveBeenCalledWith(false)
    expect(setHasShortcuts).not.toHaveBeenCalledWith(true)
    expect(removeShortcut).not.toHaveBeenCalled()
  })

  it('add, success: the sidecar answers true, so the state flips to true', async () => {
    addShortcut.mockResolvedValue(true)

    await run(false)

    expect(addShortcut).toHaveBeenCalledWith('MyGame', 'legendary', true)
    expect(setHasShortcuts).toHaveBeenCalledTimes(1)
    expect(setHasShortcuts).toHaveBeenCalledWith(true)
  })

  it('add, malformed reply: undefined never flips the state to true', async () => {
    addShortcut.mockResolvedValue(undefined)

    await run(false)

    expect(setHasShortcuts).toHaveBeenCalledWith(false)
    expect(setHasShortcuts).not.toHaveBeenCalledWith(true)
  })

  it('remove, success: the sidecar answers false, so the state is set to false', async () => {
    removeShortcut.mockResolvedValue(false)

    await run(true)

    expect(removeShortcut).toHaveBeenCalledWith('MyGame', 'legendary')
    expect(setHasShortcuts).toHaveBeenCalledWith(false)
    expect(addShortcut).not.toHaveBeenCalled()
  })

  it('remove, failure: the sidecar answers true, so the entry keeps reading "Remove shortcuts"', async () => {
    removeShortcut.mockResolvedValue(true)

    await run(true)

    expect(setHasShortcuts).toHaveBeenCalledWith(true)
    expect(setHasShortcuts).not.toHaveBeenCalledWith(false)
  })

  it.each([
    ['addShortcut', false],
    ['removeShortcut', true]
  ])(
    'a rejecting %s leaves the state unchanged, logs the channel and appName, and never rejects',
    async (channel, hasShortcuts) => {
      const mock = channel === 'addShortcut' ? addShortcut : removeShortcut
      mock.mockRejectedValue(new Error('transport down'))

      await expect(run(hasShortcuts)).resolves.toBeUndefined()

      expect(setHasShortcuts).not.toHaveBeenCalled()
      expect(logError).toHaveBeenCalledTimes(1)
      const message = String(logError.mock.calls[0][0])
      expect(message).toContain(channel)
      expect(message).toContain('MyGame')
      expect(setBusy).toHaveBeenLastCalledWith(false)
    }
  )

  it('busy: setBusy(true) precedes the api call and setBusy(false) is the last call, on success', async () => {
    addShortcut.mockResolvedValue(true)

    await run(false)

    expect(setBusy.mock.calls[0]).toEqual([true])
    expect(setBusy.mock.invocationCallOrder[0]).toBeLessThan(
      addShortcut.mock.invocationCallOrder[0]
    )
    expect(setBusy).toHaveBeenLastCalledWith(false)
    expect(setBusy.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      setHasShortcuts.mock.invocationCallOrder[0]
    )
  })

  it('source gate: handleShortcuts delegates to toggleShortcuts and never sets the state itself', () => {
    const source = readFileSync(
      join(FRONTEND, 'screens/Game/GameSubMenu/index.tsx'),
      'utf-8'
    )
    const body = blockAfter(source, 'function handleShortcuts()')

    expect(body).toContain('toggleShortcuts(')
    expect(body).not.toMatch(/setHasShortcuts\s*\(/)
    expect(source).toMatch(/shortcutsBusy\s*\?\s*\(?\s*refreshCircle\(\)/)
  })
})
