/**
 * Quick task 260926-dxa. Covers the pure classifier and parsers in
 * `meta/tauriDevPreflight.cjs` -- `classifyShellProcesses`,
 * `parseWindowsCimJson`, `parsePsComm`, `ownDebugDir`. Pure inputs only:
 * never spawns, never reads the live process table.
 */

import path from 'node:path'

// ---------------------------------------------------------------------------
// `require('../tauriDevPreflight.cjs')` below is only safe because the module
// wraps its own `main()` call in `if (require.main === module && ...)`; if
// that guard is ever removed, this require() starts a real process-table scan
// at import time under jest. Same precedent as `meta/__tests__/findDeadcode.test.ts`'s
// require of `findDeadcode.cjs`.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tauriDevPreflight = require('../tauriDevPreflight.cjs')

const {
  classifyShellProcesses,
  parseWindowsCimJson,
  parsePsComm,
  ownDebugDir
} = tauriDevPreflight

describe('classifyShellProcesses', () => {
  test('Test 1: win32 installed shell path -> foreign', () => {
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 24764,
          exePath:
            'C:\\Users\\grays\\AppData\\Local\\GameLib\\gamelib-shell.exe'
        }
      ],
      ownDebugDir:
        'C:\\Users\\grays\\Projects\\GameLib\\src-tauri\\target\\debug',
      platform: 'win32'
    })
    expect(result.foreign).toHaveLength(1)
    expect(result.foreign[0].pid).toBe(24764)
    expect(result.own).toHaveLength(0)
    expect(result.unknown).toHaveLength(0)
  })

  test('Test 2: win32 own debug path with different case and forward slashes -> own', () => {
    const ownDir =
      'C:\\Users\\grays\\Projects\\GameLib\\src-tauri\\target\\debug'
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 1111,
          exePath:
            'c:/users/grays/projects/gamelib/src-tauri/target/debug/GameLib-Shell.EXE'
        }
      ],
      ownDebugDir: ownDir,
      platform: 'win32'
    })
    expect(result.own).toHaveLength(1)
    expect(result.own[0].pid).toBe(1111)
    expect(result.foreign).toHaveLength(0)
  })

  test('Test 3: win32 release build of this repo -> foreign', () => {
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 2222,
          exePath:
            'C:\\Users\\grays\\Projects\\GameLib\\src-tauri\\target\\release\\gamelib-shell.exe'
        }
      ],
      ownDebugDir:
        'C:\\Users\\grays\\Projects\\GameLib\\src-tauri\\target\\debug',
      platform: 'win32'
    })
    expect(result.foreign).toHaveLength(1)
    expect(result.own).toHaveLength(0)
  })

  test('Test 4: null or empty exePath -> unknown, never foreign', () => {
    const result = classifyShellProcesses({
      processes: [
        { pid: 3333, exePath: null },
        { pid: 4444, exePath: '' }
      ],
      ownDebugDir:
        'C:\\Users\\grays\\Projects\\GameLib\\src-tauri\\target\\debug',
      platform: 'win32'
    })
    expect(result.unknown).toHaveLength(2)
    expect(result.foreign).toHaveLength(0)
  })

  test('Test 5: linux /proc "(deleted)" suffix after rebuild -> own', () => {
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 5555,
          exePath:
            '/home/u/GameLib/src-tauri/target/debug/gamelib-shell (deleted)'
        }
      ],
      ownDebugDir: '/home/u/GameLib/src-tauri/target/debug',
      platform: 'linux'
    })
    expect(result.own).toHaveLength(1)
    expect(result.own[0].pid).toBe(5555)
  })

  test('Test 6: darwin installed app bundle -> foreign; POSIX compare is case-sensitive', () => {
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 6666,
          exePath: '/Applications/GameLib.app/Contents/MacOS/gamelib-shell'
        }
      ],
      ownDebugDir: '/Users/u/GameLib/src-tauri/target/debug',
      platform: 'darwin'
    })
    expect(result.foreign).toHaveLength(1)
  })

  test('Test 7: a relative/non-absolute exePath -> unknown', () => {
    const result = classifyShellProcesses({
      processes: [{ pid: 7777, exePath: 'gamelib-shell' }],
      ownDebugDir: '/Users/u/GameLib/src-tauri/target/debug',
      platform: 'darwin'
    })
    expect(result.unknown).toHaveLength(1)
    expect(result.foreign).toHaveLength(0)
  })

  test('Test 8: dirname merely starts with ownDebugDir -> foreign (exact match, not prefix)', () => {
    const result = classifyShellProcesses({
      processes: [
        {
          pid: 8888,
          exePath: '/home/u/GameLib/src-tauri/target/debug-old/gamelib-shell'
        }
      ],
      ownDebugDir: '/home/u/GameLib/src-tauri/target/debug',
      platform: 'linux'
    })
    expect(result.foreign).toHaveLength(1)
    expect(result.own).toHaveLength(0)
  })
})

describe('parseWindowsCimJson', () => {
  test('Test 9: empty/whitespace stdout -> []', () => {
    expect(parseWindowsCimJson('')).toEqual([])
    expect(parseWindowsCimJson('   \n  ')).toEqual([])
  })

  test('Test 10: a single object -> one entry', () => {
    const stdout =
      '{"ProcessId":24764,"ExecutablePath":"C:\\\\Users\\\\grays\\\\gamelib-shell.exe"}'
    const result = parseWindowsCimJson(stdout)
    expect(result).toEqual([
      { pid: 24764, exePath: 'C:\\Users\\grays\\gamelib-shell.exe' }
    ])
  })

  test('Test 11: an array with one ExecutablePath: null entry -> entry with exePath null', () => {
    const stdout =
      '[{"ProcessId":1,"ExecutablePath":null},{"ProcessId":2,"ExecutablePath":"C:\\\\x.exe"}]'
    const result = parseWindowsCimJson(stdout)
    expect(result).toEqual([
      { pid: 1, exePath: null },
      { pid: 2, exePath: 'C:\\x.exe' }
    ])
  })

  test('Test 12: malformed JSON -> throws', () => {
    expect(() => parseWindowsCimJson('{not json')).toThrow()
  })
})

describe('parsePsComm', () => {
  test('Test 13: keeps only exact gamelib-shell basenames, preserves paths with spaces, ignores helper/blank', () => {
    const stdout = [
      '  1234 gamelib-shell',
      '  5678 gamelib-shell-helper',
      '',
      '  9012 /Applications/My Games/gamelib-shell',
      '   '
    ].join('\n')
    const result = parsePsComm(stdout)
    expect(result).toEqual([
      { pid: 1234, exePath: 'gamelib-shell' },
      { pid: 9012, exePath: '/Applications/My Games/gamelib-shell' }
    ])
  })
})

describe('ownDebugDir', () => {
  test('Test 14: no CARGO_TARGET_DIR / absolute / relative', () => {
    expect(ownDebugDir({ repoRoot: '/repo', env: {} })).toBe(
      path.join('/repo', 'src-tauri', 'target', 'debug')
    )
    expect(
      ownDebugDir({
        repoRoot: '/repo',
        env: { CARGO_TARGET_DIR: '/abs/target' }
      })
    ).toBe(path.join('/abs/target', 'debug'))
    expect(
      ownDebugDir({ repoRoot: '/repo', env: { CARGO_TARGET_DIR: 'x' } })
    ).toBe(path.join('/repo', 'x', 'debug'))
  })
})
