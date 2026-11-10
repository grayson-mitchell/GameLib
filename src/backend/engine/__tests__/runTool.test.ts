import {
  createScriptedRunner,
  type ScriptedRunner
} from 'backend/testUtils/scriptedRunner'
import { createRunTool } from '../runTool'

type Opts = {
  timeoutMs: number
  stdin: string
  replaceEnv: boolean
  maxBufferBytes: number
}

function firstCall(runner: ScriptedRunner) {
  const call = runner.calls[0]
  if (!call) throw new Error('no run call recorded')
  return call
}

describe('createRunTool', () => {
  const argv = ['-p', '/x/Info.plist']

  it('runs the tool with timeout, closed stdin and an isolated fake-HOME env', async () => {
    const runner = createScriptedRunner([
      { cmd: '/usr/bin/plutil', argv, result: { code: 0, stdout: 'x' } }
    ])
    const res = await createRunTool({ runner })('/usr/bin/plutil', argv, {
      timeoutMs: 15_000
    })
    expect(res).toEqual({
      code: 0,
      stdout: 'x',
      stderr: '',
      timedOut: false,
      aborted: false
    })
    const call = firstCall(runner)
    const opts = call.opts as Opts
    expect(call.cmd).toBe('/usr/bin/plutil')
    expect(call.argv).toEqual(argv)
    expect(opts.timeoutMs).toBe(15_000)
    expect(opts.stdin).toBe('')
    expect(opts.replaceEnv).toBe(true)
    expect(opts.maxBufferBytes).toBe(1024 * 1024)
    expect(call.env?.HOME).toContain('gamelib-runner-')
    expect(call.env?.HOME).not.toBe(process.env.HOME)
  })

  it('refuses a tool outside the allowlist without running it', async () => {
    const runner = createScriptedRunner([])
    const res = await createRunTool({ runner })('/bin/sh' as never, [], {
      timeoutMs: 1000
    })
    expect(res.code).toBeNull()
    expect(res.stderr).toContain('tool not allowed')
    expect(runner.calls).toHaveLength(0)
  })

  it('maps timeout, abort and non-zero exit', async () => {
    const runner = createScriptedRunner([
      { cmd: '/bin/ps', result: { code: null, timedOut: true } },
      { cmd: '/bin/ps', result: { code: null, aborted: true } },
      { cmd: '/bin/ps', result: { code: 3, stderr: 'bad' } }
    ])
    const run = createRunTool({ runner })
    expect(await run('/bin/ps', [], { timeoutMs: 5 })).toMatchObject({
      code: null,
      timedOut: true
    })
    expect(await run('/bin/ps', [], { timeoutMs: 5 })).toMatchObject({
      aborted: true
    })
    expect(await run('/bin/ps', [], { timeoutMs: 5 })).toMatchObject({
      code: 3,
      stderr: 'bad',
      timedOut: false
    })
  })

  it('resolves, never rejects, on a spawn error', async () => {
    const runner = createScriptedRunner([
      { cmd: '/usr/bin/codesign', error: { code: 'ENOENT' } }
    ])
    const res = await createRunTool({ runner })('/usr/bin/codesign', [], {
      timeoutMs: 5
    })
    expect(res.code).toBeNull()
    expect(res.stderr).toContain('ENOENT')
  })

  it('short-circuits an already-aborted signal', async () => {
    const runner = createScriptedRunner([])
    const ac = new AbortController()
    ac.abort()
    const res = await createRunTool({ runner })('/bin/cp', [], {
      timeoutMs: 5,
      signal: ac.signal
    })
    expect(res.aborted).toBe(true)
    expect(runner.calls).toHaveLength(0)
  })
})
