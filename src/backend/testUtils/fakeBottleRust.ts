/**
 * A stand-in for Rust's bottle ops in a jest test (Phase 87, 87-42, 87-43). The engine's bottle kill, guarded removal,
 * fallback creation and creation-time markers are Rust's, and a jest process has no shell to ask. This transport
 * records every call and answers each channel with a scripted value: the kill says it stopped the wineserver, the
 * removal and the markers say they were done, the fallback creation says it created the bottle, and the cancel says it
 * found nothing to cancel. A test that needs another answer (a refused kill, a failed creation, a creation held open
 * until a cancel) passes it in `others`, by channel name; an `others` entry wins over the default. `crossoverBinDir`
 * answers the CrossOver bin-dir lookup (`engine_cx_resolve_bin_dir`, 87-55): the path, or `null` when it returns nothing.
 *
 * It runs no Wine and no TS copy of what Rust does: what the ops do to the filesystem and to the process list is
 * replayed by `gamelib-engine`'s goldens (`golden_bottles.rs`, `golden_switch.rs`, `switch_incidents.rs`) against the
 * recorded fixtures, and the tests that use this fake assert what the TS caller sends and how it uses the answer.
 * Any other channel is refused, naming itself, so a test never silently reaches a Rust op it did not mean to.
 */
import {
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
  RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED,
  RUST_ENGINE_CX_RESOLVE_BIN_DIR
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

export interface FakeBottleRust extends RustInvokeDeps {
  calls: Array<{ channel: string; arg: unknown }>
}

/** The answer each bottle channel gets when a test scripts none. */
const DEFAULT_ANSWERS: Record<string, unknown> = {
  [RUST_ENGINE_BOTTLE_KILL_WINESERVER]: true,
  [RUST_ENGINE_BOTTLE_REMOVE_CREATED]: true,
  [RUST_ENGINE_BOTTLE_CREATE_FALLBACK]: { status: 'done', createdHere: true },
  [RUST_ENGINE_BOTTLE_CANCEL_CREATE]: false,
  // The creation-time markers are Rust's; a test that does not script them is told they were written.
  [RUST_ENGINE_BOTTLE_RECORD_PINNED]: true,
  [RUST_ENGINE_BOTTLE_RECORD_CROSSOVER]: true,
  [RUST_ENGINE_BOTTLE_RECONCILE_MARKER]: null
}

export function createFakeBottleRust(
  deps: {
    /** Answers for channels, by name; the argument is the call's one object. */
    others?: Record<string, (arg: unknown) => unknown>
    /** Where CrossOver is, read at each lookup so a test can change it; unset answers "not installed". */
    crossoverBinDir?: () => string | undefined
  } = {}
): FakeBottleRust {
  const calls: FakeBottleRust['calls'] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    const arg = args[0]
    calls.push({ channel, arg })
    const scripted = deps.others?.[channel]
    if (scripted) return Promise.resolve(scripted(arg))
    if (channel === RUST_ENGINE_CX_RESOLVE_BIN_DIR) {
      return Promise.resolve(deps.crossoverBinDir?.() ?? null)
    }
    if (channel in DEFAULT_ANSWERS) {
      return Promise.resolve(DEFAULT_ANSWERS[channel])
    }
    return Promise.reject(new Error(`fakeBottleRust: unexpected ${channel}`))
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return { requestRustInvoke, calls }
}
