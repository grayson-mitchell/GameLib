import { createScriptedRunner } from '../scriptedRunner'

describe('createScriptedRunner', () => {
  it('returns the canned result and records the call', async () => {
    const r = createScriptedRunner([
      { cmd: 'lipo', argv: ['-archs', '/x'], result: { stdout: 'arm64\n' } }
    ])
    const res = await r.run('lipo', ['-archs', '/x'])
    expect(res.stdout).toBe('arm64\n')
    expect(res.code).toBe(0)
    expect(res.pid).toBeUndefined()
    expect(r.calls[0]).toMatchObject({
      method: 'run',
      cmd: 'lipo',
      argv: ['-archs', '/x']
    })
  })

  it('consumes steps first-match; repeat keeps matching', async () => {
    const r = createScriptedRunner([
      { cmd: 'a', result: { stdout: '1' } },
      { cmd: 'a', result: { stdout: '2' }, repeat: true }
    ])
    expect((await r.run('a', [])).stdout).toBe('1')
    expect((await r.run('a', [])).stdout).toBe('2')
    expect((await r.run('a', [])).stdout).toBe('2')
  })

  it('does not match a consumed non-repeat step again', async () => {
    const r = createScriptedRunner([{ cmd: 'a' }])
    await r.run('a', [])
    await expect(r.run('a', [])).rejects.toThrow('unscripted')
  })

  it('rejects an unscripted run naming the cmd', async () => {
    const r = createScriptedRunner([])
    await expect(r.run('x', [])).rejects.toThrow(/unscripted.*x/)
  })

  it('throws on an unscripted runSync', () => {
    const r = createScriptedRunner([])
    expect(() => r.runSync('x', [], { timeoutMs: 10, reason: 't' })).toThrow(
      /unscripted.*x/
    )
  })

  it('delivers chunks in order before resolving', async () => {
    const seen: string[] = []
    const r = createScriptedRunner([
      {
        cmd: 'a',
        chunks: [
          { stream: 'stdout', text: 'o1' },
          { stream: 'stderr', text: 'e1' },
          { stream: 'stdout', text: 'o2' }
        ]
      }
    ])
    const p = r.run('a', [], {
      onStdout: (c) => seen.push(c),
      onStderr: (c) => seen.push(c)
    })
    await p
    expect(seen).toEqual(['o1', 'e1', 'o2'])
  })

  it('rejects with the scripted errno code', async () => {
    const r = createScriptedRunner([{ cmd: 'a', error: { code: 'ENOENT' } }])
    await expect(r.run('a', [])).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('validates timeoutMs like the real runner', async () => {
    const r = createScriptedRunner([{ cmd: 'a' }])
    await expect(r.run('a', [], { timeoutMs: -1 })).rejects.toThrow(TypeError)
  })

  it('long-lived handle exits on kill and teardownAll runs teardowns', async () => {
    const r = createScriptedRunner([{ cmd: 'srv' }, { cmd: 'srv2' }])
    const h = r.spawnLongLived('srv', [], { id: 'one' })
    expect(r.killAllTracked()).toBe(1)
    h.kill()
    await expect(h.exited).resolves.toMatchObject({ signal: 'SIGTERM' })
    const td = jest.fn()
    r.spawnLongLived('srv2', [], { id: 'two', teardown: td })
    r.teardownAll()
    expect(td).toHaveBeenCalledTimes(1)
  })

  it('openDetached records and does not throw', () => {
    const r = createScriptedRunner([])
    r.openDetached('https://example.com')
    expect(r.calls[0]?.method).toBe('openDetached')
  })

  it('expectAllConsumed lists unconsumed steps', async () => {
    const r = createScriptedRunner([{ cmd: 'a' }, { cmd: 'b' }])
    await r.run('a', [])
    expect(() => r.expectAllConsumed()).toThrow(/b/)
  })
})
