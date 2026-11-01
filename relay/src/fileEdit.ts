// Pure fix-file edit rules for the relay (D-05, D-07, D-08, D-11).
// Never throws: parse/decode failures are returned as `skipped`.
import type { KnownFixReportKey } from '../../src/common/knownFixReport'

type FixFile = Record<string, unknown>

export function fixFilePath(appId: string): string {
  return `steam/${appId}-steam.json`
}

export function serializeFixFile(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2) + '\n'
}

/** GitHub returns base64 wrapped with newlines; decode as strict UTF-8. */
export function decodeGitHubContent(b64: string): string {
  const bin = atob(b64.replace(/[\r\n]/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function encodeGitHubContent(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function parseObject(text: string): FixFile | null {
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      return v as FixFile
    }
    return null
  } catch {
    return null
  }
}

export type AddPlan =
  | { kind: 'create' | 'update'; text: string }
  | { kind: 'already-known' }
  | { kind: 'skipped'; reason: string }

export function planAdd(
  existingText: string | null,
  key: KnownFixReportKey,
  value: string,
  canonicalTitle: string
): AddPlan {
  if (existingText === null) {
    return {
      kind: 'create',
      text: serializeFixFile({ title: canonicalTitle, [key]: value })
    }
  }
  const existing = parseObject(existingText)
  if (!existing) {
    return { kind: 'skipped', reason: 'existing file is not a JSON object' }
  }
  if (existing[key] === value) return { kind: 'already-known' }
  // Spread keeps key order; assigning an existing key keeps its position.
  const next: FixFile =
    'title' in existing
      ? { ...existing }
      : { title: canonicalTitle, ...existing }
  next[key] = value
  return { kind: 'update', text: serializeFixFile(next) }
}

export type RemovePlan =
  | { kind: 'update'; text: string }
  | { kind: 'delete' }
  | { kind: 'not-in-repo' }
  | { kind: 'skipped'; reason: string }

export function planRemove(existingText: string | null): RemovePlan {
  if (existingText === null) return { kind: 'not-in-repo' }
  const existing = parseObject(existingText)
  if (!existing) {
    return { kind: 'skipped', reason: 'existing file is not a JSON object' }
  }
  if (existing.macArch !== '32') return { kind: 'not-in-repo' }
  const rest: FixFile = { ...existing }
  delete rest.macArch
  const onlyMeta = Object.keys(rest).every(
    (k) => k === 'title' || k === 'notes'
  )
  if (onlyMeta) return { kind: 'delete' }
  return { kind: 'update', text: serializeFixFile(rest) }
}
