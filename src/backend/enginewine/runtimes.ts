import type { RuntimeName } from 'common/types'
import {
  RUST_WINE_RUNTIME_DOWNLOAD,
  RUST_WINE_RUNTIME_IS_INSTALLED
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Wine runtimes (EAC, BattlEye, umu) live in Rust (Phase 87, `gamelib-wine` `runtimes`): the lutris
 * list, the installed-and-current check, the download with its contained tar extraction and the
 * guarded replace of the old folder. These two shims are the only TS path to it, kept so the launcher's
 * pre-launch runtime step keeps its call shape until Phase 88 moves launch into Rust. Each body is one
 * typed call (D-06); the shim schedule in `engineWineShimSchedule.test.ts` pins that and the phase that
 * deletes them. The renderer's `isRuntimeInstalled` and `downloadRuntime` are native channels that run
 * the same ops, so a runtime download has one writer.
 *
 * Both resolve a boolean: `isRuntimeInstalled` whether the runtime is installed and current,
 * `downloadRuntime` whether it is installed after the call.
 */
export async function isRuntimeInstalled(
  deps: RustInvokeDeps,
  name: RuntimeName
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_RUNTIME_IS_INSTALLED, [name])
}

export async function downloadRuntime(
  deps: RustInvokeDeps,
  name: RuntimeName
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_RUNTIME_DOWNLOAD, [name])
}
