/**
 * Phase 66.4 plan 02 (D-66.3-05). Orphan / exit-latency checker for the sidecar.
 *
 * 66.3's live smoke eyeballed `pgrep -fl sidecar`. This script measures what the sidecar exit
 * contract promises instead: it snapshots the sidecar's process tree before quit, waits a bounded
 * time after quit, and reports every surviving descendant (still alive, or reparented to PID 1)
 * plus the sidecar's exit latency. It is REPORT-ONLY and never kills anything.
 *
 * Two modes:
 *
 *  - `live` (default) reads the operator's REAL process table across a Cmd+Q. This is the named,
 *    justified real-profile arm of the two-profile rule: defects such as the 260913-901 presence
 *    timer arm only under a populated profile, so an isolated run would be permanently green.
 *  - `eof` spawns `build/main/sidecar.js` under `createFakeHomeProfile()` (the isolated arm),
 *    waits for the READY sentinel, closes stdin and measures drain latency.
 *
 * Thresholds (see THRESHOLDS), justified against the exit contract:
 *  - eof: warn above 2000 ms, fail above 5000 ms. An empty-profile sidecar measured ~0.7 s after
 *    EOF; `smoke:sidecar`'s 30 s timeout cannot see slow exit.
 *  - live: the sidecar must be gone before the Rust shell's `shutdown_child` SIGKILL grace
 *    (2000 ms, `src-tauri/src/shell_state.rs`: SIGTERM to the process group, poll `try_wait` every
 *    50 ms for 2000 ms, then SIGKILL) is used up. Warn above 1500 ms; fail if the sidecar or any
 *    descendant is alive 5000 ms after the shell process is gone.
 *  - Unparseable or empty `ps` output, or a sidecar PID not found before quit, is INVALID, never
 *    clean.
 *
 * Guarded per the Phase 41-07 idiom: importing this module must never run the CLI. Operator run:
 * `pnpm smoke:exit-check` (live) or `pnpm smoke:exit-check -- --mode eof`.
 */
import { existsSync } from 'node:fs'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../src/backend/testUtils/fakeHomeProfile'
import { READY_SENTINEL } from '../src/common/types/sidecarTransport'

export interface PsRow {
  pid: number
  ppid: number
  pgid: number
  command: string
}

export type Verdict = 'PASS' | 'WARN' | 'FAIL' | 'INVALID'

export interface Survivor {
  pid: number
  command: string
  state: 'alive' | 'reparented'
}

const THRESHOLDS = Object.freeze({
  eofWarnMs: 2000,
  eofFailMs: 5000,
  liveWarnMs: 1500,
  liveFailMs: 5000,
  shellGraceMs: 2000
})

/** Parses `ps -axo pid=,ppid=,pgid=,command=` output. Blank or header-only input is INVALID. */
export function parsePs(
  text: string
): PsRow[] | { status: 'INVALID'; reason: string } {
  const rows: PsRow[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line)
    if (m) {
      rows.push({
        pid: Number(m[1]),
        ppid: Number(m[2]),
        pgid: Number(m[3]),
        command: m[4] ?? ''
      })
    }
  }
  if (rows.length === 0) {
    return { status: 'INVALID', reason: 'ps output empty or unparseable' }
  }
  return rows
}

/** Every transitive child of rootPid by ppid; never the root itself. */
export function descendantsOf(rows: PsRow[], rootPid: number): PsRow[] {
  const out: PsRow[] = []
  const seen = new Set<number>([rootPid])
  const queue = [rootPid]
  while (queue.length > 0) {
    const parent = queue.shift() as number
    for (const r of rows) {
      if (r.ppid === parent && !seen.has(r.pid)) {
        seen.add(r.pid)
        out.push(r)
        queue.push(r.pid)
      }
    }
  }
  return out
}

/**
 * Snapshot descendants still present afterwards. A pid reused by a different command is not a
 * survivor; ppid 1 means it was reparented to init/launchd.
 */
export function classifySurvivors(before: PsRow[], after: PsRow[]): Survivor[] {
  const out: Survivor[] = []
  for (const b of before) {
    const a = after.find((r) => r.pid === b.pid && r.command === b.command)
    if (!a) continue
    out.push({
      pid: a.pid,
      command: a.command,
      state: a.ppid === 1 ? 'reparented' : 'alive'
    })
  }
  return out
}

export interface ExitVerdictInput {
  mode: 'eof' | 'live'
  /** null when the exit was never observed */
  latencyMs: number | null
  survivors: Survivor[]
  /** false when no sidecar pid was found before quit */
  sidecarFound: boolean
}

export function exitVerdict(input: ExitVerdictInput): Verdict {
  if (!input.sidecarFound) return 'INVALID'
  if (input.survivors.length > 0) return 'FAIL'
  if (input.latencyMs === null || !Number.isFinite(input.latencyMs)) {
    return 'INVALID'
  }
  const warn =
    input.mode === 'eof' ? THRESHOLDS.eofWarnMs : THRESHOLDS.liveWarnMs
  const fail =
    input.mode === 'eof' ? THRESHOLDS.eofFailMs : THRESHOLDS.liveFailMs
  if (input.latencyMs > fail) return 'FAIL'
  if (input.latencyMs > warn) return 'WARN'
  return 'PASS'
}

/** Fail loudly if cwd is not the repo root (the script is bundled to a temp dir). */
export function assertRepoRoot(
  root: string,
  exists: (p: string) => boolean = existsSync
): void {
  const missing = [
    join(root, 'src-tauri', 'Cargo.toml'),
    join(root, 'meta', 'sidecarExitCheck.ts')
  ].filter((p) => !exists(p))
  if (missing.length > 0) {
    throw new Error(
      `sidecarExitCheck: cwd is not the GameLib repo root (${root}). ` +
        `Missing: ${missing.join(', ')}. Run via \`pnpm smoke:exit-check\` from the repo root.`
    )
  }
}

// ---------------------------------------------------------------------------
// CLI driver (operator-run, untested -- see module docblock). Report-only: nothing here
// signals or kills any process; the eof arm only closes the child's own stdin.
// ---------------------------------------------------------------------------

const DEV_SIDECAR_PATTERN = 'build/main/sidecar.js'
// externalBin name in src-tauri/src/sidecar.rs (`app.shell().sidecar("gamelib-sidecar")`)
const PACKAGED_SIDECAR_PATTERN = 'gamelib-sidecar'
const POLL_MS = 50
const QUIT_WAIT_MS = 30_000
const SETTLE_MS = 5000
const READY_WAIT_MS = 60_000
const KILL_WAIT_MS = 5000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function pgrepPids(pattern: string): number[] {
  const result = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf-8' })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}

function snapshotPs(): PsRow[] | { status: 'INVALID'; reason: string } {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,command='], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.status !== 0) {
    return { status: 'INVALID', reason: `ps exited ${String(r.status)}` }
  }
  return parsePs(r.stdout)
}

function isPidAlive(pid: number): boolean {
  // `ps -p` existence probe: report-only, nothing is signalled.
  const r = spawnSync('ps', ['-p', String(pid), '-o', 'pid='], {
    encoding: 'utf-8'
  })
  return r.status === 0 && r.stdout.trim() !== ''
}

export interface Report {
  mode: 'eof' | 'live'
  verdict: Verdict
  latencyMs: number | null
  survivors: Survivor[]
  vite: number[]
  note?: string
}

function finish(report: Report): never {
  console.log(JSON.stringify(report, null, 2))
  console.log(
    `sidecarExitCheck [${report.mode}]: ${report.verdict}` +
      (report.latencyMs === null
        ? ''
        : ` (exit latency ${report.latencyMs} ms)`)
  )
  process.exit(
    report.verdict === 'PASS' || report.verdict === 'WARN'
      ? 0
      : report.verdict === 'FAIL'
        ? 1
        : 2
  )
}

function invalidReport(mode: 'eof' | 'live', note: string): Report {
  return {
    mode,
    verdict: 'INVALID',
    latencyMs: null,
    survivors: [],
    vite: [],
    note
  }
}

async function runLive(): Promise<Report> {
  assertRepoRoot(process.cwd())
  const sidecarPid = [
    ...pgrepPids(DEV_SIDECAR_PATTERN),
    ...pgrepPids(PACKAGED_SIDECAR_PATTERN)
  ].find((p) => p !== process.pid)
  const before = snapshotPs()
  if (!Array.isArray(before)) return invalidReport('live', before.reason)
  if (sidecarPid === undefined) {
    return invalidReport('live', 'no sidecar process found before quit')
  }
  const sidecarRow = before.find((r) => r.pid === sidecarPid)
  if (!sidecarRow) return invalidReport('live', 'sidecar pid missing from ps')
  const shellPid = sidecarRow.ppid
  const tree = descendantsOf(before, sidecarPid)
  console.log(`shell pid ${shellPid}, sidecar pid ${sidecarPid}`)
  for (const r of [sidecarRow, ...tree]) {
    console.log(`  ${r.pid} <- ${r.ppid}  ${r.command}`)
  }
  console.log(
    'Quit GameLib now (Cmd+Q). Waiting up to 30 s for the shell to exit.'
  )

  const start = Date.now()
  let quitAt: number | null = null
  let goneAt: number | null = null
  while (Date.now() - start < QUIT_WAIT_MS) {
    const now = Date.now()
    if (quitAt === null && !isPidAlive(shellPid)) quitAt = now
    if (quitAt !== null && !isPidAlive(sidecarPid)) {
      goneAt = now
      break
    }
    await sleep(POLL_MS)
  }
  if (quitAt === null) {
    return invalidReport('live', 'shell never exited within 30 s')
  }

  const latencyMs = goneAt === null ? null : goneAt - quitAt
  await sleep(SETTLE_MS)
  const after = snapshotPs()
  if (!Array.isArray(after)) return invalidReport('live', after.reason)
  const survivors = classifySurvivors([sidecarRow, ...tree], after)
  return {
    mode: 'live',
    verdict: exitVerdict({
      mode: 'live',
      latencyMs: goneAt === null ? THRESHOLDS.liveFailMs + 1 : latencyMs,
      survivors,
      sidecarFound: true
    }),
    latencyMs,
    survivors,
    vite: pgrepPids('vite')
  }
}

/**
 * Test seams for `runEof`. The CLI passes none of these; they exist so T8 can drive the
 * never-READY path against a stub sidecar and observe the cleanup.
 */
export interface EofOptions {
  /** Script to spawn. Defaults to `<cwd>/build/main/sidecar.js`. */
  sidecarJs?: string
  /** How long to wait for the READY sentinel. Defaults to READY_WAIT_MS. */
  readyWaitMs?: number
  /** Profile factory. Defaults to an isolated `createFakeHomeProfile()`. */
  createProfile?: () => FakeHomeProfile
  /** Called with the spawned child right after the spawn. */
  onSpawn?: (child: ChildProcess) => void
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

/**
 * SIGKILLs the child THIS script spawned, through its own ChildProcess handle, and waits a
 * bounded time for it to go. Never signals by a pid read from ps/pgrep, so it cannot reach an
 * operator process or a reused pid.
 */
async function reapOwnChild(
  child: ChildProcess | undefined,
  exited: Promise<void>
): Promise<void> {
  if (!child || child.pid === undefined || hasExited(child)) return
  child.kill('SIGKILL')
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, KILL_WAIT_MS)
  })
  try {
    await Promise.race([exited, timedOut])
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!hasExited(child)) {
    console.error(
      `sidecarExitCheck: child pid ${child.pid} still alive ${KILL_WAIT_MS} ms after SIGKILL`
    )
  }
}

export async function runEof(opts: EofOptions = {}): Promise<Report> {
  assertRepoRoot(process.cwd())
  const sidecarJs = opts.sidecarJs ?? join(process.cwd(), DEV_SIDECAR_PATTERN)
  const readyWaitMs = opts.readyWaitMs ?? READY_WAIT_MS
  if (!existsSync(sidecarJs)) {
    return invalidReport(
      'eof',
      'build/main/sidecar.js missing: run pnpm build:sidecar'
    )
  }
  const profile = (
    opts.createProfile ??
    (() => createFakeHomeProfile({ prefix: 'gamelib-sidecarExitCheck-' }))
  )()
  let child: ChildProcess | undefined
  let exited: Promise<void> = Promise.resolve()
  try {
    const spawned = spawn(process.execPath, [sidecarJs], {
      env: profile.childEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child = spawned
    opts.onSpawn?.(spawned)
    let stdout = ''
    spawned.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    spawned.stderr.on('data', () => undefined)
    exited = new Promise<void>((resolve) => {
      spawned.on('exit', () => resolve())
      spawned.on('error', () => resolve())
    })
    const readyStart = Date.now()
    while (
      !stdout.includes(READY_SENTINEL) &&
      !hasExited(spawned) &&
      Date.now() - readyStart < readyWaitMs
    ) {
      await sleep(POLL_MS)
    }
    if (!stdout.includes(READY_SENTINEL)) {
      return invalidReport('eof', 'sidecar never wrote the READY sentinel')
    }
    const pid = spawned.pid
    const before = snapshotPs()
    if (!Array.isArray(before)) return invalidReport('eof', before.reason)
    if (pid === undefined) return invalidReport('eof', 'no child pid')
    const snapshot = [
      ...before.filter((r) => r.pid === pid),
      ...descendantsOf(before, pid)
    ]
    const eofAt = Date.now()
    spawned.stdin.end()
    await Promise.race([exited, sleep(READY_WAIT_MS)])
    const latencyMs = hasExited(spawned) ? Date.now() - eofAt : null
    await sleep(SETTLE_MS)
    const after = snapshotPs()
    if (!Array.isArray(after)) return invalidReport('eof', after.reason)
    const survivors = classifySurvivors(snapshot, after)
    return {
      mode: 'eof',
      verdict: exitVerdict({
        mode: 'eof',
        latencyMs: latencyMs ?? THRESHOLDS.eofFailMs + 1,
        survivors,
        sidecarFound: snapshot.length > 0
      }),
      latencyMs,
      survivors,
      vite: []
    }
  } finally {
    // Reap before dispose. Disposing while the child is alive would leave it writing into a
    // half-deleted tree, and on Windows rmSync over files a live process holds open fails with
    // EBUSY, which dispose() swallows, silently stranding the profile. The verdict is already
    // fixed by now, so the kill never shapes the measurement.
    try {
      await reapOwnChild(child, exited)
    } finally {
      profile.dispose()
    }
  }
}

if (require.main === module && !process.env.JEST_WORKER_ID) {
  const modeIdx = process.argv.indexOf('--mode')
  const mode = modeIdx >= 0 ? process.argv[modeIdx + 1] : 'live'
  const job: Promise<Report> = mode === 'eof' ? runEof() : runLive()
  job.then(finish, (e) => {
    console.error(e)
    process.exit(2)
  })
}
