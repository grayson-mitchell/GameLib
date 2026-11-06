/**
 * D-12: TS <-> Rust transport constant parity, enforced from the jest lane (no cargo).
 *
 * The Rust shell mirrors a handful of constants from `common/types/sidecarTransport.ts`. Each Rust
 * mirror carries a `// transport-mirror: NAME` marker comment; this test finds them by marker across
 * every `src-tauri/src/*.rs`, so it survives the main.rs split. It also pins the string-literal arms
 * of `dispatch_rust_channel` to `RUST_INVOKE_CHANNELS`. (tauriShellSource.test.ts may overlap on the
 * arm set; D-12 owns parity, so it is asserted here too.)
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  FRONTEND_MESSAGE_EVENT,
  READY_SENTINEL,
  RUST_INVOKE_CHANNELS,
  RUST_INVOKE_KIND,
  SHELL_WINDOW_FOCUSED,
  STORE_SNAPSHOT_CHANNEL
} from 'common/types/sidecarTransport'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const RUST_DIR = join(REPO_ROOT, 'src-tauri', 'src')

const TS_VALUES: Record<string, string> = {
  READY_SENTINEL,
  FRONTEND_MESSAGE_EVENT,
  SHELL_WINDOW_FOCUSED,
  STORE_SNAPSHOT_CHANNEL,
  RUST_INVOKE_KIND
}

type Found = { name: string; value: string | undefined; file: string }

function extractMarkedConsts(sources: Record<string, string>): Found[] {
  const out: Found[] = []
  for (const [file, text] of Object.entries(sources)) {
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      const m = /^\s*\/\/ transport-mirror: (\w+)\s*$/.exec(line)
      if (!m) return
      const name = m[1]
      // The marker sits above the const (possibly with further comment lines in between) or above
      // the `"rustInvoke"` comparison: take the first following line holding a string literal.
      let value: string | undefined
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        if (/^\s*\/\//.test(lines[j])) continue
        const c = /const\s+\w+\s*:\s*&str\s*=\s*"([^"]*)"/.exec(lines[j])
        const s = /"([^"]*)"/.exec(lines[j])
        value = (c ?? s)?.[1]
        break
      }
      out.push({ name, value, file })
    })
  }
  return out
}

function extractDispatchArms(source: string): string[] {
  const fnAt = source.indexOf('fn dispatch_rust_channel')
  if (fnAt < 0) throw new Error('dispatch_rust_channel not found')
  const start = source.indexOf('match channel {', fnAt)
  if (start < 0) throw new Error('match channel { not found')
  let i = start + 'match channel {'.length
  let depth = 1
  let paren = 0
  let inBody = false
  let pending: string[] = []
  const arms: string[] = []
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 2
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let lit = ''
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\') {
          lit += source[j + 1]
          j += 2
          continue
        }
        lit += source[j++]
      }
      if (depth === 1 && paren === 0 && !inBody) pending.push(lit)
      i = j + 1
      continue
    }
    if (
      ch === '=' &&
      source[i + 1] === '>' &&
      depth === 1 &&
      paren === 0 &&
      !inBody
    ) {
      arms.push(...pending)
      pending = []
      inBody = true
      i += 2
      continue
    }
    if (ch === '(' || ch === '[') paren++
    else if (ch === ')' || ch === ']') paren--
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 1 && paren === 0) inBody = false
    } else if (ch === ',' && depth === 1 && paren === 0 && inBody) {
      inBody = false
    } else if (!inBody && depth === 1 && paren === 0 && !/[\s|]/.test(ch)) {
      // Not a string/`|`/whitespace: a non-literal pattern (e.g. `_`) or guard. Drop any pending.
      pending = []
    }
    i++
  }
  return arms
}

function readRustSources(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync(RUST_DIR).filter((n) => n.endsWith('.rs'))) {
    out[f] = readFileSync(join(RUST_DIR, f), 'utf8')
  }
  return out
}

describe('TS <-> Rust transport parity (D-12)', () => {
  const sources = readRustSources()

  it('finds each transport-mirror marker exactly once', () => {
    const found = extractMarkedConsts(sources).map((f) => f.name)
    expect([...found].sort()).toEqual(Object.keys(TS_VALUES).sort())
  })

  it('every marked Rust constant equals its TS export', () => {
    for (const f of extractMarkedConsts(sources)) {
      expect({ name: f.name, file: f.file, value: f.value }).toEqual({
        name: f.name,
        file: f.file,
        value: TS_VALUES[f.name]
      })
    }
  })

  it('dispatch_rust_channel arms equal RUST_INVOKE_CHANNELS', () => {
    const arms = extractDispatchArms(sources['store_embed.rs'])
    const rust = new Set(arms)
    const ts = new Set<string>(RUST_INVOKE_CHANNELS)
    expect([...ts].filter((c) => !rust.has(c))).toEqual([]) // missing in Rust
    expect([...rust].filter((c) => !ts.has(c))).toEqual([]) // missing in TS
    expect(arms.length).toBe(rust.size)
    expect(rust.size).toBe(ts.size)
  })

  it('near-miss: a drifted value in an in-memory snippet is reported', () => {
    const good =
      '// transport-mirror: READY_SENTINEL\nconst READY_SENTINEL: &str = "x";\n'
    const bad = good.replace('"x"', '"y"')
    const [g] = extractMarkedConsts({ 'a.rs': good })
    const [b] = extractMarkedConsts({ 'a.rs': bad })
    expect(g.value).toBe('x')
    expect(b.value).not.toBe(g.value)
  })

  it('near-miss: arm extractor handles or-patterns, block and expression bodies', () => {
    const snippet = `fn dispatch_rust_channel() { match channel {
      "a" | "b" => { foo("z"); Ok(()) }
      "c" => bar("q", 1),
      // "commented" => 1,
      _ => Err("nope"),
    } }`
    expect(extractDispatchArms(snippet)).toEqual(['a', 'b', 'c'])
  })
})
