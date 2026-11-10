/**
 * 66.2-11: the spawning helpers of backend/utils.ts on the injected spawnAsync / runner.
 * No child_process mock and no spawn: every process call is scripted or recorded.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createRealRunner } from 'backend/testUtils/realRunner'
import type { GameInfo, GameSettings } from 'common/types'
import type { SpawnAsync } from '../spawnAsync'
import { extractFiles, moveOnUnix, moveOnWindows, shutdownWine } from '../utils'
import * as logger from '../logger'

type Recorded = [string, string[], Record<string, unknown> | undefined]

/** A spawnAsync that records its calls and answers each command from `codes`. */
function recordingSpawn(
  codes: Record<string, number | null> = {},
  extra: { timedOut?: boolean } = {}
) {
  const calls: Recorded[] = []
  const spawnAsync: SpawnAsync = jest.fn(async (cmd, args, opts) => {
    calls.push([cmd, args, opts as Record<string, unknown> | undefined])
    return {
      code: codes[cmd] ?? 0,
      stdout: '',
      stderr: 'err',
      ...extra
    }
  })
  return { spawnAsync, calls }
}

const gameInfo = {
  app_name: 'g1',
  runner: 'gog',
  title: 'Endless Sky',
  install: { install_path: '/games/Endless Sky' }
} as unknown as GameInfo

// The logger is uninitialised under test; stub its writers with spies (no jest.mock site).
let warn: jest.SpyInstance
beforeEach(() => {
  jest.spyOn(logger, 'logInfo').mockImplementation()
  jest.spyOn(logger, 'logError').mockImplementation()
  warn = jest.spyOn(logger, 'logWarning').mockImplementation()
})
afterEach(() => jest.restoreAllMocks())

describe('moveOnWindows', () => {
  it('runs robocopy through the injected spawnAsync with no stdio key', async () => {
    const { spawnAsync, calls } = recordingSpawn()
    const runner = createScriptedRunner([])

    const result = await moveOnWindows(
      { spawnAsync, runner },
      'D:\\new',
      gameInfo
    )

    expect(result.status).toBe('done')
    const [cmd, , opts] = calls[0]!
    expect(cmd).toBe('robocopy')
    expect(Object.keys(opts ?? {})).not.toContain('stdio')
  })
})

describe('moveOnUnix', () => {
  const probe = {
    cmd: 'rsync',
    argv: ['--version'],
    result: { stdout: 'rsync  version 3.2.7\n' }
  }

  it('probes rsync --version on the runner (5 000 ms) and runs rsync with no stdio key', async () => {
    const { spawnAsync, calls } = recordingSpawn()
    const runner = createScriptedRunner([probe])

    await moveOnUnix({ spawnAsync, runner }, '/new', gameInfo)

    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 5000 })
    const rsync = calls.find(([c]) => c === 'rsync')!
    expect(Object.keys(rsync[2] ?? {})).not.toContain('stdio')
    runner.expectAllConsumed()
  })

  it('does not rm -rf the source when rsync exits non-zero', async () => {
    const { spawnAsync, calls } = recordingSpawn({ rsync: 23 })
    const runner = createScriptedRunner([probe])

    const result = await moveOnUnix({ spawnAsync, runner }, '/new', gameInfo)

    expect(result.status).toBe('error')
    expect(calls.some(([c]) => c === 'rm')).toBe(false)
  })

  it('rm -rf runs only after rsync exited 0', async () => {
    const { spawnAsync, calls } = recordingSpawn()
    const runner = createScriptedRunner([probe])

    await moveOnUnix({ spawnAsync, runner }, '/new', gameInfo)

    const order = calls.map(([c]) => c)
    expect(order).toEqual(['rsync', 'rm'])
  })

  it('a non-zero rsync --version falls back to mv (exec rejected on non-zero)', async () => {
    const { spawnAsync, calls } = recordingSpawn()
    const runner = createScriptedRunner([
      { cmd: 'rsync', argv: ['--version'], result: { code: 127 } }
    ])

    await moveOnUnix({ spawnAsync, runner }, '/new', gameInfo)

    expect(calls.map(([c]) => c)).toEqual(['mv'])
  })

  it('a timed-out rsync --version falls back to mv', async () => {
    const { spawnAsync, calls } = recordingSpawn()
    const runner = createScriptedRunner([
      {
        cmd: 'rsync',
        argv: ['--version'],
        result: { timedOut: true, code: null }
      }
    ])

    await moveOnUnix({ spawnAsync, runner }, '/new', gameInfo)

    expect(calls.map(([c]) => c)).toEqual(['mv'])
  })
})

describe('shutdownWine', () => {
  const settings = {
    winePrefix: '/prefix',
    wineVersion: { wineserver: '/wine/wineserver' }
  } as unknown as GameSettings
  const commandRunner = { runWineCommand: jest.fn() }

  it('awaits spawnAsync(wineserver, -k) with the prefix env and a 15 000 ms timeout', async () => {
    const { spawnAsync, calls } = recordingSpawn()

    await shutdownWine({ spawnAsync, commandRunner }, settings)

    expect(calls).toEqual([
      [
        '/wine/wineserver',
        ['-k'],
        { env: { WINEPREFIX: '/prefix' }, timeout: 15_000 }
      ]
    ])
  })

  it('a timed-out wineserver -k logs a warning and does not throw', async () => {
    const { spawnAsync } = recordingSpawn({}, { timedOut: true })

    await expect(
      shutdownWine({ spawnAsync, commandRunner }, settings)
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('extractFiles', () => {
  it('runs tar on the runner with the timeout opt-out and a reason', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'tar',
        argv: ['-xf', '/a.tar.gz', '-C', '/dest', '--strip-components=1'],
        result: { code: 0 }
      }
    ])

    const result = await extractFiles(
      { runner },
      { path: '/a.tar.gz', destination: '/dest', strip: 1 }
    )

    expect(result).toEqual({ status: 'done', installPath: '/dest' })
    expect(runner.calls[0]?.opts).toMatchObject({
      timeout: { none: true, reason: expect.stringContaining('multi-GB') }
    })
  })

  it('a non-zero tar exit is status error carrying stderr', async () => {
    const runner = createScriptedRunner([
      { cmd: 'tar', match: () => true, result: { code: 2, stderr: 'bad' } }
    ])

    const result = await extractFiles(
      { runner },
      { path: '/a.tar.gz', destination: '/dest', strip: 0 }
    )

    expect(result).toEqual({ status: 'error', error: 'bad' })
  })

  it('rejects a non-tar archive without spawning', async () => {
    const runner = createScriptedRunner([])

    const result = await extractFiles(
      { runner },
      { path: '/a.zip', destination: '/dest', strip: 0 }
    )

    expect(result.status).toBe('error')
    expect(runner.calls).toHaveLength(0)
  })

  it('extracts a real archive through a real runner', async () => {
    const work = mkdtempSync(join(tmpdir(), 'gl-utils-runner-'))
    const { runner, dispose } = createRealRunner()
    try {
      writeFileSync(join(work, 'f.txt'), 'x')
      execFileSync('tar', ['-czf', join(work, 'a.tar.gz'), '-C', work, 'f.txt'])
      const dest = join(work, 'out')
      execFileSync('mkdir', [dest])

      const result = await extractFiles(
        { runner },
        { path: join(work, 'a.tar.gz'), destination: dest, strip: 0 }
      )

      expect(result.status).toBe('done')
      expect(existsSync(join(dest, 'f.txt'))).toBe(true)
    } finally {
      dispose()
      rmSync(work, { recursive: true, force: true })
    }
  })
})
