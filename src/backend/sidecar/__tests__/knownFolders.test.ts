/**
 * Pure-parser tests for `knownFolders.ts`: `user-dirs.dirs` (Linux) and `reg query` output plus
 * `%VAR%` expansion (Windows), and `readWindowsShellFolder` over a scripted runner and a fake
 * native `requestRustInvoke` (quick 261128-7wv). Nothing here reads the real profile or runs
 * `reg.exe`.
 */
import { RUST_WINDOWS_SHELL_FOLDER_READ } from 'common/types/sidecarTransport'
import {
  expandWindowsEnv,
  parseRegQueryValue,
  parseUserDirs,
  readWindowsShellFolder
} from '../knownFolders'
import { createScriptedRunner } from '../../testUtils/scriptedRunner'

describe('parseUserDirs', () => {
  const HOME = '/home/jörg'

  it('resolves $HOME-relative and absolute entries, skipping comments', () => {
    const content = [
      '# This file is written by xdg-user-dirs-update',
      '# If you want to change or add directories, just edit the line you are interested in.',
      'XDG_DESKTOP_DIR="$HOME/Schreibtisch"',
      'XDG_DOCUMENTS_DIR="/data/Dokumente"',
      'XDG_DOWNLOAD_DIR="$HOME/Downloads"',
      ''
    ].join('\n')
    expect(parseUserDirs(content, HOME)).toEqual({
      XDG_DESKTOP_DIR: '/home/jörg/Schreibtisch',
      XDG_DOCUMENTS_DIR: '/data/Dokumente',
      XDG_DOWNLOAD_DIR: '/home/jörg/Downloads'
    })
  })

  it('treats "$HOME/" as the home directory itself (desktop disabled)', () => {
    expect(parseUserDirs('XDG_DESKTOP_DIR="$HOME/"', HOME)).toEqual({
      XDG_DESKTOP_DIR: HOME
    })
  })

  it('unescapes backslash-escaped characters, including quotes and spaces', () => {
    expect(
      parseUserDirs('XDG_DESKTOP_DIR="$HOME/My \\"Desk\\" top"', HOME)
    ).toEqual({ XDG_DESKTOP_DIR: '/home/jörg/My "Desk" top' })
  })

  it('ignores relative or unquoted values, as GLib does', () => {
    expect(
      parseUserDirs(
        [
          'XDG_DESKTOP_DIR="Desktop"',
          'XDG_DOCUMENTS_DIR=$HOME/Documents',
          'XDG_MUSIC_DIR="$HOMEBOY/Music"'
        ].join('\n'),
        HOME
      )
    ).toEqual({})
  })

  it('accepts CRLF line endings', () => {
    expect(parseUserDirs('XDG_DESKTOP_DIR="$HOME/Bureau"\r\n', HOME)).toEqual({
      XDG_DESKTOP_DIR: '/home/jörg/Bureau'
    })
  })
})

describe('parseRegQueryValue', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    '    Desktop    REG_EXPAND_SZ    %USERPROFILE%\\OneDrive\\Desktop',
    '    Personal    REG_SZ    D:\\My Documents',
    ''
  ].join('\r\n')

  it('returns the data of the named value, spaces in the data intact', () => {
    expect(parseRegQueryValue(output, 'Desktop')).toBe(
      '%USERPROFILE%\\OneDrive\\Desktop'
    )
    expect(parseRegQueryValue(output, 'Personal')).toBe('D:\\My Documents')
  })

  it('returns undefined for a value that is not present', () => {
    expect(parseRegQueryValue(output, 'My Music')).toBeUndefined()
  })
})

describe('expandWindowsEnv', () => {
  it('expands %VAR% case-insensitively, keeping non-ASCII values intact', () => {
    expect(
      expandWindowsEnv('%userprofile%\\OneDrive\\Desktop', {
        USERPROFILE: 'C:\\Users\\Jörg'
      })
    ).toBe('C:\\Users\\Jörg\\OneDrive\\Desktop')
  })

  it('returns undefined rather than leaving an unresolved %VAR% in a path', () => {
    expect(expandWindowsEnv('%ONEDRIVE%\\Desktop', {})).toBeUndefined()
  })
})

describe('readWindowsShellFolder', () => {
  const KEY =
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
  const regOut = (name: string, type: string, value: string) =>
    `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    ${name}    ${type}    ${value}\r\n\r\n`
  const env = { USERPROFILE: 'C:\\Users\\Jörg' }

  it('parses the value and calls reg.exe by argv with a 5000 ms timeout', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'reg.exe',
        result: {
          code: 0,
          stdout: regOut('Desktop', 'REG_SZ', 'D:\\Desktop')
        }
      }
    ])
    await expect(
      readWindowsShellFolder({ runner }, 'Desktop', env)
    ).resolves.toBe('D:\\Desktop')
    const call = runner.calls[0]
    expect(call?.cmd).toBe('reg.exe')
    expect(call?.argv).toEqual(['query', KEY, '/v', 'Desktop'])
    expect((call?.opts as { timeoutMs: number }).timeoutMs).toBe(5000)
  })

  it('expands REG_EXPAND_SZ values from the environment', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'reg.exe',
        result: {
          stdout: regOut(
            'Personal',
            'REG_EXPAND_SZ',
            '%USERPROFILE%\\OneDrive\\Documents'
          )
        }
      }
    ])
    await expect(
      readWindowsShellFolder({ runner }, 'Personal', env)
    ).resolves.toBe('C:\\Users\\Jörg\\OneDrive\\Documents')
  })

  it('is undefined when reg.exe cannot be spawned (ENOENT)', async () => {
    const runner = createScriptedRunner([
      { cmd: 'reg.exe', error: { code: 'ENOENT' } }
    ])
    await expect(
      readWindowsShellFolder({ runner }, 'Desktop', env)
    ).resolves.toBeUndefined()
  })

  it('is undefined on a timeout', async () => {
    const runner = createScriptedRunner([
      { cmd: 'reg.exe', result: { code: null, timedOut: true } }
    ])
    await expect(
      readWindowsShellFolder({ runner }, 'Desktop', env)
    ).resolves.toBeUndefined()
  })

  it('is undefined on a non-zero exit', async () => {
    const runner = createScriptedRunner([
      { cmd: 'reg.exe', result: { code: 1, stderr: 'ERROR' } }
    ])
    await expect(
      readWindowsShellFolder({ runner }, 'Desktop', env)
    ).resolves.toBeUndefined()
  })

  describe('native read first (quick 261128-7wv)', () => {
    /** A plain async fake that records its calls; no jest.mock (testContainment). */
    const nativeAnswering = (answer: () => Promise<unknown>) => {
      const calls: unknown[][] = []
      const requestRustInvoke = (async (...args: unknown[]) => {
        calls.push(args)
        return answer()
      }) as unknown as NonNullable<
        Parameters<typeof readWindowsShellFolder>[0]['requestRustInvoke']
      >
      return { calls, requestRustInvoke }
    }
    const regAnswer = () =>
      createScriptedRunner([
        {
          cmd: 'reg.exe',
          result: { code: 0, stdout: regOut('Personal', 'REG_SZ', 'D:\\Docs') }
        }
      ])

    it('keeps every character of a native answer and spawns no reg.exe', async () => {
      const runner = createScriptedRunner([])
      const native = nativeAnswering(() =>
        Promise.resolve('C:\\Users\\Zoë\\OneDrive\\.\\ドキュメント')
      )
      await expect(
        readWindowsShellFolder(
          { runner, requestRustInvoke: native.requestRustInvoke },
          'Personal',
          env
        )
      ).resolves.toBe('C:\\Users\\Zoë\\OneDrive\\ドキュメント')
      expect(native.calls).toEqual([
        [RUST_WINDOWS_SHELL_FOLDER_READ, [{ name: 'Personal' }]]
      ])
      expect(runner.calls).toHaveLength(0)
    })

    it('expands a native %VAR% value against the environment', async () => {
      const runner = createScriptedRunner([])
      const native = nativeAnswering(() =>
        Promise.resolve('%USERPROFILE%\\OneDrive\\Documents')
      )
      await expect(
        readWindowsShellFolder(
          { runner, requestRustInvoke: native.requestRustInvoke },
          'Personal',
          env
        )
      ).resolves.toBe('C:\\Users\\Jörg\\OneDrive\\Documents')
      expect(runner.calls).toHaveLength(0)
    })

    it('falls back to reg.exe on a null, a non-string or a rejected native answer', async () => {
      for (const answer of [
        () => Promise.resolve(null),
        () => Promise.resolve(42),
        (): Promise<unknown> => Promise.reject(new Error('rust unavailable'))
      ]) {
        const runner = regAnswer()
        const native = nativeAnswering(answer)
        await expect(
          readWindowsShellFolder(
            { runner, requestRustInvoke: native.requestRustInvoke },
            'Personal',
            env
          )
        ).resolves.toBe('D:\\Docs')
        expect(runner.calls).toHaveLength(1)
        expect(runner.calls[0]?.argv).toEqual(['query', KEY, '/v', 'Personal'])
      }
    })

    it('does not fall back after a rejected native answer', async () => {
      const runner = regAnswer()
      const native = nativeAnswering(() => Promise.resolve('Documents'))
      await expect(
        readWindowsShellFolder(
          { runner, requestRustInvoke: native.requestRustInvoke },
          'Personal',
          env
        )
      ).resolves.toBeUndefined()
      expect(runner.calls).toHaveLength(0)
    })
  })
})
