// Pure fix-file edit rules for the relay (D-05, D-07, D-08, D-11).
// The plan functions never throw: unparsable text is returned as `skipped`.
// decodeGitHubContent is strict and throws; githubFiles.getFile maps a decode
// failure to unparsable text, so it also ends as `skipped` (WR-08).
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

type NoteInput = { gamelibVersion: string; firstSeen: number }

const NOTE_REASON: Record<KnownFixReportKey, string> = {
  macArch:
    'The macOS build is 32-bit only (i386); Apple silicon cannot run it, so GameLib installs the Windows build.',
  drm: "The Windows build's executable is a Steam CEG executable. CEG needs a genuine Windows Steam client, so GameLib routes this title to bottled Steam before any download."
}

const NOTE_DETECTOR: Record<KnownFixReportKey, string> = {
  macArch: 'post-install Mach-O check',
  drm: 'PE CEG scan'
}

/**
 * WR-01 (D-14): the client-sent version is free text within the schema's
 * charset, so it reaches a committed file only when it has a release shape
 * (`1.2.3`, or `1.2.3-beta.1` with a fixed pre-release word); anything else,
 * such as `1.2.3-evil.example`, is never written.
 */
const RELEASE_VERSION_RE =
  /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:alpha|beta|rc|dev)(?:\.\d{1,4})?)?$/

export function releaseVersion(v: string | null | undefined): string | null {
  return typeof v === 'string' && RELEASE_VERSION_RE.test(v) ? v : null
}

/**
 * The `notes.<key>` text, matching the hand-written seeds. Built only from
 * fixed strings, a release-shaped version (WR-01) and a date, never client text.
 */
export function reportNote(key: KnownFixReportKey, input: NoteInput): string {
  const date = new Date(input.firstSeen).toISOString().slice(0, 10)
  const version = releaseVersion(input.gamelibVersion)
  const who = version ? `GameLib ${version}'s` : `an unknown GameLib version's`
  return `${NOTE_REASON[key]} Reported by ${who} ${NOTE_DETECTOR[key]} through the known-fix relay, first received ${date}.`
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function planAdd(
  existingText: string | null,
  key: KnownFixReportKey,
  value: string,
  canonicalTitle: string,
  note: NoteInput
): AddPlan {
  const noteText = reportNote(key, note)
  if (existingText === null) {
    return {
      kind: 'create',
      text: serializeFixFile({
        title: canonicalTitle,
        [key]: value,
        notes: { [key]: noteText }
      })
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
  // A hand-written note for this key wins; a non-object `notes` is left alone.
  if (!('notes' in next)) {
    next.notes = { [key]: noteText }
  } else if (isPlainObject(next.notes) && !(key in next.notes)) {
    const notes = next.notes
    delete next.notes
    next.notes = { ...notes, [key]: noteText }
  }
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
  if (isPlainObject(rest.notes) && 'macArch' in rest.notes) {
    const notes = { ...rest.notes }
    delete notes.macArch
    if (Object.keys(notes).length === 0) delete rest.notes
    else rest.notes = notes
  }
  const onlyMeta = Object.keys(rest).every(
    (k) => k === 'title' || k === 'notes'
  )
  if (onlyMeta) return { kind: 'delete' }
  return { kind: 'update', text: serializeFixFile(rest) }
}
