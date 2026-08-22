/**
 * Phase 34.9 gap cycle 4, quick task 260814-u2u. Executable proof that
 * meta/runTs.cjs closes C4-01/C4-02/C4-04 (and, incidentally, keeps
 * invariant 1 -- the compile-failure short-circuit -- intact). Every test
 * here spawns the REAL wrapper (or a generated copy of it, T5) as a real
 * process, really signals it or its child, and observes the outcome by
 * PID liveness, tmpdir presence on disk, and the wrapper's own exit code
 * read from its own 'close' event. A test that merely grepped
 * meta/runTs.cjs for 'SIGTERM' would be theatre; nothing here does that.
 *
 * meta/__tests__/runTs.test.ts is a separate, unmodified suite (the C3-01
 * package.json wiring pin) -- this file does not touch it.
 */
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Production path -- the RED proof below temporarily repoints ONLY this one
// constant to meta/runTs.prefix.cjs (the pre-fix file), never anything else.
const WRAPPER = join(__dirname, '..', 'runTs.cjs')
const REPO_ROOT = join(__dirname, '..', '..')
const FIXTURE = join(__dirname, 'fixtures', 'runTsSignalFixture.ts')
const PROBE_PATH = join(__dirname, '..', 'runTs.__probe__.cjs')

function listRunTsDirs(): Set<string> {
  return new Set(
    readdirSync(tmpdir()).filter((name) => name.startsWith('gamelib-runts-'))
  )
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    // Any other error (e.g. EPERM) -- cannot confirm death, treat as alive.
    return true
  }
}

async function waitForDeath(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return !isAlive(pid)
}

interface Launched {
  wrapperChild: ReturnType<typeof spawn>
  ready: Promise<{ pid: number; dir: string }>
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  stdout: () => string
  stderr: () => string
}

// Spawns the wrapper (or, for T5, a generated probe copy of it) exactly as
// package.json does: `node <wrapper> --bundle --platform=node
// --target=node21 <entry>`. Never `shell: true`, never a pipe -- the exit
// code returned by `closed` comes straight from the wrapper's own 'close'
// event.
function launch(entryPath: string, wrapperPath: string = WRAPPER): Launched {
  const wrapperChild = spawn(
    process.execPath,
    [wrapperPath, '--bundle', '--platform=node', '--target=node21', entryPath],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let stdoutBuf = ''
  let stderrBuf = ''
  wrapperChild.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString()
  })
  wrapperChild.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
  })

  const ready = new Promise<{ pid: number; dir: string }>((resolve) => {
    const onData = () => {
      const match = stdoutBuf.match(
        /runts-fixture: ready pid=(\d+) dir=([^\n]+)\n/
      )
      if (match) {
        wrapperChild.stdout?.off('data', onData)
        resolve({ pid: Number(match[1]), dir: match[2].trim() })
      }
    }
    wrapperChild.stdout?.on('data', onData)
  })

  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    wrapperChild.on('close', (code, signal) => resolve({ code, signal }))
  })

  return {
    wrapperChild,
    ready,
    closed,
    stdout: () => stdoutBuf,
    stderr: () => stderrBuf
  }
}

let before: Set<string>

beforeEach(() => {
  before = listRunTsDirs()
})

// Polled rather than a single snapshot: `meta/__tests__/updaterSigningKey.test.ts`
// independently spawns `pnpm verify:updater-key`, which also goes through
// meta/runTs.cjs and creates its own gamelib-runts-* dir in the SAME shared
// os.tmpdir() -- when jest runs test FILES concurrently (the default,
// non---runInBand mode), that unrelated invocation's dir can transiently
// exist inside our own before/after window with zero relationship to
// anything this file did. A single snapshot comparison flakes on that
// overlap; polling for up to 5s tolerates a concurrent unrelated
// invocation's own (bounded) lifetime while still failing definitively on a
// REAL leak from this file's own tests, which -- being an actual bug --
// would never clear no matter how long we wait.
afterEach(async () => {
  // Probe cleanup runs FIRST and unconditionally (finally-style) -- the leak
  // assertion below throws on failure, and a throw would otherwise skip the
  // unlink, leaking meta/runTs.__probe__.cjs into the tree on every RED run.
  try {
    const deadline = Date.now() + 5000
    let leaked: string[] = []
    for (;;) {
      const after = listRunTsDirs()
      leaked = [...after].filter((dir) => !before.has(dir))
      if (leaked.length === 0 || Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(leaked).toEqual([])
  } finally {
    if (existsSync(PROBE_PATH)) unlinkSync(PROBE_PATH)
  }
}, 10000)

describe('meta/runTs.cjs signal forwarding (C4-01/C4-02/C4-04)', () => {
  test('T1: SIGTERM to the wrapper PID alone kills the child, removes the tmpdir, wrapper exits 143', async () => {
    const { wrapperChild, ready, closed } = launch(FIXTURE)
    const { pid, dir } = await ready

    wrapperChild.kill('SIGTERM')
    const { code, signal } = await closed

    expect(code).toBe(143)
    expect(signal).toBeNull()
    expect(await waitForDeath(pid, 3000)).toBe(true)
    expect(existsSync(dir)).toBe(false)
  }, 30000)

  test('T2: SIGINT to the wrapper PID alone does the same, wrapper exits 130', async () => {
    const { wrapperChild, ready, closed } = launch(FIXTURE)
    const { pid, dir } = await ready

    wrapperChild.kill('SIGINT')
    const { code, signal } = await closed

    expect(code).toBe(130)
    expect(signal).toBeNull()
    expect(await waitForDeath(pid, 3000)).toBe(true)
    expect(existsSync(dir)).toBe(false)
  }, 30000)

  test('T3 (invariant 1): node is never spawned on a failed compile, proven with an in-test positive control', async () => {
    const srcDir = mkdtempSync(join(tmpdir(), 'runts-signals-src-'))
    const goodEntry = join(srcDir, 'good.ts')
    const brokenEntry = join(srcDir, 'broken.ts')
    const MARKER_LITERAL = 'runts-shortcircuit-marker'

    writeFileSync(goodEntry, `console.log('${MARKER_LITERAL}')\n`)
    // Deliberate syntax error, same marker line kept above it so a healthy
    // compile WOULD have printed the marker if node had somehow run anyway.
    writeFileSync(
      brokenEntry,
      `console.log('${MARKER_LITERAL}')\nconst x = ;\n`
    )

    try {
      // Positive control: proves the marker predicate CAN match, so test's
      // absence-assertion below is not vacuous.
      const good = launch(goodEntry)
      const goodResult = await good.closed
      expect(goodResult.code).toBe(0)
      expect(good.stdout()).toContain(MARKER_LITERAL)

      // The actual short-circuit assertion: esbuild fails on the broken
      // entry, so node must never run, so the marker must never print.
      const broken = launch(brokenEntry)
      const brokenResult = await broken.closed
      expect(brokenResult.code).not.toBe(0)
      expect(broken.stdout()).not.toContain(MARKER_LITERAL)
    } finally {
      rmSync(srcDir, { recursive: true, force: true })
    }
  }, 30000)

  test('T4 (C4-04): external SIGKILL to the child alone (wrapper untouched) makes the wrapper exit 137, not a flat 1', async () => {
    const { ready, closed } = launch(FIXTURE)
    const { pid, dir } = await ready

    process.kill(pid, 'SIGKILL')
    const { code } = await closed

    expect(code).toBe(137)
    expect(existsSync(dir)).toBe(false)
  }, 30000)

  test('T5 (C4-02): a symlinkSync failure inside the wrapper no longer leaks the tmpdir', async () => {
    const source = readFileSync(WRAPPER, 'utf8')
    const MARKER = 'fs.symlinkSync('

    // If this marker is ever renamed, this assertion must go red, not
    // silently pass -- "what happens when the check fails to load".
    expect(source.split(MARKER).length - 1).toBe(1)

    const probeSource = source.replace(
      MARKER,
      "(() => { throw new Error('forced symlink failure (C4-02 probe)') })("
    )
    writeFileSync(PROBE_PATH, probeSource)
    // Must parse before we spawn it.
    execFileSync(process.execPath, ['--check', PROBE_PATH], {
      stdio: 'pipe'
    })

    const { closed, stderr } = launch(FIXTURE, PROBE_PATH)
    const { code } = await closed

    expect(code).not.toBe(0)
    expect(stderr()).toContain('forced symlink failure')
  }, 30000)

  test('T6 (C5-02): SIGHUP to the wrapper PID alone kills the child, removes the tmpdir, wrapper exits 129', async () => {
    const { wrapperChild, ready, closed } = launch(FIXTURE)
    const { pid, dir } = await ready

    wrapperChild.kill('SIGHUP')
    const { code, signal } = await closed

    expect(code).toBe(129)
    expect(signal).toBeNull()
    expect(await waitForDeath(pid, 3000)).toBe(true)
    expect(existsSync(dir)).toBe(false)
  }, 30000)

  test('T7 (C5-02 non-vacuity control): with SIGHUP removed from FORWARDED_SIGNALS, the wrapper is signal-terminated instead of forwarding, and the tmpdir survives', async () => {
    const source = readFileSync(WRAPPER, 'utf8')
    const MARKER = "['SIGTERM', 'SIGINT', 'SIGHUP']"

    // If this marker is ever renamed or reordered, this assertion must go
    // red, not silently pass -- same idiom as T5's "what happens when the
    // check fails to load".
    expect(source.split(MARKER).length - 1).toBe(1)

    const probeSource = source.replace(MARKER, "['SIGTERM', 'SIGINT']")
    writeFileSync(PROBE_PATH, probeSource)
    // Must parse before we spawn it.
    execFileSync(process.execPath, ['--check', PROBE_PATH], {
      stdio: 'pipe'
    })

    const { wrapperChild, ready, closed } = launch(FIXTURE, PROBE_PATH)
    const { pid: childPid, dir } = await ready
    const wrapperPid = wrapperChild.pid as number

    try {
      // Signal the WRAPPER pid, mirroring T6 -- the probe no longer has a
      // SIGHUP handler, so Node's default disposition terminates the
      // wrapper directly instead of forwarding to the child: this is the
      // pre-fix orphan+leak shape C5-02 exists to close, made permanent as
      // a control rather than a one-off manual observation.
      wrapperChild.kill('SIGHUP')
      const { code, signal } = await closed

      expect(code).toBeNull()
      expect(signal).toBe('SIGHUP')
      // Non-vacuity: the tmpdir SURVIVES because nothing forwarded the
      // signal to the child before the wrapper itself died.
      expect(existsSync(dir)).toBe(true)
    } finally {
      // T7 leaks BY DESIGN -- that leak is the observation under test. Clean
      // up here so the suite's own leak-detecting afterEach stays green
      // unmodified, per the plan's explicit instruction not to relax it
      // rather than bend the gate.
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
      // The child (fixture) is orphaned -- kill it directly by its own pid.
      if (isAlive(childPid)) {
        try {
          process.kill(childPid, 'SIGKILL')
        } catch {
          // already gone
        }
      }
      if (isAlive(wrapperPid)) {
        try {
          process.kill(wrapperPid, 'SIGKILL')
        } catch {
          // already gone
        }
      }
    }
  }, 30000)
})
