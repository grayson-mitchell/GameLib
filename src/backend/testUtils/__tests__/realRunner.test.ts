import { existsSync } from 'node:fs'
import { createRealRunner } from '../realRunner'

describe('createRealRunner', () => {
  const disposers: (() => void)[] = []
  afterEach(() => {
    while (disposers.length > 0) disposers.pop()?.()
  })

  it('runs children under the fake HOME and dispose removes it', async () => {
    const r = createRealRunner()
    disposers.push(r.dispose)
    const root = r.profile?.root as string
    const res = await r.runner.run(process.execPath, [
      '-e',
      'process.stdout.write(process.env.HOME || process.env.USERPROFILE)'
    ])
    expect(res.stdout.startsWith(root)).toBe(true)
    r.dispose()
    expect(existsSync(root)).toBe(false)
  })

  it('requires a justification for the real-profile arm', () => {
    expect(() =>
      createRealRunner({ realProfile: { justification: '' } })
    ).toThrow(TypeError)
    const r = createRealRunner({
      realProfile: {
        justification: 'defect only arms under a populated profile'
      }
    })
    expect(r.profile).toBeNull()
    r.dispose()
  })

  it('refuses openDetached under test', () => {
    const r = createRealRunner()
    disposers.push(r.dispose)
    expect(() => r.runner.openDetached('https://example.com')).toThrow(
      /openDetached is not allowed under test/
    )
  })
})
