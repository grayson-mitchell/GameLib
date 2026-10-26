/**
 * quick 261026-j6x: store-agnostic tier-2 `registry` application. The shared
 * functions are tested directly with an injected `run`; the launch hook
 * applyKnownFixProfileRegistry uses the REAL readKnownFixProfile against
 * tmp-redirected fixes dirs. runWineCommand is mocked; nothing is spawned.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-registryfixes-home-${process.pid}`)
  }
})

// Never write to the repo's public/fixes.
jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  return {
    ...actual,
    bundledFixesPath: path.join(
      os.tmpdir(),
      `gamelib-bundled-fixes-test-${process.pid}-registry`
    )
  }
})

const mockRunWineCommand = jest.fn()
const mockLogWarning = jest.fn()

jest.mock('backend/launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import type { GameSettings } from 'common/types'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import {
  applyKnownFixProfileRegistry,
  applyRegistryFixes,
  buildRegistryFixCommandParts,
  REGISTRY_FIX_TIMEOUT_MS,
  validateRegistryFixes
} from '../knownFixesRegistry'

const CTX = { label: 'gog 123', logPrefix: 'Backend' } as never
const KEY = 'HKCU\\Software\\Foo'
const ENTRY = { key: KEY, name: 'Bar', type: 'REG_DWORD', value: 1 }

describe('validateRegistryFixes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('keeps a valid entry and warns on a bad sibling with ctx label/prefix', () => {
    const out = validateRegistryFixes(
      [{ ...ENTRY, key: 'HKXX\\bad' }, ENTRY],
      CTX
    )
    expect(out).toEqual([
      { key: KEY, name: 'Bar', type: 'REG_DWORD', data: '1', views: [32, 64] }
    ])
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining(
        'gog 123: skipping invalid registry fix (bad key)'
      ),
      'Backend'
    )
  })

  it('rejects a name starting with / and a quote in a REG_SZ value', () => {
    const out = validateRegistryFixes(
      [
        { ...ENTRY, name: '/f' },
        { ...ENTRY, type: 'REG_SZ', value: 'a"b' }
      ],
      CTX
    )
    expect(out).toEqual([])
    expect(mockLogWarning).toHaveBeenCalledTimes(2)
  })

  it('warns and returns [] for a non-array', () => {
    expect(validateRegistryFixes({}, CTX)).toEqual([])
    expect(mockLogWarning).toHaveBeenCalledWith(
      'gog 123: ignoring registry fixes, not an array',
      'Backend'
    )
  })
})

describe('applyRegistryFixes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('runs once per view, 32 then 64, with the reg add argv', async () => {
    const run = jest.fn().mockResolvedValue({ code: 0 })
    await applyRegistryFixes([ENTRY], CTX, run)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[0][0]).toEqual(
      buildRegistryFixCommandParts(
        { key: KEY, name: 'Bar', type: 'REG_DWORD', data: '1', views: [32] },
        32
      )
    )
    expect(run.mock.calls[1][0]).toContain('/reg:64')
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('warns, never rejects, on non-zero code, undefined and rejection', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ code: 2 })
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ code: 0 })
    await expect(
      applyRegistryFixes([ENTRY, { ...ENTRY, name: 'Baz' }], CTX, run)
    ).resolves.toBeUndefined()
    const msgs = mockLogWarning.mock.calls.map((c) => c[0] as string)
    expect(msgs[0]).toContain('gog 123: registry fix')
    expect(msgs[0]).toContain('did not succeed (code 2)')
    expect(msgs[1]).toContain('did not succeed (code undefined)')
    expect(msgs[2]).toContain('threw: Error: boom')
    expect(mockLogWarning.mock.calls.every((c) => c[1] === 'Backend')).toBe(
      true
    )
  })

  it('warns timed out for a never-settling run', async () => {
    jest.useFakeTimers()
    try {
      const run = jest.fn(() => new Promise<never>(() => undefined))
      const p = applyRegistryFixes([{ ...ENTRY, views: [64] }], CTX, run)
      await jest.advanceTimersByTimeAsync(REGISTRY_FIX_TIMEOUT_MS)
      await p
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
        'Backend'
      )
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('applyKnownFixProfileRegistry', () => {
  const SETTINGS = {
    winePrefix: '/games/prefixes/GOGAPP'
  } as unknown as GameSettings

  const writeIn = (dir: string, runner: string, content: object) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `GOGAPP-${runner}.profile.json`),
      JSON.stringify(content)
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    rmSync(fixesPath, { recursive: true, force: true })
    rmSync(localFixesPath, { recursive: true, force: true })
    rmSync(bundledFixesPath, { recursive: true, force: true })
    mkdirSync(fixesPath, { recursive: true })
    mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  })

  afterAll(() => {
    rmSync(fixesPath, { recursive: true, force: true })
    rmSync(localFixesPath, { recursive: true, force: true })
    rmSync(bundledFixesPath, { recursive: true, force: true })
  })

  it('applies a bundled -gog.profile.json to the game own prefix', async () => {
    writeIn(bundledFixesPath, 'gog', { title: 't', registry: [ENTRY] })

    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)

    expect(mockRunWineCommand).toHaveBeenCalledTimes(2)
    const first = mockRunWineCommand.mock.calls[0][0]
    expect(first.commandParts).toEqual(
      expect.arrayContaining(['reg', 'add', KEY, '/reg:32', '/f'])
    )
    expect(mockRunWineCommand.mock.calls[1][0].commandParts).toContain(
      '/reg:64'
    )
    expect(first.gameSettings).toBe(SETTINGS)
    expect(first.gameSettings.winePrefix).toBe('/games/prefixes/GOGAPP')
    expect(first.wait).toBe(false)
    expect(first.protonVerb).toBe('runinprefix')
  })

  it('applies via the local layer for legendary (file suffix is epic)', async () => {
    writeIn(localFixesPath, 'epic', { title: 't', registry: [ENTRY] })

    await applyKnownFixProfileRegistry('GOGAPP', 'legendary', SETTINGS)

    expect(mockRunWineCommand).toHaveBeenCalledTimes(2)
  })

  it('ignores a profile that exists only in the remote fixes dir', async () => {
    writeIn(fixesPath, 'gog', { title: 't', registry: [ENTRY] })

    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })

  it('does nothing, silently, with no profile or no registry', async () => {
    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)
    writeIn(bundledFixesPath, 'gog', { title: 't' })
    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('resolves and warns with the runner/app label when runWineCommand rejects', async () => {
    writeIn(bundledFixesPath, 'gog', { title: 't', registry: [ENTRY] })
    mockRunWineCommand.mockRejectedValue(new Error('nope'))

    await expect(
      applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)
    ).resolves.toBeUndefined()

    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('gog GOGAPP: registry fix'),
      'Backend'
    )
  })

  it('writes on every call, not only the first', async () => {
    writeIn(bundledFixesPath, 'gog', { title: 't', registry: [ENTRY] })

    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)
    await applyKnownFixProfileRegistry('GOGAPP', 'gog', SETTINGS)

    expect(mockRunWineCommand).toHaveBeenCalledTimes(4)
  })
})
