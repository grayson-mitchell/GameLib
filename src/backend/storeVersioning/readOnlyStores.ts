/**
 * Aggregate of stores that are read-only this process (Phase 68, D-03/D-05/D-06/D-07).
 * No logger import (module-init cycle): the log and send sinks are injected by the
 * caller (`flushReadOnlyStores`), which already owns the logger and the IPC layer.
 * Creates no timer or handle (sidecar exit contract).
 */

import type { StoreReadOnlyReason } from './types'
import {
  READ_ONLY_AREAS,
  type ReadOnlyArea,
  type ReadOnlyStoresNoticePayload
} from '../../common/types/readOnlyStores'
import storeChannels from '../../common/types/ipc/storeChannels.json'

type ReadOnlyEntry = {
  storeKey: string
  file: string
  reason: StoreReadOnlyReason
  detail: string
}

export type Sinks = {
  send: (payload: ReadOnlyStoresNoticePayload) => void
  log: (line: string) => void
}

/**
 * The area of each store key, read from `storeChannels.json` (`readOnlyAreas`), the file the Rust
 * shell's `store_policy.rs` reads too (85-16), so both sides name the same area for a store: an
 * exact key, else the first matching prefix (`store_cache/humble_`, and `GamesConfig/` since the
 * shell reports a per-game document by its own key, 85-15), else the fallback (`app-data`).
 */
const READ_ONLY_AREA_MAP = storeChannels.readOnlyAreas

/** A value from the JSON narrowed to the closed set; anything else falls back to `app-data`. */
function asArea(value: string): ReadOnlyArea {
  return (READ_ONLY_AREAS as readonly string[]).includes(value)
    ? (value as ReadOnlyArea)
    : 'app-data'
}

export function areaForStoreKey(storeKey: string): ReadOnlyArea {
  const byKey: Readonly<Record<string, string>> = READ_ONLY_AREA_MAP.byKey
  if (Object.prototype.hasOwnProperty.call(byKey, storeKey)) {
    return asArea(byKey[storeKey] ?? READ_ONLY_AREA_MAP.fallback)
  }
  const prefixed = READ_ONLY_AREA_MAP.byPrefix.find((p) =>
    storeKey.startsWith(p.prefix)
  )
  return asArea(prefixed ? prefixed.area : READ_ONLY_AREA_MAP.fallback)
}

function stderrFailure(what: string, error: unknown): void {
  try {
    process.stderr.write(
      `[storeVersion] read-only ${what} failed: ${error instanceof Error ? error.message : String(error)}\n`
    )
  } catch {
    // nothing left to do
  }
}

export interface ReadOnlyStores {
  record(entry: ReadOnlyEntry): void
  list(): readonly ReadOnlyEntry[]
  /**
   * Once-per-launch delivery: logs one line per read-only store and sends one ids-only
   * payload. After this call, later `record` entries re-publish the full list.
   */
  flush(newSinks: Sinks): void
}

/**
 * Read-only tracking for one store root (66.4 plan 18). Entries and sinks live in this closure,
 * so two roots never report each other's stores. `deps.sinks` is the construction-time sink
 * (tests); production leaves it unset and `flush` installs the real one at frontendReady.
 */
export function createReadOnlyStores(deps?: { sinks?: Sinks }): ReadOnlyStores {
  const entries: ReadOnlyEntry[] = []
  let sinks: Sinks | undefined = deps?.sinks

  function buildPayload(): ReadOnlyStoresNoticePayload {
    const seen = new Set<string>()
    const out: ReadOnlyStoresNoticePayload['entries'] = []
    for (const e of entries) {
      const area = areaForStoreKey(e.storeKey)
      const id = `${area}:${e.reason}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ area, reason: e.reason })
    }
    return { entries: out }
  }

  function logEntry(entry: ReadOnlyEntry): void {
    if (!sinks) return
    try {
      sinks.log(
        `[storeVersion] ${entry.storeKey} (${entry.file}) is read-only: ${entry.reason} - ${entry.detail}`
      )
    } catch (error) {
      stderrFailure('log', error)
    }
  }

  function publish(): void {
    if (!sinks || entries.length === 0) return
    try {
      sinks.send(buildPayload())
    } catch (error) {
      stderrFailure('send', error)
    }
  }

  return {
    record(entry) {
      const id = `${entry.storeKey}:${entry.file}`
      if (entries.some((e) => `${e.storeKey}:${e.file}` === id)) return
      const copy = { ...entry }
      entries.push(copy)
      if (sinks) {
        logEntry(copy)
        publish()
      }
    },
    list: () => entries,
    flush(newSinks) {
      sinks = newSinks
      for (const e of entries) logEntry(e)
      publish()
    }
  }
}
