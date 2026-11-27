/**
 * Offline dev tool: translates the declarative subset of umu-protonfixes
 * `gamefixes-steam/*.py` into candidate GameLib local fix files for Mac
 * testing. Todo: `.planning/todos/pending/2026-10-29-protonfixes-import-dev-tool.md`
 * (quick 261127-vy3).
 *
 * Run with:
 *
 *   pnpm import-protonfixes --source <checkout> --out <dir>
 *     [--source-rev <sha>] [--source-url <url>] [--only <appId,appId>]
 *     [--overwrite]
 *
 * Offline and data-only. The checkout is untrusted third-party Python: this
 * tool only reads it as text. It never executes the Python, spawns nothing and
 * fetches nothing. It parses with a small hand-written tokenizer and only ever
 * extracts a statement that is exactly one declarative helper call with
 * literal arguments. Anything else (conditionals, loops, try/with blocks,
 * assignments, custom functions, non-literal arguments) is reported as
 * unmapped and never extracted.
 *
 * Translation table (protonfixes `util.py` helper -> GameLib key, tier):
 *
 *   protontricks     -> winetricks     (1)
 *   set_environment  -> envVariables   (1)
 *   append_argument  -> launchArgs     (1)
 *   replace_command  -> exeOverride    (1)
 *   winedll_override -> dllOverrides   (2)
 *   regedit_add      -> registry       (2)
 *
 * disable_esync, disable_fsync and disable_nvapi are not applicable on macOS
 * and are recorded as such. Output: `<out>/fixes/<appId>-steam.json` (tier 1),
 * `<out>/fixes/<appId>-steam.profile.json` (tier 2) and `<out>/report.json`.
 *
 * Attribution. umu-protonfixes is BSD-2-Clause. The tool refuses to run when
 * the checkout has no BSD-2-Clause licence file, and every emitted file
 * carries the upstream path, the pinned revision, the upstream copyright
 * line(s) and the full licence text in `notes`.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { KnowFixesInfo, KnownFixProfile } from '../src/common/types'

const TOOL_NAME = 'importProtonfixes'
const DEFAULT_SOURCE_URL =
  'https://github.com/Open-Wine-Components/umu-protonfixes'
const FIX_DIR = 'gamefixes-steam'
const MAX_FILE_BYTES = 256 * 1024

// ---------------------------------------------------------------------------
// Allow-lists. Mirrors TIER1_KNOWN_FIX_KEYS / TIER2_PROFILE_KEYS in
// src-tauri/crates/gamelib-knownfix/src/types.rs; a test pins the drift.
// Only the keys this importer can emit are listed.
// ---------------------------------------------------------------------------

const TIER1_EMIT_KEYS = [
  'title',
  'notes',
  'winetricks',
  'envVariables',
  'launchArgs',
  'exeOverride'
] as const
const TIER2_EMIT_KEYS = [
  'title',
  'notes',
  'evidence',
  'registry',
  'dllOverrides'
] as const

// ---------------------------------------------------------------------------
// Python tokenizer
// ---------------------------------------------------------------------------

export class PythonParseError extends Error {}

export interface Token {
  kind: 'name' | 'number' | 'string' | 'op'
  text: string
  /** Decoded value of a string token. */
  value?: string
  /** False for f-strings, byte strings and `\N{...}` strings. */
  literal?: boolean
  /** The integer value of a number token, or null when it is not an int. */
  int?: number | null
  /** Physical source line the token starts on (1-based). */
  line: number
}

export interface LogicalLine {
  indent: number
  tokens: Token[]
  /** Physical line the logical line starts on (1-based). */
  line: number
}

const STRING_PREFIXES = new Set(['r', 'u', 'b', 'f', 'br', 'rb', 'fr', 'rf'])
const OPS3 = new Set(['**=', '//=', '>>=', '<<=', '...'])
const OPS2 = new Set([
  '->',
  '==',
  '!=',
  '<=',
  '>=',
  '**',
  '//',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '<<',
  '>>',
  ':=',
  '|=',
  '&=',
  '^=',
  '@='
])
const OPS1 = new Set('()[]{}:,.;=+-*/%<>|&^~@'.split(''))

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= '0' && c <= '9'
const isHex = (c: string | undefined): boolean =>
  c !== undefined && /^[0-9a-fA-F]$/.test(c)
const isNameStart = (c: string | undefined): boolean =>
  c !== undefined && (/^[A-Za-z_]$/.test(c) || c.charCodeAt(0) > 127)
const isNameChar = (c: string | undefined): boolean =>
  isNameStart(c) || isDigit(c)

/**
 * Linear, single-pass tokenizer for the subset of Python 3 the fix files use.
 * Handles comments, backslash and bracket line joining, tab-aware indentation,
 * every string prefix and escape, and number forms. Never backtracks. Throws
 * `PythonParseError` on an unterminated string, unbalanced brackets or a
 * character Python would reject.
 */
export function tokenizePython(source: string): LogicalLine[] {
  const src = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const n = src.length
  const out: LogicalLine[] = []
  let i = 0
  let line = 1
  let depth = 0
  let tokens: Token[] = []
  let indent = 0
  let lineStart = 1
  let atStart = true

  const fail: (message: string) => never = (message) => {
    throw new PythonParseError(`line ${line}: ${message}`)
  }
  const consumeNewline = (): void => {
    if (src[i] === '\r' && src[i + 1] === '\n') i += 2
    else i += 1
    line += 1
  }
  const skipComment = (): void => {
    while (i < n && src[i] !== '\n' && src[i] !== '\r') i += 1
  }

  const readString = (prefix: string): Token => {
    const startLine = line
    const q = src[i]
    const triple = src[i + 1] === q && src[i + 2] === q
    i += triple ? 3 : 1
    const raw = /r/i.test(prefix)
    let literal = !/[fb]/i.test(prefix)
    let value = ''
    for (;;) {
      if (i >= n) fail('unterminated string')
      const ch = src[i]
      if (ch === q) {
        if (!triple) {
          i += 1
          break
        }
        if (src[i + 1] === q && src[i + 2] === q) {
          i += 3
          break
        }
        value += ch
        i += 1
        continue
      }
      if (ch === '\n' || ch === '\r') {
        if (!triple) fail('unterminated string')
        consumeNewline()
        value += '\n'
        continue
      }
      if (ch !== '\\') {
        value += ch
        i += 1
        continue
      }
      const next = src[i + 1]
      if (next === undefined) fail('unterminated string')
      if (next === '\n' || next === '\r') {
        // backslash-newline: a continuation in a normal string, kept in a raw one
        i += 1
        consumeNewline()
        if (raw) value += '\\\n'
        continue
      }
      if (raw) {
        value += '\\' + next
        i += 2
        continue
      }
      switch (next) {
        case '\\':
        case "'":
        case '"':
          value += next
          i += 2
          break
        case 'n':
          value += '\n'
          i += 2
          break
        case 't':
          value += '\t'
          i += 2
          break
        case 'r':
          value += '\r'
          i += 2
          break
        case 'a':
          value += '\u0007'
          i += 2
          break
        case 'b':
          value += '\b'
          i += 2
          break
        case 'f':
          value += '\f'
          i += 2
          break
        case 'v':
          value += '\v'
          i += 2
          break
        case 'x':
        case 'u':
        case 'U': {
          const width = next === 'x' ? 2 : next === 'u' ? 4 : 8
          const digits = src.slice(i + 2, i + 2 + width)
          if (digits.length !== width || ![...digits].every(isHex))
            fail('truncated escape')
          const code = parseInt(digits, 16)
          if (code > 0x10ffff) fail('illegal escape')
          value += String.fromCodePoint(code)
          i += 2 + width
          break
        }
        case 'N': {
          if (src[i + 2] !== '{') fail('malformed \\N escape')
          const close = src.indexOf('}', i + 3)
          if (close < 0) fail('malformed \\N escape')
          literal = false
          i = close + 1
          break
        }
        default:
          if (/^[0-7]$/.test(next)) {
            let j = i + 1
            let digits = ''
            while (digits.length < 3 && /^[0-7]$/.test(src[j] ?? '')) {
              digits += src[j] ?? ''
              j += 1
            }
            value += String.fromCharCode(parseInt(digits, 8))
            i = j
          } else {
            // an unknown escape keeps its backslash, as Python does
            value += '\\' + next
            i += 2
          }
      }
    }
    return { kind: 'string', text: '<string>', value, literal, line: startLine }
  }

  const readNumber = (): Token => {
    const start = i
    const tokenLine = line
    let int: number | null = null
    if (src[i] === '0' && /[xXoObB]/.test(src[i + 1] ?? '')) {
      const base = { x: 16, o: 8, b: 2 }[(src[i + 1] ?? '').toLowerCase()] ?? 10
      i += 2
      while (i < n && /[0-9a-fA-F_]/.test(src[i] ?? '')) i += 1
      const digits = src.slice(start + 2, i).replace(/_/g, '')
      const value = digits === '' ? NaN : parseInt(digits, base)
      const valid =
        digits !== '' &&
        [...digits].every((d) => !Number.isNaN(parseInt(d, base)))
      int = valid && Number.isSafeInteger(value) ? value : null
    } else {
      let isInt = true
      while (i < n && (isDigit(src[i]) || src[i] === '_')) i += 1
      if (src[i] === '.') {
        isInt = false
        i += 1
        while (i < n && (isDigit(src[i]) || src[i] === '_')) i += 1
      }
      if (
        /[eE]/.test(src[i] ?? '') &&
        (isDigit(src[i + 1]) ||
          (/[+-]/.test(src[i + 1] ?? '') && isDigit(src[i + 2])))
      ) {
        isInt = false
        i += 2
        while (i < n && isDigit(src[i])) i += 1
      }
      if (/[jJ]/.test(src[i] ?? '')) {
        isInt = false
        i += 1
      }
      const value = Number(src.slice(start, i).replace(/_/g, ''))
      int = isInt && Number.isSafeInteger(value) ? value : null
    }
    return {
      kind: 'number',
      text: src.slice(start, i),
      int,
      line: tokenLine
    }
  }

  while (i < n) {
    if (atStart && depth === 0) {
      let width = 0
      while (i < n) {
        const c = src[i]
        if (c === ' ') width += 1
        else if (c === '\t') width = (Math.floor(width / 8) + 1) * 8
        else if (c === '\f') width = 0
        else break
        i += 1
      }
      if (i >= n) break
      const c = src[i]
      if (c === '#') {
        skipComment()
        continue
      }
      if (c === '\n' || c === '\r') {
        consumeNewline()
        continue
      }
      indent = width
      lineStart = line
      atStart = false
      tokens = []
    }

    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\f') {
      i += 1
      continue
    }
    if (c === '#') {
      skipComment()
      continue
    }
    if (c === '\n' || c === '\r') {
      consumeNewline()
      if (depth === 0) {
        if (tokens.length > 0) out.push({ indent, tokens, line: lineStart })
        tokens = []
        atStart = true
      }
      continue
    }
    if (c === '\\') {
      const next = src[i + 1]
      if (next === '\n' || next === '\r') {
        i += 1
        consumeNewline()
        continue
      }
      fail('unexpected character after line continuation')
    }
    if (c === '"' || c === "'") {
      tokens.push(readString(''))
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      tokens.push(readNumber())
      continue
    }
    if (isNameStart(c)) {
      const start = i
      while (i < n && isNameChar(src[i])) i += 1
      const word = src.slice(start, i)
      if (
        STRING_PREFIXES.has(word.toLowerCase()) &&
        (src[i] === '"' || src[i] === "'")
      ) {
        const token = readString(word)
        tokens.push(token)
        continue
      }
      tokens.push({ kind: 'name', text: word, line })
      continue
    }
    const three = src.slice(i, i + 3)
    const two = src.slice(i, i + 2)
    let op: string | null = null
    if (OPS3.has(three)) op = three
    else if (OPS2.has(two)) op = two
    else if (OPS1.has(c ?? '')) op = c ?? null
    if (op === null) fail(`unexpected character ${JSON.stringify(c)}`)
    const text = op
    if (text === '(' || text === '[' || text === '{') depth += 1
    else if (text === ')' || text === ']' || text === '}') {
      depth -= 1
      if (depth < 0) fail('unbalanced brackets')
    }
    tokens.push({ kind: 'op', text, line })
    i += text.length
  }
  if (depth !== 0) fail('unbalanced brackets')
  if (tokens.length > 0) out.push({ indent, tokens, line: lineStart })
  return out
}

// ---------------------------------------------------------------------------
// Value rules. Each validator mirrors a GameLib accept rule; the comment names
// its source so a change there is a visible diff here.
// ---------------------------------------------------------------------------

const utf16Len = (s: string): number => s.length

// registry.rs `forbidden`: '"', CR, LF, NUL. This tool is stricter and also
// refuses any other control character.
const hasForbiddenChar = (s: string): boolean =>
  // eslint-disable-next-line no-control-regex
  /["\r\n\u0000]/.test(s)
// eslint-disable-next-line no-control-regex
const hasControlChar = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s)

// registry.rs REGISTRY_ROOTS.
const REGISTRY_ROOTS = [
  'HKLM\\',
  'HKEY_LOCAL_MACHINE\\',
  'HKCU\\',
  'HKEY_CURRENT_USER\\'
]

/**
 * registry.rs `valid_key`: an exact root, no empty segment, no trailing
 * backslash, at most 512 UTF-16 units, none of '"', CR, LF, NUL.
 */
export function isValidRegistryKey(key: string): boolean {
  if (utf16Len(key) > 512 || hasForbiddenChar(key)) return false
  const root = REGISTRY_ROOTS.find((r) => key.startsWith(r))
  if (root === undefined) return false
  const rest = key.slice(root.length)
  return (
    rest !== '' &&
    !rest.endsWith('\\') &&
    !rest.split('\\').some((s) => s === '')
  )
}

/** registry.rs `validate_registry_fixes`: name non-empty, <= 256, no leading '/'. */
export function isValidRegistryName(name: string): boolean {
  return (
    name !== '' &&
    utf16Len(name) <= 256 &&
    !name.startsWith('/') &&
    !hasForbiddenChar(name)
  )
}

/** registry.rs `valid_dll_override_exe`: /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,250}\.exe$/i */
export function isValidDllOverrideExe(exe: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,250}\.exe$/i.test(exe)
}

/** registry.rs `valid_dll_name`: /^[A-Za-z0-9_+-][A-Za-z0-9_.+-]{0,63}$/ and not /\.dll$/i */
export function isValidDllName(dll: string): boolean {
  return (
    /^[A-Za-z0-9_+-][A-Za-z0-9_.+-]{0,63}$/.test(dll) && !/\.dll$/i.test(dll)
  )
}

const DLL_MODES = [
  'native',
  'builtin',
  'native,builtin',
  'builtin,native',
  'disabled'
]

/**
 * knownFixTwins.ts `isValidExeOverrideShape`: non-empty, no NUL, not absolute
 * (posix or win32), no drive letter, no `..` segment.
 */
export function isValidExeOverrideShape(value: string): boolean {
  if (value.trim() === '') return false
  if (value.includes('\u0000')) return false
  if (value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[A-Za-z]:/.test(value)) return false
  if (value.split(/[\\/]/).some((seg) => seg === '..')) return false
  return true
}

const WINETRICKS_VERB = /^[A-Za-z0-9][A-Za-z0-9_.=+-]*$/
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

function validateNotes(notes: unknown): void {
  if (notes === null || typeof notes !== 'object')
    throw new Error('notes is not an object')
  for (const [k, v] of Object.entries(notes)) {
    if (typeof v !== 'string') throw new Error(`notes.${k} is not a string`)
  }
}

function validateDescriptive(candidate: Record<string, unknown>): void {
  if (typeof candidate.title !== 'string' || candidate.title === '')
    throw new Error('title missing')
  if (candidate.notes !== undefined) validateNotes(candidate.notes)
}

function validateRegistryEntry(entry: unknown): void {
  if (entry === null || typeof entry !== 'object')
    throw new Error('registry entry is not an object')
  const e = entry as Record<string, unknown>
  if (typeof e.key !== 'string' || !isValidRegistryKey(e.key))
    throw new Error(`bad registry key ${JSON.stringify(e.key)}`)
  if (typeof e.name !== 'string' || !isValidRegistryName(e.name))
    throw new Error(`bad registry name ${JSON.stringify(e.name)}`)
  if (e.type === 'REG_DWORD') {
    const v = e.value
    if (
      typeof v !== 'number' ||
      !Number.isInteger(v) ||
      v < 0 ||
      v > 0xffffffff
    )
      throw new Error(`bad REG_DWORD value ${JSON.stringify(v)}`)
  } else if (e.type === 'REG_SZ') {
    const v = e.value
    if (typeof v !== 'string' || utf16Len(v) > 1024 || hasForbiddenChar(v))
      throw new Error('bad REG_SZ value')
  } else {
    throw new Error(`unknown registry type ${JSON.stringify(e.type)}`)
  }
  if (e.views !== undefined) {
    if (
      !Array.isArray(e.views) ||
      e.views.length === 0 ||
      !e.views.every((v) => v === 32 || v === 64)
    )
      throw new Error('bad registry views')
  }
  const extra = Object.keys(e).filter(
    (k) => !['key', 'name', 'type', 'value', 'views'].includes(k)
  )
  if (extra.length > 0) throw new Error(`unknown registry key ${extra[0]}`)
}

/** Throws when a tier-1 candidate would not pass GameLib's accept rules. */
export function validateTier1(candidate: KnowFixesInfo): void {
  const c = candidate as unknown as Record<string, unknown>
  for (const k of Object.keys(c)) {
    if (!(TIER1_EMIT_KEYS as readonly string[]).includes(k))
      throw new Error(`tier-1 key not allowed: ${k}`)
  }
  validateDescriptive(c)
  if (c.winetricks !== undefined) {
    if (
      !Array.isArray(c.winetricks) ||
      !c.winetricks.every(
        (v) => typeof v === 'string' && WINETRICKS_VERB.test(v)
      )
    )
      throw new Error('bad winetricks')
  }
  if (c.envVariables !== undefined) {
    const env = c.envVariables
    if (env === null || typeof env !== 'object') throw new Error('bad env')
    for (const [k, v] of Object.entries(env)) {
      if (!ENV_KEY.test(k) || typeof v !== 'string' || v.includes('\u0000'))
        throw new Error(`bad env variable ${k}`)
    }
  }
  if (c.launchArgs !== undefined) {
    if (
      !Array.isArray(c.launchArgs) ||
      !c.launchArgs.every(
        (v) => typeof v === 'string' && v !== '' && !v.includes('\u0000')
      )
    )
      throw new Error('bad launchArgs')
  }
  if (c.exeOverride !== undefined) {
    if (
      typeof c.exeOverride !== 'string' ||
      !isValidExeOverrideShape(c.exeOverride)
    )
      throw new Error('bad exeOverride')
  }
}

/** Throws when a tier-2 candidate would not pass GameLib's accept rules. */
export function validateTier2(candidate: KnownFixProfile): void {
  const c = candidate as unknown as Record<string, unknown>
  for (const k of Object.keys(c)) {
    if (!(TIER2_EMIT_KEYS as readonly string[]).includes(k))
      throw new Error(`tier-2 key not allowed: ${k}`)
  }
  validateDescriptive(c)
  if (c.evidence !== undefined && typeof c.evidence !== 'string')
    throw new Error('bad evidence')
  if (c.registry !== undefined) {
    if (!Array.isArray(c.registry)) throw new Error('bad registry')
    c.registry.forEach(validateRegistryEntry)
  }
  if (c.dllOverrides !== undefined) {
    if (!Array.isArray(c.dllOverrides)) throw new Error('bad dllOverrides')
    for (const entry of c.dllOverrides as unknown[]) {
      const e = entry as Record<string, unknown>
      if (typeof e.exe !== 'string' || !isValidDllOverrideExe(e.exe))
        throw new Error(`bad dllOverrides exe ${JSON.stringify(e.exe)}`)
      const dlls = e.dlls as Record<string, unknown> | null
      if (
        dlls === null ||
        typeof dlls !== 'object' ||
        Object.keys(dlls).length === 0
      )
        throw new Error('bad dllOverrides dlls')
      for (const [dll, mode] of Object.entries(dlls)) {
        if (!isValidDllName(dll)) throw new Error(`bad dll name ${dll}`)
        if (typeof mode !== 'string' || !DLL_MODES.includes(mode))
          throw new Error(`bad dll mode ${String(mode)}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Statement model and helper translation
// ---------------------------------------------------------------------------

export type SkipReason =
  | 'not-an-appid-file'
  | 'unsafe-file'
  | 'parse-error'
  | 'no-main'
  | 'empty-main'
  | 'only-not-applicable'
  | 'nothing-mapped'

export interface Unmapped {
  line: number
  text: string
  reason: string
}

export interface NotApplicable {
  line: number
  helper: string
}

export interface Attribution {
  url: string
  rev: string
  copyrightLines: string[]
  licenseText: string
}

export interface FileResult {
  status: 'translated' | 'partial' | 'skipped'
  skipReason?: SkipReason
  detail?: string
  tier1?: KnowFixesInfo
  tier2?: KnownFixProfile
  emitted: { tier1: string[]; tier2: string[] }
  unmapped: Unmapped[]
  notApplicable: NotApplicable[]
}

type Lit =
  | { t: 'str'; v: string }
  | { t: 'int'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'none' }
  | { t: 'enum'; v: string }

const CONTINUATIONS = new Set(['elif', 'else', 'except', 'finally'])

const COMPOUND_KEYWORDS = new Set([
  'if',
  'elif',
  'else',
  'for',
  'while',
  'with',
  'try',
  'except',
  'finally',
  'def',
  'class',
  'match',
  'async'
])

const ENUM_MODES: Record<string, string> = {
  NATIVE: 'native',
  BUILTIN: 'builtin',
  NATIVE_BUILTIN: 'native,builtin',
  BUILTIN_NATIVE: 'builtin,native',
  DISABLED: 'disabled'
}
const STRING_MODES: Record<string, string> = {
  n: 'native',
  b: 'builtin',
  'n,b': 'native,builtin',
  'b,n': 'builtin,native',
  '': 'disabled',
  native: 'native',
  builtin: 'builtin',
  'native,builtin': 'native,builtin',
  'builtin,native': 'builtin,native',
  disabled: 'disabled'
}

const SIGNATURES: Record<string, { params: string[]; required: number }> = {
  protontricks: { params: ['verb'], required: 1 }
}
const NOT_APPLICABLE = new Set([
  'disable_esync',
  'disable_fsync',
  'disable_nvapi'
])

/** `arr[k]` where the caller has already checked the bounds. */
const nth = <T>(arr: readonly T[], k: number): T => arr[k] as T

const isOp = (t: Token | undefined, text: string): boolean =>
  t !== undefined && t.kind === 'op' && t.text === text

/** Index of the bracket closing the one at `open`, or -1. */
function matchingClose(tokens: Token[], open: number): number {
  let depth = 0
  for (let k = open; k < tokens.length; k += 1) {
    const t = nth(tokens, k)
    if (t.kind !== 'op') continue
    if (t.text === '(' || t.text === '[' || t.text === '{') depth += 1
    else if (t.text === ')' || t.text === ']' || t.text === '}') {
      depth -= 1
      if (depth === 0) return k
    }
  }
  return -1
}

/** Splits `tokens` on `sep` ops at bracket depth 0. */
function splitTopLevel(tokens: Token[], separator: string): Token[][] {
  const parts: Token[][] = []
  let current: Token[] = []
  let depth = 0
  for (const t of tokens) {
    if (t.kind === 'op') {
      if (t.text === '(' || t.text === '[' || t.text === '{') depth += 1
      else if (t.text === ')' || t.text === ']' || t.text === '}') depth -= 1
      else if (t.text === separator && depth === 0) {
        parts.push(current)
        current = []
        continue
      }
    }
    current.push(t)
  }
  parts.push(current)
  return parts
}

/** Index of the first `:` at bracket depth 0, or -1. */
function headerColon(tokens: Token[]): number {
  let depth = 0
  for (let k = 0; k < tokens.length; k += 1) {
    const t = nth(tokens, k)
    if (t.kind !== 'op') continue
    if (t.text === '(' || t.text === '[' || t.text === '{') depth += 1
    else if (t.text === ')' || t.text === ']' || t.text === '}') depth -= 1
    else if (t.text === ':' && depth === 0) return k
  }
  return -1
}

interface ParsedModule {
  docstring: string | null
  aliases: Set<string>
  bare: Map<string, string>
  moduleUnmapped: Unmapped[]
  main: {
    header: LogicalLine
    statements: Token[][]
    docstring: string | null
  } | null
}

class StatementReject extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

/** The last segment of a dotted name in `tokens` (name . name ...), joined. */
function dotted(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('')
}

function recordImport(
  tokens: Token[],
  aliases: Set<string>,
  bare: Map<string, string>
): void {
  if (nth(tokens, 0).text === 'import') {
    for (const part of splitTopLevel(tokens.slice(1), ',')) {
      const asAt = part.findIndex((t) => t.kind === 'name' && t.text === 'as')
      const path = dotted(asAt < 0 ? part : part.slice(0, asAt))
      if (path === 'util' || path.endsWith('.util')) {
        const alias = asAt >= 0 ? part[asAt + 1]?.text : undefined
        if (alias !== undefined) aliases.add(alias)
        else if (path === 'util') aliases.add('util')
      }
    }
    return
  }
  // from <module> import <names>
  const importAt = tokens.findIndex(
    (t) => t.kind === 'name' && t.text === 'import'
  )
  if (importAt < 0) return
  const module = dotted(tokens.slice(1, importAt))
  let names = tokens.slice(importAt + 1)
  if (isOp(names[0], '(') && isOp(names[names.length - 1], ')'))
    names = names.slice(1, -1)
  const isUtilModule = module === 'util' || module.endsWith('.util')
  const isPackage = module === 'protonfixes' || module.endsWith('protonfixes')
  for (const part of splitTopLevel(names, ',')) {
    if (part.length === 0) continue
    const name = nth(part, 0).text
    const alias =
      part.length >= 3 && nth(part, 1).text === 'as' ? nth(part, 2).text : name
    if (isUtilModule) bare.set(alias, name)
    else if (isPackage && name === 'util') aliases.add(alias)
  }
}

function lineBlockEnd(lines: LogicalLine[], from: number): number {
  let j = from + 1
  while (j < lines.length && nth(lines, j).indent > nth(lines, from).indent)
    j += 1
  return j
}

function parseModule(lines: LogicalLine[]): ParsedModule {
  const model: ParsedModule = {
    docstring: null,
    aliases: new Set(['util']),
    bare: new Map(),
    moduleUnmapped: [],
    main: null
  }
  let i = 0
  let seenFirst = false
  let lastUnmapped = false
  while (i < lines.length) {
    const first = nth(lines, i)
    const end = lineBlockEnd(lines, i)
    const t0 = nth(first.tokens, 0)
    const isFirst = !seenFirst
    seenFirst = true
    const wasUnmapped = lastUnmapped
    lastUnmapped = false
    if (first.indent > 0)
      throw new PythonParseError(`line ${first.line}: unexpected indent`)
    if (first.tokens.every((t) => t.kind === 'string')) {
      if (isFirst && first.tokens.every((t) => t.literal === true))
        model.docstring = first.tokens.map((t) => t.value ?? '').join('')
      i = end
      continue
    }
    if (t0.kind === 'name' && (t0.text === 'import' || t0.text === 'from')) {
      recordImport(first.tokens, model.aliases, model.bare)
      i = end
      continue
    }
    if (isOp(t0, '@')) {
      i = end
      continue
    }
    if (t0.kind === 'name' && t0.text === 'def') {
      if (first.tokens[1]?.text === 'main') {
        model.main = parseMain(lines, i, end)
      }
      i = end
      continue
    }
    const continues =
      t0.kind === 'name' && CONTINUATIONS.has(t0.text) && wasUnmapped
    if (!continues)
      model.moduleUnmapped.push({
        line: first.line,
        text: '',
        reason: 'module-level-statement'
      })
    lastUnmapped = true
    i = end
  }
  return model
}

function parseMain(
  lines: LogicalLine[],
  at: number,
  end: number
): NonNullable<ParsedModule['main']> {
  const header = nth(lines, at)
  const colon = headerColon(header.tokens)
  if (colon < 0)
    throw new PythonParseError(`line ${header.line}: def without a colon`)
  const statements: Token[][] = []
  let docstring: string | null = null
  const addSimple = (tokens: Token[], isFirst: boolean): boolean => {
    for (const part of splitTopLevel(tokens, ';')) {
      if (part.length === 0) continue
      if (part.every((t) => t.kind === 'string')) {
        if (
          isFirst &&
          docstring === null &&
          part.every((t) => t.literal === true)
        )
          docstring = part.map((t) => t.value ?? '').join('')
        isFirst = false
        continue
      }
      isFirst = false
      const head = nth(part, 0)
      if (head.kind === 'name' && head.text === 'pass' && part.length === 1)
        continue
      if (head.kind === 'name' && head.text === 'return') {
        if (
          part.length === 1 ||
          (part.length === 2 &&
            nth(part, 1).kind === 'name' &&
            nth(part, 1).text === 'None')
        )
          return true
      }
      statements.push(part)
    }
    return false
  }

  const inline = header.tokens.slice(colon + 1)
  let returned = false
  if (inline.length > 0) {
    returned = addSimple(inline, true)
  } else {
    if (end <= at + 1)
      throw new PythonParseError(
        `line ${header.line}: expected an indented block`
      )
    const base = nth(lines, at + 1).indent
    let k = at + 1
    let first = true
    let lastCompound = false
    while (k < end && !returned) {
      const line = nth(lines, k)
      if (line.indent !== base)
        throw new PythonParseError(`line ${line.line}: unexpected indent`)
      const blockEnd = lineBlockEnd(lines, k)
      const t0 = nth(line.tokens, 0)
      if (
        (t0.kind === 'name' && COMPOUND_KEYWORDS.has(t0.text)) ||
        isOp(t0, '@')
      ) {
        // elif/else/except/finally continue the compound statement above
        if (!(CONTINUATIONS.has(t0.text) && lastCompound))
          statements.push(line.tokens)
        lastCompound = true
        first = false
      } else {
        lastCompound = false
        if (blockEnd > k + 1)
          throw new PythonParseError(
            `line ${nth(lines, k + 1).line}: unexpected indent`
          )
        returned = addSimple(line.tokens, first)
        first = false
      }
      k = blockEnd
    }
  }
  return { header, statements, docstring }
}

interface RegistryEntry {
  key: string
  name: string
  type: 'REG_DWORD' | 'REG_SZ'
  value: number | string
  views?: number[]
}

interface Accumulator {
  winetricks: string[]
  env: Map<string, string>
  launchArgs: string[]
  exe: { value: string; orig: string; repl: string } | null
  registry: RegistryEntry[]
  dllStatements: {
    line: number
    text: string
    pairs: Array<[string, string]>
  }[]
  notApplicable: NotApplicable[]
  unmapped: Unmapped[]
}

function parseLiteral(tokens: Token[], aliases: Set<string>): Lit | null {
  if (tokens.length === 0) return null
  if (tokens.every((t) => t.kind === 'string')) {
    if (!tokens.every((t) => t.literal === true)) return null
    return { t: 'str', v: tokens.map((t) => t.value ?? '').join('') }
  }
  if (tokens.length === 1) {
    const t = nth(tokens, 0)
    if (t.kind === 'number')
      return t.int === null || t.int === undefined
        ? null
        : { t: 'int', v: t.int }
    if (t.kind === 'name') {
      if (t.text === 'True') return { t: 'bool', v: true }
      if (t.text === 'False') return { t: 'bool', v: false }
      if (t.text === 'None') return { t: 'none' }
    }
    return null
  }
  // OverrideOrder.MEMBER or <util>.OverrideOrder.MEMBER
  const names = tokens.filter((_, k) => k % 2 === 0)
  const dots = tokens.filter((_, k) => k % 2 === 1)
  if (
    (tokens.length === 3 || tokens.length === 5) &&
    names.every((t) => t.kind === 'name') &&
    dots.every((t) => isOp(t, '.'))
  ) {
    const path = names.map((t) => t.text)
    const member = nth(path, path.length - 1)
    const holder = nth(path, path.length - 2)
    const owner = path.length === 3 ? nth(path, 0) : undefined
    if (
      holder === 'OverrideOrder' &&
      (owner === undefined || aliases.has(owner))
    )
      return { t: 'enum', v: member }
  }
  return null
}

const stringMode = (s: string): string | null =>
  Object.hasOwn(STRING_MODES, s) ? (STRING_MODES[s] ?? null) : null

function normalizeMode(lit: Lit): string | null {
  if (lit.t === 'enum') return ENUM_MODES[lit.v] ?? null
  if (lit.t === 'str') return stringMode(lit.v)
  return null
}

/** `WINEDLLOVERRIDES` syntax: `dll[,dll]=mode[;...]`. Null when malformed. */
function parseWineDllOverrides(value: string): Array<[string, string]> | null {
  const pairs: Array<[string, string]> = []
  for (const entry of value.split(';')) {
    if (entry === '') continue
    const parts = entry.split('=')
    if (parts.length !== 2) return null
    const mode = stringMode(nth(parts, 1))
    if (mode === null) return null
    for (const dll of nth(parts, 0).split(',')) {
      const name = dll.replace(/\.dll$/i, '')
      if (!isValidDllName(name)) return null
      pairs.push([name, mode])
    }
  }
  return pairs.length > 0 ? pairs : null
}

const REGISTRY_DLL_OVERRIDES =
  /^(HKCU|HKEY_CURRENT_USER)\\Software\\Wine\\DllOverrides$/i

function canonicalizeRegistryKey(folder: string): string | null {
  const lower = folder.toLowerCase()
  const root = REGISTRY_ROOTS.find((r) => lower.startsWith(r.toLowerCase()))
  if (root === undefined) return null
  return root.toUpperCase() + folder.slice(root.length)
}

/** Maps one recognised helper call into the accumulator; throws StatementReject. */
function applyHelper(
  helper: string,
  args: Record<string, Lit>,
  acc: Accumulator,
  line: number,
  text: string
): void {
  const invalid = (): never => {
    throw new StatementReject('invalid-value')
  }
  const str = (name: string): string => {
    const lit = args[name]
    if (lit === undefined || lit.t !== 'str') return invalid()
    return lit.v
  }
  switch (helper) {
    case 'protontricks': {
      const verb = str('verb')
      if (!WINETRICKS_VERB.test(verb)) invalid()
      if (!acc.winetricks.includes(verb)) acc.winetricks.push(verb)
      return
    }
    case 'set_environment': {
      const key = str('envvar')
      const value = str('value')
      if (key === 'WINEDLLOVERRIDES') {
        const pairs = parseWineDllOverrides(value)
        if (pairs === null) invalid()
        acc.dllStatements.push({
          line,
          text,
          pairs: pairs as Array<[string, string]>
        })
        return
      }
      if (key.startsWith('PROTON_'))
        throw new StatementReject('proton-launcher-env')
      if (!ENV_KEY.test(key) || value.includes('\u0000')) invalid()
      acc.env.set(key, value)
      return
    }
    case 'append_argument': {
      const arg = str('argument')
      if (arg === '' || arg.includes('\u0000')) invalid()
      acc.launchArgs.push(arg)
      return
    }
    case 'replace_command': {
      const orig = str('orig')
      const repl = str('repl')
      const origPlain = orig
        .replace(/\\(.)/g, '$1')
        .replace(/^\^/, '')
        .replace(/\$$/, '')
      const replPath = repl.replace(/\\/g, '/')
      if (!/\.exe$/i.test(origPlain) || !/\.exe$/i.test(replPath))
        throw new StatementReject('replace-command-not-exe')
      // a backslash-digit or backslash-g in a regex replacement is a backreference
      if (/\\[0-9g]/.test(repl) || !isValidExeOverrideShape(replPath)) invalid()
      if (acc.exe !== null) throw new StatementReject('multiple-exe-overrides')
      acc.exe = { value: replPath, orig, repl }
      return
    }
    case 'winedll_override': {
      const dll = str('dll').replace(/\.dll$/i, '')
      const mode = args.dtype === undefined ? null : normalizeMode(args.dtype)
      if (!isValidDllName(dll) || mode === null) invalid()
      acc.dllStatements.push({
        line,
        text,
        pairs: [[dll, mode as string]]
      })
      return
    }
    case 'regedit_add': {
      const folder = str('folder')
      const given = (n: string): Lit | undefined =>
        args[n] === undefined || args[n].t === 'none' ? undefined : args[n]
      const name = given('name')
      const typ = given('typ')
      const value = given('value')
      if (name === undefined || typ === undefined || value === undefined)
        throw new StatementReject('registry-key-only')
      if (name.t !== 'str' || typ.t !== 'str') invalid()
      const arch = args.arch
      if (arch !== undefined && arch.t !== 'bool') invalid()
      const key = canonicalizeRegistryKey(folder)
      const regName = (name as { v: string }).v
      const regType = (typ as { v: string }).v.toUpperCase()
      if (key === null) return invalid()
      if (hasControlChar(key) || hasControlChar(regName)) invalid()
      if (
        regType === 'REG_BINARY' ||
        regType === 'REG_EXPAND_SZ' ||
        regType === 'REG_MULTI_SZ'
      )
        throw new StatementReject('unsupported-registry-type')
      if (regType !== 'REG_DWORD' && regType !== 'REG_SZ')
        throw new StatementReject('unsupported-registry-type')
      if (REGISTRY_DLL_OVERRIDES.test(key)) {
        const mode =
          value.t === 'str' && regType === 'REG_SZ'
            ? normalizeMode(value)
            : null
        const dll = regName.replace(/\.dll$/i, '')
        if (mode === null || !isValidDllName(dll)) invalid()
        acc.dllStatements.push({
          line,
          text,
          pairs: [[dll, mode as string]]
        })
        return
      }
      let data: number | string
      if (regType === 'REG_DWORD') {
        let n: number
        if (value.t === 'int') n = value.v
        else if (value.t === 'str' && /^(0x[0-9a-f]+|[0-9]+)$/i.test(value.v))
          n = Number(value.v)
        else return invalid()
        if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return invalid()
        data = n
      } else {
        if (value.t !== 'str') return invalid()
        data = value.v
      }
      const entry: RegistryEntry = {
        key,
        name: regName,
        type: regType,
        value: data
      }
      if (arch !== undefined && arch.t === 'bool' && arch.v) entry.views = [64]
      const draft = {
        key: entry.key,
        name: entry.name,
        type: entry.type,
        value: entry.value
      }
      // reject now, so a bad value is `invalid-value` and not an importer bug
      try {
        validateRegistryEntry(draft)
      } catch {
        invalid()
      }
      acc.registry.push(entry)
      return
    }
    default:
      throw new StatementReject(`unsupported-helper:${helper}`)
  }
}

/** Binds a call's arguments to a signature, then to literals. */
function bindArguments(
  argTokens: Token[],
  signature: { params: string[]; required: number },
  aliases: Set<string>
): Record<string, Lit> {
  const segments = splitTopLevel(argTokens, ',')
  if (segments.length > 0 && nth(segments, segments.length - 1).length === 0)
    segments.pop()
  const bound = new Map<string, Token[]>()
  let position = 0
  for (const seg of segments) {
    if (seg.length === 0) throw new StatementReject('bad-arguments')
    if (isOp(seg[0], '*') || isOp(seg[0], '**'))
      throw new StatementReject('non-literal-argument')
    if (nth(seg, 0).kind === 'name' && isOp(seg[1], '=')) {
      const name = nth(seg, 0).text
      if (!signature.params.includes(name) || bound.has(name))
        throw new StatementReject('bad-arguments')
      bound.set(name, seg.slice(2))
    } else {
      if (position >= signature.params.length)
        throw new StatementReject('bad-arguments')
      const name = nth(signature.params, position)
      if (bound.has(name)) throw new StatementReject('bad-arguments')
      bound.set(name, seg)
      position += 1
    }
  }
  for (let k = 0; k < signature.required; k += 1) {
    if (!bound.has(nth(signature.params, k)))
      throw new StatementReject('bad-arguments')
  }
  const out: Record<string, Lit> = {}
  for (const [name, tokens] of bound) {
    const lit = parseLiteral(tokens, aliases)
    if (lit === null) throw new StatementReject('non-literal-argument')
    out[name] = lit
  }
  return out
}

function processStatement(
  tokens: Token[],
  model: ParsedModule,
  acc: Accumulator,
  physical: string[]
): void {
  const head = nth(tokens, 0)
  const line = head.line
  const text = (physical[line - 1] ?? '').trim().slice(0, 200)
  const unmap = (reason: string): void => {
    acc.unmapped.push({ line, text, reason })
  }
  if (head.kind === 'name' && COMPOUND_KEYWORDS.has(head.text)) {
    unmap('non-declarative-statement')
    return
  }
  // <path> ( args ) where path is NAME(.NAME)*
  let k = 1
  const path = [head.text]
  if (head.kind === 'name') {
    while (isOp(tokens[k], '.') && tokens[k + 1]?.kind === 'name') {
      path.push(nth(tokens, k + 1).text)
      k += 2
    }
  }
  const closeAt = isOp(tokens[k], '(') ? matchingClose(tokens, k) : -1
  if (head.kind !== 'name' || closeAt !== tokens.length - 1) {
    unmap('non-declarative-statement')
    return
  }
  let helper: string | null = null
  if (path.length === 2 && model.aliases.has(nth(path, 0)))
    helper = nth(path, 1)
  else if (path.length === 1 && model.bare.has(nth(path, 0)))
    helper = model.bare.get(nth(path, 0)) ?? null
  if (helper === null) {
    unmap('unsupported-call')
    return
  }
  const signature = Object.hasOwn(SIGNATURES, helper)
    ? (SIGNATURES[helper] ?? null)
    : null
  if (signature === null) {
    unmap(`unsupported-helper:${helper}`)
    return
  }
  try {
    const args = bindArguments(
      tokens.slice(k + 1, closeAt),
      signature,
      model.aliases
    )
    if (NOT_APPLICABLE.has(helper)) {
      acc.notApplicable.push({ line, helper })
      return
    }
    applyHelper(helper, args, acc, line, text)
  } catch (error) {
    if (error instanceof StatementReject) {
      unmap(error.reason)
      return
    }
    throw error
  }
}

function attributionNotes(
  appId: string,
  attribution: Attribution
): Record<string, string> {
  const path = `${FIX_DIR}/${appId}.py`
  const copyright = attribution.copyrightLines.join(' ')
  return {
    'umu-protonfixes':
      `Candidate generated by meta/importProtonfixes.ts from umu-protonfixes ${path} at ${attribution.rev} ` +
      `(${attribution.url}/blob/${attribution.rev}/${path}). Not Mac-validated: test it as a local fix before promoting it. ` +
      `${copyright} Used under the BSD-2-Clause licence; the full text is in notes.umu-protonfixes-license.`,
    'umu-protonfixes-license': attribution.licenseText.trim()
  }
}

function titleFrom(docstring: string | null, appId: string): string {
  const firstLine =
    (docstring ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  const cleaned = firstLine.replace(/^game fix for\s+/i, '').trim()
  return cleaned === '' ? `Steam app ${appId}` : cleaned
}

function upstreamComment(
  physical: string[],
  headerLine: number,
  mainDoc: string | null
): string | null {
  const comments: string[] = []
  let k = headerLine - 2
  while (k >= 0 && nth(physical, k).trim().startsWith('#')) {
    comments.unshift(
      nth(physical, k)
        .trim()
        .replace(/^#+\s?/, '')
    )
    k -= 1
  }
  const parts = [...comments]
  if (mainDoc !== null && mainDoc.trim() !== '') parts.push(mainDoc.trim())
  const joined = parts.join('\n').trim()
  return joined === '' ? null : joined.slice(0, 1000)
}

const emptyResult = (skipReason: SkipReason, detail?: string): FileResult => ({
  status: 'skipped',
  skipReason,
  ...(detail === undefined ? {} : { detail }),
  emitted: { tier1: [], tier2: [] },
  unmapped: [],
  notApplicable: []
})

/**
 * Translates one gamefixes-steam file's source text. Pure: reads nothing and
 * writes nothing. A candidate that fails the internal validator throws (an
 * importer bug, never a skip).
 */
export function translateFixSource(
  source: string,
  appId: string,
  attribution: Attribution
): FileResult {
  const physical = source.replace(/^\ufeff/, '').split(/\r\n|\r|\n/)
  let model: ParsedModule
  try {
    model = parseModule(tokenizePython(source))
  } catch (error) {
    if (error instanceof PythonParseError)
      return emptyResult('parse-error', error.message)
    throw error
  }
  if (model.main === null) return emptyResult('no-main')

  const acc: Accumulator = {
    winetricks: [],
    env: new Map(),
    launchArgs: [],
    exe: null,
    registry: [],
    dllStatements: [],
    notApplicable: [],
    unmapped: model.moduleUnmapped.map((u) => ({
      ...u,
      text: (physical[u.line - 1] ?? '').trim().slice(0, 200)
    }))
  }
  for (const statement of model.main.statements)
    processStatement(statement, model, acc, physical)

  // Pass 2: a dllOverrides entry needs a statically known exe.
  const exeBase =
    acc.exe === null ? null : (acc.exe.value.split('/').pop() ?? null)
  const dllExe =
    exeBase !== null && isValidDllOverrideExe(exeBase) ? exeBase : null
  let dllOverrides: Array<{ exe: string; dlls: Record<string, string> }> = []
  if (dllExe !== null) {
    const dlls = new Map<string, string>()
    for (const statement of acc.dllStatements)
      for (const [dll, mode] of statement.pairs) dlls.set(dll, mode)
    if (dlls.size > 0)
      dllOverrides = [{ exe: dllExe, dlls: Object.fromEntries(dlls) }]
  } else {
    for (const statement of acc.dllStatements)
      acc.unmapped.push({
        line: statement.line,
        text: statement.text,
        reason: 'dll-override-exe-unknown'
      })
  }
  acc.unmapped.sort((a, b) => a.line - b.line)

  const tier1Fix: Partial<KnowFixesInfo> = {}
  if (acc.winetricks.length > 0) tier1Fix.winetricks = acc.winetricks
  if (acc.env.size > 0) tier1Fix.envVariables = Object.fromEntries(acc.env)
  if (acc.launchArgs.length > 0) tier1Fix.launchArgs = acc.launchArgs
  if (acc.exe !== null) tier1Fix.exeOverride = acc.exe.value
  const tier1Keys = Object.keys(tier1Fix)
  const tier2Keys: string[] = []
  if (acc.registry.length > 0) tier2Keys.push('registry')
  if (dllOverrides.length > 0) tier2Keys.push('dllOverrides')

  const base = {
    emitted: { tier1: tier1Keys, tier2: tier2Keys },
    unmapped: acc.unmapped,
    notApplicable: acc.notApplicable
  }
  if (tier1Keys.length === 0 && tier2Keys.length === 0) {
    const nothingAtAll =
      model.main.statements.length === 0 && acc.unmapped.length === 0
    const skipReason: SkipReason = nothingAtAll
      ? 'empty-main'
      : acc.notApplicable.length > 0 && acc.unmapped.length === 0
        ? 'only-not-applicable'
        : 'nothing-mapped'
    return { ...base, status: 'skipped', skipReason }
  }

  const title = titleFrom(model.docstring, appId)
  const notes: Record<string, string> = attributionNotes(appId, attribution)
  const comment = upstreamComment(
    physical,
    model.main.header.line,
    model.main.docstring
  )
  if (comment !== null) notes['upstream-comment'] = comment
  if (acc.unmapped.length > 0)
    notes['protonfixes-unmapped'] = acc.unmapped
      .map((u) => `line ${u.line}: ${u.text} (${u.reason})`)
      .join('\n')

  const result: FileResult = {
    ...base,
    status: acc.unmapped.length === 0 ? 'translated' : 'partial'
  }
  if (tier1Keys.length > 0) {
    const tier1Notes = { ...notes }
    if (acc.exe !== null)
      tier1Notes.exeOverride = `From replace_command('${acc.exe.orig}', '${acc.exe.repl}'): protonfixes regex-substitutes the launch command; GameLib launches this install-folder-relative path instead. Check where the exe lives under the install folder.`
    const tier1: KnowFixesInfo = {
      title,
      notes: tier1Notes,
      ...tier1Fix
    }
    validateTier1(tier1)
    result.tier1 = tier1
  }
  if (tier2Keys.length > 0) {
    const tier2: KnownFixProfile = {
      title,
      evidence: `${attribution.url}/blob/${attribution.rev}/${FIX_DIR}/${appId}.py`,
      notes,
      ...(acc.registry.length > 0 ? { registry: acc.registry } : {}),
      ...(dllOverrides.length > 0 ? { dllOverrides } : {})
    } as KnownFixProfile
    validateTier2(tier2)
    result.tier2 = tier2
  }
  return result
}

// ---------------------------------------------------------------------------
// Checkout reading (data only)
// ---------------------------------------------------------------------------

/** Reads the BSD-2-Clause licence file and its copyright lines, or throws. */
export function readAttributionSource(source: string): {
  copyrightLines: string[]
  licenseText: string
} {
  const names = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']
  const found = names.map((n) => join(source, n)).find((p) => existsSync(p))
  if (found === undefined)
    throw new Error(
      `${source} has no LICENSE file; refusing to import without the BSD-2-Clause licence`
    )
  const text = readFileSync(found, 'utf8')
  if (
    !text.includes('Redistribution and use in source and binary forms') ||
    !text.includes('Redistributions in binary form must reproduce') ||
    text.includes('Neither the name')
  )
    throw new Error(
      `${found} is not a BSD-2-Clause licence; refusing to import`
    )
  const copyrightLines = text
    .split(/\r\n|\r|\n/)
    .filter((l) => /^\s*Copyright/i.test(l))
    .map((l) => l.trim())
  if (copyrightLines.length === 0)
    throw new Error(`${found} carries no Copyright line; refusing to import`)
  return { copyrightLines, licenseText: text.trim() }
}

/** Resolves the checked-out revision by reading `.git` files only. */
export function resolveRevision(source: string): string {
  const gitDir = join(source, '.git')
  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
  let rev = head
  if (head.startsWith('ref:')) {
    const ref = head.slice(4).trim()
    if (!ref.startsWith('refs/') || ref.split('/').includes('..'))
      throw new Error(`unsupported HEAD ref ${JSON.stringify(ref)}`)
    const loose = join(gitDir, ref)
    if (existsSync(loose)) {
      rev = readFileSync(loose, 'utf8').trim()
    } else {
      const packed = join(gitDir, 'packed-refs')
      const line = existsSync(packed)
        ? readFileSync(packed, 'utf8')
            .split('\n')
            .find((l) => l.endsWith(` ${ref}`))
        : undefined
      if (line === undefined) throw new Error(`cannot resolve ${ref}`)
      rev = nth(line.split(' '), 0)
    }
  }
  if (!/^[0-9a-f]{40}$/.test(rev))
    throw new Error(`revision ${JSON.stringify(rev)} is not 40 lowercase hex`)
  return rev
}

export interface ImportOptions {
  source: string
  out: string
  sourceUrl?: string
  sourceRev?: string
  only?: string[]
  overwrite?: boolean
}

export interface FileReport {
  file: string
  appId: string | null
  status: 'translated' | 'partial' | 'skipped'
  skipReason?: SkipReason
  detail?: string
  emitted: { tier1: string[]; tier2: string[] }
  unmapped: Unmapped[]
  notApplicable: NotApplicable[]
}

export interface Report {
  tool: string
  source: { url: string; rev: string; dir: string }
  counts: {
    total: number
    translated: number
    partial: number
    skipped: number
    notSelected?: number
  }
  skipReasons: Record<string, number>
  unmappedReasons: Record<string, number>
  files: FileReport[]
}

const sortedCounts = (map: Map<string, number>): Record<string, number> =>
  Object.fromEntries(
    [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  )

function compareEntries(a: string, b: string): number {
  const ma = /^([0-9]{1,10})\.py$/.exec(a)
  const mb = /^([0-9]{1,10})\.py$/.exec(b)
  if (ma && mb) {
    const diff = Number(ma[1]) - Number(mb[1])
    if (diff !== 0) return diff
  } else if (ma) return -1
  else if (mb) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

function readSafely(
  dir: string,
  realSource: string,
  name: string
): { text: string } | { unsafe: string } {
  const full = join(dir, name)
  let stat = lstatSync(full)
  let target = full
  if (stat.isSymbolicLink()) {
    let real: string
    try {
      real = realpathSync(full)
    } catch {
      return { unsafe: 'broken symlink' }
    }
    if (!real.startsWith(realSource + sep))
      return { unsafe: 'symlink leaves the checkout' }
    target = real
    stat = statSync(real)
  }
  if (!stat.isFile()) return { unsafe: 'not a regular file' }
  if (stat.size > MAX_FILE_BYTES) return { unsafe: 'file larger than 256 KiB' }
  return { text: readFileSync(target, 'utf8') }
}

function guardOutputDir(out: string, overwrite: boolean): string {
  const outAbs = resolve(out)
  const segments = outAbs.split(/[\\/]+/)
  for (let k = 0; k + 1 < segments.length; k += 1) {
    if (segments[k] === 'public' && segments[k + 1] === 'fixes')
      throw new Error(
        `${outAbs} is inside public/fixes, the bundled fix layer; refusing to write candidates there`
      )
  }
  if (existsSync(outAbs)) {
    if (!statSync(outAbs).isDirectory())
      throw new Error(`${outAbs} exists and is not a directory`)
    if (readdirSync(outAbs).length > 0) {
      let ours = false
      if (overwrite) {
        try {
          const prior = JSON.parse(
            readFileSync(join(outAbs, 'report.json'), 'utf8')
          ) as { tool?: unknown }
          ours = prior.tool === TOOL_NAME
        } catch {
          ours = false
        }
      }
      if (!ours)
        throw new Error(
          `${outAbs} is not empty${overwrite ? " and is not this importer's output" : "; pass --overwrite to replace this importer's earlier output"}`
        )
    }
  }
  return outAbs
}

/**
 * Runs the import: reads the checkout, translates every gamefixes-steam
 * entry, then writes candidates and `report.json`. Everything is computed
 * before the first write, so a failure leaves nothing behind.
 */
export function runImport(options: ImportOptions): {
  report: Report
  tier1Files: number
  tier2Files: number
} {
  const sourceAbs = resolve(options.source)
  const sourceUrl = options.sourceUrl ?? DEFAULT_SOURCE_URL
  if (!/^https?:\/\/[^\s"]+$/.test(sourceUrl))
    throw new Error(`--source-url ${JSON.stringify(sourceUrl)} is not a URL`)
  const { copyrightLines, licenseText } = readAttributionSource(sourceAbs)
  const rev = options.sourceRev ?? resolveRevision(sourceAbs)
  if (!/^[0-9a-f]{40}$/.test(rev))
    throw new Error(`revision ${JSON.stringify(rev)} is not 40 lowercase hex`)
  const outAbs = guardOutputDir(options.out, options.overwrite === true)

  const realSource = realpathSync(sourceAbs)
  const fixDir = join(sourceAbs, FIX_DIR)
  if (!existsSync(fixDir) || !statSync(fixDir).isDirectory())
    throw new Error(`${fixDir} is not a directory`)
  if (!realpathSync(fixDir).startsWith(realSource + sep))
    throw new Error(`${fixDir} leaves the checkout`)

  const attribution: Attribution = {
    url: sourceUrl,
    rev,
    copyrightLines,
    licenseText
  }
  const only = options.only === undefined ? null : new Set(options.only)
  const names = readdirSync(fixDir).sort(compareEntries)
  const files: FileReport[] = []
  const writes: Array<{ name: string; json: unknown }> = []
  let notSelected = 0

  for (const name of names) {
    const match = /^([0-9]{1,10})\.py$/.exec(name)
    const appId = match?.[1] ?? null
    if (only !== null && (appId === null || !only.has(appId))) {
      notSelected += 1
      continue
    }
    let result: FileResult
    if (appId === null) {
      result = emptyResult('not-an-appid-file')
    } else {
      const read = readSafely(fixDir, realSource, name)
      result =
        'unsafe' in read
          ? emptyResult('unsafe-file', read.unsafe)
          : translateFixSource(read.text, appId, attribution)
    }
    files.push({
      file: name,
      appId,
      status: result.status,
      ...(result.skipReason === undefined
        ? {}
        : { skipReason: result.skipReason }),
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      emitted: result.emitted,
      unmapped: result.unmapped,
      notApplicable: result.notApplicable
    })
    if (appId !== null && result.tier1 !== undefined)
      writes.push({ name: `${appId}-steam.json`, json: result.tier1 })
    if (appId !== null && result.tier2 !== undefined)
      writes.push({ name: `${appId}-steam.profile.json`, json: result.tier2 })
  }

  const skipReasons = new Map<string, number>()
  const unmappedReasons = new Map<string, number>()
  const counts = { translated: 0, partial: 0, skipped: 0 }
  for (const f of files) {
    counts[f.status] += 1
    if (f.skipReason !== undefined)
      skipReasons.set(f.skipReason, (skipReasons.get(f.skipReason) ?? 0) + 1)
    for (const u of f.unmapped)
      unmappedReasons.set(u.reason, (unmappedReasons.get(u.reason) ?? 0) + 1)
  }
  const report: Report = {
    tool: TOOL_NAME,
    source: { url: sourceUrl, rev, dir: FIX_DIR },
    counts: {
      total: names.length,
      ...counts,
      ...(only === null ? {} : { notSelected })
    },
    skipReasons: sortedCounts(skipReasons),
    unmappedReasons: sortedCounts(unmappedReasons),
    files
  }

  rmSync(join(outAbs, 'fixes'), { recursive: true, force: true })
  rmSync(join(outAbs, 'report.json'), { force: true })
  mkdirSync(join(outAbs, 'fixes'), { recursive: true })
  for (const w of writes)
    writeFileSync(
      join(outAbs, 'fixes', w.name),
      JSON.stringify(w.json, null, 2) + '\n'
    )
  writeFileSync(
    join(outAbs, 'report.json'),
    JSON.stringify(report, null, 2) + '\n'
  )
  return {
    report,
    tier1Files: writes.filter((w) => !w.name.endsWith('.profile.json')).length,
    tier2Files: writes.filter((w) => w.name.endsWith('.profile.json')).length
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): ImportOptions {
  const values = new Map<string, string>()
  let overwrite = false
  const known = new Set([
    'source',
    'out',
    'source-rev',
    'source-url',
    'only',
    'overwrite'
  ])
  for (let k = 0; k < argv.length; k += 1) {
    const arg = nth(argv, k)
    if (!arg.startsWith('--')) throw new Error(`unexpected argument ${arg}`)
    const eq = arg.indexOf('=')
    const flag = arg.slice(2, eq < 0 ? undefined : eq)
    if (!known.has(flag)) throw new Error(`unknown flag --${flag}`)
    if (flag === 'overwrite') {
      overwrite = true
      continue
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[(k += 1)]
    if (value === undefined) throw new Error(`--${flag} needs a value`)
    values.set(flag, value)
  }
  const source = values.get('source')
  const out = values.get('out')
  if (source === undefined || out === undefined)
    throw new Error('--source and --out are required')
  const only = values.get('only')
  return {
    source,
    out,
    sourceRev: values.get('source-rev'),
    sourceUrl: values.get('source-url'),
    only:
      only === undefined
        ? undefined
        : only
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
    overwrite
  }
}

const byCountDesc = (a: [string, number], b: [string, number]): number =>
  b[1] - a[1] || (a[0] < b[0] ? -1 : 1)

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const { report, tier1Files, tier2Files } = runImport(options)
  const lines = [
    `umu-protonfixes ${report.source.rev}: ${report.counts.total} entries in ${report.source.dir}`,
    `  translated: ${report.counts.translated}`,
    `  partial:    ${report.counts.partial}`,
    `  skipped:    ${report.counts.skipped}`
  ]
  if (report.counts.notSelected !== undefined)
    lines.push(`  not selected (--only): ${report.counts.notSelected}`)
  lines.push('skip reasons:')
  for (const [reason, count] of Object.entries(report.skipReasons).sort(
    byCountDesc
  ))
    lines.push(`  ${count}  ${reason}`)
  lines.push('unmapped reasons:')
  for (const [reason, count] of Object.entries(report.unmappedReasons).sort(
    byCountDesc
  ))
    lines.push(`  ${count}  ${reason}`)
  lines.push(
    `wrote ${tier1Files} tier-1 and ${tier2Files} tier-2 candidate files to ${resolve(options.out)}`
  )
  console.log(lines.join('\n'))
}

// Guard main() so importing this module under jest never runs the CLI.
if (!process.env.JEST_WORKER_ID) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
