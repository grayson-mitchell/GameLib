/**
 * Phase 82 (D-05): the detector behind the per-plan raw-delete source gates. A guarded file must
 * route every recursive delete through the Rust safety primitive, so a gate scans the file list a
 * plan migrated and asserts this finds nothing.
 *
 * Comments are blanked IN PLACE (newlines kept) rather than dropped with `stripSourceComments`,
 * because that helper removes whole lines and would shift the line numbers this reports, and it
 * leaves a trailing `// rmSync(x, { recursive: true })` comment in the text, which would be a false
 * positive.
 *
 * What it reports: any method or function named rm, rmSync, rmdir or rmdirSync, whatever its
 * receiver (deps.rm, deps.fs.rmSync, this.deps.fs.promises.rm, optional-chained), when its
 * arguments say `recursive` or its options argument is not an object literal (a variable, a call,
 * a conditional, a spread). That includes non-fs methods that happen to carry one of those names;
 * a false positive is allowlisted in the gate by enclosing function, with a written reason.
 * Declarations (`function rm(...) {}`, a method `rm(a, b) {}`) are skipped, not reported.
 *
 * What this does not see (non-goals, so the header claims only what is covered):
 * - an aliased import (`rmSync as drop`) or a destructured re-binding (`const { rm: drop } = fsp`)
 * - computed member access (`fs['rmSync'](...)`)
 * - rimraf and fs-extra's remove/emptyDir
 * - wrapper helpers that delete recursively under another name: removeFolder in backend/utils.ts
 *   is one, and its call sites are not reported
 * - shell deletes through spawn or exec (rm -rf, rd /s)
 * - any delete in a file the gate does not list
 *
 * Pure apart from `scanGuardedFiles` reading the files it is handed. No timers, no handles, no
 * work at import, no module-level mutable state; never mock anything to test it.
 */
import { readFileSync } from 'fs'
import { assertAtOrAboveFloor } from './censusFloor'

export interface RawRecursiveDelete {
  file: string
  line: number
  call: string
  /** `recursive-option`: the arguments say `recursive`. `opaque-options`: the options are not a literal. */
  reason: 'recursive-option' | 'opaque-options'
}

/** Replaces every comment with spaces, keeping newlines so offsets and line numbers still match. */
function blankComments(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source.charAt(i)
    const next = source.charAt(i + 1)
    if (c === '/' && next === '/') {
      while (i < n && source.charAt(i) !== '\n') {
        out += ' '
        i++
      }
    } else if (c === '/' && next === '*') {
      out += '  '
      i += 2
      while (
        i < n &&
        !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')
      ) {
        out += source.charAt(i) === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
    } else if (c === '"' || c === "'" || c === '`') {
      out += c
      i++
      while (i < n && source.charAt(i) !== c) {
        if (source.charAt(i) === '\\' && i + 1 < n) {
          out += source.charAt(i) + source.charAt(i + 1)
          i += 2
          continue
        }
        out += source.charAt(i)
        i++
      }
      if (i < n) {
        out += c
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

/** Index of the `)` matching the `(` at `open`, skipping string literals; -1 when unbalanced. */
function matchingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text.charAt(i)
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < text.length && text.charAt(i) !== c) {
        if (text.charAt(i) === '\\') i++
        i++
      }
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** The name of an rm-family call, after any non-identifier character (`.`, `?.`, `)`, whitespace). */
const CALL = /(?<![\w$])(?:rmSync|rmdirSync|rm|rmdir)\s*\(/g

/**
 * Where the reported call text starts: the head of an immediately preceding receiver chain
 * (identifiers joined by `.` or `?.`, whitespace allowed around the dots), or the name itself.
 */
function receiverStart(text: string, nameStart: number): number {
  let start = nameStart
  for (;;) {
    let i = start - 1
    while (i >= 0 && /\s/.test(text.charAt(i))) i--
    if (text.charAt(i) !== '.') break
    i--
    if (text.charAt(i) === '?') i--
    while (i >= 0 && /\s/.test(text.charAt(i))) i--
    let j = i
    while (j >= 0 && /[\w$]/.test(text.charAt(j))) j--
    if (j === i) break
    start = j + 1
  }
  return start
}

/**
 * The text of each top-level argument between the parens at `open`..`close`. Top level is depth
 * zero across (), [] and {}; string and template literals are skipped. A trailing empty argument
 * (a trailing comma) is dropped.
 */
function topLevelArguments(
  text: string,
  open: number,
  close: number
): string[] {
  const args: string[] = []
  let depth = 0
  let from = open + 1
  for (let i = open + 1; i < close; i++) {
    const c = text.charAt(i)
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < close && text.charAt(i) !== c) {
        if (text.charAt(i) === '\\') i++
        i++
      }
    } else if (c === '(' || c === '[' || c === '{') {
      depth++
    } else if (c === ')' || c === ']' || c === '}') {
      depth--
    } else if (c === ',' && depth === 0) {
      args.push(text.slice(from, i))
      from = i + 1
    }
  }
  args.push(text.slice(from, close))
  while (args.length > 0 && (args[args.length - 1] ?? '').trim() === '') {
    args.pop()
  }
  return args
}

/**
 * A declaration or arrow parameter list, not a call: the name directly follows the `function`
 * keyword (optionally `*`), or the closing paren is followed by `{` or `=>`.
 */
function isDeclaration(text: string, nameAt: number, close: number): boolean {
  if (
    /\bfunction\s*\*?\s*$/.test(text.slice(Math.max(0, nameAt - 40), nameAt))
  ) {
    return true
  }
  return /^\s*(?:\{|=>)/.test(text.slice(close + 1, close + 20))
}

/** Why a call is reported, or undefined when it is neither recursive nor opaque. */
function classify(
  text: string,
  open: number,
  close: number
): RawRecursiveDelete['reason'] | undefined {
  if (/\brecursive\b/.test(text.slice(open, close + 1)))
    return 'recursive-option'
  const args = topLevelArguments(text, open, close)
  const first = (args[0] ?? '').trim()
  const second = (args[1] ?? '').trim()
  if (first.startsWith('...')) return 'opaque-options'
  if (args.length < 2) return undefined
  if (!second.startsWith('{') || second.includes('...')) return 'opaque-options'
  return undefined
}

/**
 * Every `rm`/`rmdir` call on any receiver (bare or member) whose arguments say `recursive`, or
 * whose options argument is not an object literal (suspect: the options could say recursive).
 */
export function findRawRecursiveDeletes(
  source: string,
  file: string
): RawRecursiveDelete[] {
  const text = blankComments(source)
  const found: RawRecursiveDelete[] = []
  for (const m of text.matchAll(CALL)) {
    const nameAt = m.index
    const open = nameAt + m[0].length - 1
    const close = matchingParen(text, open)
    if (close < 0) continue
    if (isDeclaration(text, nameAt, close)) continue
    const reason = classify(text, open, close)
    if (reason === undefined) continue
    found.push({
      file,
      line: text.slice(0, nameAt).split('\n').length,
      reason,
      call: text
        .slice(receiverStart(text, nameAt), close + 1)
        .replace(/\s+/g, ' ')
    })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

/**
 * Reads each path and returns every raw recursive delete, sorted by file then line. Throws when
 * fewer than `floor` files were read: a scan over an empty list proves nothing (D-05).
 */
export function scanGuardedFiles(
  paths: string[],
  floor: number
): RawRecursiveDelete[] {
  const found = paths.flatMap((p) =>
    findRawRecursiveDeletes(readFileSync(p, 'utf8'), p)
  )
  assertAtOrAboveFloor('rawRecursiveDeletes', paths.length, floor)
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}
