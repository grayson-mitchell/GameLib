/**
 * The sidecar's side of the Rust version gate for the two bottle-local versioned files (Phase 85,
 * D-17): `<bottle>/.gamelib-engine.json` and `<bottle>/gamelib-shared-redists.json`.
 *
 * Both carry a top-level numeric `version` and both chains are empty (current v1), so the gate never
 * migrates or rewrites anything. Rust (`store_version_gate`) decides one thing: whether the file was
 * written by a newer GameLib and so must not be overwritten (the Phase 68 refuse-newer rule). The
 * file's own readers and writers stay in TS. `store_backup_file` has Rust copy an unreadable ledger
 * aside (`<name>.v<from>.<stamp>.bak.json`, 0600, at most 3).
 *
 * Gate states, with the TS engine's parity for these two files:
 *   absent      no file                                         writable
 *   ok          version at or below the current one             writable
 *   unreadable  not a JSON object (TS never marked this read-only; the ledger backs itself up)
 *                                                               writable
 *   newer       version above the current one                   read-only, never rewritten
 *
 * The writers here are synchronous (`engineSwitch`'s marker writes) but the gate is a rustInvoke
 * round trip, so an async entry point primes the answer first and the synchronous code reads it back
 * with `state()`. The memo is an object the boot owns (`createBottleVersionGate`), not module state:
 * `moduleStateCensus` allows none. A write to a path nobody primed is refused, so a possibly-newer
 * file is never overwritten on a guess; reads never consult the gate because they never write.
 *
 * Nothing runs at import, and there are no timers or handles (sidecar exit contract).
 */
import {
  RUST_STORE_BACKUP_FILE,
  RUST_STORE_VERSION_GATE
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { logWarning, LogPrefix } from 'backend/logger'

/** The engine marker's chain key (`gamelib-store`'s `Chains` table). */
export const ENGINE_MARKER_CHAIN = 'engine/gamelib-engine-marker' as const

/** The shared-redist ledger's chain key. */
export const SHARED_REDIST_LEDGER_CHAIN = 'steam_bridge/shared-redists' as const

type BottleFileChain =
  | typeof ENGINE_MARKER_CHAIN
  | typeof SHARED_REDIST_LEDGER_CHAIN

/** The version both files are written at: the baseline, as both chains have no steps. */
export const BOTTLE_FILE_VERSION = 1

export type GateState = 'absent' | 'ok' | 'unreadable' | 'newer'

function isGateState(v: unknown): v is GateState {
  return v === 'absent' || v === 'ok' || v === 'unreadable' || v === 'newer'
}

/** Reads Rust's reply strictly: anything but a known state is "could not ask". */
function stateOf(reply: unknown): GateState | undefined {
  if (typeof reply !== 'object' || reply === null) return undefined
  const state = (reply as { state?: unknown }).state
  return isGateState(state) ? state : undefined
}

export interface BottleVersionGate {
  /**
   * Asks Rust about the file and remembers the answer for `state()`. Asked again on every call, so
   * a file a newer build replaced since the last call is noticed. Never rejects: when Rust cannot be
   * asked the memo for that path is dropped and the result is `undefined`, which `state()` reports
   * as unprimed (writes refused).
   */
  prime(
    deps: RustInvokeDeps,
    path: string,
    chain: BottleFileChain
  ): Promise<GateState | undefined>
  /** The last primed answer for `path`, or `undefined` when none (never primed, or Rust failed). */
  state(path: string): GateState | undefined
  /** Drops the memo for `path` (its bottle was deleted). */
  forget(path: string): void
}

export function createBottleVersionGate(): BottleVersionGate {
  const memo = new Map<string, GateState>()
  return {
    async prime(deps, path, chain) {
      try {
        const state = stateOf(
          await deps.requestRustInvoke(RUST_STORE_VERSION_GATE, [
            { path, chain }
          ])
        )
        if (state === undefined) {
          memo.delete(path)
          logWarning(
            'bottle version gate: unexpected reply from Rust; writes to that file are refused',
            LogPrefix.Backend
          )
          return undefined
        }
        memo.set(path, state)
        return state
      } catch (err) {
        memo.delete(path)
        logWarning(
          ['bottle version gate: Rust could not be asked', err],
          LogPrefix.Backend
        )
        return undefined
      }
    },
    state: (path) => memo.get(path),
    forget: (path) => {
      memo.delete(path)
    }
  }
}

/**
 * True when a write to a file whose gate answered `state` may go ahead: it is absent, current, or
 * unreadable. A `newer` file and a gate nobody asked are both refused.
 */
export function gateAllowsWrite(state: GateState | undefined): boolean {
  return state !== undefined && state !== 'newer'
}

/**
 * Has Rust copy the file at `path` aside before it is replaced (`<name>.v<fromVersion>.<stamp>.bak.json`
 * beside it). Resolves the backup's file name, or null when the file is gone. Rejects when the copy
 * could not be made, so a caller that must not discard the only copy can tell.
 */
export async function backupBottleFile(
  deps: RustInvokeDeps,
  path: string,
  fromVersion: number
): Promise<string | null> {
  const reply = await deps.requestRustInvoke(RUST_STORE_BACKUP_FILE, [
    { path, fromVersion }
  ])
  return typeof reply === 'string' ? reply : null
}
