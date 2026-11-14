import { randomInt } from 'node:crypto'

interface LogonIdStore {
  get(key: 'cmLogonId'): number | undefined
  set(key: 'cmLogonId', value: number): void
}

function isValid(v: unknown): v is number {
  return (
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 4294967295
  )
}

/**
 * D-18: per-install non-zero logonID, generated once and persisted, so a TS and a Rust
 * session on one account never replace each other (eresult 34).
 * Exit contract: no timers, no handles.
 */
export function getOrCreateCmLogonId(configStore: LogonIdStore): number {
  const existing = configStore.get('cmLogonId')
  if (isValid(existing)) return existing
  const fresh = randomInt(1, 4294967296)
  configStore.set('cmLogonId', fresh)
  return fresh
}
