import {
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Anti-cheat data lives in Rust (Phase 86, `gamelib-info` `anticheat`): the AreWeAntiCheatYet file
 * check, its download and the per-game lookup are all there. These three shims are the only TS path
 * to it. TS keeps the `releasesInfoReady` listener and its online wait (D-07, D-28) until the phase
 * that ports `online_monitor` (88): the listener calls `anticheatStatus` first and only when the
 * file is stale waits for the network and calls `anticheatDownload`. `gameAnticheatInfo` is the
 * launch-time lookup `launcher.ts` still calls. Each body is one typed call (D-06); the shim
 * schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes them.
 *
 * Each resolves `unknown`, because the transport is untyped: the caller states the shape it reads
 * (`{ needed: boolean }`, `{ written: boolean, warning?: string }`, `AntiCheatInfo | null`). The
 * crate has no logger, so the listener logs a download's `warning` itself.
 */

/** `{ needed }`: the local data file is missing or differs from the hash the releases file names. */
export async function anticheatStatus(
  deps: RustInvokeDeps,
  args: { latestFileHash?: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_ANTICHEAT_STATUS, [args])
}

/** `{ written, warning? }`: `written: false` plus a `warning` when the fetch or the write failed. */
export async function anticheatDownload(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_ANTICHEAT_DOWNLOAD, [{}])
}

/** The matching entry, or null when there is none or the data file is unreadable. */
export async function gameAnticheatInfo(
  deps: RustInvokeDeps,
  appNamespace: string | undefined
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_ANTICHEAT_INFO, [{ appNamespace }])
}
