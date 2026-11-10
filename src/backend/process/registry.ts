/**
 * Per-instance tracked-child and teardown registries (Phase 66 D-11),
 * absorbing backend/trackedChildren.ts and backend/longLivedChildren.ts.
 *
 * Tracked children are NOT detached: the Rust shell's process-group reap relies
 * on it (Phase 72 D-13). State lives in Maps created inside each factory.
 *
 * Import budget: ./types only.
 */
import type { LogSink, TrackFilter } from './types'

/** Structural stand-in for ChildProcess so this file never imports child_process. */
export interface ChildProcessLike {
  pid?: number
  once(event: 'close' | 'error', fn: () => void): unknown
}

interface TrackedMeta {
  runner: string
  key: string
}
interface TrackedEntry extends TrackedMeta {
  pid: number
}

export function createTrackedRegistry(deps: {
  killPid(pid: number): boolean
  log: LogSink
}) {
  const registry = new Map<ChildProcessLike, TrackedEntry>()
  // Children this registry killed on purpose; weak so an exited child is not retained.
  const killedByUs = new WeakSet<ChildProcessLike>()

  function killTracked(filter: TrackFilter): number {
    let killed = 0
    for (const [child, entry] of [...registry.entries()]) {
      if (filter.runner !== undefined && entry.runner !== filter.runner)
        continue
      if (filter.key !== undefined && entry.key !== filter.key) continue
      let ok = false
      try {
        ok = deps.killPid(entry.pid)
      } catch (error) {
        deps.log.warn(
          `Unable to kill ${entry.runner} (${entry.key}), ignoring: ${String(error)}`
        )
        continue
      }
      if (ok) {
        killed++
        killedByUs.add(child)
      } else
        deps.log.warn(
          `Unable to kill ${entry.runner} (${entry.key}), ignoring.`
        )
    }
    return killed
  }

  return {
    track(child: ChildProcessLike, meta: TrackedMeta): () => void {
      const pid = child.pid
      if (pid === undefined) return () => undefined
      registry.set(child, { pid, runner: meta.runner, key: meta.key })
      const untrack = () => {
        registry.delete(child)
      }
      child.once('close', untrack)
      child.once('error', untrack)
      return untrack
    },
    killTracked,
    /** Whether killTracked/killAll signalled this child (read after it exits). */
    wasKilled: (child: ChildProcessLike) => killedByUs.has(child),
    killAll: () => killTracked({}),
    size: () => registry.size
  }
}

export function createTeardownRegistry(deps: { log: LogSink }) {
  const registry = new Map<string, () => void>()
  return {
    register(id: string, teardown: () => void): () => void {
      registry.set(id, teardown)
      return () => {
        if (registry.get(id) === teardown) registry.delete(id)
      }
    },
    teardownAll(): void {
      const entries = [...registry.entries()]
      registry.clear()
      for (const [id, teardown] of entries) {
        try {
          teardown()
        } catch (error) {
          deps.log.warn(`Teardown of ${id} failed: ${String(error)}`)
        }
      }
    },
    size: () => registry.size
  }
}
