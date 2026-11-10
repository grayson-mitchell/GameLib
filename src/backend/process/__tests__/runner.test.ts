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
    // The caller-supplied HOME comes from a SECOND helper-built profile, not a
    // hand-written env literal (fakeHomeIsolation.test.ts forbids those in any
    // file that spawns). A distinct profile root is still a real conflicting
    // HOME, so this proves the runner's pinned profile HOME overrides it.
    const other = createFakeHomeProfile()
    try {
      expect(other.root).not.toBe(profile.root)
      const merged = await r1.run(NODE, ['-e', script], {
        env: other.childEnv({ B: '2' })
      })
      expect(JSON.parse(merged.stdout)).toEqual(['1', '2', profile.root])
    } finally {
      other.dispose()
    }
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

describe('C-02 WR-01 drain grace and caller capabilities', () => {
  const GRANDCHILD =
    "require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'inherit'}).unref()"

  it('WR-01 settles after a timeout kill even if a grandchild holds the pipes', async () => {
    const t0 = Date.now()
    const r = await runner.run(
      NODE,
      ['-e', `${GRANDCHILD};setTimeout(()=>{},10000)`],
      { timeoutMs: 200 }
    )
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.timedOut).toBe(true)
    expect(r.drainTimedOut).toBe(true)
  })

  it('WR-01 resolveOn exit settles with the exit code when a grandchild holds the pipes', async () => {
    const t0 = Date.now()
    const r = await runner.run(NODE, ['-e', GRANDCHILD], {
      resolveOn: 'exit',
      timeoutMs: 10_000
    })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.code).toBe(0)
    expect(r.drainTimedOut).toBe(true)
  })

  it('WR-01 resolveOn exit without a grandchild is not flagged', async () => {
    const r = await runner.run(NODE, ['-e', 'process.stdout.write("ok")'], {
      resolveOn: 'exit'
    })
    expect(r.code).toBe(0)
    expect(r.drainTimedOut).toBeFalsy()
  })

  it('WR-01 untracks the child when the drain is cut short', async () => {
    await runner.run(NODE, ['-e', GRANDCHILD], { resolveOn: 'exit' })
    expect(runner.killTracked({ runner: 'runner' })).toBe(0)
  })

  it('opt-out runs without a timeout when a reason is given', async () => {
    const r = await runner.run(NODE, ['-e', 'setTimeout(()=>{},300)'], {
      timeout: { none: true, reason: 'installer' }
    })
    expect(r).toMatchObject({ code: 0, timedOut: false })
  })

  it('opt-out rejects an empty reason and a combination with timeoutMs', () => {
    expect(() =>
      runner.run(NODE, ['-e', ''], { timeout: { none: true, reason: '  ' } })
    ).toThrow(/D-10/)
    expect(() =>
      runner.run(NODE, ['-e', ''], {
        timeoutMs: 5,
        timeout: { none: true, reason: 'x' }
      })
    ).toThrow(TypeError)
  })

  it('handle reports exit state', async () => {
    let seen: { exitCode: number | null; signalCode: unknown } | undefined
    let handle: import('../types').ChildHandle | undefined
    await runner.run(NODE, ['-e', 'process.exit(0)'], {
      onSpawn: (h) => {
        handle = h
        seen = { exitCode: h.exitCode, signalCode: h.signalCode }
      }
    })
    expect(seen).toEqual({ exitCode: null, signalCode: null })
    expect(handle?.exitCode).toBe(0)
    expect(handle?.signalCode).toBeNull()
  })
})

describe('C-02 WR-02 truncation pin', () => {
  // The review's splice cannot occur: outBytes counts dropped chunks, so once a
  // chunk is dropped no later (smaller) chunk is appended. Verified not
  // reproducible; this pins that behaviour.
  it('never appends a later chunk once one was dropped', async () => {
    const script =
      'const w=(s)=>new Promise(r=>process.stdout.write(s,r));' +
      '(async()=>{await w("aaaa");await wait();await w("b".repeat(20));await wait();await w("c")})();' +
      'function wait(){return new Promise(r=>setTimeout(r,50))}'
    const r = await runner.run(NODE, ['-e', script], { maxBufferBytes: 10 })
    expect(r.stdout).toBe('aaaa')
    expect(r.truncated).toBe(true)
  })
})

describe('C-02 WR-03', () => {
  const posixOnlyIt = process.platform === 'win32' ? it.skip : it
  // A6: CI is ubuntu-only, so the win32 taskkill success path is not CI-verified.
  posixOnlyIt('win32 killPid returns false when taskkill fails', async () => {
    const r = make({ platform: 'win32' })
    let child: import('../types').ChildHandle | undefined
    const pending = r.run(NODE, SLEEP10, {
      timeoutMs: 20_000,
      onSpawn: (h) => {
        child = h
      }
    })
    await wait(150)
    expect(r.killTracked({ runner: 'runner' })).toBe(0)
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unable to kill')
    )
    child?.kill('SIGKILL')
    await pending
  })

  it('runSync captures a 2 MB stdout', () => {
    const r = runner.runSync(
      NODE,
      ['-e', 'process.stdout.write("x".repeat(2e6))'],
      { timeoutMs: 10_000, reason: 'test' }
    )
    expect(r.error).toBeUndefined()
    expect(r.stdout.length).toBe(2_000_000)
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
