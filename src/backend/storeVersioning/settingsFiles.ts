/**
 * Settings files (config.json, GamesConfig/<app>.json) on the store engine
 * (Phase 68, D-10). They carry a top-level `version: 'vN'` string; absent or
 * unparseable means v0. No `backend/logger` import: config.ts and
 * game_config.ts import this module and the logger imports them (cycle).
 */
import { atomicWritePrivate } from './backup'
import { isReadOnlyPath, noteRefusedWrite, prepareStoreFile } from './engine'
import type { VersionCodec } from './types'

export function parseSettingsVersion(raw: unknown): number {
  if (typeof raw !== 'string') return 0
  const match = /^v(\d+)(\.\d+)?$/.exec(raw)
  return match?.[1] ? Number(match[1]) : 0
}

export const settingsVersionCodec: VersionCodec = {
  read: (data) => parseSettingsVersion(data['version']),
  write: (data, version) => ({ ...data, version: `v${version}` })
}

export function ensureSettingsMigrated(
  path: string,
  chainKey: 'settings/global' | 'settings/game'
): void {
  prepareStoreFile(path, chainKey, { kind: 'user-state' }, settingsVersionCodec)
}

export function isSettingsFileReadOnly(path: string): boolean {
  return isReadOnlyPath(path)
}

/** Atomic, private write; refused (without throwing) for a read-only file. */
export function writeSettingsFile(
  path: string,
  data: Record<string, unknown>
): void {
  if (isReadOnlyPath(path)) {
    noteRefusedWrite(path)
    return
  }
  atomicWritePrivate(path, JSON.stringify(data, null, 2))
}
