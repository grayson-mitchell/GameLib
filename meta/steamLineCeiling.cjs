'use strict'
/**
 * Phase 65 (65-01, D-01/D-02/D-13): shrink-only per-file line ceiling for
 * src/backend/storeManagers/steam/.
 *
 * Contract (same family as meta/indexedAccessRatchet.cjs):
 *   - No non-generated, non-test source file under steam/ may exceed 1,000
 *     lines unless it is allowlisted in meta/steamLineCeilingBaseline.json.
 *   - An allowlisted file must match its entry EXACTLY: growth fails, and a
 *     shrink fails until the entry is lowered in the same commit as the move.
 *   - An entry at or under the ceiling, or naming a missing file, fails.
 *   - There is NO --update flag. Numbers move by hand, in the same commit as
 *     the move (D-13). The phase ends with the baseline `{}`.
 *   - Scope is steam/ only; a backend-wide ceiling is a deferred idea.
 *
 * Counting is `wc -l` semantics (newline count).
 */
const fs = require('node:fs')
const path = require('node:path')

const CEILING = 1000
const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_ROOT = path.join(
  REPO_ROOT,
  'src',
  'backend',
  'storeManagers',
  'steam'
)
const DEFAULT_BASELINE = path.join(__dirname, 'steamLineCeilingBaseline.json')
// Scanned-file floor: ~80% of the 128 code files measured at 65-01. Zero files
// scanned must never read as a pass.
const DEFAULT_MIN_FILES = 100
const CODE_EXT = new Set(['.ts', '.tsx', '.cjs', '.mjs', '.js'])
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'node_modules'])

/** @param {string} text */
function countLines(text) {
  if (text === '') return 0
  const n = text.split('\n').length
  return text.endsWith('\n') ? n - 1 : n
}

/**
 * @param {string} root directory to scan
 * @param {string} [base] paths are returned relative to this (POSIX)
 * @returns {string[]}
 */
function collectFiles(root, base = REPO_ROOT) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const name = entry.name
      if (!CODE_EXT.has(path.extname(name))) continue
      if (/\.(test|spec)\./.test(name) || name.includes('.generated.')) continue
      out.push(path.relative(base, full).split(path.sep).join('/'))
    }
  }
  walk(root)
  return out
}

/**
 * Pure. Returns failure messages (empty = pass).
 * @param {Record<string, number>} baseline
 * @param {Record<string, number>} current
 * @param {number} [ceiling]
 * @returns {string[]}
 */
function evaluate(baseline, current, ceiling = CEILING) {
  const failures = []
  for (const file of Object.keys(current).sort()) {
    const n = current[file]
    const allowed = baseline[file]
    // A missing entry and an invalid (at/under-ceiling) entry both leave the
    // file held to the plain ceiling. The invalid entry itself is reported in
    // the baseline loop below, whatever the file's size.
    if (allowed === undefined || allowed <= ceiling) {
      if (n > ceiling)
        failures.push(
          `over ceiling: ${file} has ${n} lines (max ${ceiling}); split it, do not allowlist it`
        )
      continue
    }
    if (n > allowed) failures.push(`grew: ${file} ${n} > baseline ${allowed}`)
    else if (n < allowed && n > ceiling)
      failures.push(
        `shrank: lower ${file} to ${n} in this commit (baseline says ${allowed})`
      )
  }
  for (const file of Object.keys(baseline).sort()) {
    if (current[file] === undefined) {
      failures.push(
        `stale baseline entry: ${file} (file is gone; remove the entry in this commit)`
      )
    } else if (baseline[file] <= ceiling) {
      failures.push(
        `at or under ceiling: remove ${file} from the baseline in this commit (entry ${baseline[file]} is not above the ceiling of ${ceiling}; an entry cannot cap a file)`
      )
    } else if (current[file] <= ceiling) {
      failures.push(
        `at or under ceiling: remove ${file} from the baseline in this commit (${current[file]} lines)`
      )
    }
  }
  return failures
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? undefined : argv[i + 1]
}

function main() {
  const argv = process.argv.slice(2)
  const root = argValue(argv, '--root')
    ? path.resolve(argValue(argv, '--root'))
    : DEFAULT_ROOT
  const base = argValue(argv, '--root') ? root : REPO_ROOT
  const baselinePath = argValue(argv, '--baseline') || DEFAULT_BASELINE
  const minFiles = Number(argValue(argv, '--min-files') || DEFAULT_MIN_FILES)

  let baseline
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  } catch (e) {
    console.error(`cannot read baseline ${baselinePath}: ${e.message}`)
    process.exit(1)
  }

  const files = collectFiles(root, base)
  if (files.length < minFiles) {
    console.error(
      `FAIL: scanned only ${files.length} files, below the floor of ${minFiles}; the scan is broken`
    )
    process.exit(1)
  }
  const current = {}
  for (const rel of files)
    current[rel] = countLines(fs.readFileSync(path.join(base, rel), 'utf8'))

  const failures = evaluate(baseline, current)
  if (failures.length === 0) {
    console.log(
      `PASS (${files.length} files scanned, ${Object.keys(baseline).length} allowlisted over ${CEILING})`
    )
    return
  }
  for (const f of failures) console.error(`FAIL: ${f}`)
  process.exit(1)
}

module.exports = { countLines, collectFiles, evaluate }

if (require.main === module) main()
