/**
 * Unit tests for the Windows `.lnk` writer's argv/script/env construction. `spawn` is a fake:
 * NO POWERSHELL RUNS. The property under test is that caller-supplied values only ever travel
 * as environment variables, never as script text or argv, so they need no escaping.
 */
import { EventEmitter } from 'events'

const mockSpawn = jest.fn()
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: (...args: unknown[]) => mockSpawn(...args)
}))

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

const HOSTILE_TITLE = `Jörg's "Quest" $(calc) \`whoami\`; & 日本語 'x'`
// The same title with only the characters Windows forbids in a file NAME removed
// (`<>:"/\|?*`), for the one test that creates a real file. It keeps `$(...)`, the backtick,
// the apostrophe and the CJK run, which is what the file-creating test is about.
const HOSTILE_FILE_TITLE = HOSTILE_TITLE.replace(/[<>:"/\\|?*]/g, '')
const HOSTILE_LNK = `C:\\Users\\Jörg\\OneDrive\\Desktop\\${HOSTILE_TITLE}.lnk`

type FakeChild = EventEmitter & {
  stdin: EventEmitter & { write: jest.Mock; end: jest.Mock }
  stderr: EventEmitter
  kill: jest.Mock
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  const stdin = new EventEmitter() as FakeChild['stdin']
  stdin.write = jest.fn()
  stdin.end = jest.fn()
  child.stdin = stdin
  child.stderr = new EventEmitter()
  child.kill = jest.fn()
  return child
}

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

  it('turns a protocol URL target into explorer.exe + the URL as its argument', () => {
    const url = 'gamelib://launch?appName=a&runner=gog'
    const env = buildShortcutEnv(
      'C:\\x.lnk',
      { target: url, icon: 'C:\\Games\\Game.exe', iconIndex: 0 },
      { SystemRoot: 'D:\\WINDOWS' }
    )
    expect(env.GAMELIB_LNK_TARGET).toBe('D:\\WINDOWS\\explorer.exe')
    expect(env.GAMELIB_LNK_ARGS).toBe(url)
    expect(env.GAMELIB_LNK_ICON).toBe('C:\\Games\\Game.exe')
    expect(env.GAMELIB_LNK_ICON_INDEX).toBe('0')
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
    jest.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('spawns powershell.exe with a fixed argv, no shell, and feeds the constant script on stdin', async () => {
    expect(HOSTILE_FILE_TITLE).toContain('$(calc)')
    expect(HOSTILE_FILE_TITLE).toContain('`')
    expect(HOSTILE_FILE_TITLE).toContain("'")
    expect(HOSTILE_FILE_TITLE).toContain('日本語')
    expect(HOSTILE_FILE_TITLE).not.toMatch(/[<>:"/\\|?*]/)
    const lnk = join(dir, `${HOSTILE_FILE_TITLE}.lnk`)
    const child = fakeChild()
    mockSpawn.mockReturnValue(child)

    const pending = writeWindowsShortcut(lnk, { target: 'gamelib://x' })
    writeFileSync(lnk, '')
    child.emit('close', 0)

    await expect(pending).resolves.toEqual({ ok: true })
    const [command, args, options] = mockSpawn.mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(args).toEqual(POWERSHELL_ARGS)
    expect(args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-'
    ])
    expect(JSON.stringify(args)).not.toContain('Jörg')
    expect(options.shell).toBeUndefined()
    expect(options.windowsHide).toBe(true)
    expect(options.env.GAMELIB_LNK_PATH).toBe(lnk)
    expect(child.stdin.write).toHaveBeenCalledWith(WRITE_SHORTCUT_SCRIPT)
    expect(child.stdin.end).toHaveBeenCalled()
  })

  it('reports a non-zero exit with its stderr', async () => {
    const child = fakeChild()
    mockSpawn.mockReturnValue(child)

    const pending = writeWindowsShortcut(join(dir, 'a.lnk'), {
      target: 'gamelib://x'
    })
    child.stderr.emit('data', Buffer.from('Access is denied.\r\n'))
    child.emit('close', 1)

    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'powershell exited 1: Access is denied.'
    })
  })

  it('does not trust exit 0 when no .lnk was written', async () => {
    const child = fakeChild()
    mockSpawn.mockReturnValue(child)

    const pending = writeWindowsShortcut(join(dir, 'missing.lnk'), {
      target: 'gamelib://x'
    })
    child.emit('close', 0)

    await expect(pending).resolves.toMatchObject({ ok: false })
  })

  it('reports a spawn error (e.g. powershell.exe not found)', async () => {
    const child = fakeChild()
    mockSpawn.mockReturnValue(child)

    const pending = writeWindowsShortcut(join(dir, 'a.lnk'), {
      target: 'gamelib://x'
    })
    child.emit('error', new Error('spawn powershell.exe ENOENT'))

    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'Error: spawn powershell.exe ENOENT'
    })
  })

  it('kills a child that never exits, after the bound', async () => {
    jest.useFakeTimers()
    const child = fakeChild()
    mockSpawn.mockReturnValue(child)

    const pending = writeWindowsShortcut(join(dir, 'a.lnk'), {
      target: 'gamelib://x'
    })
    jest.advanceTimersByTime(WRITE_SHORTCUT_TIMEOUT_MS)

    await expect(pending).resolves.toMatchObject({ ok: false })
    expect(child.kill).toHaveBeenCalled()
  })
})
