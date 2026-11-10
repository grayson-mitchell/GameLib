import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createProbeDemoStatus, parseDemoStatus } from '../demoStatus'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

describe('parseDemoStatus', () => {
  it('maps Standard version to licensed', () => {
    expect(parseDemoStatus('Standard version\n')).toEqual({ kind: 'licensed' })
  })
  it('maps a trial line', () => {
    expect(parseDemoStatus('Demo version (12 days remaining)')).toEqual({
      kind: 'trial',
      daysRemaining: 12
    })
  })
  it('maps expired using the last non-empty line', () => {
    expect(
      parseDemoStatus('noise line\nDemo version (expired 3 days ago)\n')
    ).toEqual({ kind: 'expired', daysAgo: 3 })
  })
  it.each([
    '',
    'Standard Version',
    'Demo version (-1 days remaining)',
    'Demo version (12 days remaining) extra'
  ])('treats %j as unrecognised', (s) => {
    expect(parseDemoStatus(s)).toEqual({ kind: 'unrecognised' })
  })
})

describe('createProbeDemoStatus', () => {
  const binDir = '/opt/cx/bin'
  const wine = join(binDir, 'wine')
  const probeWith = (
    step: Parameters<typeof createScriptedRunner>[0][number]
  ) => {
    const runner = createScriptedRunner([step])
    return { runner, probe: createProbeDemoStatus({ runner }) }
  }

  it.each([
    ['Standard version\n', { kind: 'licensed' }],
    ['Demo version (12 days remaining)', { kind: 'trial', daysRemaining: 12 }],
    ['Demo version (expired 3 days ago)', { kind: 'expired', daysAgo: 3 }],
    ['garbage', { kind: 'unrecognised' }],
    ['', { kind: 'unrecognised' }]
  ])('reports %j output', async (stdout, status) => {
    const { probe } = probeWith({
      cmd: wine,
      argv: ['--demo-status'],
      result: { stdout }
    })
    expect(await probe({ binDir, bottleName: 'Steam' })).toMatchObject({
      kind: 'ok',
      status
    })
  })

  it('runs with the 15 s cap, closed stdin and CX_BOTTLE in env', async () => {
    const { runner, probe } = probeWith({ cmd: wine, argv: ['--demo-status'] })
    await probe({ binDir, bottleName: 'My.Bottle-1' })
    const call = runner.calls[0]
    const opts = call.opts as {
      timeoutMs: number
      stdin: string
      replaceEnv: boolean
    }
    expect(opts.timeoutMs).toBe(15_000)
    expect(opts.stdin).toBe('')
    expect(opts.replaceEnv).toBe(false)
    expect(call.env).toMatchObject({ CX_BOTTLE: 'My.Bottle-1' })
  })

  it('honours args.timeoutMs and uses a fake-HOME baseEnv verbatim', async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-demostatus-' })
    try {
      const { runner, probe } = probeWith({ cmd: wine })
      await probe({
        binDir,
        bottleName: 'Steam',
        timeoutMs: 500,
        baseEnv: profile.childEnv()
      })
      const opts = runner.calls[0].opts as {
        timeoutMs: number
        replaceEnv: boolean
      }
      expect(opts.timeoutMs).toBe(500)
      expect(opts.replaceEnv).toBe(true)
      expect(runner.calls[0].env?.HOME).toBe(profile.childEnv().HOME)
    } finally {
      profile.dispose()
    }
  })

  it('reports a timeout', async () => {
    const { probe } = probeWith({
      cmd: wine,
      result: { timedOut: true, code: null }
    })
    expect(await probe({ binDir, bottleName: 'Steam' })).toMatchObject({
      kind: 'failed',
      reason: 'timeout'
    })
  })

  it('reports a non-zero exit', async () => {
    const { probe } = probeWith({ cmd: wine, result: { code: 3 } })
    expect(await probe({ binDir, bottleName: 'Steam' })).toMatchObject({
      kind: 'failed',
      reason: 'nonzero-exit'
    })
  })

  it('G29: keeps the stdout on one line and caps it', async () => {
    const { probe } = probeWith({
      cmd: wine,
      result: {
        code: 1,
        stderr: 'e\ne',
        stdout: `line\n${'x'.repeat(1000)}`
      }
    })
    const r = await probe({ binDir, bottleName: 'Steam' })
    if (r.kind !== 'failed') throw new Error('expected failed')
    expect(r.detail).toContain('code=1')
    expect(r.detail).not.toMatch(/[\r\n]/)
    expect(r.detail.split('stdout=')[1]).toHaveLength(400)
  })

  it('reports a missing wine binary as spawn-error', async () => {
    const { probe } = probeWith({ cmd: wine, error: { code: 'ENOENT' } })
    expect(await probe({ binDir, bottleName: 'Steam' })).toMatchObject({
      kind: 'failed',
      reason: 'spawn-error'
    })
  })

  it.each(['a/b', '', '..', 'x\\y', ' padded ', 'a'.repeat(256)])(
    'rejects bottle name %j without spawning',
    async (b) => {
      const runner = createScriptedRunner([])
      const r = await createProbeDemoStatus({ runner })({
        binDir,
        bottleName: b
      })
      expect(r).toMatchObject({ kind: 'failed', reason: 'invalid-bottle' })
      expect(runner.calls).toHaveLength(0)
    }
  )

  it.each(['Windows 10 Games', 'My Bottle (2)', 'x '.repeat(60).trim()])(
    'probes the bottle named %j (CX_BOTTLE travels in env)',
    async (b) => {
      const { runner, probe } = probeWith({
        cmd: wine,
        result: { stdout: 'Standard version' }
      })
      expect(await probe({ binDir, bottleName: b })).toMatchObject({
        kind: 'ok',
        status: { kind: 'licensed' }
      })
      expect(runner.calls[0].env?.CX_BOTTLE).toBe(b)
    }
  )
})
