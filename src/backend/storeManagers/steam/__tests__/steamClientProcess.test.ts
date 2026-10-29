/**
 * debug/steam-waiting-for-restart-windows (D-UAT-13): the Steam-client process
 * probe the install poller uses to tell whether the client that was running
 * when GameLib wrote a manifest has since exited.
 *
 * `child_process.execFile` is mocked: no real `tasklist`/`pgrep` is spawned
 * (the two-profile rule is moot here -- the probe reads no user profile and
 * passes no env, and nothing in this suite can spawn). The real Windows probe
 * was exercised once, by hand, against the live Steam client (see the debug
 * session's Evidence).
 */
import { execFile } from 'child_process'
import {
  listSteamClientPids,
  parsePgrepPids,
  parsePidTokenLines,
  readSteamProcessStartTokens,
  parseTasklistSteamPids
} from '../steamClientProcess'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

type ExecCb = (
  err: (Error & { code?: number | string }) | null,
  stdout: string,
  stderr: string
) => void

/** Makes the next execFile call finish with `code`/`stdout` (code 0 = success). */
function mockExec(code: number | string, stdout = '') {
  jest.mocked(execFile).mockImplementation(((
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: ExecCb
  ) => {
    if (code === 0) cb(null, stdout, '')
    else cb(Object.assign(new Error(`exit ${code}`), { code }), stdout, '')
    return {} as never
  }) as never)
}

const calls = () => jest.mocked(execFile).mock.calls

describe('parseTasklistSteamPids()', () => {
  it('reads the PID of a steam.exe CSV row', () => {
    expect(
      parseTasklistSteamPids(
        '"steam.exe","13712","Console","1","183,580 K"\r\n'
      )
    ).toEqual([13712])
  })

  it('collects every steam.exe row and matches the image name case-insensitively', () => {
    expect(
      parseTasklistSteamPids(
        '"steam.exe","100","Console","1","1 K"\r\n"Steam.EXE","200","Console","1","1 K"\r\n'
      )
    ).toEqual([100, 200])
  })

  it('ignores sibling Steam processes and the (localized) no-match line', () => {
    expect(
      parseTasklistSteamPids(
        [
          '"steamwebhelper.exe","5","Console","1","1 K"',
          '"steamservice.exe","6","Services","0","1 K"',
          '"notsteam.exe","7","Console","1","1 K"',
          'INFO: No tasks are running which match the specified criteria.',
          'INFORMATION : aucune tâche en service ne correspond aux critères spécifiés.'
        ].join('\r\n')
      )
    ).toEqual([])
  })

  it('rejects a non-numeric or zero PID', () => {
    expect(
      parseTasklistSteamPids('"steam.exe","abc","Console","1","1 K"\r\n')
    ).toEqual([])
    expect(
      parseTasklistSteamPids('"steam.exe","0","Console","1","1 K"\r\n')
    ).toEqual([])
  })
})

describe('parsePgrepPids()', () => {
  it('reads one PID per line', () => {
    expect(parsePgrepPids('4242\n4243\n')).toEqual([4242, 4243])
  })

  it('ignores blank and non-numeric lines', () => {
    expect(parsePgrepPids('\nnope\n77\n  \n')).toEqual([77])
  })
})

describe('listSteamClientPids()', () => {
  describe('win32', () => {
    it('runs tasklist filtered to steam.exe (image + PID, so PID reuse by another program is harmless) and returns its PIDs', async () => {
      mockExec(0, '"steam.exe","13712","Console","1","183,580 K"\r\n')

      await expect(listSteamClientPids('win32')).resolves.toEqual([13712])

      expect(calls()).toHaveLength(1)
      const [file, args, opts] = calls()[0] as unknown as [
        string,
        string[],
        { timeout: number; windowsHide: boolean }
      ]
      expect(file.toLowerCase()).toMatch(/tasklist\.exe$/)
      expect(args).toEqual([
        '/FI',
        'IMAGENAME eq steam.exe',
        '/FO',
        'CSV',
        '/NH'
      ])
      // Bounded and windowless; no env literal (nothing profile-dependent).
      expect(opts.timeout).toBeGreaterThan(0)
      expect(opts.windowsHide).toBe(true)
      expect(opts).not.toHaveProperty('env')
    })

    it('returns [] (a definite "not running") when tasklist matches nothing', async () => {
      mockExec(
        0,
        'INFO: No tasks are running which match the specified criteria.\r\n'
      )
      await expect(listSteamClientPids('win32')).resolves.toEqual([])
    })

    it('returns undefined ("unknown", callers fail open) when tasklist fails or cannot be spawned', async () => {
      mockExec('ENOENT')
      await expect(listSteamClientPids('win32')).resolves.toBeUndefined()
      mockExec(1)
      await expect(listSteamClientPids('win32')).resolves.toBeUndefined()
    })
  })

  describe('darwin', () => {
    it('runs pgrep -x steam_osx and returns its PIDs', async () => {
      mockExec(0, '5150\n')

      await expect(listSteamClientPids('darwin')).resolves.toEqual([5150])

      const [file, args] = calls()[0] as unknown as [string, string[]]
      expect(file).toBe('/usr/bin/pgrep')
      expect(args).toEqual(['-x', 'steam_osx'])
    })

    it('pgrep exit 1 is a definite "not running" ([]), any other failure is unknown (undefined)', async () => {
      mockExec(1)
      await expect(listSteamClientPids('darwin')).resolves.toEqual([])
      mockExec(2)
      await expect(listSteamClientPids('darwin')).resolves.toBeUndefined()
      mockExec('ENOENT')
      await expect(listSteamClientPids('darwin')).resolves.toBeUndefined()
    })
  })

  describe('linux', () => {
    it('runs pgrep -x steam and returns its PIDs', async () => {
      mockExec(0, '900\n901\n')

      await expect(listSteamClientPids('linux')).resolves.toEqual([900, 901])

      const [, args] = calls()[0] as unknown as [string, string[]]
      expect(args).toEqual(['-x', 'steam'])
    })

    it('pgrep exit 1 is [] and a missing pgrep is unknown', async () => {
      mockExec(1)
      await expect(listSteamClientPids('linux')).resolves.toEqual([])
      mockExec('ENOENT')
      await expect(listSteamClientPids('linux')).resolves.toBeUndefined()
    })
  })

  it('returns undefined on a platform it has no probe for, without spawning anything', async () => {
    await expect(
      listSteamClientPids('freebsd' as unknown as NodeJS.Platform)
    ).resolves.toBeUndefined()
    expect(calls()).toHaveLength(0)
  })

  it('never rejects, even if execFile throws synchronously', async () => {
    jest.mocked(execFile).mockImplementation((() => {
      throw new Error('boom')
    }) as never)
    await expect(listSteamClientPids('win32')).resolves.toBeUndefined()
  })
})

describe('parsePidTokenLines()', () => {
  it('parses ps lstart lines and tick lines, ignoring noise', () => {
    expect(parsePidTokenLines('  4410 Thu Oct 29  12:12:31 2026\n')).toEqual(
      new Map([[4410, 'Thu Oct 29 12:12:31 2026']])
    )
    expect(parsePidTokenLines('13712 638659123450000000\r\n')).toEqual(
      new Map([[13712, '638659123450000000']])
    )
    expect(parsePidTokenLines('\nPID START\nabc 5\n')).toEqual(new Map())
  })
})

describe('readSteamProcessStartTokens()', () => {
  it('spawns nothing for an empty or invalid pid list', async () => {
    await expect(readSteamProcessStartTokens([], 'linux')).resolves.toEqual(
      new Map()
    )
    await expect(
      readSteamProcessStartTokens([-1, 1.5, NaN], 'win32')
    ).resolves.toEqual(new Map())
    expect(calls()).toHaveLength(0)
  })

  it('darwin uses /bin/ps with lstart', async () => {
    mockExec(0, '4410 Thu Oct 29 12:12:31 2026\n')
    const r = await readSteamProcessStartTokens([4410, 4411], 'darwin')
    expect(r).toEqual(new Map([[4410, 'Thu Oct 29 12:12:31 2026']]))
    const [file, args] = calls()[0] as unknown as [string, string[]]
    expect(file).toBe('/bin/ps')
    expect(args).toEqual(['-o', 'pid=,lstart=', '-p', '4410,4411'])
  })

  it('linux uses bare ps; code 1 is empty, other codes unknown', async () => {
    mockExec(0, '900 Thu Oct 29 12:12:31 2026\n')
    await readSteamProcessStartTokens([900], 'linux')
    expect((calls()[0] as unknown as [string])[0]).toBe('ps')
    mockExec(1)
    await expect(readSteamProcessStartTokens([900], 'linux')).resolves.toEqual(
      new Map()
    )
    mockExec(2)
    await expect(
      readSteamProcessStartTokens([900], 'linux')
    ).resolves.toBeUndefined()
  })

  it('win32 uses PowerShell Get-Process ticks', async () => {
    mockExec(0, '13712 638659123450000000\r\n99 5\r\n')
    const r = await readSteamProcessStartTokens([13712, 4410], 'win32')
    expect(r).toEqual(new Map([[13712, '638659123450000000']]))
    const [file, args] = calls()[0] as unknown as [string, string[]]
    expect(file).toMatch(/powershell\.exe$/)
    expect(args.slice(0, 3)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command'
    ])
    expect(args[3]).toContain('Get-Process -Id 13712,4410')
    expect(args[3]).toContain('-ErrorAction SilentlyContinue')
    expect(args[3]).toContain('StartTime.ToUniversalTime().Ticks')
    expect(args[3].endsWith('exit 0')).toBe(true)
    mockExec(1)
    await expect(
      readSteamProcessStartTokens([13712], 'win32')
    ).resolves.toBeUndefined()
  })

  it('is undefined on an unsupported platform', async () => {
    await expect(
      readSteamProcessStartTokens([1], 'freebsd' as unknown as NodeJS.Platform)
    ).resolves.toBeUndefined()
  })
})
