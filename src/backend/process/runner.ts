/**
 * The one process runner (Phase 66 D-09, D-10, D-11). Every backend spawn goes
 * through this module once callers migrate; it is the only file allowed to
 * import child_process.
 *
 * - argv-only API: there is no shell string and no `shell` spawn option (D-09).
 * - every run() has a timeout (default DEFAULT_RUN_TIMEOUT_MS) enforced by an
 *   unref'd clock timer that SIGKILLs the child (D-10).
 * - exit contract: the child, its stdin/stdout/stderr pipes and the kill timer
 *   are all unref()'d, so a running child never holds the sidecar's event loop
 *   open. This is the only code allowed to unref() a child, and `openDetached`
 *   is the only detached spawn (D-11).
 * - tracked children are killable by PID, never by name (Phase 72 D-13), and are
 *   NOT detached so the Rust shell's process-group reap still covers them.
 *
 * Import budget: Node builtins plus ./types and ./registry ONLY.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createTeardownRegistry, createTrackedRegistry } from './registry'
import type {
  ChildHandle,
  LongLivedHandle,
  LongLivedOptions,
  ProcessRunner,
  ProcessRunnerDeps,
  RunOptions,
  RunResult,
  RunSyncOptions,
  SyncResult,
  TimerHandle,
  TrackFilter
} from './types'

export const DEFAULT_RUN_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024
/** Grace after 'exit' before a pipe-holding grandchild stops blocking run(). */
const DRAIN_GRACE_MS = 250

type Unrefable = { unref?: () => void }

function positiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function createProcessRunner(deps: ProcessRunnerDeps): ProcessRunner {
  function buildEnv(
    env: NodeJS.ProcessEnv | undefined,
    replaceEnv: boolean | undefined
  ): NodeJS.ProcessEnv {
    const merged = replaceEnv
      ? { ...(env ?? {}) }
      : { ...deps.baseEnv, ...(env ?? {}) }
    return deps.pinnedEnv ? { ...merged, ...deps.pinnedEnv } : merged
  }

  function runSync(
    cmd: string,
    argv: readonly string[],
    opts: RunSyncOptions
  ): SyncResult {
    if (!positiveFinite(opts.timeoutMs)) {
      throw new TypeError('runSync requires a positive finite timeoutMs (D-09)')
    }
    if (typeof opts.reason !== 'string' || opts.reason.trim().length === 0) {
      throw new TypeError('runSync requires a non-empty reason (D-09)')
    }
    const r = spawnSync(cmd, [...argv], {
      cwd: opts.cwd,
      env: buildEnv(opts.env, opts.replaceEnv),
      input: opts.input,
      timeout: opts.timeoutMs,
      killSignal: 'SIGKILL',
      windowsHide: true,
      encoding: 'utf-8',
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES
    })
    const errCode = (r.error as NodeJS.ErrnoException | undefined)?.code
    return {
      code: r.status,
      signal: r.signal,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      timedOut: errCode === 'ETIMEDOUT',
      ...(r.error ? { error: r.error.message } : {})
    }
  }

  function killPid(pid: number): boolean {
    if (deps.platform === 'win32') {
      const r = runSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        timeoutMs: 5_000,
        reason: 'quit path must finish before app exit (Phase 72 D-13)'
      })
      return r.code === 0 && !r.error
    } else {
      process.kill(pid, 'SIGTERM')
    }
    return true
  }

  const tracked = createTrackedRegistry({ killPid, log: deps.log })
  const teardowns = createTeardownRegistry({ log: deps.log })

  function unrefChild(child: ChildProcess): void {
    child.unref()
    for (const s of [child.stdin, child.stdout, child.stderr]) {
      ;(s as unknown as Unrefable | null)?.unref?.()
    }
  }

  function handleOf(child: ChildProcess): ChildHandle {
    return {
      pid: child.pid,
      get exitCode() {
        return child.exitCode
      },
      get signalCode() {
        return child.signalCode
      },
      kill: (signal) => child.kill(signal)
    }
  }

  function run(
    cmd: string,
    argv: readonly string[],
    opts: RunOptions = {}
  ): Promise<RunResult> {
    let timeoutMs: number | null
    if (opts.timeout !== undefined) {
      if (opts.timeoutMs !== undefined) {
        throw new TypeError(
          'run: timeoutMs and timeout are mutually exclusive (D-10)'
        )
      }
      if (
        opts.timeout.none !== true ||
        typeof opts.timeout.reason !== 'string' ||
        opts.timeout.reason.trim().length === 0
      ) {
        throw new TypeError(
          'run: timeout opt-out requires { none: true, reason } with a non-empty reason (D-10)'
        )
      }
      timeoutMs = null
    } else {
      timeoutMs = opts.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS
      if (!positiveFinite(timeoutMs)) {
        throw new TypeError('run requires a positive finite timeoutMs (D-10)')
      }
    }
    const maxBytes = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
    const resolveOn = opts.resolveOn ?? 'close'

    return new Promise<RunResult>((resolve, reject) => {
      const child = spawn(cmd, [...argv], {
        cwd: opts.cwd,
        env: buildEnv(opts.env, opts.replaceEnv),
        signal: opts.signal,
        windowsHide: opts.windowsHide ?? true,
        stdio: 'pipe'
      })
      unrefChild(child)
      const handle = handleOf(child)
      const untrack = tracked.track(
        child,
        opts.track ?? { runner: 'runner', key: cmd }
      )

      let stdout = ''
      let stderr = ''
      let outBytes = 0
      let errBytes = 0
      let truncated = false
      // Once a chunk is dropped on a stream, nothing later is appended to it.
      const stopped = { out: false, err: false }
      let timedOut = false
      let aborted = false
      let settled = false

      let drainTimedOut = false
      let drainTimer: TimerHandle | undefined
      const timer =
        timeoutMs === null
          ? undefined
          : deps.clock.setTimeout(() => {
              timedOut = true
              child.kill('SIGKILL')
            }, timeoutMs)

      const capture = (text: string, stream: 'out' | 'err'): void => {
        const bytes = Buffer.byteLength(text)
        const total = (stream === 'out' ? outBytes : errBytes) + bytes
        if (stream === 'out') outBytes = total
        else errBytes = total
        if (stopped[stream] || total > maxBytes) {
          stopped[stream] = true
          truncated = true
          return
        }
        if (stream === 'out') stdout += text
        else stderr += text
      }

      child.stdout?.setEncoding('utf-8')
      child.stderr?.setEncoding('utf-8')
      child.stdout?.on('data', (chunk: string) => {
        capture(chunk, 'out')
        opts.onStdout?.(chunk, handle)
        opts.logSink?.(opts.sanitize ? opts.sanitize(chunk) : chunk)
      })
      child.stderr?.on('data', (chunk: string) => {
        capture(chunk, 'err')
        opts.onStderr?.(chunk, handle)
        opts.logSink?.(opts.sanitize ? opts.sanitize(chunk) : chunk)
      })

      const finish = (
        code: number | null,
        signal: NodeJS.Signals | null
      ): void => {
        if (settled) return
        settled = true
        if (timer) deps.clock.clear(timer)
        if (drainTimer) deps.clock.clear(drainTimer)
        resolve({
          code,
          signal,
          stdout,
          stderr,
          timedOut,
          aborted,
          truncated,
          pid: child.pid,
          ...(drainTimedOut ? { drainTimedOut: true } : {}),
          ...(tracked.wasKilled(child) ? { killedByUs: true } : {})
        })
      }

      child.on('error', (err: Error) => {
        if (err.name === 'AbortError') {
          aborted = true
          return
        }
        if (settled) return
        settled = true
        if (timer) deps.clock.clear(timer)
        if (drainTimer) deps.clock.clear(drainTimer)
        reject(err)
      })
      child.on('exit', (code, signal) => {
        if (settled) return
        if (resolveOn === 'exit' || timedOut || aborted) {
          // A grandchild may hold the stdio pipes so 'close' never arrives;
          // give the pipes a bounded grace, then cut them (WR-01).
          drainTimer = deps.clock.setTimeout(() => {
            drainTimedOut = true
            untrack()
            child.stdout?.destroy()
            child.stderr?.destroy()
            finish(code, signal)
          }, DRAIN_GRACE_MS)
        }
      })
      child.on('close', finish)

      if (child.stdin) {
        child.stdin.on('error', () => undefined)
        if (opts.stdin !== undefined) {
          child.stdin.write(opts.stdin)
          child.stdin.end()
        }
      }
      opts.onSpawn?.(handle)
    })
  }

  function spawnLongLived(
    cmd: string,
    argv: readonly string[],
    opts: LongLivedOptions
  ): LongLivedHandle {
    const child = spawn(cmd, [...argv], {
      cwd: opts.cwd,
      env: buildEnv(opts.env, opts.replaceEnv),
      signal: opts.signal,
      windowsHide: opts.windowsHide ?? true,
      stdio: opts.stdio === 'ignore' ? 'ignore' : 'pipe'
    })
    unrefChild(child)
    tracked.track(child, opts.track ?? { runner: 'long-lived', key: opts.id })

    const exited = new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }))
      child.once('error', (err) => {
        deps.log.warn(`${opts.id}: ${err.message}`)
        resolve({ code: null, signal: null })
      })
    })

    const base = handleOf(child)
    let unregister: () => void = () => undefined
    const handle: LongLivedHandle = {
      id: opts.id,
      pid: child.pid,
      exited,
      kill: (signal) => base.kill(signal),
      unregister: () => unregister()
    }
    const teardown = opts.teardown ?? ((h) => void h.kill('SIGTERM'))
    unregister = teardowns.register(opts.id, () => teardown(handle))
    void exited.then(() => unregister())

    const handleOut = (chunk: string) => {
      opts.onStdout?.(chunk, base)
      opts.logSink?.(opts.sanitize ? opts.sanitize(chunk) : chunk)
    }
    const handleErr = (chunk: string) => {
      opts.onStderr?.(chunk, base)
      opts.logSink?.(opts.sanitize ? opts.sanitize(chunk) : chunk)
    }
    child.stdout?.setEncoding('utf-8')
    child.stderr?.setEncoding('utf-8')
    child.stdout?.on('data', handleOut)
    child.stderr?.on('data', handleErr)
    child.stdin?.on('error', () => undefined)
    opts.onSpawn?.(base)
    return handle
  }

  function openDetached(url: string, onError?: (code: string) => void): void {
    if (deps.platform !== 'darwin') {
      onError?.('unsupported-platform')
      return
    }
    // No env option: LaunchServices must see the real session, not a pinned
    // profile. This is the one detached, untracked child (D-11).
    const child = spawn(deps.openerPath, ['-g', url], {
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      onError?.(err.code ?? 'error')
    })
    child.unref()
  }

  return {
    run,
    spawnLongLived,
    runSync,
    killTracked: (filter: TrackFilter) => tracked.killTracked(filter),
    killAllTracked: () => tracked.killAll(),
    teardownAll: () => teardowns.teardownAll(),
    openDetached
  }
}
