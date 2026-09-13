/**
 * Cold-boot timing + agent-pool census harness for `build/main/sidecar.js`.
 *
 * Quick task 260913-m9c. Exists because the defect it measures is INVISIBLE to
 * every other gate in this repo, for one structural reason: `pnpm smoke:sidecar`
 * is the named real-profile exemption of the two-profile rule (CLAUDE.md,
 * "Fake-HOME isolation for direct binary runs"), so the operator's local run
 * inherits a warm, populated profile and finishes fast. CI always runs COLD. The
 * cost only exists against an empty profile, so only a fresh fake-profile run
 * exercises the failing condition at all.
 *
 * WHAT IT MEASURES, and why each half is here:
 *
 *   1. Wall time from spawn to child exit, with stdin closed immediately, which
 *      is exactly the shape `meta/sidecarStartupSmoke.cjs` spawns. The gate's
 *      `STARTUP_TIMEOUT_MS` is mirrored below so this harness's verdict means the
 *      same thing the gate's does.
 *   2. Whether the child wrote the READY sentinel, and whether it emitted the
 *      uncaught-exception prefix on stderr. The second is NOT incidental: that
 *      stderr arm was added to the smoke gate on evidence gathered entirely
 *      against the operator's warm real profile, and was never validated against
 *      a cold fake profile. This harness is the only place that measures it in
 *      the configuration CI actually runs.
 *   3. Optionally, a diagnostic-report handle census at a chosen offset.
 *
 * THE INSTRUMENT FOR (3) IS THE REPORT, NOT `process._getActiveHandles()`. That
 * call cannot see JS timers and under-reports; measured on this repo, it showed
 * only stdio pipes while a ref'd interval held the loop open. `--report-on-signal`
 * + SIGUSR2 yields a `libuv` array carrying `type`/`is_active`/`is_referenced`,
 * which is the thing worth counting.
 *
 * FRESH PROFILE PER RUN, ALWAYS. A reused profile completes in ~1.0s from warm
 * caches and masks the defect entirely, so reuse here would not be an
 * optimisation -- it would be a different experiment that cannot fail.
 *
 * CAPTURES ARE RADIOACTIVE. A Node diagnostic report embeds
 * `environmentVariables`, `commandLine` and `cwd` VERBATIM. Every capture path is
 * registered with `registerCapture()` so `dispose()` shreds it, and `dispose()`
 * runs in a `finally` so it also runs on throw. The written-mitigation-only
 * version of this rule has already failed twice on this repo (260912-e6k,
 * 260913-901, the latter leaving 103 MB of unredacted captures on disk).
 *
 * Usage:
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 \
 *     meta/coldBootTiming.ts --runs 2 --label baseline
 *
 * Flags: --runs <n> (default 1), --label <s>, --preload <abs path>,
 *        --report-at-ms <n>, --scratch <dir>.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

/**
 * Mirrored from `meta/sidecarStartupSmoke.cjs`. Duplicated deliberately: that
 * file is CommonJS run straight off disk and cannot import from here, and this
 * harness must not import from it either (requiring it would RUN it -- the
 * standing finding that importing a meta script executes its main and rewrites
 * its artifact). The point of mirroring is that a number measured here can be
 * compared to the gate's budget without a second conversion step.
 */
const STARTUP_TIMEOUT_MS = 30_000
const READY_SENTINEL = '__GAMELIB_SIDECAR_READY__'
const UNCAUGHT_EXCEPTION_PREFIX = '[sidecar] uncaught exception:'

/**
 * Hard ceiling per run. Deliberately ABOVE `STARTUP_TIMEOUT_MS` so a boot that
 * would fail the gate still gets measured rather than truncated -- the number
 * this harness exists to produce is "how long did it actually take", and
 * clipping it at the gate's budget would destroy exactly the margin being
 * investigated. `timeout(1)` is not used because BSD userland has no such binary.
 */
const RUN_BUDGET_MS = STARTUP_TIMEOUT_MS + 15_000

interface Options {
  runs: number
  label: string
  preload: string | undefined
  reportAtMs: number | undefined
  scratch: string
}

interface RunResult {
  elapsedMs: number
  code: number | null
  signal: NodeJS.Signals | null
  sawReady: boolean
  sawUncaught: boolean
  stderrBytes: number
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    runs: 1,
    label: 'run',
    preload: undefined,
    reportAtMs: undefined,
    scratch: process.env.COLD_BOOT_SCRATCH ?? tmpdir()
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} requires a value`)
    if (flag === '--runs') options.runs = Number.parseInt(value, 10)
    else if (flag === '--label') options.label = value
    else if (flag === '--preload') options.preload = resolve(value)
    else if (flag === '--report-at-ms')
      options.reportAtMs = Number.parseInt(value, 10)
    else if (flag === '--scratch') options.scratch = resolve(value)
    else throw new Error(`unknown flag: ${flag}`)
    i += 1
  }

  if (!Number.isFinite(options.runs) || options.runs < 1) {
    throw new Error('--runs must be a positive integer')
  }
  return options
}

/**
 * Count `tcp` handles in a diagnostic report, split by reference and activity.
 *
 * Only `tcp` is counted: a referenced TCP handle is the thing capable of holding
 * the loop open here, and reporting the whole `libuv` array would bury it under
 * the stdio pipes that are present in every run regardless.
 */
function summariseReport(reportPath: string): string {
  if (!existsSync(reportPath)) return 'report: NOT WRITTEN'
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(reportPath, 'utf-8'))
  } catch (error) {
    return `report: UNPARSEABLE (${String(error)})`
  }

  const handles = (parsed as { libuv?: unknown }).libuv
  if (!Array.isArray(handles)) return 'report: no libuv array'

  let refdActive = 0
  let refdIdle = 0
  let unrefd = 0
  for (const handle of handles) {
    const entry = handle as {
      type?: string
      is_referenced?: boolean
      is_active?: boolean
    }
    if (entry.type !== 'tcp') continue
    if (entry.is_referenced !== true) unrefd += 1
    else if (entry.is_active === true) refdActive += 1
    else refdIdle += 1
  }

  return `tcp handles: referenced+active=${refdActive} referenced+idle=${refdIdle} unreferenced=${unrefd}`
}

async function runOnce(index: number, options: Options): Promise<RunResult> {
  // FRESH on every call. See the header: reuse is a different experiment.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-coldboot-' })
  const stem = `${options.label}-${index}`
  const stdoutPath = join(options.scratch, `${stem}.stdout`)
  const stderrPath = join(options.scratch, `${stem}.stderr`)
  const probeOutPath = join(options.scratch, `${stem}.probe`)
  const reportName = `${stem}.report.json`
  const reportPath = join(options.scratch, reportName)

  profile.registerCapture(stdoutPath)
  profile.registerCapture(stderrPath)
  profile.registerCapture(probeOutPath)
  profile.registerCapture(reportPath)

  try {
    const nodeArgs: string[] = []
    if (options.reportAtMs !== undefined) {
      nodeArgs.push(
        '--report-on-signal',
        `--report-directory=${options.scratch}`,
        `--report-filename=${reportName}`
      )
    }
    if (options.preload !== undefined) {
      nodeArgs.push('--require', options.preload)
    }
    nodeArgs.push(BUNDLE)

    const childEnvironment = profile.childEnv({
      ...process.env,
      COLD_BOOT_PROBE_OUT: probeOutPath
    })

    const startedAt = process.hrtime.bigint()
    const child = spawn(process.execPath, nodeArgs, {
      cwd: REPO_ROOT,
      env: childEnvironment,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Close stdin at once so the RPC loop sees EOF, exactly as the smoke gate
    // does. Without this the sidecar waits on a stream that will never end and
    // the number measured would be the harness's patience, not the boot's cost.
    child.stdin?.end()

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    // EVERY timer below is unref'd. A ref'd probe timer would hold this harness
    // open and, worse, would be indistinguishable in the result from the defect
    // under investigation.
    if (options.reportAtMs !== undefined) {
      const reportTimer = setTimeout(() => {
        try {
          child.kill('SIGUSR2')
        } catch {
          // The child may already have exited; a missed report is a gap in the
          // census, not a failure of the timing run.
        }
      }, options.reportAtMs)
      reportTimer.unref()
    }

    let killedForBudget = false
    const budgetTimer = setTimeout(() => {
      killedForBudget = true
      child.kill('SIGKILL')
    }, RUN_BUDGET_MS)
    budgetTimer.unref()

    const result = await new Promise<RunResult>((resolveRun, rejectRun) => {
      child.on('error', rejectRun)
      child.on('close', (code, signal) => {
        clearTimeout(budgetTimer)
        const elapsedMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8')
        const stderr = Buffer.concat(stderrChunks).toString('utf-8')
        writeFileSync(stdoutPath, stdout)
        writeFileSync(stderrPath, stderr)
        resolveRun({
          elapsedMs,
          code,
          signal,
          sawReady: stdout.includes(READY_SENTINEL),
          sawUncaught: stderr.includes(UNCAUGHT_EXCEPTION_PREFIX),
          stderrBytes: Buffer.byteLength(stderr)
        })
      })
    })

    const verdict = [
      `[${stem}]`,
      `elapsed=${(result.elapsedMs / 1000).toFixed(2)}s`,
      `exit=${result.code ?? 'null'}`,
      `signal=${result.signal ?? 'none'}`,
      `ready=${result.sawReady ? 'YES' : 'NO'}`,
      `uncaughtOnStderr=${result.sawUncaught ? 'YES' : 'NO'}`,
      `stderrBytes=${result.stderrBytes}`,
      killedForBudget ? `KILLED at budget ${RUN_BUDGET_MS}ms` : '',
      `budget=${STARTUP_TIMEOUT_MS}ms margin=${((STARTUP_TIMEOUT_MS - result.elapsedMs) / 1000).toFixed(2)}s`
    ]
      .filter((part) => part.length > 0)
      .join(' ')
    console.log(verdict)

    if (options.reportAtMs !== undefined) {
      console.log(`  ${summariseReport(reportPath)}`)
    }

    // Echo the probe and any stderr to THIS process's stdout before `dispose()`
    // shreds the files. Not a convenience: the capture has to die with the
    // profile, so the only way its content survives the run is to be read out
    // here. Safe to echo precisely because the child ran against an EMPTY fake
    // profile -- there is no session frame in it to leak. The raw diagnostic
    // report is deliberately NOT echoed; it embeds `environmentVariables`,
    // `commandLine` and `cwd` verbatim, which is why only the counted summary
    // above ever leaves this function.
    if (existsSync(probeOutPath)) {
      console.log('  ---- agent-pool probe ----')
      console.log(
        readFileSync(probeOutPath, 'utf-8')
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      )
    }
    if (result.stderrBytes > 0) {
      console.log('  ---- child stderr ----')
      console.log(readFileSync(stderrPath, 'utf-8').slice(0, 4000))
    }

    return result
  } finally {
    // In a `finally` so it also runs on throw. Cleanup belongs to the harness,
    // never to the investigator remembering at the end of a long task.
    profile.dispose()
  }
}

/**
 * `process.cwd()`, not `__dirname`: `meta/runTs.cjs` compiles each entry into
 * its own `mkdtempSync` directory and runs the bundle from there, so `__dirname`
 * is a throwaway temp path. The cwd assumption is CHECKED below rather than
 * trusted -- a wrong root must fail loudly instead of timing a missing file.
 */
const REPO_ROOT = process.cwd()
const BUNDLE = join(REPO_ROOT, 'build', 'main', 'sidecar.js')

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  if (!existsSync(BUNDLE)) {
    console.error(
      `[coldboot] FAIL: no bundle at ${BUNDLE}. Run \`pnpm build:sidecar\` first, ` +
        'and run this harness from the repo root -- timing a build is not timing a boot.'
    )
    process.exitCode = 1
    return
  }

  console.log(
    `[coldboot] label=${options.label} runs=${options.runs} node=${process.version} ` +
      `preload=${options.preload ?? 'none'} reportAtMs=${options.reportAtMs ?? 'none'}`
  )

  const elapsed: number[] = []
  for (let index = 1; index <= options.runs; index += 1) {
    const result = await runOnce(index, options)
    elapsed.push(result.elapsedMs)
  }

  const mean = elapsed.reduce((sum, ms) => sum + ms, 0) / elapsed.length
  console.log(
    `[coldboot] ${options.label}: n=${elapsed.length} ` +
      `mean=${(mean / 1000).toFixed(2)}s ` +
      `min=${(Math.min(...elapsed) / 1000).toFixed(2)}s ` +
      `max=${(Math.max(...elapsed) / 1000).toFixed(2)}s`
  )
}

void main().catch((error: unknown) => {
  console.error(`[coldboot] FAIL: ${String(error)}`)
  process.exitCode = 1
})
