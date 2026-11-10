import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'
import { moveOnUnix } from '../utils'
import type { SpawnAsync } from '../spawnAsync'
import type { GameInfo } from 'common/types'

jest.mock('backend/platform')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment')
}))

const gameInfo = {
  app_name: '1829678475',
  runner: 'gog',
  title: 'Endless Sky',
  install: { install_path: '/games/Endless Sky' }
} as unknown as GameInfo

/** The `rsync --version` probe for a given rsync implementation, on the scripted runner. */
function rsyncProbe(flavour: 'gnu' | 'openrsync' | 'absent'): ScriptStep {
  if (flavour === 'absent') {
    return {
      cmd: 'rsync',
      argv: ['--version'],
      error: { code: 'ENOENT' }
    }
  }
  const stdout =
    flavour === 'openrsync'
      ? 'openrsync: protocol version 29\nrsync version 2.6.9 compatible\n'
      : 'rsync  version 3.2.7  protocol version 31\n'
  return { cmd: 'rsync', argv: ['--version'], result: { stdout } }
}

/** A spawnAsync fake that records every call and exits with `code`. */
function harness(flavour: 'gnu' | 'openrsync' | 'absent', code: number | null) {
  const runner = createScriptedRunner([rsyncProbe(flavour)])
  const calls: Array<[string, string[], unknown]> = []
  const spawnAsync: SpawnAsync = jest.fn((cmd, args, opts) => {
    calls.push([cmd, args, opts])
    return Promise.resolve({ code, stdout: '', stderr: 'boom' })
  })
  return {
    deps: { runner, spawnAsync },
    spawnCalls: (): Array<[string, string[]]> => calls.map(([c, a]) => [c, a])
  }
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
        const { deps, spawnCalls } = harness('gnu', code)

        const result = await moveOnUnix(deps, '/new', gameInfo)

        expect(result.status).toBe('error')
        expect(
          spawnCalls().filter(([command]) => command === 'rm')
        ).toHaveLength(0)
      }
    )

    test('a null exit code (killed by signal) does NOT delete the source', async () => {
      const { deps, spawnCalls } = harness('gnu', null)

      const result = await moveOnUnix(deps, '/new', gameInfo)

      expect(result.status).toBe('error')
      expect(spawnCalls().filter(([command]) => command === 'rm')).toHaveLength(
        0
      )
    })

    test('exit 0 DOES delete the source (the guard is not simply always-false)', async () => {
      const { deps, spawnCalls } = harness('gnu', 0)

      const result = await moveOnUnix(deps, '/new', gameInfo)

      expect(result.status).toBe('done')
      expect(spawnCalls()).toContainEqual(['rm', ['-rf', '/games/Endless Sky']])
    })

    test('the mv fallback also treats only exit 0 as success', async () => {
      const { deps } = harness('absent', 23)

      const result = await moveOnUnix(deps, '/new', gameInfo)

      expect(result.status).toBe('error')
    })
  })

  describe('D-35-19-07 — flags are chosen by rsync IMPLEMENTATION, not existence', () => {
    test('openrsync is never passed the two flags it rejects', async () => {
      const { deps, spawnCalls } = harness('openrsync', 0)

      await moveOnUnix(deps, '/new', gameInfo)

      const [, args] = spawnCalls().find(([c]) => c === 'rsync')!
      expect(args).not.toContain('--no-human-readable')
      expect(args).not.toContain('--info=name,progress')
      expect(args).toContain('--progress')
      expect(args).toContain('--remove-source-files')
    })

    test('GNU rsync keeps the exact flag list that shipped before this fix', async () => {
      const { deps, spawnCalls } = harness('gnu', 0)

      await moveOnUnix(deps, '/new', gameInfo)

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
      const { deps, spawnCalls } = harness('openrsync', 0)

      await moveOnUnix(deps, '/new', gameInfo)

      expect(spawnCalls().some(([c]) => c === 'rsync')).toBe(true)
      expect(spawnCalls().some(([c]) => c === 'mv')).toBe(false)
    })

    test('mv is used only when rsync is genuinely absent', async () => {
      const { deps, spawnCalls } = harness('absent', 0)

      const result = await moveOnUnix(deps, '/new', gameInfo)

      expect(result.status).toBe('done')
      expect(spawnCalls().some(([c]) => c === 'rsync')).toBe(false)
      expect(spawnCalls()).toContainEqual([
        'mv',
        ['-f', '/games/Endless Sky', '/new/Endless Sky']
      ])
    })
  })
})
