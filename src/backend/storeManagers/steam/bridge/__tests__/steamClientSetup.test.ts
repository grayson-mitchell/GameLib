/**
 * Phase 52 Plan 08: steamClientSetup -- HKCU-only registry argv, drive_c
 * path mapping, and containment-checked forwarder placement.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSteamClientRegistryCommands,
  setupSteamClientForwarder,
  STEAMCLIENT_ACTIVE_PROCESS_KEY,
  toBottleWindowsPath
} from '../steamClientSetup'
import { runWineCommand } from 'backend/launcher'
import { getBottleDir } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/paths', () => ({
  builtBridgeSteamClient64Path: '/nonexistent/steamclient64.dll'
}))
jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))
jest.mock('../../bottle', () => ({
  getBottleDir: jest.fn(),
  sanitizeBottleName: (name: string): string | null =>
    typeof name === 'string' && name.trim() && !/[\\/\0]|\.\./.test(name)
      ? name.trim()
      : null
}))

const mockedRun = runWineCommand as jest.Mock
const mockedGetBottleDir = getBottleDir as jest.Mock
const WIN = 'C:\\G\\x64\\steamclient64.dll'

describe('buildSteamClientRegistryCommands', () => {
  it('returns exactly the SteamClientDll64 and Universe argv', () => {
    expect(buildSteamClientRegistryCommands({ dll64WinPath: WIN })).toEqual([
      [
        'reg',
        'add',
        STEAMCLIENT_ACTIVE_PROCESS_KEY,
        '/v',
        'SteamClientDll64',
        '/t',
        'REG_SZ',
        '/d',
        WIN,
        '/f'
      ],
      [
        'reg',
        'add',
        STEAMCLIENT_ACTIVE_PROCESS_KEY,
        '/v',
        'Universe',
        '/t',
        'REG_SZ',
        '/d',
        'Public',
        '/f'
      ]
    ])
  })

  it('never names HKLM in any argv element', () => {
    for (const argv of buildSteamClientRegistryCommands({
      dll64WinPath: WIN
    })) {
      for (const el of argv) {
        expect(el).not.toMatch(/HKLM|HKEY_LOCAL_MACHINE/i)
      }
    }
  })

  it('writes no pid and no x86 SteamClientDll value', () => {
    const names = buildSteamClientRegistryCommands({ dll64WinPath: WIN }).map(
      (a) => a[4]
    )
    expect(names).toEqual(['SteamClientDll64', 'Universe'])
  })

  it.each(['C:\\a"b', 'C:\\a\rb', 'C:\\a\nb', 'C:\\a\0b', '/unix/path', 'x'])(
    'throws for an unsafe path %j',
    (p) => {
      expect(() =>
        buildSteamClientRegistryCommands({ dll64WinPath: p })
      ).toThrow()
    }
  )
})

describe('toBottleWindowsPath', () => {
  it('maps a drive_c path to a C:\\ path', () => {
    expect(
      toBottleWindowsPath(
        '/B',
        '/B/drive_c/Program Files (x86)/Steam/x64/steamclient64.dll'
      )
    ).toBe('C:\\Program Files (x86)\\Steam\\x64\\steamclient64.dll')
  })
  it.each([
    '/B/drive_c/../x',
    '/B/dosdevices/z:/x',
    '/elsewhere/x',
    '/B/drive_c'
  ])('returns null for %s', (p) => {
    expect(toBottleWindowsPath('/B', p)).toBeNull()
  })
})

describe('setupSteamClientForwarder', () => {
  let root: string
  let bottleDir: string
  let exeDir: string
  let exe: string
  let source: string
  const settings = { winePrefix: 'x' } as never

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-scsetup-'))
    bottleDir = join(root, 'bottle')
    exeDir = join(bottleDir, 'drive_c', 'G', 'x64')
    mkdirSync(exeDir, { recursive: true })
    exe = join(exeDir, 'Game.exe')
    writeFileSync(exe, 'exe')
    source = join(root, 'steamclient64.dll')
    writeFileSync(source, 'forwarder-bytes')
    mockedGetBottleDir.mockReturnValue(bottleDir)
    mockedRun.mockReset()
    mockedRun.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const run = (over: Record<string, unknown> = {}) =>
    setupSteamClientForwarder({
      appId: '123',
      bottleName: 'GameLibSteamBridge-123',
      bottleSettings: settings,
      exePath: exe,
      shimPaths: [join(exeDir, 'steam_api64.dll')],
      arch: 'x64',
      forwarderSourcePath: source,
      ...over
    })

  it('places the forwarder and runs both reg adds', async () => {
    const res = await run()
    expect(res).toEqual({
      status: 'placed',
      forwarderPath: join(exeDir, 'steamclient64.dll'),
      winPath: 'C:\\G\\x64\\steamclient64.dll'
    })
    expect(readFileSync(join(exeDir, 'steamclient64.dll'), 'utf-8')).toBe(
      'forwarder-bytes'
    )
    expect(mockedRun).toHaveBeenCalledTimes(2)
    expect(mockedRun).toHaveBeenNthCalledWith(1, {
      gameSettings: settings,
      commandParts: buildSteamClientRegistryCommands({
        dll64WinPath: 'C:\\G\\x64\\steamclient64.dll'
      })[0],
      wait: true,
      protonVerb: 'run'
    })
  })

  it('is idempotent when the forwarder is already byte-identical', async () => {
    writeFileSync(join(exeDir, 'steamclient64.dll'), 'forwarder-bytes')
    expect((await run()).status).toBe('placed')
  })

  it('x86 is unavailable with no wine call', async () => {
    expect(await run({ arch: 'x86' })).toEqual({
      status: 'unavailable',
      reason: 'x86-deferred'
    })
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('missing forwarder source is unavailable', async () => {
    expect(await run({ forwarderSourcePath: join(root, 'nope.dll') })).toEqual({
      status: 'unavailable',
      reason: 'forwarder-not-built'
    })
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('prefers the shim directory equal to the exe directory', async () => {
    const compat = join(exeDir, '..', 'compat')
    mkdirSync(compat, { recursive: true })
    const res = await run({
      shimPaths: [
        join(compat, 'steam_api64.dll'),
        join(exeDir, 'steam_api64.dll')
      ]
    })
    expect(res.status === 'placed' && res.forwarderPath).toBe(
      join(exeDir, 'steamclient64.dll')
    )
  })

  it('falls back to the first steam_api64.dll shim dir', async () => {
    const other = join(bottleDir, 'drive_c', 'G', 'bin')
    mkdirSync(other, { recursive: true })
    const res = await run({
      shimPaths: [join(other, 'steam_api.dll'), join(other, 'steam_api64.dll')]
    })
    expect(res.status === 'placed' && res.forwarderPath).toBe(
      join(other, 'steamclient64.dll')
    )
  })

  it('refuses a target outside the bottle', async () => {
    const outside = join(root, 'outside')
    mkdirSync(outside)
    const res = await run({
      exePath: join(outside, 'Game.exe'),
      shimPaths: [join(outside, 'steam_api64.dll')]
    })
    expect(res.status).toBe('error')
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('reports a non-zero reg exit with the value name', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '', stderr: '', code: 1 })
    const res = await run()
    expect(res.status).toBe('error')
    expect(res.status === 'error' && res.error).toContain('SteamClientDll64')
  })

  it('reports a thrown runWineCommand without throwing', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    mockedRun.mockRejectedValueOnce(new Error('boom'))
    const res = await run()
    expect(res.status).toBe('error')
    expect(res.status === 'error' && res.error).toContain('Universe')
  })

  it('rejects a non-numeric appId before any fs or wine call', async () => {
    expect((await run({ appId: '12a' })).status).toBe('error')
    expect(mockedRun).not.toHaveBeenCalled()
  })
})
