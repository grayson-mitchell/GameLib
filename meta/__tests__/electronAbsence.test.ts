/**
 * Mechanized form of D-03's success test (Phase 35 Plan 18): "electron appears nowhere" --
 * proven by an automated, mutation-provable gate instead of a manual `grep` a human runs once
 * and forgets. Plan 18 removed the `electron` devDependency (and `electron-store`, and the
 * transitively-hoisted `electron` that `react-devtools` was dragging in) outright, and Plan 15
 * migrated every real source import from `electron` to `backend/platform`. This gate is the
 * permanent regression detector for both: nothing under `src/` may reference the `electron`
 * package by import, require, or `Electron.` namespace, and `package.json` may not declare it
 * (or any `electron-*` package) as a dependency ever again.
 *
 * FOUR REFERENCE FORMS, NEVER THE BARE SUBSTRING:
 * A naive `grep -rc "electron" src` gate would false-fire on every file whose own FILENAME
 * contains the substring -- `src/backend/logger/electronStores.ts`,
 * `src/backend/electron_store.ts`, `src/frontend/helpers/electronStores.ts`, and a dozen more
 * same-named siblings across the store-manager tree, plus `src/common/types/electron_store.ts`.
 * None of these are references to the npm package: they
 * are first-party module names that happen to share a substring with it, and renaming them was
 * out of scope for this plan. A bare-substring gate would also false-fire on any local import
 * like `import { x } from './electronStores'` or `from '../logger/electronStores'`, which
 * contain the substring `electron` but are NOT `electron`-package references. This is exactly
 * the failure class that hit this repo's plan-phase UI gate once already (18 false hits on `ui`
 * inside `build`) -- so every regex below requires the matched token to be the WHOLE quoted
 * specifier or the WHOLE namespace identifier, not a substring of something longer:
 *   - `from 'electron'` / `from "electron"` requires the quoted string between the quote marks
 *     to be exactly `electron` -- `'./electronStores'` has more characters between its quotes
 *     and does not match.
 *   - `require('electron')` / `require("electron")` is the same exact-specifier requirement
 *     inside the call parens.
 *   - `Electron.` requires a word boundary immediately before the capital `E` and a literal `.`
 *     immediately after `Electron` -- `ElectronStore.` does not match, because the character
 *     after `Electron` there is `S`, not `.`.
 *   - The `package.json` dependency check compares object KEYS for exact equality (`electron`)
 *     or an `electron-` prefix, never a substring search over the file's raw text.
 *
 * COMMENTS ARE FILTERED BEFORE MATCHING:
 * This file's own explanatory prose above (and every sibling gate's) mentions `from 'electron'`
 * and `require('electron')` in comments constantly -- but this gate only scans `src/`, never
 * `meta/`, so its own prose is out of scope by construction. Source files under `src/` DO carry
 * comments that discuss the old `electron` import shape (migration history, docstrings
 * explaining why a stub exists), and an unfiltered gate would either be permanently red on its
 * own commentary or -- worse -- silently pass because someone loosened the regex to dodge the
 * comment noise, hiding a real hit alongside it. `stripBlockCommentsPreservingLines()` and the
 * per-line `//`/`*`-prefix filter below adapt the two-stage strategy documented in
 * `src/backend/testUtils/stripSourceComments.ts` (strip `/* ... *\/` spans first, THEN drop
 * lines that themselves start with a comment marker), but preserve line numbers exactly --
 * `stripSourceComments()` itself drops whole lines and reflows the array, which would misreport
 * line numbers in this gate's failure messages. Blanking (replacing with spaces) instead of
 * deleting keeps `content.split('\n')[i]` aligned with the ORIGINAL file's line `i + 1` for
 * every reported hit.
 *
 * ONE DOCUMENTED, SURGICAL EXCEPTION (not a file-level exclusion):
 * `src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts` line 190 is the sole
 * non-comment, non-filename hit anywhere under `src/` at the time this gate was authored. It is
 * the "known-good control" fixture for THAT file's own Gate 3 (a `ts-morph`/TS-compiler-API AST
 * scan for forbidden dynamic `import('electron')`): a template-literal string containing
 * `import { app } from 'electron'` as fixture SOURCE TEXT handed to `ts.createSourceFile()`, not
 * a real import of this test file itself. Excluding the whole FILE would be too broad -- a real
 * `import ... from 'electron'` added anywhere else in that file must still be caught. Instead,
 * `TOLERATED_HITS` below allowlists this one exact (file, trimmed-line-content) pair. If that
 * fixture's content ever changes, the hit reappears here and must be re-added deliberately,
 * mirroring this repo's SHA256 re-pin convention for other gates.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..', 'src')
const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')

interface Hit {
  file: string
  line: number
  content: string
}

/**
 * Blanks the interior of every `/* ... *\/` block comment (replacing every non-newline
 * character with a space) so line numbers and column positions are preserved exactly, unlike
 * `stripSourceComments()` (`src/backend/testUtils/stripSourceComments.ts`), which deletes whole
 * lines and would misalign this gate's `file:line` failure reporting.
 */
function stripBlockCommentsPreservingLines(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

/** Second stage: blank out (not delete) any line whose trimmed form starts with a comment marker. */
function blankLineCommentMarkers(lines: string[]): string[] {
  return lines.map((line) => {
    const trimmed = line.trim()
    const isCommentLine =
      trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
    return isCommentLine ? line.replace(/[^\n]/g, ' ') : line
  })
}

function collectTsFiles(root: string): string[] {
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    files.push(join(entry.parentPath ?? entry.path, entry.name))
  }
  return files
}

/**
 * The sole documented tolerance -- see the top-of-file docstring's "ONE DOCUMENTED, SURGICAL
 * EXCEPTION" section. Keyed by the file's repo-relative path and the EXACT trimmed content of
 * the tolerated line, so any drift in that fixture's text un-tolerates it automatically.
 */
const TOLERATED_HITS: Array<{ file: string; trimmedContent: string }> = [
  {
    file: 'src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts',
    trimmedContent: "import { app } from 'electron'",
  },
]

function isTolerated(file: string, content: string): boolean {
  const relPath = relative(join(__dirname, '..', '..'), file).split('\\').join('/')
  const trimmed = content.trim()
  return TOLERATED_HITS.some(
    (t) => t.file === relPath && t.trimmedContent === trimmed
  )
}

function findHits(pattern: RegExp): Hit[] {
  const hits: Hit[] = []
  for (const file of collectTsFiles(SRC_ROOT)) {
    const original = readFileSync(file, 'utf8')
    const blockStripped = stripBlockCommentsPreservingLines(original)
    const lines = blankLineCommentMarkers(blockStripped.split('\n'))
    const originalLines = original.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        const originalContent = originalLines[i]
        if (isTolerated(file, originalContent)) continue
        hits.push({ file, line: i + 1, content: originalContent.trim() })
      }
      // Reset lastIndex for global-less patterns is a no-op; kept for clarity if a
      // caller ever passes a `g`-flagged pattern.
      pattern.lastIndex = 0
    }
  }
  return hits
}

function formatHits(hits: Hit[]): string {
  return hits
    .map((h) => `  ${relative(join(__dirname, '..', '..'), h.file)}:${h.line}: ${h.content}`)
    .join('\n')
}

describe('D-03: electron package absence -- mechanized, mutation-proven gate', () => {
  it('has zero `from \'electron\'` / `from "electron"` static import specifiers under src/', () => {
    const hits = findHits(/from\s+(['"])electron\1/)
    if (hits.length > 0) {
      throw new Error(
        `Found a static import from the 'electron' package -- expected zero:\n${formatHits(hits)}`
      )
    }
    expect(hits).toHaveLength(0)
  })

  it('has zero `require(\'electron\')` / `require("electron")` calls under src/', () => {
    const hits = findHits(/require\(\s*(['"])electron\1\s*\)/)
    if (hits.length > 0) {
      throw new Error(
        `Found a require('electron') call -- expected zero:\n${formatHits(hits)}`
      )
    }
    expect(hits).toHaveLength(0)
  })

  it('has zero `Electron.` namespace references under src/', () => {
    const hits = findHits(/\bElectron\./)
    if (hits.length > 0) {
      throw new Error(
        `Found an Electron.* namespace reference -- expected zero:\n${formatHits(hits)}`
      )
    }
    expect(hits).toHaveLength(0)
  })

  it('has no `electron` (or `electron-*`, or `@types/electron`) key in package.json dependencies/devDependencies', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const allKeys = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const offenders = allKeys.filter(
      (k) => k === 'electron' || k === '@types/electron' || k.startsWith('electron-')
    )
    if (offenders.length > 0) {
      throw new Error(
        `package.json declares a forbidden electron package: ${offenders.join(', ')}`
      )
    }
    expect(offenders).toHaveLength(0)
  })

  it('vacuity control: a token that MUST survive under src/ is still found by the same scan mechanism', () => {
    // Without this control, a broken SRC_ROOT (typo, wrong join depth, CI working-directory
    // drift) or a broken collectTsFiles() would make every assertion above pass vacuously
    // against an empty or near-empty file set. `backend/platform` is the module the whole
    // migration this gate guards points AT, so it is guaranteed to appear widely.
    const hits = findHits(/backend\/platform/)
    expect(hits.length).toBeGreaterThan(0)
  })
})
