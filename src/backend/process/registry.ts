/**
 * Per-instance tracked-child and teardown registries (Phase 66 D-11),
 * absorbing the former tracked-children and long-lived-children modules.
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
  once(event: 'close' | 'error' | 'exit', fn: () => void): unknown
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
      // 'exit' too: an exited child whose pipes a grandchild still holds has no 'close' yet,
      // and must not stay killable (its PID may be recycled; Phase 72 D-13, A-WR-2).
      child.once('exit', untrack)
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
  // A Set per id, not a single slot: a second long-lived child registered under the same id
  // while the first is still alive must not silently drop the first's teardown (the first child
  // would then outlive quit with its cleanup never run; A-WR-6, 66.1 review). Each register()
  // returns an unregister bound to its own entry, so an exited child removes only itself.
  const registry = new Map<string, Set<() => void>>()
  return {
    register(id: string, teardown: () => void): () => void {
      let set = registry.get(id)
      if (!set) {
        set = new Set()
        registry.set(id, set)
      }
      // Wrap so registering the same function twice yields two distinct entries.
      const entry = () => teardown()
      set.add(entry)
      return () => {
        const current = registry.get(id)
        if (!current) return
        current.delete(entry)
        if (current.size === 0) registry.delete(id)
      }
    },
    teardownAll(): void {
      const entries = [...registry.entries()]
      registry.clear()
      for (const [id, teardowns] of entries) {
        for (const teardown of teardowns) {
          try {
            teardown()
          } catch (error) {
            deps.log.warn(`Teardown of ${id} failed: ${String(error)}`)
          }
        }
      }
    },
    size: () => [...registry.values()].reduce((n, set) => n + set.size, 0)
  }
}
