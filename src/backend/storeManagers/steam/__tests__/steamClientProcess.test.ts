/**
 * debug/steam-waiting-for-restart-windows (D-UAT-13): the Steam-client process
 * probe the install poller uses to tell whether the client that was running
 * when GameLib wrote a manifest has since exited.
 *
 * A scripted process runner stands in for the real one: no real
 * `tasklist`/`pgrep` is spawned (the two-profile rule is moot here -- the
 * probe reads no user profile and passes no env, and nothing in this suite
 * can spawn). The real Windows probe was exercised once, by hand, against
 * the live Steam client (see the debug session's Evidence).
 */
import { join } from 'path'
import {
  createScriptedRunner,
  type ScriptStep
} from 'backend/testUtils/scriptedRunner'
import {
  listSteamClientPids,
  parsePgrepPids,
  parsePidTokenLines,
  readSteamProcessStartTokens,
  parseTasklistSteamPids
} from '../steamClientProcess'
import { at } from './fixtures/indexed'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
/** One scripted step; a string code is a spawn error (ENOENT), a number an exit code. */
function step(
  cmd: string,
  code: number | string,
  stdout = '',
  extra: Partial<ScriptStep> = {}
): ScriptStep {
  return typeof code === 'string'
    ? { cmd, error: { code }, ...extra }
    : { cmd, result: { code, stdout }, ...extra }
}

function probe(...steps: ScriptStep[]) {
  const runner = createScriptedRunner(steps)
  return { runner, deps: { runner } }
}

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

const sysRoot = () => process.env.SystemRoot ?? 'C:\\Windows'
const tasklist = () => join(sysRoot(), 'System32', 'tasklist.exe')

describe('listSteamClientPids()', () => {
  describe('win32', () => {
    it('runs tasklist filtered to steam.exe (image + PID, so PID reuse by another program is harmless) and returns its PIDs', async () => {
      const { runner, deps } = probe(
        step(tasklist(), 0, '"steam.exe","13712","Console","1","183,580 K"\r\n')
      )

      await expect(listSteamClientPids(deps, 'win32')).resolves.toEqual([13712])

      expect(runner.calls).toHaveLength(1)
      const call = runner.calls[0]
      expect(call?.cmd.toLowerCase()).toMatch(/tasklist\.exe$/)
      expect(call?.argv).toEqual([
        '/FI',
        'IMAGENAME eq steam.exe',
        '/FO',
        'CSV',
        '/NH'
      ])
      // Bounded and windowless; no env literal (nothing profile-dependent).
      expect(call?.opts).toMatchObject({
        timeoutMs: 5000,
        windowsHide: true,
        stdin: ''
      })
      expect(call?.env).toBeUndefined()
    })

    it('returns [] (a definite "not running") when tasklist matches nothing', async () => {
      const { deps } = probe(
        step(
          tasklist(),
          0,
          'INFO: No tasks are running which match the specified criteria.\r\n'
        )
      )
      await expect(listSteamClientPids(deps, 'win32')).resolves.toEqual([])
    })

    it('returns undefined ("unknown", callers fail open) when tasklist fails, times out or cannot be spawned', async () => {
      for (const s of [
        step(tasklist(), 'ENOENT'),
        step(tasklist(), 1),
        {
          cmd: tasklist(),
          result: { code: null, timedOut: true }
        } satisfies ScriptStep
      ]) {
        const { deps } = probe(s)
        await expect(
          listSteamClientPids(deps, 'win32')
        ).resolves.toBeUndefined()
      }
    })
  })

  describe('darwin', () => {
    it('runs pgrep -x steam_osx and returns its PIDs in the order pgrep printed them', async () => {
      const { runner, deps } = probe(step('/usr/bin/pgrep', 0, '12\n7\n'))

      await expect(listSteamClientPids(deps, 'darwin')).resolves.toEqual([
        12, 7
      ])

      expect(runner.calls[0]?.cmd).toBe('/usr/bin/pgrep')
      expect(runner.calls[0]?.argv).toEqual(['-x', 'steam_osx'])
      expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 5000 })
    })

    it('pgrep exit 1 is a definite "not running" ([]), any other failure is unknown (undefined)', async () => {
      await expect(
        listSteamClientPids(probe(step('/usr/bin/pgrep', 1)).deps, 'darwin')
      ).resolves.toEqual([])
      await expect(
        listSteamClientPids(probe(step('/usr/bin/pgrep', 2)).deps, 'darwin')
      ).resolves.toBeUndefined()
      await expect(
        listSteamClientPids(
          probe(step('/usr/bin/pgrep', 'ENOENT')).deps,
          'darwin'
        )
      ).resolves.toBeUndefined()
    })
  })

  describe('linux', () => {
    it('runs pgrep -x steam and returns its PIDs', async () => {
      const { runner, deps } = probe(step('pgrep', 0, '900\n901\n'))

      await expect(listSteamClientPids(deps, 'linux')).resolves.toEqual([
        900, 901
      ])

      expect(runner.calls[0]?.argv).toEqual(['-x', 'steam'])
    })

    it('pgrep exit 1 is [] and a missing pgrep is unknown', async () => {
      await expect(
        listSteamClientPids(probe(step('pgrep', 1)).deps, 'linux')
      ).resolves.toEqual([])
      await expect(
        listSteamClientPids(probe(step('pgrep', 'ENOENT')).deps, 'linux')
      ).resolves.toBeUndefined()
    })
  })

  it('returns undefined on a platform it has no probe for, without spawning anything', async () => {
    const { runner, deps } = probe()
    await expect(
      listSteamClientPids(deps, 'freebsd' as unknown as NodeJS.Platform)
    ).resolves.toBeUndefined()
    expect(runner.calls).toHaveLength(0)
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
    const { runner, deps } = probe()
    await expect(
      readSteamProcessStartTokens(deps, [], 'linux')
    ).resolves.toEqual(new Map())
    await expect(
      readSteamProcessStartTokens(deps, [-1, 1.5, NaN], 'win32')
    ).resolves.toEqual(new Map())
    expect(runner.calls).toHaveLength(0)
  })

  it('darwin uses /bin/ps with lstart and the 15 s bound', async () => {
    const { runner, deps } = probe(
      step('/bin/ps', 0, '4410 Thu Oct 29 12:12:31 2026\n')
    )
    const r = await readSteamProcessStartTokens(deps, [4410, 4411], 'darwin')
    expect(r).toEqual(new Map([[4410, 'Thu Oct 29 12:12:31 2026']]))
    expect(runner.calls[0]?.cmd).toBe('/bin/ps')
    expect(runner.calls[0]?.argv).toEqual([
      '-o',
      'pid=,lstart=',
      '-p',
      '4410,4411'
    ])
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 15000 })
  })

  it('linux uses bare ps; code 1 is empty, other codes unknown', async () => {
    const first = probe(step('ps', 0, '900 Thu Oct 29 12:12:31 2026\n'))
    await readSteamProcessStartTokens(first.deps, [900], 'linux')
    expect(first.runner.calls[0]?.cmd).toBe('ps')
    await expect(
      readSteamProcessStartTokens(probe(step('ps', 1)).deps, [900], 'linux')
    ).resolves.toEqual(new Map())
    await expect(
      readSteamProcessStartTokens(probe(step('ps', 2)).deps, [900], 'linux')
    ).resolves.toBeUndefined()
  })

  it('win32 uses PowerShell Get-Process ticks', async () => {
    const ps = join(
      sysRoot(),
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
    const { runner, deps } = probe(
      step(ps, 0, '13712 638659123450000000\r\n99 5\r\n')
    )
    const r = await readSteamProcessStartTokens(deps, [13712, 4410], 'win32')
    expect(r).toEqual(new Map([[13712, '638659123450000000']]))
    const args = runner.calls[0]?.argv ?? []
    expect(runner.calls[0]?.cmd).toMatch(/powershell\.exe$/)
    expect(args.slice(0, 3)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command'
    ])
    expect(args[3]).toContain('Get-Process -Id 13712,4410')
    expect(args[3]).toContain('-ErrorAction SilentlyContinue')
    expect(args[3]).toContain('StartTime.ToUniversalTime().Ticks')
    expect(at(args, 3).endsWith('exit 0')).toBe(true)
    await expect(
      readSteamProcessStartTokens(probe(step(ps, 1)).deps, [13712], 'win32')
    ).resolves.toBeUndefined()
  })

  it('is undefined on an unsupported platform', async () => {
    await expect(
      readSteamProcessStartTokens(
        probe().deps,
        [1],
        'freebsd' as unknown as NodeJS.Platform
      )
    ).resolves.toBeUndefined()
  })
})
