/**
 * Registry of long-lived child processes spawned by the Node sidecar that must be torn
 * down when the app quits gracefully (quick task 260907-juv, Layer A of the two-layer
 * helper-process-orphan fix -- see
 * `.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-...md`).
 *
 * This is deliberately the ONLY seam `handleExit()` (`backend/utils.ts`) needs to know
 * about: every long-lived child (currently GOG's `comet` and the Steam bridge helper)
 * registers its own teardown here once, and `shutdownLongLivedChildren()` fans out to
 * all of them. Adding a THIRD long-lived child later means calling
 * `registerLongLivedChild()` at its spawn site -- `handleExit()` itself never changes.
 *
 * NOTE (Layer A alone is NOT the full fix): this registry is only reachable from the
 * in-app quit path (`ipcMain.on('quit', ...)` / ctrl+q -> `handleExit()`). The
 * red-X/Cmd+Q/`osascript` quit path never runs any JavaScript at all -- the sidecar is
 * killed by SIGKILL from the Rust shell before any handler here could run. That path is
 * covered separately by Layer B (`src-tauri/src/main.rs`'s process-group reap). See
 * `.planning/quick/260907-juv-fix-helper-process-orphan-on-app-quit-wi/260907-juv-CONTEXT.md`
 * findings F1-F3 for the full analysis of why both layers are required.
 *
 * Import budget: `backend/logger` ONLY. This module must not import `backend/utils` (it
 * is called FROM there) and must not reach into any individual store manager -- store
 * managers import THIS module to register, never the other way around.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

type LongLivedChildId = string
type Teardown = () => void

const registry = new Map<LongLivedChildId, Teardown>()

/**
 * Registers a teardown callback for a long-lived child process under `id`. Returns an
 * unregister function, so a caller whose own child dies/is replaced independently of a
 * full-app quit (e.g. the bridge helper's own `shutdownBridgeHelper()`, or comet exiting
 * when its game quits) can remove its now-stale entry without waiting for app quit.
 *
 * Registering under an `id` that is already registered replaces the previous entry
 * rather than accumulating both -- there is exactly one live child process per `id` at
 * any given time, by construction of every current caller (D-03's shared-helper
 * singleton, and the single comet child per game session).
 */
function registerLongLivedChild(
  id: LongLivedChildId,
  teardown: Teardown
): () => void {
  registry.set(id, teardown)
  return () => {
    // Only clear the entry if it still points at THIS registration -- guards against a
    // stale unregister (from an already-superseded registration) clobbering a newer one.
    if (registry.get(id) === teardown) {
      registry.delete(id)
    }
  }
}

/**
 * Tears down every currently-registered long-lived child. Called once from
 * `handleExit()` immediately before `app.exit()`. Safe to call with an empty registry
 * (no long-lived child was ever spawned this session) -- a no-op in that case.
 *
 * Each teardown is invoked independently and defensively: one child's teardown throwing
 * must not prevent the others from running, since the whole point of this fan-out is to
 * avoid leaving orphans on quit.
 */
function shutdownLongLivedChildren(): void {
  if (registry.size === 0) {
    return
  }
  for (const [id, teardown] of registry) {
    try {
      teardown()
    } catch (error) {
      logWarning([
        `shutdownLongLivedChildren: teardown for "${id}" threw, continuing with the rest`,
        error
      ])
    }
  }
  logInfo(
    `shutdownLongLivedChildren: tore down ${registry.size} long-lived child(ren) on quit`,
    LogPrefix.Backend
  )
  registry.clear()
}

/** Test-only reset hook, mirroring this codebase's `__reset*ForTests` convention. */
function __resetLongLivedChildrenForTests(): void {
  registry.clear()
}

export {
  registerLongLivedChild,
  shutdownLongLivedChildren,
  __resetLongLivedChildrenForTests
}
