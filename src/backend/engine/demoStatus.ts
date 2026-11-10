/**
 * CrossOver trial-state probe (phase 59, D-09).
 *
 * Two-profile rule: this is the declared real-profile arm. CrossOver reads
 * its licence from the real HOME (spike 060 step 2), so production spawns
 * inherit `process.env`; tests pass a fake profile's `childEnv()` via
 * `baseEnv`.
 *
 * Sidecar exit contract: nothing runs at import; the child runs through the
 * injected process runner, which owns the cap timer and the unref discipline.
 */
import { join } from 'path'
import { logInfo, LogPrefix } from 'backend/logger'
import type { ProcessRunner } from 'backend/process/types'
import { sanitizeBottleName } from './bottlePrimitives'

// Spike 060 measured 4.2 s cold, 0.9 s warm: about 3.5x headroom.
const DEMO_STATUS_CAP_MS = 15_000

const OUTPUT_CAP = 64 * 1024
// APFS file-name limit; a bottle is a directory.
const BOTTLE_NAME_MAX = 255

export type DemoStatus =
  | { kind: 'licensed' }
  | { kind: 'trial'; daysRemaining: number }
  | { kind: 'expired'; daysAgo: number }
  | { kind: 'unrecognised' }

export type DemoStatusProbe =
  | { kind: 'ok'; status: DemoStatus; elapsedMs: number }
  | {
      kind: 'failed'
      reason: 'invalid-bottle' | 'spawn-error' | 'timeout' | 'nonzero-exit'
      detail: string
      elapsedMs: number
    }

export function parseDemoStatus(stdout: string): DemoStatus {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const last = lines[lines.length - 1]
  if (last === undefined) return { kind: 'unrecognised' }
  if (/^Standard version$/.test(last)) return { kind: 'licensed' }
  const trial = /^Demo version \((\d+) days remaining\)$/.exec(last)
  if (trial) return { kind: 'trial', daysRemaining: Number(trial[1]) }
  const expired = /^Demo version \(expired (\d+) days ago\)$/.exec(last)
  if (expired) return { kind: 'expired', daysAgo: Number(expired[1]) }
  return { kind: 'unrecognised' }
}

// On macOS CrossOver's Perl bin/wine reports wrapper fatal errors on stdout via
// the cxmessage stand-in (G29), so the nonzero-exit detail keeps stdout too.
// Collapsing whitespace keeps the text on one log line (no forged lines).
function oneLine(s: string, cap: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, cap)
}

export type ProbeDemoStatus = (args: {
  binDir: string
  bottleName: string
  timeoutMs?: number
  baseEnv?: NodeJS.ProcessEnv
}) => Promise<DemoStatusProbe>

export function createProbeDemoStatus(deps: {
  runner: Pick<ProcessRunner, 'run'>
}): ProbeDemoStatus {
  return (args) => probeWith(deps.runner, args)
}

async function probeWith(
  runner: Pick<ProcessRunner, 'run'>,
  args: {
    binDir: string
    bottleName: string
    timeoutMs?: number
    baseEnv?: NodeJS.ProcessEnv
  }
): Promise<DemoStatusProbe> {
  const { binDir, bottleName } = args
  const started = Date.now()
  const log = (outcome: string, extra = '') =>
    logInfo(
      `Engine: demo-status probe bottle=${bottleName.slice(0, 64)} outcome=${outcome}${extra ? ` ${extra.slice(0, 700)}` : ''} elapsedMs=${Date.now() - started}`,
      LogPrefix.Backend
    )
  const fail = (
    reason: Extract<DemoStatusProbe, { kind: 'failed' }>['reason'],
    detail: string
  ): DemoStatusProbe => {
    log(reason, detail)
    return {
      kind: 'failed',
      reason,
      detail,
      elapsedMs: Date.now() - started
    }
  }

  // CX_BOTTLE travels in the child's env, not argv, so spaces and punctuation
  // are safe; sanitizeBottleName is the engine layer's one name chokepoint.
  if (
    sanitizeBottleName(bottleName) !== bottleName ||
    bottleName.length > BOTTLE_NAME_MAX
  ) {
    return fail('invalid-bottle', 'bottle name rejected')
  }

  const timeoutMs = args.timeoutMs ?? DEMO_STATUS_CAP_MS
  let res
  try {
    // Real-profile arm: without baseEnv the runner merges the process env
    // under CX_BOTTLE, as the old spawn did; a test baseEnv is used verbatim.
    res = await runner.run(join(binDir, 'wine'), ['--demo-status'], {
      env: { ...args.baseEnv, CX_BOTTLE: bottleName },
      replaceEnv: args.baseEnv !== undefined,
      stdin: '',
      timeoutMs,
      maxBufferBytes: OUTPUT_CAP
    })
  } catch (e) {
    return fail('spawn-error', e instanceof Error ? e.message : String(e))
  }
  if (res.timedOut) return fail('timeout', `no result within ${timeoutMs} ms`)
  if (res.code !== 0) {
    return fail(
      'nonzero-exit',
      `code=${res.code} stderr=${oneLine(res.stderr, 200)} stdout=${oneLine(res.stdout, 400)}`
    )
  }
  const status = parseDemoStatus(res.stdout)
  log('ok', `status=${status.kind}`)
  return { kind: 'ok', status, elapsedMs: Date.now() - started }
}
