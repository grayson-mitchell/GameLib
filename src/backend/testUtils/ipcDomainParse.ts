/**
 * Shared source parsing for the IPC census tests (Phase 62 census, extended in Phase 67).
 *
 * Lives outside `__tests__` so jest's `**\/__tests__/**\/*.test.ts` match never runs it.
 *
 * A domain file under `src/common/types/ipc/` declares channels in one of two forms, and
 * `parseDomainFile` reads both:
 *
 *   (a) legacy:     `export interface <Domain><Kind> { key: (...) => ... }`
 *   (b) conversion: `export const <domain><Kind>Args = { key: z.tuple([...]) }`
 *
 * NAMING CONTRACT (every conversion plan follows it): the const is `<domain><Kind>Args`, and the
 * derived part name is the const name minus `Args` with its first letter upper-cased
 * (`shellFilesSyncArgs` -> `ShellFilesSync`), so it matches the type name `ipc/index.ts`
 * intersects. Keys are 2-space-indented `key:` or `'quoted-key':` lines.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export const KINDS = ['Sync', 'TestSync', 'Async', 'FrontendMessages'] as const
export type Kind = (typeof KINDS)[number]

// TestSync must be tested before Sync: `FooTestSync` also ends in `Sync`.
const DETECT_ORDER: readonly Kind[] = [
  'TestSync',
  'FrontendMessages',
  'Async',
  'Sync'
]

export interface DomainPart {
  name: string
  kind: Kind
  keys: string[]
}

const BACKEND_DIR = join(__dirname, '..')
export const IPC_DIR = join(BACKEND_DIR, '..', 'common', 'types', 'ipc')
const TRANSPORT = join(
  BACKEND_DIR,
  '..',
  'common',
  'types',
  'sidecarTransport.ts'
)

/** A capture group that the pattern guarantees on every match; throws if the pattern ever stops doing so. */
function group(m: RegExpExecArray | RegExpMatchArray, i: number): string {
  const g = m[i]
  if (g === undefined) {
    throw new Error(`regex capture group ${i} missing in match of ${m[0]}`)
  }
  return g
}

function memberKeys(body: string): string[] {
  const keys: string[] = []
  for (const line of body.split('\n')) {
    const k = /^ {2}('[^']+'|[A-Za-z_]\w*)\??:/.exec(line)
    if (k) keys.push(group(k, 1).replace(/'/g, ''))
  }
  return keys
}

/** Parts declared in a domain file, in either the interface or the const-args form. */
export function parseDomainFile(source: string): DomainPart[] {
  const parts: DomainPart[] = []
  const iface = /^export interface (\w+) \{\n([\s\S]*?)^\}/gm
  let m: RegExpExecArray | null
  while ((m = iface.exec(source))) {
    const name = group(m, 1)
    const kind = DETECT_ORDER.find((k) => name.endsWith(k))
    if (!kind) continue
    parts.push({ name, kind, keys: memberKeys(group(m, 2)) })
  }
  const konst = /^export const (\w+)Args = \{\n([\s\S]*?)^\}/gm
  while ((m = konst.exec(source))) {
    const base = group(m, 1)
    const name = base.charAt(0).toUpperCase() + base.slice(1)
    const kind = DETECT_ORDER.find((k) => name.endsWith(k))
    if (!kind) continue
    parts.push({ name, kind, keys: memberKeys(group(m, 2)) })
  }
  return parts
}

export function sharedConstants(): Record<string, string> {
  const out: Record<string, string> = {}
  const src = readFileSync(TRANSPORT, 'utf-8')
  for (const m of src.matchAll(/export const ([A-Z][A-Z0-9_]*) = '([^']+)'/g)) {
    out[group(m, 1)] = group(m, 2)
  }
  return out
}

export function domainSources(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync(IPC_DIR).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts'
  )) {
    out[f.replace(/\.ts$/, '')] = readFileSync(join(IPC_DIR, f), 'utf-8')
  }
  return out
}
