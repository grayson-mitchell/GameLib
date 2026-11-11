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
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
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

export const THRESHOLDS = Object.freeze({
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
    join(root, 'src-tauri', 'src', 'main.rs'),
    join(root, 'meta', 'sidecarExitCheck.ts')
  ].filter((p) => !exists(p))
  if (missing.length > 0) {
    throw new Error(
      `sidecarExitCheck: cwd is not the GameLib repo root (${root}). ` +
        `Missing: ${missing.join(', ')}. Run via \`pnpm smoke:exit-check\` from the repo root.`
    )
  }
}
