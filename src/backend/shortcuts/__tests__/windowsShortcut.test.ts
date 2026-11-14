/**
 * Unit tests for the Windows `.lnk` writer's argv/script/env construction. The runner is scripted:
 * NO POWERSHELL RUNS. The property under test is that caller-supplied values only ever travel
 * as environment variables, never as script text or argv, so they need no escaping.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  POWERSHELL_ARGS,
  SHELL_LINK_CSHARP,
  WRITE_SHORTCUT_SCRIPT,
  WRITE_SHORTCUT_TIMEOUT_MS,
  buildShortcutEnv,
  writeWindowsShortcut
} from '../shortcuts/windowsShortcut'
import { createScriptedRunner } from '../../testUtils/scriptedRunner'

const HOSTILE_TITLE = `Jörg's "Quest" $(calc) \`whoami\`; & 日本語 'x'`
// The same title with only the characters Windows forbids in a file NAME removed
// (`<>:"/\|?*`), for the one test that creates a real file. It keeps `$(...)`, the backtick,
// the apostrophe and the CJK run, which is what the file-creating test is about.
const HOSTILE_FILE_TITLE = HOSTILE_TITLE.replace(/[<>:"/\\|?*]/g, '')
const HOSTILE_LNK = `C:\\Users\\Jörg\\OneDrive\\Desktop\\${HOSTILE_TITLE}.lnk`

const IShellLinkW_MEMBERS = [
  'GetPath',
  'GetIDList',
  'SetIDList',
  'GetDescription',
  'SetDescription',
  'GetWorkingDirectory',
  'SetWorkingDirectory',
  'GetArguments',
  'SetArguments',
  'GetHotkey',
  'SetHotkey',
  'GetShowCmd',
  'SetShowCmd',
  'GetIconLocation',
  'SetIconLocation',
  'SetRelativePath',
  'Resolve',
  'SetPath'
]

describe('SHELL_LINK_CSHARP', () => {
  it('is a single line with no single quote and no // comment', () => {
    expect(SHELL_LINK_CSHARP).not.toMatch(/[\r\n]/)
    expect(SHELL_LINK_CSHARP).not.toContain("'")
    expect(SHELL_LINK_CSHARP).not.toContain('//')
  })

  it('declares the shell-link COM types and the Write entry point', () => {
    expect(SHELL_LINK_CSHARP).toContain('namespace GameLibLnk')
    expect(SHELL_LINK_CSHARP).toContain('00021401-0000-0000-C000-000000000046')
    expect(SHELL_LINK_CSHARP).toContain('000214F9-0000-0000-C000-000000000046')
    expect(SHELL_LINK_CSHARP).toContain('IPersistFile')
    expect(SHELL_LINK_CSHARP).toContain(
      'public static void Write(string lnk, string target, string args, string icon, int iconIndex)'
    )
  })

  it('declares the 18 IShellLinkW members once each, in COM vtable order', () => {
    let previous = -1
    for (const name of IShellLinkW_MEMBERS) {
      const needle = `void ${name}(`
      const first = SHELL_LINK_CSHARP.indexOf(needle)
      expect(first).toBeGreaterThan(previous)
      expect(SHELL_LINK_CSHARP.indexOf(needle, first + 1)).toBe(-1)
      previous = first
    }
  })
})

describe('WRITE_SHORTCUT_SCRIPT', () => {
  it('no longer goes through WScript.Shell, whose ANSI conversion loses CJK', () => {
    expect(WRITE_SHORTCUT_SCRIPT).not.toContain('WScript.Shell')
    expect(WRITE_SHORTCUT_SCRIPT).not.toContain('-ComObject')
  })

  it('is exactly four one-statement lines, for -Command - which parses stdin line by line', () => {
    const lines = WRITE_SHORTCUT_SCRIPT.split('\r\n').filter(Boolean)
    expect(lines).toEqual([
      "$ErrorActionPreference = 'Stop'",
      `$src = '${SHELL_LINK_CSHARP}'`,
      expect.stringMatching(
        /^try \{ Add-Type -TypeDefinition \$src; \[GameLibLnk\.Writer\]::Write\(.*\) \} catch \{.*exit 1 \}$/
      ),
      'exit 0'
    ])
    expect(WRITE_SHORTCUT_SCRIPT.endsWith('\r\n')).toBe(true)
  })

  it('has no here-string opener, which -Command - silently stops at', () => {
    expect(WRITE_SHORTCUT_SCRIPT).not.toContain("@'")
    expect(WRITE_SHORTCUT_SCRIPT).not.toContain('@"')
  })

  it('passes the five values to the writer only through $env:', () => {
    expect(WRITE_SHORTCUT_SCRIPT).toContain(
      '[GameLibLnk.Writer]::Write($env:GAMELIB_LNK_PATH, $env:GAMELIB_LNK_TARGET, $env:GAMELIB_LNK_ARGS, $env:GAMELIB_LNK_ICON, [int]$env:GAMELIB_LNK_ICON_INDEX)'
    )
    const names = new Set(
      [...WRITE_SHORTCUT_SCRIPT.matchAll(/\$env:(\w+)/g)].map((m) => m[1])
    )
    expect([...names].sort()).toEqual(
      [
        'GAMELIB_LNK_ARGS',
        'GAMELIB_LNK_ICON',
        'GAMELIB_LNK_ICON_INDEX',
        'GAMELIB_LNK_PATH',
        'GAMELIB_LNK_TARGET'
      ].sort()
    )
  })
})

describe('buildShortcutEnv', () => {
  it('passes a hostile, non-ASCII path through verbatim, as data', () => {
    const env = buildShortcutEnv(
      HOSTILE_LNK,
      { target: 'C:\\Games\\Game.exe' },
      { SystemRoot: 'C:\\Windows' }
    )
    expect(env.GAMELIB_LNK_PATH).toBe(HOSTILE_LNK)
    expect(env.GAMELIB_LNK_TARGET).toBe('C:\\Games\\Game.exe')
    expect(env.GAMELIB_LNK_ARGS).toBe('')
    // The constant script never contains the value it is given.
    expect(WRITE_SHORTCUT_SCRIPT).not.toContain('Jörg')
  })

  it('turns a protocol URL target into explorer.exe + the URL as ONE double-quoted argument', () => {
    const url = 'gamelib://launch?appName=a&runner=gog'
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: url, icon: 'C:\\Games\\Game.exe', iconIndex: 0 },
      { SystemRoot: 'D:\\WINDOWS' }
    )
    expect(env.GAMELIB_LNK_TARGET).toBe('D:\\WINDOWS\\explorer.exe')
    expect(env.GAMELIB_LNK_ARGS).toBe(`"${url}"`)
    expect(env.GAMELIB_LNK_ICON).toBe('C:\\Games\\Game.exe')
    expect(env.GAMELIB_LNK_ICON_INDEX).toBe('0')
  })

  it('appends details.args after the closing quote of a URL target', () => {
    const url = 'gamelib://launch?appName=a&runner=gog'
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: url, args: '--x' },
      { SystemRoot: 'C:\\Windows' }
    )
    expect(env.GAMELIB_LNK_ARGS).toBe(`"${url}" --x`)
  })

  it('percent-encodes a double quote inside a URL target so it cannot end the argument early', () => {
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: 'gamelib://launch?appName=a"b" /root,C:\\&runner=gog' },
      { SystemRoot: 'C:\\Windows' }
    )
    const args = env.GAMELIB_LNK_ARGS ?? ''
    expect(args).toBe(
      '"gamelib://launch?appName=a%22b%22 /root,C:\\&runner=gog"'
    )
    expect(args.match(/"/g)).toHaveLength(2)
    expect(args.startsWith('"')).toBe(true)
    expect(args.endsWith('"')).toBe(true)
  })

  it('leaves the args of a non-URL target exactly as given, with no quotes added', () => {
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: 'C:\\Game.exe', args: 'a b' },
      {}
    )
    expect(env.GAMELIB_LNK_ARGS).toBe('a b')
  })

  it('does not mistake a drive letter for a URL scheme', () => {
    const env = buildShortcutEnv('C:\\x.lnk', { target: 'C:\\Game.exe' }, {})
    expect(env.GAMELIB_LNK_TARGET).toBe('C:\\Game.exe')
  })

  it('keeps the inherited environment (PowerShell needs SystemRoot, PATH, ...)', () => {
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: 'C:\\Game.exe' },
      { PATH: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows' }
    )
    expect(env.PATH).toBe('C:\\Windows\\System32')
  })
})

describe('writeWindowsShortcut', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-lnk-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const writer = (runner: ReturnType<typeof createScriptedRunner>) => ({
    runner
  })

  it('runs powershell.exe with a fixed argv, the constant script on stdin, and the env replaced', async () => {
    expect(HOSTILE_FILE_TITLE).toContain('$(calc)')
    expect(HOSTILE_FILE_TITLE).toContain('`')
    expect(HOSTILE_FILE_TITLE).toContain("'")
    expect(HOSTILE_FILE_TITLE).toContain('日本語')
    expect(HOSTILE_FILE_TITLE).not.toMatch(/[<>:"/\\|?*]/)
    const lnk = join(dir, `${HOSTILE_FILE_TITLE}.lnk`)
    writeFileSync(lnk, '')
    const runner = createScriptedRunner([{ cmd: 'powershell.exe' }])

    await expect(
      writeWindowsShortcut(writer(runner), lnk, { target: 'gamelib://x' })
    ).resolves.toEqual({ ok: true })

    const call = runner.calls[0]
    expect(call?.method).toBe('run')
    expect(call?.cmd).toBe('powershell.exe')
    expect(call?.argv).toEqual(POWERSHELL_ARGS)
    expect(call?.argv).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-'
    ])
    expect(JSON.stringify(call?.argv)).not.toContain('Jörg')
    const opts = call?.opts as {
      stdin: string
      replaceEnv: boolean
      timeoutMs: number
      windowsHide: boolean
      env: NodeJS.ProcessEnv
    }
    expect(opts.stdin).toBe(WRITE_SHORTCUT_SCRIPT)
    expect(opts.replaceEnv).toBe(true)
    expect(opts.timeoutMs).toBe(30000)
    expect(opts.timeoutMs).toBe(WRITE_SHORTCUT_TIMEOUT_MS)
    expect(opts.windowsHide).toBe(true)
    expect(opts.env.GAMELIB_LNK_PATH).toBe(lnk)
    runner.expectAllConsumed()
  })

  it('reports a non-zero exit with its stderr', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'powershell.exe',
        result: { code: 1, stderr: 'Access is denied.\r\n' }
      }
    ])
    await expect(
      writeWindowsShortcut(writer(runner), join(dir, 'a.lnk'), {
        target: 'gamelib://x'
      })
    ).resolves.toEqual({
      ok: false,
      error: 'powershell exited 1: Access is denied.'
    })
  })

  it('does not trust exit 0 when no .lnk was written', async () => {
    const runner = createScriptedRunner([{ cmd: 'powershell.exe' }])
    await expect(
      writeWindowsShortcut(writer(runner), join(dir, 'missing.lnk'), {
        target: 'gamelib://x'
      })
    ).resolves.toMatchObject({ ok: false })
  })

  it('reports a spawn error (e.g. powershell.exe not found)', async () => {
    const runner = createScriptedRunner([
      { cmd: 'powershell.exe', error: { code: 'ENOENT' } }
    ])
    await expect(
      writeWindowsShortcut(writer(runner), join(dir, 'a.lnk'), {
        target: 'gamelib://x'
      })
    ).resolves.toEqual({
      ok: false,
      error: 'Error: spawn powershell.exe ENOENT'
    })
  })

  it('reports a timeout', async () => {
    const runner = createScriptedRunner([
      { cmd: 'powershell.exe', result: { code: null, timedOut: true } }
    ])
    await expect(
      writeWindowsShortcut(writer(runner), join(dir, 'a.lnk'), {
        target: 'gamelib://x'
      })
    ).resolves.toEqual({
      ok: false,
      error: `powershell did not exit within ${WRITE_SHORTCUT_TIMEOUT_MS}ms`
    })
  })
})
