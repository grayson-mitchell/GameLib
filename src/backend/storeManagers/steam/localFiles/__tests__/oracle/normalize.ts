import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

export const FIXTURES_TOKEN = '${FIXTURES}'

const REPO_ROOT = resolve(__dirname, '../../../../../../..')
export const FIXTURES_SRC = join(
  REPO_ROOT,
  'src-tauri/crates/gamelib-steamfiles/tests/fixtures'
)

function replaceBuffer(buf: Buffer, from: string, to: string): Buffer {
  const needle = Buffer.from(from)
  const out: Buffer[] = []
  let at = 0
  for (;;) {
    const i = buf.indexOf(needle, at)
    if (i < 0) break
    out.push(buf.subarray(at, i), Buffer.from(to))
    at = i + needle.length
  }
  if (out.length === 0) return buf
  out.push(buf.subarray(at))
  return Buffer.concat(out)
}

function copyTree(src: string, dst: string, root: string): void {
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    const s = join(src, name)
    const d = join(dst, name)
    if (statSync(s).isDirectory()) {
      copyTree(s, d, root)
    } else {
      let bytes: Buffer = readFileSync(s)
      // Only `.vdf` files carry the token; replaced at byte level so binary
      // shortcuts files and non-UTF-8 bytes are never re-encoded.
      if (name.endsWith('.vdf')) {
        bytes = replaceBuffer(bytes, FIXTURES_TOKEN, root)
      }
      writeFileSync(d, bytes)
    }
  }
}

/**
 * Copies `fixtures/<sub>` (or the whole tree for '') into an mkdtemp dir under
 * os.tmpdir(), resolves the `${FIXTURES}` token inside `.vdf` files to that
 * dir, runs `fn(root)` and removes the dir. Oracle code never touches the
 * committed fixtures or any real Steam path (T-75-06).
 */
export async function withFixtureCopy<T>(
  sub: string,
  fn: (root: string) => Promise<T> | T
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-steamfiles-oracle-'))
  try {
    copyTree(sub ? join(FIXTURES_SRC, sub) : FIXTURES_SRC, root, root)
    return await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * Fixtures on which `@node-steam/vdf` `parse` never returns (a truncated file:
 * EOF inside a block spins the tokenizer; found while capturing this oracle).
 * Any oracle path that would call `parse` on one records this marker instead of
 * running, so a hang in the TS reader can not hang the capture. `parseAcfTree`
 * and `parseKv1` are not affected. Paths are relative to the fixtures root.
 */
export const VDF_PARSE_HANGS = new Set([
  'acf/truncated.acf',
  'installscript/malformed.vdf',
  'scan/lib1/steamapps/appmanifest_30.acf'
])

export const HANGS_MARKER = {
  hangs: '@node-steam/vdf parse does not terminate on this input'
}

/** `run()` unless `rel` is a known parse-hang fixture (then the marker). */
export async function unlessHangs(
  rel: string,
  root: string,
  run: () => unknown
): Promise<unknown> {
  return VDF_PARSE_HANGS.has(rel) ? HANGS_MARKER : capture(run, root)
}

/** Runs fn and returns its value, or `{ throws: message }`. */
export async function capture(
  fn: () => unknown,
  root: string
): Promise<unknown> {
  try {
    return normalizeForGolden(await fn(), root)
  } catch (error) {
    return normalizeForGolden(
      { throws: error instanceof Error ? error.message : String(error) },
      root
    )
  }
}

function normalizeString(s: string, roots: string[]): string {
  let out = s
  for (const r of roots) out = out.split(r).join(FIXTURES_TOKEN)
  // Path-shaped values (start with the token) use `/` separators; backslashes
  // elsewhere are fixture data (escaped Windows paths) and are captured as is.
  return out.startsWith(FIXTURES_TOKEN) ? out.replace(/\\/g, '/') : out
}

/**
 * Turns an oracle result into a JSON-stable value: temp root -> `${FIXTURES}`,
 * Map -> sorted [key, value] pairs, Set -> sorted array, Date -> unix seconds,
 * Buffer -> lowercase hex, `undefined` members dropped. Numbers and booleans
 * stay exactly as the oracle produced them (coercion is what is captured).
 */
export function normalizeForGolden(
  value: unknown,
  fixturesRoot: string
): unknown {
  let real = fixturesRoot
  try {
    real = realpathSync(fixturesRoot)
  } catch {
    /* removed already */
  }
  const roots = [...new Set([fixturesRoot, real])].sort(
    (a, b) => b.length - a.length
  )
  const walk = (v: unknown): unknown => {
    if (v === undefined || v === null) return v ?? null
    if (typeof v === 'string') return normalizeString(v, roots)
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (typeof v === 'bigint') return v.toString()
    if (Buffer.isBuffer(v)) return v.toString('hex')
    if (v instanceof Date) return Math.floor(v.getTime() / 1000)
    if (v instanceof Map) {
      return [...v.entries()]
        .map(([k, val]) => [walk(k), walk(val)] as [unknown, unknown])
        .sort((a, b) => cmp(a[0], b[0]))
    }
    if (v instanceof Set) {
      return [...v.values()].map(walk).sort(cmp)
    }
    if (Array.isArray(v)) return v.map(walk)
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(v)) {
        const member = (v as Record<string, unknown>)[k]
        if (member === undefined) continue
        out[normalizeString(k, roots)] = walk(member)
      }
      return out
    }
    if (typeof v === 'symbol' || typeof v === 'function') return v.toString()
    throw new TypeError(
      `normalizeForGolden: unhandled value of type ${typeof v}`
    )
  }
  return walk(value)
}

function cmp(a: unknown, b: unknown): number {
  const x = JSON.stringify(a)
  const y = JSON.stringify(b)
  return x < y ? -1 : x > y ? 1 : 0
}

export function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isFile())
    .sort()
}
