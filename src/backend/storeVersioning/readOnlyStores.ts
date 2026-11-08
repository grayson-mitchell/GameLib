/**
 * Aggregate of stores that are read-only this process (Phase 68, D-03/D-05/D-06/D-07).
 * No logger import (module-init cycle): the log and send sinks are injected by the
 * caller (`flushReadOnlyStores`), which already owns the logger and the IPC layer.
 * Creates no timer or handle (sidecar exit contract).
 */

import type { StoreReadOnlyReason } from './types'
import type {
  ReadOnlyArea,
  ReadOnlyStoresNoticePayload
} from '../../common/types/readOnlyStores'

export type ReadOnlyEntry = {
  storeKey: string
  file: string
  reason: StoreReadOnlyReason
  detail: string
}

type Sinks = {
  send: (payload: ReadOnlyStoresNoticePayload) => void
  log: (line: string) => void
}

const entries: ReadOnlyEntry[] = []
let sinks: Sinks | undefined

const AREA_BY_KEY: Record<string, ReadOnlyArea> = {
  'store_cache/steam_library': 'steam-library',
  'store_cache/gog_library': 'gog-library',
  'gog_store/installed': 'gog-library',
  'store_cache/legendary_library': 'epic-library',
  'store_cache/nile_library': 'amazon-library',
  'sideload_apps/library': 'sideload-library',
  'steam_store/config': 'steam-account',
  'gog_store/config': 'gog-account',
  'legendary_store/config': 'epic-account',
  'nile_store/config': 'amazon-account',
  'humble_store/config': 'humble',
  'store/download-manager': 'downloads',
  'store/timestamp': 'play-history',
  'gog_store/saveTimestamps': 'play-history',
  'store_cache/gog_playtime_sync_queue': 'play-history',
  'store/config': 'preferences',
  'settings/global': 'settings',
  'settings/game': 'game-settings'
}

export function areaForStoreKey(storeKey: string): ReadOnlyArea {
  const mapped = AREA_BY_KEY[storeKey]
  if (mapped) return mapped
  if (storeKey.startsWith('store_cache/humble_')) return 'humble'
  return 'app-data'
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

export function recordReadOnly(entry: ReadOnlyEntry): void {
  const id = `${entry.storeKey}:${entry.file}`
  if (entries.some((e) => `${e.storeKey}:${e.file}` === id)) return
  const copy = { ...entry }
  entries.push(copy)
  if (sinks) {
    logEntry(copy)
    publish()
  }
}

export function listReadOnly(): readonly ReadOnlyEntry[] {
  return entries
}

/**
 * Once-per-launch delivery: logs one line per read-only store and sends one ids-only
 * payload. After this call, later `recordReadOnly` entries re-publish the full list.
 */
export function flushReadOnlyStores(newSinks: Sinks): void {
  sinks = newSinks
  for (const e of entries) logEntry(e)
  publish()
}

export function __resetReadOnlyForTest(): void {
  entries.length = 0
  sinks = undefined
}
