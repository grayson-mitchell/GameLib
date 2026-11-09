import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestContext } from '../testContext'
import { createScriptedRunner } from '../scriptedRunner'

describe('createTestContext', () => {
  const disposers: (() => void)[] = []
  afterEach(() => {
    while (disposers.length > 0) disposers.pop()?.()
  })
  const make = (...a: Parameters<typeof createTestContext>) => {
    const t = createTestContext(...a)
    disposers.push(t.dispose)
    return t
  }

  it('builds every AppContext field from fakes under the fake HOME', () => {
    const t = make()
    expect(Object.keys(t.ctx).sort()).toEqual(
      ['clock', 'log', 'paths', 'platform', 'runner'].sort()
    )
    expect(t.ctx.runner).toBe(t.runner)
    expect(t.ctx.clock).toBe(t.clock)
    for (const p of Object.values(t.ctx.paths)) {
      expect(p.startsWith(t.profile.root)).toBe(true)
      expect(existsSync(p)).toBe(true)
    }
  })

  it('dispose removes the profile and is idempotent', () => {
    const t = make()
    t.dispose()
    expect(existsSync(t.profile.root)).toBe(false)
    expect(() => t.dispose()).not.toThrow()
  })

  it('never mkdir an overridden path', () => {
    const outside = join(
      process.cwd(),
      'definitely-not-created-by-test-context-xyz'
    )
    const t = make({ paths: { userData: outside } })
    expect(t.ctx.paths.userData).toBe(outside)
    expect(existsSync(outside)).toBe(false)
    expect(existsSync(t.ctx.paths.appRoot)).toBe(true)
  })

  it('passes script to the scripted runner and accepts a runner override', async () => {
    const t = make({ script: [{ cmd: 'a', result: { stdout: 'ok' } }] })
    expect((await t.runner.run('a', [])).stdout).toBe('ok')
    const custom = createScriptedRunner([])
    const u = make({ runner: custom })
    expect(u.runner).toBe(custom)
  })

  it('shares nothing between two contexts', () => {
    const a = make()
    const b = make()
    expect(a.profile).not.toBe(b.profile)
    expect(a.runner).not.toBe(b.runner)
    expect(a.clock).not.toBe(b.clock)
  })
})
