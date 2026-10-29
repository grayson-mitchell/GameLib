/**
 * 56-REVIEW WR-02: runBoundedListing must not hold the event loop (sidecar exit
 * contract, half 1). Measured, not assumed: the helper is compiled on its own
 * and run in a plain node child on `sleep 2`. The child has nothing else to
 * do, so it must exit well under 2 s. A control arm runs the pre-fix shape
 * (`execFile` with `timeout` plus `child.unref()`) and must still be held for
 * about 2 s, so the measurement is shown to tell the two apart.
 */
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'
import { runBoundedListing } from '../boundedListing'

const HELPER_SOURCE = resolve(__dirname, '..', 'boundedListing.ts')

const POSIX = process.platform !== 'win32'
const describePosix = POSIX ? describe : describe.skip

/** Wall-clock ms until a node child running `script` exits. */
function timeNodeChild(
  script: string,
  env: NodeJS.ProcessEnv
): Promise<{ ms: number; code: number | null; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const started = Date.now()
    const child = execFile(
      process.execPath,
      ['-e', script],
      { env, timeout: 15000 },
      (error, _stdout, stderr) => {
        const code =
          error && typeof error.code === 'number' ? error.code : error ? 1 : 0
        resolveRun({ ms: Date.now() - started, code, stderr: String(stderr) })
      }
    )
    child.on('error', rejectRun)
  })
}

describePosix('runBoundedListing (56-REVIEW WR-02)', () => {
  let profile: FakeHomeProfile
  let bundle: string

  beforeAll(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-boundedListing-home-' })
    bundle = join(profile.root, 'boundedListing.cjs')
    buildSync({
      entryPoints: [HELPER_SOURCE],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      outfile: bundle,
      logLevel: 'silent'
    })
  })

  afterAll(() => {
    profile?.dispose()
  })

  test('a pending listing on sleep 2 lets the process exit at once', async () => {
    const script = `
      const { runBoundedListing } = require(${JSON.stringify(bundle)})
      void runBoundedListing('/bin/sleep', ['2'], { timeoutMs: 3000, maxBuffer: 1024 })
    `
    const run = await timeNodeChild(script, profile.childEnv())
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
    expect(run.ms).toBeLessThan(1000)
  }, 20000)

  test('control: execFile with timeout plus child.unref() is still held by sleep 2', async () => {
    const script = `
      const c = require('node:child_process').execFile('/bin/sleep', ['2'], { timeout: 3000 }, () => {})
      c.unref()
    `
    const run = await timeNodeChild(script, profile.childEnv())
    expect(run.code).toBe(0)
    expect(run.ms).toBeGreaterThanOrEqual(1800)
  }, 20000)

  test('returns stdout of a completed child', async () => {
    await expect(
      runBoundedListing('/bin/echo', ['hello'], {
        timeoutMs: 3000,
        maxBuffer: 1024
      })
    ).resolves.toEqual({ error: false, stdout: 'hello\n' })
  })

  test('kills a child that overruns the bound and reports an error', async () => {
    const started = Date.now()
    const result = await runBoundedListing('/bin/sleep', ['5'], {
      timeoutMs: 200,
      maxBuffer: 1024
    })
    expect(result.error).toBe(true)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  test('a missing binary reports an error, never a throw', async () => {
    const result = await runBoundedListing(
      '/nonexistent/gamelib-no-such-bin',
      [],
      { timeoutMs: 3000, maxBuffer: 1024 }
    )
    expect(result.error).toBe(true)
    expect(result.stdout).toBe('')
  })
})
