/**
 * Contracts for the process leaf (Phase 66). Types only, no runtime code.
 *
 * Import budget: Node builtins and files inside src/backend/process/ ONLY; no
 * backend/logger, backend/config or backend/utils (logger -> config -> spawn
 * cycle, RESEARCH Pitfall 1).
 */

export interface TimerOptions {
  /** Opt out of unref(). The reason is mandatory and must be non-empty (D-04). */
  keepAlive?: { reason: string }
}
export interface TimerHandle {
  readonly id: number
}
export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number, opts?: TimerOptions): TimerHandle
  setInterval(fn: () => void, ms: number, opts?: TimerOptions): TimerHandle
  clear(handle: TimerHandle): void
}

export interface LogSink {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export interface ChildHandle {
  readonly pid: number | undefined
  /** Live exit state of the child; null until it exits. */
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals): boolean
}
export interface TrackFilter {
  runner?: string
  key?: string
}

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** true: env is used verbatim; default merges over baseEnv. */
  replaceEnv?: boolean
  /** Default DEFAULT_RUN_TIMEOUT_MS; must be positive finite. */
  timeoutMs?: number
  /**
   * The only way to run without a timeout (D-10, A1). The reason is mandatory and
   * non-empty; mutually exclusive with timeoutMs.
   */
  timeout?: { none: true; reason: string }
  signal?: AbortSignal
  stdin?: string
  onSpawn?: (child: ChildHandle) => void
  onStdout?: (chunk: string, child: ChildHandle) => void
  onStderr?: (chunk: string, child: ChildHandle) => void
  /** Receives sanitize(text) only; result.stdout/stderr stay raw. */
  logSink?: (text: string) => void
  sanitize?: (text: string) => string
  track?: { runner: string; key: string }
  /** Default 'close'. */
  resolveOn?: 'close' | 'exit'
  /** Default 8 MiB per stream; capture truncates and sets `truncated`. */
  maxBufferBytes?: number
  /** Default true. */
  windowsHide?: boolean
}
export interface RunResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
  truncated: boolean
  pid: number | undefined
  /**
   * True when the child exited but its pipes were still open after the drain
   * grace (a grandchild holds them); late output was dropped.
   */
  drainTimedOut?: boolean
  /**
   * True when this child was killed through killTracked/killAllTracked: an intended stop,
   * cancel or quit, so a caller reads the signal exit as a cancellation, not a failure.
   */
  killedByUs?: boolean
}

export interface LongLivedOptions extends Omit<
  RunOptions,
  'timeoutMs' | 'timeout' | 'resolveOn' | 'maxBufferBytes' | 'stdin'
> {
  id: string
  stdio?: 'pipe' | 'ignore'
  /** Default: handle.kill('SIGTERM'). */
  teardown?: (handle: LongLivedHandle) => void
}
export interface LongLivedHandle {
  readonly id: string
  readonly pid: number | undefined
  readonly exited: Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>
  /**
   * Resolves when the child's stdio has closed ('close') or it failed to spawn ('error').
   * Later than `exited` when a grandchild holds the pipes. Flush line relays here so a final
   * unterminated line written just before exit is not lost.
   */
  readonly closed: Promise<void>
  kill(signal?: NodeJS.Signals): boolean
  unregister(): void
}

export interface RunSyncOptions {
  timeoutMs: number
  reason: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  replaceEnv?: boolean
  input?: string
}
export interface SyncResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  error?: string
}

export interface ProcessRunner {
  run(
    cmd: string,
    argv: readonly string[],
    opts?: RunOptions
  ): Promise<RunResult>
  spawnLongLived(
    cmd: string,
    argv: readonly string[],
    opts: LongLivedOptions
  ): LongLivedHandle
  runSync(
    cmd: string,
    argv: readonly string[],
    opts: RunSyncOptions
  ): SyncResult
  killTracked(filter: TrackFilter): number
  killAllTracked(): number
  teardownAll(): void
  openDetached(url: string, onError?: (code: string) => void): void
}
export interface ProcessRunnerDeps {
  clock: Clock
  log: LogSink
  platform: NodeJS.Platform
  baseEnv: NodeJS.ProcessEnv
  /** Test arm: applied LAST on every spawn (fake HOME); production passes null. */
  pinnedEnv: NodeJS.ProcessEnv | null
  /** '/usr/bin/open' in production. */
  openerPath: string
}
