import { readFileSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { createClock } from '../clock'
import { createProcessRunner, DEFAULT_RUN_TIMEOUT_MS } from '../runner'
import type { Clock, ProcessRunner } from '../types'

const NODE = process.execPath
const SLEEP10 = ['-e', 'setTimeout(()=>{},10000)']

type Profile = ReturnType<typeof createFakeHomeProfile>
let profile: Profile
let runner: ProcessRunner
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function make(
  over: {
    clock?: Clock
    baseEnv?: NodeJS.ProcessEnv
    platform?: NodeJS.Platform
    openerPath?: string
  } = {}
): ProcessRunner {
  return createProcessRunner({
    clock: over.clock ?? createClock(),
    log,
    platform: over.platform ?? process.platform,
    baseEnv: over.baseEnv ?? profile.childEnv(),
    pinnedEnv: profile.env,
    openerPath: over.openerPath ?? '/usr/bin/open'
  })
}

beforeEach(() => {
  profile = createFakeHomeProfile()
  runner = make()
})
afterEach(() => {
  runner.killAllTracked()
  profile.dispose()
  jest.clearAllMocks()
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const resources = () => {
  const list = process.getActiveResourcesInfo()
  return ['ProcessWrap', 'PipeWrap', 'Timeout'].map(
    (t) => list.filter((x) => x === t).length
  )
}

describe('run', () => {
  it('captures stdout', async () => {
    const r = await runner.run(NODE, ['-e', 'process.stdout.write("hi")'])
    expect(r).toMatchObject({
      code: 0,
      stdout: 'hi',
      timedOut: false,
      aborted: false
    })
  })

  it('resolves a nonzero exit code without rejecting', async () => {
    const r = await runner.run(NODE, ['-e', 'process.exit(3)'])
    expect(r.code).toBe(3)
  })

  it('rejects ENOENT for a missing binary', async () => {
    await expect(
      runner.run('/nonexistent/gamelib-binary', [])
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('kills a child at the timeout', async () => {
    const t0 = Date.now()
    const r = await runner.run(NODE, SLEEP10, { timeoutMs: 200 })
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(r.timedOut).toBe(true)
    expect(r.signal).toBe('SIGKILL')
  })

  it('applies DEFAULT_RUN_TIMEOUT_MS when none is given', async () => {
    const real = createClock()
    const spy = jest.fn(real.setTimeout)
    const r = make({ clock: { ...real, setTimeout: spy } })
    await r.run(NODE, ['-e', ''])
    expect(spy.mock.calls[0]?.[1]).toBe(DEFAULT_RUN_TIMEOUT_MS)
    expect(DEFAULT_RUN_TIMEOUT_MS).toBe(30000)
  })

  it.each([0, -1, NaN, Infinity])('rejects timeoutMs %p', (ms) => {
    expect(() => runner.run(NODE, ['-e', ''], { timeoutMs: ms })).toThrow(
      TypeError
    )
  })

  it('does not hold the loop: no new ProcessWrap/PipeWrap/Timeout', async () => {
    const before = resources()
    const p = runner.run(NODE, SLEEP10, { timeoutMs: 5000 })
    await wait(100)
    expect(resources()).toEqual(before)
    runner.killAllTracked()
    await p
  })

  it('resolves aborted: true on abort', async () => {
    const ac = new AbortController()
    const p = runner.run(NODE, SLEEP10, { signal: ac.signal })
    await wait(100)
    ac.abort()
    expect((await p).aborted).toBe(true)
  })

  it('calls onStdout and logSink with sanitized text; result stays raw', async () => {
    const chunks: string[] = []
    const logged: string[] = []
    const r = await runner.run(NODE, ['-e', 'process.stdout.write("secret")'], {
      onStdout: (c) => chunks.push(c),
      logSink: (t) => logged.push(t),
      sanitize: (t) => t.replace('secret', '***')
    })
    expect(chunks.join('')).toBe('secret')
    expect(logged.join('')).toBe('***')
    expect(r.stdout).toBe('secret')
  })

  it('merges env over baseEnv, replaceEnv is verbatim, pinned HOME wins', async () => {
    const r1 = make({ baseEnv: profile.childEnv({ A: '1' }) })
    const script =
      'process.stdout.write(JSON.stringify([process.env.A,process.env.B,process.env.HOME]))'
    const merged = await r1.run(NODE, ['-e', script], {
      env: { B: '2', HOME: '/elsewhere' }
    })
    expect(JSON.parse(merged.stdout)).toEqual(['1', '2', profile.root])
    const replaced = await r1.run(NODE, ['-e', script], {
      env: { B: '2' },
      replaceEnv: true
    })
    expect(JSON.parse(replaced.stdout)).toEqual([null, '2', profile.root])
  })

  it('tracks children: killTracked by key and killAllTracked', async () => {
    const p = runner.run(NODE, SLEEP10, {
      track: { runner: 'wine', key: 'g1' }
    })
    await wait(100)
    expect(runner.killTracked({ key: 'nope' })).toBe(0)
    expect(runner.killTracked({ key: 'g1' })).toBe(1)
    const r = await p
    expect(r.timedOut).toBe(false)
    const p2 = runner.run(NODE, SLEEP10)
    await wait(100)
    expect(runner.killAllTracked()).toBe(1)
    await p2
  })

  it('supports stdin', async () => {
    const r = await runner.run(
      NODE,
      ['-e', 'process.stdin.on("data",d=>process.stdout.write(String(d)))'],
      { stdin: 'echo-me' }
    )
    expect(r.stdout).toBe('echo-me')
  })
})

describe('spawnLongLived', () => {
  it('replaces by id, runs only the latest teardown', () => {
    const t1 = jest.fn()
    const t2 = jest.fn()
    const a = runner.spawnLongLived(NODE, SLEEP10, { id: 'x', teardown: t1 })
    const b = runner.spawnLongLived(NODE, SLEEP10, { id: 'x', teardown: t2 })
    runner.teardownAll()
    expect(t1).not.toHaveBeenCalled()
    expect(t2).toHaveBeenCalledWith(b)
    a.kill('SIGKILL')
    b.kill('SIGKILL')
  })

  it('resolves exited and auto-unregisters', async () => {
    const t = jest.fn()
    const h = runner.spawnLongLived(NODE, ['-e', 'process.exit(0)'], {
      id: 'short',
      teardown: t
    })
    const r = await h.exited
    expect(r.code).toBe(0)
    await wait(10)
    runner.teardownAll()
    expect(t).not.toHaveBeenCalled()
  })

  it('default teardown SIGTERMs the child', async () => {
    const h = runner.spawnLongLived(NODE, SLEEP10, { id: 'dflt' })
    runner.teardownAll()
    const r = await h.exited
    expect(r.signal ?? r.code).not.toBeNull()
  })
})

describe('runSync', () => {
  it('requires reason and positive timeout', () => {
    expect(() =>
      runner.runSync(NODE, ['-e', ''], { timeoutMs: 100, reason: '' })
    ).toThrow(TypeError)
    expect(() =>
      runner.runSync(NODE, ['-e', ''], { timeoutMs: 0, reason: 'x' })
    ).toThrow(TypeError)
  })

  it('times out a sleeper', () => {
    const r = runner.runSync(NODE, SLEEP10, {
      timeoutMs: 200,
      reason: 'test sleeper'
    })
    expect(r.timedOut).toBe(true)
  })

  it('returns stdout on success', () => {
    const r = runner.runSync(NODE, ['-e', 'process.stdout.write("ok")'], {
      timeoutMs: 5000,
      reason: 'test'
    })
    expect(r).toMatchObject({ code: 0, stdout: 'ok', timedOut: false })
  })
})

describe('openDetached', () => {
  it('reports unsupported-platform off darwin and spawns nothing', () => {
    const onError = jest.fn()
    make({ platform: 'linux', openerPath: '/nonexistent/opener' }).openDetached(
      'steam://x',
      onError
    )
    expect(onError).toHaveBeenCalledWith('unsupported-platform')
  })

  // win32 has no posix-style detached no-op spawn semantics we rely on here.
  const posixIt = process.platform === 'win32' ? it.skip : it
  posixIt('spawns the opener on darwin without erroring', async () => {
    const onError = jest.fn()
    make({ platform: 'darwin', openerPath: NODE }).openDetached(
      'steam://x',
      onError
    )
    await wait(200)
    expect(onError).not.toHaveBeenCalled()
  })

  posixIt('reports the errno code when the opener is missing', async () => {
    const onError = jest.fn()
    make({
      platform: 'darwin',
      openerPath: '/nonexistent/opener'
    }).openDetached('steam://x', onError)
    await wait(200)
    expect(onError).toHaveBeenCalledWith('ENOENT')
  })
})

describe('source shape', () => {
  it('has no shell option and exactly one detached spawn', () => {
    const src = stripSourceComments(
      readFileSync(join(__dirname, '..', 'runner.ts'), 'utf-8')
    )
    expect(src).not.toMatch(/shell:/)
    expect(src.match(/detached: true/g)).toHaveLength(1)
  })
})
