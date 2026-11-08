/**
 * Aggregate of stores that are read-only this process (Phase 68, D-03/D-06).
 * No logger import (module-init cycle) and no IPC: a later plan publishes it.
 */

import type { StoreReadOnlyReason } from './types'

export type ReadOnlyEntry = {
  storeKey: string
  file: string
  reason: StoreReadOnlyReason
  detail: string
}

const entries: ReadOnlyEntry[] = []

export function recordReadOnly(entry: ReadOnlyEntry): void {
  const id = `${entry.storeKey}:${entry.file}`
  if (entries.some((e) => `${e.storeKey}:${e.file}` === id)) return
  entries.push({ ...entry })
}

export function listReadOnly(): readonly ReadOnlyEntry[] {
  return entries
}

export function __resetReadOnlyForTest(): void {
  entries.length = 0
}
