import { createSpawnAsync } from '../spawnAsync'
import { createScriptedRunner } from '../testUtils/scriptedRunner'
import { createRealRunner } from '../testUtils/realRunner'

describe('createSpawnAsync', () => {
  test('one run call: no timeout, windowsHide false, no replaceEnv', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'tar',
        argv: ['-xf', 'a'],
        chunks: [
          { stream: 'stdout', text: 'o1' },
          { stream: 'stderr', text: 'e1' },
          { stream: 'stdout', text: 'o2' }
        ]
      }
    ])
    const out = await createSpawnAsync({ runner })('tar', ['-xf', 'a'], {
      cwd: '/x'
    })
    expect(out).toEqual({ code: 0, stdout: 'o1o2', stderr: 'e1' })
    expect(runner.calls).toHaveLength(1)
    const opts = runner.calls[0]!.opts as Record<string, any>
    expect(runner.calls[0]!.cwd).toBe('/x')
    expect(opts.timeout.none).toBe(true)
    expect(opts.timeout.reason.length).toBeGreaterThan(0)
    expect(opts.windowsHide).toBe(false)
    expect(opts.replaceEnv).toBe(false)
  })

  test('options.env replaces the environment', async () => {
    const runner = createScriptedRunner([{ cmd: 'x' }])
    await createSpawnAsync({ runner })('x', [], { env: { A: '1' } })
    const opts = runner.calls[0]!.opts as Record<string, any>
    expect(opts.replaceEnv).toBe(true)
    expect(runner.calls[0]!.env).toEqual({ A: '1' })
  })

  test('a positive timeout becomes timeoutMs; signal and windowsHide pass through', async () => {
    const runner = createScriptedRunner([{ cmd: 'x' }])
    const ac = new AbortController()
    await createSpawnAsync({ runner })('x', [], {
      timeout: 500,
      signal: ac.signal,
      windowsHide: true
    })
    const opts = runner.calls[0]!.opts as Record<string, any>
    expect(opts.timeoutMs).toBe(500)
    expect(opts.timeout).toBeUndefined()
    expect(opts.signal).toBe(ac.signal)
    expect(opts.windowsHide).toBe(true)
  })

  test('onOutput receives every chunk of both streams in order', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'x',
        chunks: [
          { stream: 'stdout', text: 'a' },
          { stream: 'stderr', text: 'b' },
          { stream: 'stdout', text: 'c' }
        ]
      }
    ])
    const seen: string[] = []
    await createSpawnAsync({ runner })('x', [], {}, (d) => seen.push(d))
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  test('keeps only the last 50 chunks', async () => {
    const chunks = Array.from({ length: 60 }, (_, i) => ({
      stream: 'stdout' as const,
      text: `${i},`
    }))
    const runner = createScriptedRunner([{ cmd: 'x', chunks }])
    const out = await createSpawnAsync({ runner })('x', [])
    expect(out.stdout).toBe(
      chunks
        .slice(10)
        .map((c) => c.text)
        .join('')
    )
  })

  test('a spawn error rejects', async () => {
    const runner = createScriptedRunner([
      { cmd: 'x', error: { code: 'ENOENT' } }
    ])
    await expect(createSpawnAsync({ runner })('x', [])).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  test.each(['shell', 'detached', 'stdio'])(
    'option %s throws a TypeError naming it before any run',
    async (key) => {
      const runner = createScriptedRunner([])
      await expect(
        createSpawnAsync({ runner })('x', [], { [key]: true } as never)
      ).rejects.toThrow(new RegExp(`"${key}"`))
      expect(runner.calls).toHaveLength(0)
    }
  )

  test('real child: exit code and stdout', async () => {
    const real = createRealRunner()
    const runner = real.runner
    try {
      const out = await createSpawnAsync({ runner })(process.execPath, [
        '-e',
        'process.stdout.write("ok"); process.exit(3)'
      ])
      expect(out).toMatchObject({ code: 3, stdout: 'ok' })
    } finally {
      real.dispose()
    }
  })
})
