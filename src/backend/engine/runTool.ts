/**
 * Store-agnostic tool runner: spawns one of five allowlisted absolute-path
 * tools with the isolated fake-HOME env (two-profile rule, isolated half).
 * Moved unchanged from steam/bridge/drm/runnerClone.ts (phase 61 plan 04).
 *
 * Nothing runs at import; every child runs through the injected process runner,
 * which owns the timeout, the abort signal and the unref discipline.
 */
import type { ProcessRunner } from 'backend/process/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

type RunnerTool =
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

/**
 * Never rejects. Only the five allowlisted absolute tool paths can be run.
 */
export function createRunTool(deps: {
  runner: Pick<ProcessRunner, 'run'>
}): RunTool {
  return async (tool, args, opts) => {
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
    try {
      const r = await deps.runner.run(tool, [...args], {
        env: profile.childEnv(),
        replaceEnv: true,
        stdin: '',
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
        maxBufferBytes: OUTPUT_CAP
      })
      return {
        code: r.code,
        stdout: r.stdout,
        stderr: r.stderr,
        timedOut: r.timedOut,
        aborted: r.aborted
      }
    } catch (e) {
      return { ...result, stderr: e instanceof Error ? e.message : String(e) }
    } finally {
      profile.dispose()
    }
  }
}
