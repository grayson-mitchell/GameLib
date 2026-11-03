import { chmodSync, copyFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { parseDemoStatus, probeDemoStatus } from '../demoStatus'

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

describe('probeDemoStatus', () => {
  let profile: ReturnType<typeof createFakeHomeProfile>
  let binDir: string
  beforeEach(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-demostatus-' })
    binDir = join(profile.root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const dest = join(binDir, 'wine')
    copyFileSync(join(__dirname, 'fixtures', 'stub-wine.sh'), dest)
    chmodSync(dest, 0o755)
  })
  afterEach(() => profile.dispose())

  const env = (mode: string) =>
    profile.childEnv({
      ...process.env,
      STUB_MODE: mode,
      STUB_RECORD: join(profile.root, 'record')
    })

  it.each([
    ['licensed', { kind: 'licensed' }],
    ['trial', { kind: 'trial', daysRemaining: 12 }],
    ['expired', { kind: 'expired', daysAgo: 3 }],
    ['garbage', { kind: 'unrecognised' }],
    ['empty', { kind: 'unrecognised' }]
  ])('reports %s output', async (mode, status) => {
    const r = await probeDemoStatus({
      binDir,
      bottleName: 'Steam',
      baseEnv: env(mode)
    })
    expect(r).toMatchObject({ kind: 'ok', status })
  })

  it('passes CX_BOTTLE to the engine', async () => {
    await probeDemoStatus({
      binDir,
      bottleName: 'My.Bottle-1',
      baseEnv: env('licensed')
    })
    expect(readFileSync(join(profile.root, 'record'), 'utf8')).toBe(
      'My.Bottle-1'
    )
  })

  it('reports a hang as timeout within the cap', async () => {
    const t = Date.now()
    const r = await probeDemoStatus({
      binDir,
      bottleName: 'Steam',
      timeoutMs: 500,
      baseEnv: env('hang')
    })
    expect(r).toMatchObject({ kind: 'failed', reason: 'timeout' })
    expect(Date.now() - t).toBeLessThan(2000)
  })

  it('reports a non-zero exit', async () => {
    const r = await probeDemoStatus({
      binDir,
      bottleName: 'Steam',
      baseEnv: env('fail')
    })
    expect(r).toMatchObject({ kind: 'failed', reason: 'nonzero-exit' })
  })

  it('G29: keeps the stand-in fatal_error stdout on one line', async () => {
    const r = await probeDemoStatus({
      binDir,
      bottleName: 'Steam',
      baseEnv: env('cxfatal')
    })
    expect(r).toMatchObject({ kind: 'failed', reason: 'nonzero-exit' })
    if (r.kind !== 'failed') return
    expect(r.detail).toContain('code=1')
    expect(r.detail).toContain('stderr=')
    expect(r.detail).toContain('is not readable')
    expect(r.detail).not.toMatch(/[\r\n]/)
  })

  it('G29: caps the stdout in the detail', async () => {
    const r = await probeDemoStatus({
      binDir,
      bottleName: 'Steam',
      baseEnv: env('bigout')
    })
    if (r.kind !== 'failed') throw new Error('expected failed')
    expect(r.detail.split('stdout=')[1]).toHaveLength(400)
  })

  it('reports a missing wine binary as spawn-error', async () => {
    const r = await probeDemoStatus({
      binDir: join(profile.root, 'nowhere'),
      bottleName: 'Steam',
      baseEnv: env('licensed')
    })
    expect(r).toMatchObject({ kind: 'failed', reason: 'spawn-error' })
  })

  it.each(['a/b', ''])('rejects bottle name %j without spawning', async (b) => {
    const r = await probeDemoStatus({
      binDir,
      bottleName: b,
      baseEnv: env('licensed')
    })
    expect(r).toMatchObject({ kind: 'failed', reason: 'invalid-bottle' })
  })
})
