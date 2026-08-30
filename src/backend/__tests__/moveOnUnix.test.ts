import { exec, spawn } from 'child_process'
import { moveOnUnix } from '../utils'
import type { GameInfo } from 'common/types'

jest.mock('backend/platform')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment')
}))
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  exec: jest.fn(),
  spawn: jest.fn()
}))

const mockedExec = exec as unknown as jest.Mock
const mockedSpawn = spawn as unknown as jest.Mock

/**
 * A minimal stand-in for the ChildProcess `spawnAsync` consumes: it only needs
 * `stdout`/`stderr` emitters and a `close` event carrying the exit code.
 */
function fakeChild(code: number | null) {
  const noopStream = { on: jest.fn() }
  return {
    stdout: noopStream,
    stderr: noopStream,
    on: (event: string, cb: (arg: unknown) => void) => {
      if (event === 'close') {
        // Defer so the promise's `.on('close')` is registered first.
        setImmediate(() => cb(code))
      }
    }
  }
}

/** Every `spawn` call made during one `moveOnUnix`, as `[command, args]`. */
function spawnCalls(): Array<[string, string[]]> {
  return mockedSpawn.mock.calls.map((c) => [c[0] as string, c[1] as string[]])
}

const gameInfo = {
  app_name: '1829678475',
  runner: 'gog',
  title: 'Endless Sky',
  install: { install_path: '/games/Endless Sky' }
} as unknown as GameInfo

/** Report a given rsync implementation from `rsync --version`. */
function withRsync(flavour: 'gnu' | 'openrsync' | 'absent') {
  mockedExec.mockImplementation((cmd: string, cb: CallableFunction) => {
    if (flavour === 'absent') {
      cb(new Error('command not found: rsync'))
      return
    }
    const stdout =
      flavour === 'openrsync'
        ? 'openrsync: protocol version 29\nrsync version 2.6.9 compatible\n'
        : 'rsync  version 3.2.7  protocol version 31\n'
    cb(null, { stdout, stderr: '' })
  })
}

describe('backend/utils.ts: moveOnUnix', () => {
  describe('D-35-19-08 — the source install is only deleted on unambiguous success', () => {
    // The pre-fix test was `code !== 1`, so 23 read as success and the source
    // was `rm -rf`'d after a PARTIAL transfer. These cases fail against that code.
    test.each([
      [23, 'a partial transfer'],
      [2, 'a protocol incompatibility'],
      [11, 'a file I/O error'],
      [24, 'vanished source files'],
      [30, 'a timeout']
    ])(
      'exit %i (%s) does NOT delete the source and reports an error',
      async (code) => {
        withRsync('gnu')
        mockedSpawn.mockImplementation(() => fakeChild(code))

        const result = await moveOnUnix('/new', gameInfo)

        expect(result.status).toBe('error')
        expect(
          spawnCalls().filter(([command]) => command === 'rm')
        ).toHaveLength(0)
      }
    )

    test('a null exit code (killed by signal) does NOT delete the source', async () => {
      withRsync('gnu')
      mockedSpawn.mockImplementation(() => fakeChild(null))

      const result = await moveOnUnix('/new', gameInfo)

      expect(result.status).toBe('error')
      expect(spawnCalls().filter(([command]) => command === 'rm')).toHaveLength(
        0
      )
    })

    test('exit 0 DOES delete the source (the guard is not simply always-false)', async () => {
      withRsync('gnu')
      mockedSpawn.mockImplementation(() => fakeChild(0))

      const result = await moveOnUnix('/new', gameInfo)

      expect(result.status).toBe('done')
      expect(spawnCalls()).toContainEqual(['rm', ['-rf', '/games/Endless Sky']])
    })

    test('the mv fallback also treats only exit 0 as success', async () => {
      withRsync('absent')
      mockedSpawn.mockImplementation(() => fakeChild(23))

      const result = await moveOnUnix('/new', gameInfo)

      expect(result.status).toBe('error')
    })
  })

  describe('D-35-19-07 — flags are chosen by rsync IMPLEMENTATION, not existence', () => {
    test('openrsync is never passed the two flags it rejects', async () => {
      withRsync('openrsync')
      mockedSpawn.mockImplementation(() => fakeChild(0))

      await moveOnUnix('/new', gameInfo)

      const [, args] = spawnCalls().find(([c]) => c === 'rsync')!
      expect(args).not.toContain('--no-human-readable')
      expect(args).not.toContain('--info=name,progress')
      expect(args).toContain('--progress')
      expect(args).toContain('--remove-source-files')
    })

    test('GNU rsync keeps the exact flag list that shipped before this fix', async () => {
      withRsync('gnu')
      mockedSpawn.mockImplementation(() => fakeChild(0))

      await moveOnUnix('/new', gameInfo)

      const [, args] = spawnCalls().find(([c]) => c === 'rsync')!
      expect(args).toEqual([
        '--archive',
        '--compress',
        '--no-human-readable',
        '--remove-source-files',
        '--info=name,progress',
        '/games/Endless Sky/',
        '/new/Endless Sky'
      ])
    })

    test('openrsync still takes the rsync path — it does NOT fall through to mv', async () => {
      // The pre-fix `which rsync` probe succeeded under openrsync too, so the mv
      // fallback was unreachable there; this pins that the fix did not instead
      // route openrsync to mv.
      withRsync('openrsync')
      mockedSpawn.mockImplementation(() => fakeChild(0))

      await moveOnUnix('/new', gameInfo)

      expect(spawnCalls().some(([c]) => c === 'rsync')).toBe(true)
      expect(spawnCalls().some(([c]) => c === 'mv')).toBe(false)
    })

    test('mv is used only when rsync is genuinely absent', async () => {
      withRsync('absent')
      mockedSpawn.mockImplementation(() => fakeChild(0))

      const result = await moveOnUnix('/new', gameInfo)

      expect(result.status).toBe('done')
      expect(spawnCalls().some(([c]) => c === 'rsync')).toBe(false)
      expect(spawnCalls()).toContainEqual([
        'mv',
        ['-f', '/games/Endless Sky', '/new/Endless Sky']
      ])
    })
  })
})
