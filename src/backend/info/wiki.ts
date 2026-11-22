import { RUST_INFO_UMU_GET } from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The umu id lookup lives in Rust (Phase 86, `gamelib-info` `wiki::umu`): the runner and store tables,
 * the cache, the request and its answer. This shim is the only TS path to it, and its body is one typed
 * call (D-06); the schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * Resolves `unknown`, because the transport is untyped: the umu id (`string`) or `null` (a sideload, no
 * match, or the lookup failed); the caller states that shape.
 */
export async function getUmuId(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_UMU_GET, [{ appName, runner }])
}
