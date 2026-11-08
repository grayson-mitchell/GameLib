/**
 * Minimal registry of the runner and Wine children this sidecar spawned, so quit and
 * stop can kill by PID instead of by name pattern (Phase 72 D-13). `pkill -f legendary`
 * and Windows `Stop-Process -name` hit every matching process on the machine, including
 * other users' tools or a second launcher; a tracked PID can only be ours.
 *
 * Fed by the two spawn helpers in `backend/launcher.ts` (`callRunner`,
 * `runWineCommand`). Kept deliberately small (`trackChild` / `killTracked` /
 * `killAllTracked`) so Phase 66's process runner can absorb it.
 *
 * Sidecar exit contract: this module creates no timers or handles and never uses
 * `detached`; tracked children stay in the sidecar's process group, so the Rust shell's
 * group reap still covers them.
 *
 * Import budget: `backend/logger` and node builtins ONLY. It must not import
 * `backend/utils` (which calls it).
 */
import { spawnSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { logWarning, LogPrefix } from 'backend/logger'

interface TrackedMeta {
  runner: string
  key: string
}

interface TrackedEntry extends TrackedMeta {
  pid: number
}

interface TrackedFilter {
  runner?: string
  key?: string
}

const registry = new Map<ChildProcess, TrackedEntry>()

/**
 * Records `child` under `meta`. Returns an untrack function that removes only this
 * child's entry. The entry is also removed on 'close' and 'error', so a reaped PID is
 * never signalled (PID-reuse guard). A child with no pid (spawn failure) is not recorded.
 */
function trackChild(child: ChildProcess, meta: TrackedMeta): () => void {
  const pid = child.pid
  if (pid === undefined) {
    return () => undefined
  }
  registry.set(child, { pid, runner: meta.runner, key: meta.key })
  const untrack = () => {
    registry.delete(child)
  }
  child.once('close', untrack)
  child.once('error', untrack)
  return untrack
}

function killEntry(entry: TrackedEntry): boolean {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F'], {
        windowsHide: true
      })
    } else {
      process.kill(entry.pid, 'SIGTERM')
    }
    return true
  } catch (error) {
    logWarning(
      [`Unable to kill ${entry.runner} (${entry.key}), ignoring.`, error],
      LogPrefix.Backend
    )
    return false
  }
}

/** Kills tracked children matching `filter` (an omitted field matches all). Returns the count killed. */
function killTracked(filter: TrackedFilter): number {
  let killed = 0
  for (const entry of [...registry.values()]) {
    if (filter.runner !== undefined && entry.runner !== filter.runner) continue
    if (filter.key !== undefined && entry.key !== filter.key) continue
    if (killEntry(entry)) killed++
  }
  return killed
}

/** Kills every tracked child; one failure does not stop the rest. */
function killAllTracked(): number {
  return killTracked({})
}

export { trackChild, killTracked, killAllTracked }
