/**
 * Phase 82 (D-05): the detector behind the per-plan raw-delete source gates. A guarded file must
 * route every recursive delete through the Rust safety primitive, so a gate scans the file list a
 * plan migrated and asserts this finds nothing.
 *
 * Comments are blanked IN PLACE (newlines kept) rather than dropped with `stripSourceComments`,
 * because that helper removes whole lines and would shift the line numbers this reports, and it
 * leaves a trailing `// rmSync(x, { recursive: true })` comment in the text, which would be a false
 * positive. Out of scope: an aliased import (`rmSync as drop`), `rimraf` and fs-extra `remove`.
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

const CALL =
  /(?<![\w$.])(?:(?:fs|fsp|promises|fsPromises)\s*\.\s*)*(?:rmSync|rmdirSync|rm|rmdir)\s*\(/g

/** Every `rm`/`rmdir` call (bare or `fs.`/`fsp.`/`promises.` qualified) whose arguments say `recursive`. */
export function findRawRecursiveDeletes(
  source: string,
  file: string
): RawRecursiveDelete[] {
  const text = blankComments(source)
  const found: RawRecursiveDelete[] = []
  for (const m of text.matchAll(CALL)) {
    const start = m.index
    const open = start + m[0].length - 1
    const close = matchingParen(text, open)
    if (close < 0) continue
    if (!/\brecursive\b/.test(text.slice(open, close + 1))) continue
    found.push({
      file,
      line: text.slice(0, start).split('\n').length,
      call: text.slice(start, close + 1).replace(/\s+/g, ' ')
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
