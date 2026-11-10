/**
 * A `spawnLongLived` runner backed by hand-driven fake children, for tests that
 * script a helper's stdout/stderr and exit by emitting events on an
 * EventEmitter. It is the long-lived counterpart of scriptedRunner.ts: the
 * `spawn` argument is the test's own jest.fn(), called with
 * `(cmd, argv, { cwd, env, replaceEnv, id })` and returning the fake child, so
 * a test keeps asserting on that mock's calls.
 *
 * Behaviour mirrors the real runner's contract: chunks arrive as strings,
 * `exited` resolves on the child's 'exit' or 'error', a registered teardown is
 * dropped when the process exits, and a duplicate id replaces the earlier
 * registration.
 */
import type { EventEmitter } from 'node:events'

import type {
  LongLivedHandle,
  LongLivedOptions,
  ProcessRunner
} from '../process/types'

export interface FakeSpawnedChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: (signal?: NodeJS.Signals) => unknown
  pid?: number
}

export interface FakeSpawnOptions {
  id: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  replaceEnv?: boolean
}

export interface ChildBackedRunner {
  runner: Pick<ProcessRunner, 'spawnLongLived'>
  /** Runs every still-registered teardown, like the real runner at quit. */
  teardownAll(): void
  /** Forgets every registered teardown (call between tests). */
  reset(): void
}

export function createChildBackedRunner(
  spawn: (
    cmd: string,
    argv: readonly string[],
    opts: FakeSpawnOptions
  ) => FakeSpawnedChild
): ChildBackedRunner {
  const teardowns = new Map<string, () => void>()
  const runner: Pick<ProcessRunner, 'spawnLongLived'> = {
    spawnLongLived(cmd, argv, opts: LongLivedOptions): LongLivedHandle {
      const child = spawn(cmd, argv, {
        id: opts.id,
        cwd: opts.cwd,
        env: opts.env,
        replaceEnv: opts.replaceEnv
      })
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((resolve) => {
        child.once(
          'exit',
          (code: number | null, signal: NodeJS.Signals | null) =>
            resolve({ code, signal })
        )
        child.once('error', () => resolve({ code: null, signal: null }))
      })
      const handle: LongLivedHandle = {
        id: opts.id,
        pid: child.pid,
        exited,
        kill: (signal) => {
          child.kill(signal)
          return true
        },
        unregister: () => {
          if (teardowns.get(opts.id) === registered) teardowns.delete(opts.id)
        }
      }
      const registered = () =>
        opts.teardown ? opts.teardown(handle) : void handle.kill('SIGTERM')
      teardowns.set(opts.id, registered)
      void exited.then(() => handle.unregister())
      child.stdout.on('data', (chunk: unknown) =>
        opts.onStdout?.(String(chunk), undefined as never)
      )
      child.stderr.on('data', (chunk: unknown) =>
        opts.onStderr?.(String(chunk), undefined as never)
      )
      return handle
    }
  }
  return {
    runner,
    teardownAll() {
      const all = [...teardowns.values()]
      teardowns.clear()
      for (const t of all) t()
    },
    reset: () => teardowns.clear()
  }
}
