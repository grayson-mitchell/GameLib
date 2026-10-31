/**
 * CrossOver trial-state probe (phase 59, D-09).
 *
 * Two-profile rule: this is the declared real-profile arm. CrossOver reads
 * its licence from the real HOME (spike 060 step 2), so production spawns
 * inherit `process.env`; tests pass a fake profile's `childEnv()` via
 * `baseEnv`.
 *
 * Sidecar exit contract: nothing runs at import; the cap timer, the child and
 * its pipes are unref'd, and every settle path clears the timer.
 */
import { spawn } from 'child_process'
import { join } from 'path'
import { logInfo, LogPrefix } from 'backend/logger'

// Spike 060 measured 4.2 s cold, 0.9 s warm: about 3.5x headroom.
export const DEMO_STATUS_CAP_MS = 15_000

const OUTPUT_CAP = 64 * 1024
const BOTTLE_RE = /^[A-Za-z0-9._-]{1,64}$/

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

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

export async function probeDemoStatus(args: {
  binDir: string
  bottleName: string
  timeoutMs?: number
  baseEnv?: NodeJS.ProcessEnv
}): Promise<DemoStatusProbe> {
  const { binDir, bottleName } = args
  const started = Date.now()
  const log = (outcome: string, extra = '') =>
    logInfo(
      `SteamEngine: demo-status probe bottle=${bottleName.slice(0, 64)} outcome=${outcome}${extra ? ` ${extra.slice(0, 200)}` : ''} elapsedMs=${Date.now() - started}`,
      LogPrefix.Steam
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

  if (!BOTTLE_RE.test(bottleName)) {
    return fail('invalid-bottle', 'bottle name rejected')
  }

  return new Promise<DemoStatusProbe>((resolve) => {
    let settled = false
    // eslint-disable-next-line prefer-const -- assigned after the settle closure that clears it
    let timer: NodeJS.Timeout | undefined
    const settle = (r: DemoStatusProbe) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(r)
    }
    let stdout = ''
    let stderr = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(join(binDir, 'wine'), ['--demo-status'], {
        env: { ...(args.baseEnv ?? process.env), CX_BOTTLE: bottleName },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch (e) {
      settle(fail('spawn-error', e instanceof Error ? e.message : String(e)))
      return
    }
    unrefHandle(child)
    unrefHandle(child.stdout)
    unrefHandle(child.stderr)
    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < OUTPUT_CAP) stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < OUTPUT_CAP) stderr += d.toString('utf8')
    })
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
      settle(
        fail(
          'timeout',
          `no result within ${args.timeoutMs ?? DEMO_STATUS_CAP_MS} ms`
        )
      )
    }, args.timeoutMs ?? DEMO_STATUS_CAP_MS)
    unrefHandle(timer)
    child.on('error', (e) => settle(fail('spawn-error', e.message)))
    child.on('close', (code) => {
      if (code !== 0) {
        settle(
          fail('nonzero-exit', `code=${code} stderr=${stderr.slice(0, 200)}`)
        )
        return
      }
      const status = parseDemoStatus(stdout)
      log('ok', `status=${status.kind}`)
      settle({ kind: 'ok', status, elapsedMs: Date.now() - started })
    })
  })
}
