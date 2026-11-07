/**
 * Store-agnostic tool runner: spawns one of five allowlisted absolute-path
 * tools with the isolated fake-HOME env (two-profile rule, isolated half).
 * Moved unchanged from steam/bridge/drm/runnerClone.ts (phase 61 plan 04).
 *
 * Nothing runs at import; every child, pipe and deadline is unref'd.
 */
import { spawn } from 'child_process'

import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

export type RunnerTool =
  | '/bin/cp'
  | '/usr/bin/xattr'
  | '/usr/bin/codesign'
  | '/usr/bin/plutil'
  | '/bin/ps'

const RUNNER_TOOLS: readonly RunnerTool[] = [
  '/bin/cp',
  '/usr/bin/xattr',
  '/usr/bin/codesign',
  '/usr/bin/plutil',
  '/bin/ps'
]

export type RunToolResult = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
}

export type RunTool = (
  tool: RunnerTool,
  args: readonly string[],
  opts: { timeoutMs: number; signal?: AbortSignal }
) => Promise<RunToolResult>

const OUTPUT_CAP = 1024 * 1024

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

/**
 * Never rejects. Only the five allowlisted absolute tool paths can be run.
 */
export const defaultRunTool: RunTool = async (tool, args, opts) => {
  const result: RunToolResult = {
    code: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false
  }
  if (!RUNNER_TOOLS.includes(tool)) {
    return { ...result, stderr: `tool not allowed: ${String(tool)}` }
  }
  if (opts.signal?.aborted) return { ...result, aborted: true }

  // These tools need no user profile, so they get the isolated half of the
  // two-profile rule. The env comes from createFakeHomeProfile().childEnv()
  // and is never a hand-rolled literal.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-runner-' })
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  try {
    return await new Promise<RunToolResult>((resolve) => {
      let settled = false
      const done = (code: number | null) => {
        if (settled) return
        settled = true
        resolve({ ...result, code })
      }
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(tool, [...args], {
          env: profile.childEnv(),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        })
      } catch (e) {
        result.stderr = e instanceof Error ? e.message : String(e)
        done(null)
        return
      }
      unrefHandle(child)
      unrefHandle(child.stdout)
      unrefHandle(child.stderr)
      child.stdout?.on('data', (d: Buffer) => {
        if (result.stdout.length < OUTPUT_CAP)
          result.stdout += d.toString('utf8')
      })
      child.stderr?.on('data', (d: Buffer) => {
        if (result.stderr.length < OUTPUT_CAP)
          result.stderr += d.toString('utf8')
      })
      timer = setTimeout(() => {
        result.timedOut = true
        child.kill('SIGKILL')
        done(null)
      }, opts.timeoutMs)
      timer.unref?.()
      if (opts.signal) {
        onAbort = () => {
          result.aborted = true
          child.kill('SIGKILL')
          done(null)
        }
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
      child.on('error', () => done(null))
      child.on('close', (code) => done(code))
    })
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort) opts.signal?.removeEventListener('abort', onAbort)
    profile.dispose()
  }
}
