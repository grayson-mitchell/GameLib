/**
 * Phase 85 (D-17): a jest-mock-free fake of the two bottle-file rustInvoke channels
 * (`store_version_gate`, `store_backup_file`), so a test of the engine launch or the shared-redist
 * installer can drive them end to end without the Rust shell.
 *
 * `store_version_gate` answers from the real file at the path the way `gamelib-store`'s
 * `version_gate` does: no file is `absent`, bytes that are not a JSON object are `unreadable`, a
 * top-level `version` that is a non-negative integer above 1 is `newer`, everything else is `ok`
 * (a missing or invalid version reads as 0). `answer` forces one state for every path instead, for
 * a test that wants `newer` without writing a file. `store_backup_file` copies the file to
 * `<name>.v<from>.<stamp>.bak.json` beside it (0600) and replies the new file name, or null when
 * the file is absent; the cap of three and the skip-when-equal rule are the crate's and are proven
 * there, not here. Every other channel goes to `base`, or rejects. All state lives in the returned
 * closure.
 */
import { copyFileSync, existsSync, readFileSync, chmodSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { RequestRustInvoke } from 'backend/host'
import {
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_STORE_BACKUP_FILE,
  RUST_STORE_VERSION_GATE
} from 'common/types/sidecarTransport'
import type { GateState } from 'backend/stores/bottleVersionGate'

export interface FakeBottleGateOptions {
  /** Force this state for every path instead of reading the file. */
  answer?: GateState
  /** `store_version_gate` rejects. */
  rejectGate?: boolean
  /** `store_backup_file` rejects (the copy could not be made). */
  rejectBackup?: boolean
  /** Answers every channel that is not a bottle-file channel. */
  base?: RequestRustInvoke
}

export interface FakeBottleGateCall {
  channel: string
  args: unknown[]
}

const CURRENT = 1

function stateOfFile(path: string): GateState {
  if (!existsSync(path)) return 'absent'
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return 'unreadable'
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return 'unreadable'
  }
  const v = (doc as { version?: unknown }).version
  const version = typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
  return version > CURRENT ? 'newer' : 'ok'
}

export function createFakeBottleGateRust(options: FakeBottleGateOptions = {}): {
  requestRustInvoke: RequestRustInvoke
  calls: FakeBottleGateCall[]
  /** The `store_backup_file` calls, in order. */
  backups: { path: string; fromVersion: number }[]
} {
  const calls: FakeBottleGateCall[] = []
  const backups: { path: string; fromVersion: number }[] = []
  let seq = 0
  const requestRustInvoke: RequestRustInvoke = (channel, args) => {
    const list = args as unknown as unknown[]
    calls.push({ channel, args: list })
    if (channel === RUST_STORE_VERSION_GATE) {
      if (options.rejectGate) {
        return Promise.reject(new Error(`fake rustInvoke rejected: ${channel}`))
      }
      const { path } = list[0] as { path: string }
      const state = options.answer ?? stateOfFile(path)
      return Promise.resolve({ state, version: 0, current: CURRENT })
    }
    if (channel === RUST_STORE_BACKUP_FILE) {
      if (options.rejectBackup) {
        return Promise.reject(new Error(`fake rustInvoke rejected: ${channel}`))
      }
      const { path, fromVersion } = list[0] as {
        path: string
        fromVersion: number
      }
      backups.push({ path, fromVersion })
      if (!existsSync(path)) return Promise.resolve(null)
      const name = basename(path, '.json')
      seq += 1
      const file = `${name}.v${fromVersion}.${String(seq).padStart(9, '0')}.bak.json`
      const target = join(dirname(path), file)
      copyFileSync(path, target)
      chmodSync(target, 0o600)
      return Promise.resolve(file)
    }
    // 87-42: the running-games ledger and selection clear are Rust's; with no `base` they answer what an empty Rust
    // state would (`engine_ledger_mark_running` records, the other two have nothing to drop).
    if (!options.base) {
      if (channel === RUST_ENGINE_LEDGER_MARK_RUNNING) {
        return Promise.resolve(true)
      }
      if (channel === RUST_ENGINE_LEDGER_MARK_STOPPED) {
        return Promise.resolve(null)
      }
      if (channel === RUST_ENGINE_SELECTION_CLEAR) {
        return Promise.resolve(false)
      }
    }
    return options.base
      ? options.base(channel, args)
      : Promise.reject(
          new Error(`fakeBottleGateRust: unexpected channel ${channel}`)
        )
  }
  return { requestRustInvoke, calls, backups }
}
