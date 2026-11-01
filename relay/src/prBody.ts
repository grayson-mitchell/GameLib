// PR / issue text for known-fix reports (D-13, D-20 marker).
// Inputs are validated key/op/appId/version plus Steam's canonical title,
// which only ever appears inside a code span (T-57-32).
import { KNOWN_FIX_REPORT_PAIRS } from '../../src/common/knownFixReport'

export const REPORT_MARKER_PREFIX = 'gamelib-report:'

export type BodyEntry = {
  key: 'macArch' | 'drm'
  op: 'add' | 'remove'
  detector: 'macho' | 'ceg'
  count: number
  firstSeen: number
  lastSeen: number
  lastVersion: string | null
}

const DETECTOR_LABEL: Record<BodyEntry['detector'], string> = {
  macho: 'post-install Mach-O check',
  ceg: 'PE CEG scan'
}

export function prTitle(
  appId: string,
  { key, op }: { key: 'macArch' | 'drm'; op: 'add' | 'remove' }
): string {
  if (op === 'remove') return `steam ${appId}: remove ${key}`
  return `steam ${appId}: add ${key} "${KNOWN_FIX_REPORT_PAIRS[key]}"`
}

export function issueTitle(appId: string): string {
  return `bundled-removal: steam ${appId} macArch "32"`
}

const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

function safeTitle(title: string): string {
  return title.replace(/`/g, "'").replace(/\s+/g, ' ').trim()
}

function entryLines(appId: string, e: BodyEntry): string[] {
  const value = KNOWN_FIX_REPORT_PAIRS[e.key]
  const change =
    e.op === 'remove'
      ? `Change: remove \`${e.key}\` from steam/${appId}-steam.json`
      : `Change: add \`${e.key}: "${value}"\` to steam/${appId}-steam.json`
  return [
    `Detected by GameLib ${e.lastVersion ?? 'unknown'} on macOS (${DETECTOR_LABEL[e.detector]})`,
    change,
    `Reports received: ${e.count} (first ${isoDate(e.firstSeen)}, latest ${isoDate(e.lastSeen)})`
  ]
}

export function renderPrBody(a: {
  appId: string
  title: string
  entries: BodyEntry[]
}): string {
  const lines: string[] = []
  lines.push(`Title from Steam: \`${safeTitle(a.title)}\``, '')
  for (const e of a.entries) lines.push(...entryLines(a.appId, e), '')
  lines.push('Review checklist:')
  lines.push('- [ ] the change matches what the detector reported')
  lines.push('- [ ] no other keys in the file were altered')
  lines.push('- [ ] the file name matches the app id', '')
  if (a.entries.some((e) => e.op === 'remove')) {
    lines.push(
      `Caveat: a bundled public/fixes/${a.appId}-steam.json shipped inside GameLib may carry the same entry; removing it here does not change the bundled copy.`,
      ''
    )
  }
  if (a.entries.some((e) => e.key === 'drm' && e.op === 'add')) {
    lines.push(
      `Caveat: a bundled public/fixes/${a.appId}-steam.json without drm shadows this remote file, because the whole file is replaced rather than merged.`,
      ''
    )
  }
  const marker = a.entries.map((e) => `${e.key}:${e.op}`).join(',')
  lines.push(`<!-- ${REPORT_MARKER_PREFIX} ${marker} -->`)
  return lines.join('\n') + '\n'
}

export function renderIssueBody(a: {
  appId: string
  title: string
  count: number
  lastVersion: string | null
}): string {
  return (
    [
      `GameLib ${a.lastVersion ?? 'unknown'} reported that \`macArch: "32"\` is wrong for steam ${a.appId} (\`${safeTitle(a.title)}\`), but the known-fixes repo has no such entry.`,
      '',
      `The entry is bundled only: it lives in public/fixes/${a.appId}-steam.json inside GameLib and needs a GameLib release to fix.`,
      '',
      `Reports received: ${a.count}`
    ].join('\n') + '\n'
  )
}

const MARKER_RE = /<!--\s*gamelib-report:\s*([^>]*?)\s*-->/g
const ITEM_RE = /^(macArch|drm):(add|remove)$/

export function parseReportMarker(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(MARKER_RE)) {
    for (const item of m[1].split(',').map((s) => s.trim())) {
      if (ITEM_RE.test(item) && !out.includes(item)) out.push(item)
    }
  }
  return out
}
