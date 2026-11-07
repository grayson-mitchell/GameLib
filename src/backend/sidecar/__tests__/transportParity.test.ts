/**
 * D-12 / D-17: TS <-> Rust dispatch-arm parity, enforced from the jest lane (no cargo).
 *
 * The `// transport-mirror:` marker tests were retired by 67-03: the Rust transport constants and
 * the channel-name enum are now generated into `src-tauri/src/ipc_contract.rs` and kept fresh by
 * `pnpm check:ipc-contract`. The remaining test pins the string-literal arms of
 * `dispatch_rust_channel` to `RUST_INVOKE_CHANNELS`; it is retired by 67-11 when dispatch matches
 * on the generated enum (V67-F).
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { RUST_INVOKE_CHANNELS } from 'common/types/sidecarTransport'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const RUST_DIR = join(REPO_ROOT, 'src-tauri', 'src')

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

  it('dispatch_rust_channel arms equal RUST_INVOKE_CHANNELS', () => {
    const arms = extractDispatchArms(sources['store_embed.rs'])
    const rust = new Set(arms)
    const ts = new Set<string>(RUST_INVOKE_CHANNELS)
    expect([...ts].filter((c) => !rust.has(c))).toEqual([]) // missing in Rust
    expect([...rust].filter((c) => !ts.has(c))).toEqual([]) // missing in TS
    expect(arms.length).toBe(rust.size)
    expect(rust.size).toBe(ts.size)
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
