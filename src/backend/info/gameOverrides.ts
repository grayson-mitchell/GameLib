import type { GameInfo } from 'common/types'
import type { MetadataOverride } from 'common/types/ipc/gameDetails'
import {
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Per-game metadata overrides live in Rust (Phase 86, `gamelib-info` `overrides`): the
 * `store/game-overrides.json` read, the write and the cleanup of the game's stored images all happen
 * there. These four shims are the only TS path to it, kept so the game-details callers keep their
 * call shape until phase 88 (which owns them) calls Rust directly. Each body is one typed call
 * (D-06); the shim schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes them.
 *
 * Each now answers with a Promise, so the two call sites in `gamedetails/` gained an `await`
 * (Pitfall 9). Each resolves `unknown`, because the transport is untyped: the caller states the shape
 * it reads. The crate has no logger, so `setGameOverrides` resolves the boolean the TS function
 * returned and the caller writes the `GameOverrides` log lines from it.
 */
export async function getGameOverrides(
  deps: RustInvokeDeps,
  appName: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_OVERRIDES_GET, [{ appName }])
}

/** `info_overrides_get_all` takes no argument at all: the crate rejects a non-empty list. */
export async function getAllGameOverrides(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_OVERRIDES_GET_ALL, [])
}

/** The wire field is `overrideData`: `override` is a reserved word in the generated Rust args struct. */
export async function setGameOverrides(
  deps: RustInvokeDeps,
  appName: string,
  override: MetadataOverride
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_OVERRIDES_SET, [
    { appName, overrideData: override }
  ])
}

export async function attachOverrides(
  deps: RustInvokeDeps,
  gameInfo: GameInfo
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_OVERRIDES_ATTACH, [{ gameInfo }])
}
