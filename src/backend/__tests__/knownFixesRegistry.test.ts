/**
 * quick 261026-j6x: store-agnostic tier-2 `registry` application. The shared
 * functions are tested directly with an injected `run`; the launch hook
 * applyKnownFixProfileRegistry uses the REAL readKnownFixProfile against
 * tmp-redirected fixes dirs. runWineCommand is mocked; nothing is spawned.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
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
const mockLogInfo = jest.fn()

jest.mock('backend/launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import type { GameSettings } from 'common/types'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import {
  applyKnownFixProfileRegistry,
  applyRegistryFixes,
  buildRegistryFixCommandParts,
  knownFixPrefixDir,
  REGISTRY_FIX_TIMEOUT_MS,
  validateRegistryFixes,
  wineRegistryValueIsSet,
  type ValidRegistryFix
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

describe('wineRegistryValueIsSet', () => {
  const WMP =
    'Software\\\\Microsoft\\\\Active Setup\\\\Installed Components\\\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}'
  const reg = (
    arch: string | null,
    body: string,
    first = 'WINE REGISTRY Version 2'
  ) =>
    [
      first,
      ';; All keys relative to REGISTRY\\\\Machine',
      '',
      ...(arch ? [`#arch=${arch}`] : []),
      '',
      body
    ].join('\n')
  const section = (key: string, ...vals: string[]) =>
    [`[${key}] 1792831399`, '#time=1dc1', ...vals, ''].join('\n')
  const DW = (data = 1): ValidRegistryFix => ({
    key: 'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}',
    name: 'IsInstalled',
    type: 'REG_DWORD',
    data: String(data),
    views: [32, 64]
  })
  const SZ = (data: string): ValidRegistryFix => ({
    key: 'HKLM\\Software\\Foo',
    name: 'Path',
    type: 'REG_SZ',
    data,
    views: [32, 64]
  })
  const wow = WMP.replace('Software\\\\', 'Software\\\\Wow6432Node\\\\')
  const both = reg(
    'win64',
    section(WMP, '"IsInstalled"=dword:00000001') +
      section(wow, '"IsInstalled"=dword:00000001')
  )

  it('matches a DWORD in the 64 view and the Wow6432Node 32 view', () => {
    expect(wineRegistryValueIsSet(both, DW(), 64)).toBe(true)
    expect(wineRegistryValueIsSet(both, DW(), 32)).toBe(true)
  })

  it('is false when the Wow6432Node section is absent for view 32', () => {
    const only64 = reg('win64', section(WMP, '"IsInstalled"=dword:00000001'))
    expect(wineRegistryValueIsSet(only64, DW(), 64)).toBe(true)
    expect(wineRegistryValueIsSet(only64, DW(), 32)).toBe(false)
  })

  it('handles win32: view 32 plain, view 64 false', () => {
    const t = reg('win32', section(WMP, '"IsInstalled"=dword:00000001'))
    expect(wineRegistryValueIsSet(t, DW(), 32)).toBe(true)
    expect(wineRegistryValueIsSet(t, DW(), 64)).toBe(false)
  })

  it('is false for different data, absent name, absent section', () => {
    expect(
      wineRegistryValueIsSet(
        reg('win64', section(WMP, '"IsInstalled"=dword:00000000')),
        DW(),
        64
      )
    ).toBe(false)
    expect(
      wineRegistryValueIsSet(
        reg('win64', section(WMP, '"Other"=dword:00000001')),
        DW(),
        64
      )
    ).toBe(false)
    expect(
      wineRegistryValueIsSet(
        reg(
          'win64',
          section('Software\\\\Else', '"IsInstalled"=dword:00000001')
        ),
        DW(),
        64
      )
    ).toBe(false)
  })

  it('compares key and name case-insensitively', () => {
    const fix = {
      ...DW(),
      name: 'isinstalled',
      key: DW().key.replace('Software\\Microsoft', 'SOFTWARE\\Microsoft')
    }
    expect(wineRegistryValueIsSet(both, fix, 64)).toBe(true)
  })

  it('matches REG_SZ with escaped backslashes and rejects differences', () => {
    const t = reg(
      'win64',
      section('Software\\\\Foo', '"Path"="C:\\\\Games\\\\x"')
    )
    expect(wineRegistryValueIsSet(t, SZ('C:\\Games\\x'), 64)).toBe(true)
    expect(wineRegistryValueIsSet(t, SZ('C:\\Games\\y'), 64)).toBe(false)
  })

  it('rejects a different stored type', () => {
    for (const v of ['"Path"=str(2):"C:\\\\x"', '"Path"=hex:01,00']) {
      const t = reg('win64', section('Software\\\\Foo', v))
      expect(wineRegistryValueIsSet(t, SZ('C:\\x'), 64)).toBe(false)
    }
  })

  it('rejects other escapes and non-ASCII expected data', () => {
    for (const v of ['"Path"="a\\tb"', '"Path"="a\\x00e9"']) {
      const t = reg('win64', section('Software\\\\Foo', v))
      expect(wineRegistryValueIsSet(t, SZ('a\tb'), 64)).toBe(false)
    }
    const t = reg('win64', section('Software\\\\Foo', '"Path"="café"'))
    expect(wineRegistryValueIsSet(t, SZ('café'), 64)).toBe(false)
  })

  it('is false without #arch, wrong first line, or a continuation line', () => {
    const body = section(WMP, '"IsInstalled"=dword:00000001')
    expect(wineRegistryValueIsSet(reg(null, body), DW(), 64)).toBe(false)
    expect(
      wineRegistryValueIsSet(
        reg('win64', body, 'WINE REGISTRY Version 3'),
        DW(),
        64
      )
    ).toBe(false)
    expect(
      wineRegistryValueIsSet(
        reg(
          'win64',
          section(WMP, '"IsInstalled"=dword:00000001', '"X"=hex:01,\\')
        ),
        DW(),
        64
      )
    ).toBe(false)
  })

  it('handles HKCU view 64 and doubts HKCU view 32', () => {
    const fix: ValidRegistryFix = {
      key: 'HKCU\\Software\\Wine',
      name: 'Version',
      type: 'REG_SZ',
      data: 'win10',
      views: [32, 64]
    }
    const t = reg('win64', section('Software\\\\Wine', '"Version"="win10"'))
    expect(wineRegistryValueIsSet(t, fix, 64)).toBe(true)
    expect(wineRegistryValueIsSet(t, fix, 32)).toBe(false)
  })

  it('doubts view 32 for non-Software, Wow6432Node and Classes keys', () => {
    const t = reg(
      'win64',
      section('Software\\\\Wow6432Node\\\\Foo', '"Path"="x"') +
        section('Software\\\\Classes\\\\Foo', '"Path"="x"') +
        section('System\\\\Foo', '"Path"="x"')
    )
    for (const key of [
      'HKLM\\Software\\Wow6432Node\\Foo',
      'HKLM\\Software\\Classes\\Foo',
      'HKLM\\System\\Foo'
    ]) {
      expect(wineRegistryValueIsSet(t, { ...SZ('x'), key }, 32)).toBe(false)
    }
  })
})

describe('applyRegistryFixes skip and kill', () => {
  const dirs: string[] = []
  const WMPKEY =
    'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312}'
  const entry = {
    key: WMPKEY,
    name: 'IsInstalled',
    type: 'REG_DWORD',
    value: 1
  }
  const sec = (k: string) =>
    `[${k}] 1\n#time=1\n"IsInstalled"=dword:00000001\n\n`
  const mkPrefix = (name: string, content?: string) => {
    const dir = join(homedir(), `prefix-${name}`)
    mkdirSync(dir, { recursive: true })
    if (content !== undefined) writeFileSync(join(dir, 'system.reg'), content)
    dirs.push(dir)
    return dir
  }
  const header =
    'WINE REGISTRY Version 2\n;; All keys relative to REGISTRY\\\\Machine\n\n#arch=win64\n\n'
  const k64 =
    'Software\\\\Microsoft\\\\Active Setup\\\\Installed Components\\\\{22d6f312}'
  const k32 = k64.replace('Software\\\\', 'Software\\\\Wow6432Node\\\\')

  beforeEach(() => jest.clearAllMocks())
  afterAll(() =>
    dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  )

  it('spawns nothing and logs per view when both views are set', async () => {
    const dir = mkPrefix('both', header + sec(k64) + sec(k32))
    const run = jest.fn()
    await applyRegistryFixes([entry], CTX, run, dir)
    expect(run).not.toHaveBeenCalled()
    const infos = mockLogInfo.mock.calls.map((c) => c[0] as string)
    expect(infos).toHaveLength(2)
    expect(infos.every((m) => m.includes('already set'))).toBe(true)
  })

  it('runs only the missing view', async () => {
    const dir = mkPrefix('one', header + sec(k64))
    const run = jest.fn().mockResolvedValue({ code: 0 })
    await applyRegistryFixes([entry], CTX, run, dir)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toContain('/reg:32')
  })

  it('runs every view with no prefixDir or no system.reg, without warning', async () => {
    const run = jest.fn().mockResolvedValue({ code: 0 })
    await applyRegistryFixes([entry], CTX, run)
    await applyRegistryFixes([entry], CTX, run, mkPrefix('empty'))
    expect(run).toHaveBeenCalledTimes(4)
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  const fakeChild = (exitCode: number | null) => ({
    pid: 4242,
    exitCode,
    signalCode: null,
    kill: jest.fn()
  })

  it('SIGKILLs the captured child on timeout and warns killed', async () => {
    jest.useFakeTimers()
    try {
      const child = fakeChild(null)
      const run = jest.fn((_p: string[], onSpawn: (c: never) => void) => {
        onSpawn(child as never)
        return new Promise<never>(() => undefined)
      })
      const p = applyRegistryFixes([{ ...entry, views: [64] }], CTX, run)
      await jest.advanceTimersByTimeAsync(REGISTRY_FIX_TIMEOUT_MS)
      await p
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
      const msg = mockLogWarning.mock.calls[0][0] as string
      expect(msg).toContain('timed out')
      expect(msg).toContain('killed')
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not kill an already-exited child, or without onSpawn', async () => {
    jest.useFakeTimers()
    try {
      const child = fakeChild(0)
      const run = jest.fn((_p: string[], onSpawn: (c: never) => void) => {
        onSpawn(child as never)
        return new Promise<never>(() => undefined)
      })
      const p = applyRegistryFixes([{ ...entry, views: [64] }], CTX, run)
      await jest.advanceTimersByTimeAsync(REGISTRY_FIX_TIMEOUT_MS)
      await p
      expect(child.kill).not.toHaveBeenCalled()
      const bare = jest.fn(() => new Promise<never>(() => undefined))
      const p2 = applyRegistryFixes([{ ...entry, views: [64] }], CTX, bare)
      await jest.advanceTimersByTimeAsync(REGISTRY_FIX_TIMEOUT_MS)
      await p2
      expect(
        mockLogWarning.mock.calls.every((c) =>
          String(c[0]).includes('timed out')
        )
      ).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('never kills after a successful run', async () => {
    const child = fakeChild(null)
    const run = jest.fn((_p: string[], onSpawn: (c: never) => void) => {
      onSpawn(child as never)
      return Promise.resolve({ code: 0 })
    })
    await applyRegistryFixes([entry], CTX, run)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('keeps the 15 s timeout', () => {
    expect(REGISTRY_FIX_TIMEOUT_MS).toBe(15000)
  })
})

describe('knownFixPrefixDir', () => {
  const s = (o: object) => o as unknown as GameSettings
  it('maps each wine type to its registry dir', () => {
    expect(
      knownFixPrefixDir(
        s({ winePrefix: '/x', wineVersion: { type: 'proton' } })
      )
    ).toBe(join('/x', 'pfx'))
    expect(
      knownFixPrefixDir(s({ winePrefix: '/x', wineVersion: { type: 'wine' } }))
    ).toBe('/x')
    expect(
      knownFixPrefixDir(
        s({ wineCrossoverBottle: 'B', wineVersion: { type: 'crossover' } })
      )
    ).toMatch(/CrossOver\/Bottles\/B$/)
  })
  it('is undefined when unknown', () => {
    expect(knownFixPrefixDir(s({ winePrefix: '/x' }))).toBeUndefined()
    expect(
      knownFixPrefixDir(s({ wineVersion: { type: 'wine' } }))
    ).toBeUndefined()
    expect(
      knownFixPrefixDir(s({ wineVersion: { type: 'crossover' } }))
    ).toBeUndefined()
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
    expect(typeof first.onSpawn).toBe('function')
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
