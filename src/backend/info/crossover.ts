import { RUST_INFO_CROSSOVER_RATING_MAP } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { ManagerDeps } from 'backend/services/types'

/**
 * The CrossOver rating map lives in Rust (Phase 86, `gamelib-info` `crossover`): the index fetch over
 * HTTPS, its schema bounds, the cache and the 5 minute back-off, the bundled cold-start snapshot, the
 * title normalisation and the three-state map (a number is the rating, `null` is looked up and not
 * found, an absent key was never looked up; `{}` off macOS). This resolver is the only TS path to it,
 * and it gathers the one input Rust cannot (D-24): the games, which come from every library manager's
 * in-memory list until the library managers themselves port. The body is `const games`, then one typed
 * call (D-06); the schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * Resolves `unknown`, because the transport is untyped: the `{ [appName]: number | null }` map the
 * renderer's badges read; rejects with the text of what failed.
 */
export async function getCrossoverIndex(
  deps: Pick<ManagerDeps, 'libraryManagers'> & RustInvokeDeps
): Promise<unknown> {
  const games = Object.values(deps.libraryManagers).flatMap((manager) =>
    manager.getListOfGames().map((game) => ({
      appName: game.app_name,
      title: game.title,
      runner: game.runner
    }))
  )
  return deps.requestRustInvoke(RUST_INFO_CROSSOVER_RATING_MAP, [{ games }])
}
