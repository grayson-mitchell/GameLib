/**
 * Quick 261107-brs. Replaces the ts-prune two-ledger ratchet behind
 * `pnpm find-deadcode`. Holds knip's findings at an exact IDENTITY set in
 * meta/knip-baseline.txt, Phase 62 ratchet style: a finding that is not in the
 * baseline fails ("new knip finding"), and a baseline line whose finding has
 * disappeared fails too ("remove this line ... in this commit"), so the
 * committed ledger always equals the real findings. It is shrink-only:
 * removing one dead symbol while adding a different one cannot net to green.
 * There is no --update flag: lines move by hand, in the same commit that
 * removes dead code (or that adds a justified `@public` tag).
 *
 * "Warn-only" reading of the todo: knip itself runs with `--no-exit-code`, so
 * its raw findings are reported and never fatal on their own. THIS ratchet is
 * the gate (the `find-deadcode` script pipes knip's JSON into it), and it is a
 * hard gate on drift in either direction, because the ts-prune gate it
 * replaces was already a hard gate that lint.yml and .husky/pre-push call.
 *
 * Input is knip's `--reporter json` output on stdin:
 *   { "issues": [ { "file": "<repo-relative posix path>",
 *                   "<type>": [ { "name", "line", "col", "pos",
 *                                 "namespace"? } ] ,
 *                   "duplicates": [ [ { "name", ... }, ... ] ] } ] }
 * where <type> is files | exports | types | dependencies | devDependencies |
 * unlisted | binaries | unresolved | enumMembers | classMembers | ...
 * Dependency findings carry file "package.json". An identity is
 * `type<TAB>path<TAB>symbol` with no line numbers, so unrelated edits that
 * shift lines never move the baseline.
 *
 * An empty, unparseable or issues-less report exits 1: a knip crash must never
 * read as "zero findings".
 *
 * Plain CommonJS, node: builtins only. No child process (the report arrives on
 * stdin), so the fake-HOME rule has nothing to govern here.
 *
 * Local usage:
 *   pnpm find-deadcode
 *   pnpm exec knip --no-exit-code --reporter json | node meta/knipRatchet.cjs --baseline /tmp/b.txt
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_BASELINE = path.join(__dirname, 'knip-baseline.txt')

/** Pure: repo-relative posix path. */
function normalisePath(file) {
  let p = String(file)
  if (path.isAbsolute(p)) {
    const rel = path.relative(REPO_ROOT, p)
    if (!rel.startsWith('..')) p = rel
  }
  return p.replace(/\\/g, '/')
}

/**
 * Pure: a parsed knip JSON report -> sorted, de-duplicated identity list.
 * @param {{ issues?: unknown }} report
 * @returns {string[]}
 */
function identitiesFromReport(report) {
  if (!report || !Array.isArray(report.issues)) {
    throw new Error('knip report has no `issues` array')
  }
  const ids = new Set()
  for (const issue of report.issues) {
    const file = normalisePath(issue.file)
    for (const [type, items] of Object.entries(issue)) {
      if (type === 'file' || !Array.isArray(items)) continue
      for (const item of items) {
        let symbol
        if (Array.isArray(item)) {
          // duplicates / cycles: a group of names
          symbol = item
            .map((i) => i.name)
            .sort()
            .join(',')
        } else if (type === 'files') {
          symbol = '-'
        } else if (item.namespace) {
          symbol = `${item.namespace}.${item.name}`
        } else {
          symbol = item.name
        }
        if (typeof symbol !== 'string' || symbol === '') continue
        ids.add(`${type}\t${file}\t${symbol}`)
      }
    }
  }
  return [...ids].sort()
}

/**
 * Pure: baseline text -> identity list. Blank lines and `#` lines ignored.
 * @param {string} text
 * @returns {string[]}
 */
function parseBaseline(text) {
  const ids = []
  const seen = new Set()
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.trim() === '' || line.startsWith('#')) continue
    if (seen.has(line)) {
      throw new Error(`duplicate baseline identity: ${line}`)
    }
    seen.add(line)
    ids.push(line)
  }
  return ids
}

/**
 * Pure: equality comparison. Returns failure messages (empty = pass).
 * @param {string[]} baseline
 * @param {string[]} current
 * @returns {string[]}
 */
function evaluate(baseline, current) {
  const b = new Set(baseline)
  const c = new Set(current)
  const failures = []
  for (const id of [...c].sort()) {
    if (!b.has(id)) {
      failures.push(
        `new knip finding: ${id.replace(/\t/g, ' | ')} (remove the dead code, or tag a justified export \`@public\`)`
      )
    }
  }
  for (const id of [...b].sort()) {
    if (!c.has(id)) {
      failures.push(
        `baseline line no longer found, remove this line from meta/knip-baseline.txt in this commit: ${id.replace(/\t/g, ' | ')}`
      )
    }
  }
  return failures
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  const argv = process.argv.slice(2)
  const bi = argv.indexOf('--baseline')
  const baselinePath = bi >= 0 ? argv[bi + 1] : DEFAULT_BASELINE
  if (!baselinePath) {
    console.error('FAIL: --baseline needs a path')
    process.exit(1)
  }

  const input = readStdin()
  if (input.trim() === '') {
    console.error(
      'FAIL: empty knip report on stdin (knip crashed or printed nothing); refusing to read it as zero findings'
    )
    process.exit(1)
  }
  let current
  try {
    current = identitiesFromReport(JSON.parse(input))
  } catch (e) {
    console.error(`FAIL: unusable knip report: ${e.message}`)
    process.exit(1)
  }
  let baseline
  try {
    baseline = parseBaseline(fs.readFileSync(baselinePath, 'utf8'))
  } catch (e) {
    console.error(`FAIL: unusable baseline ${baselinePath}: ${e.message}`)
    process.exit(1)
  }

  const failures = evaluate(baseline, current)
  if (failures.length === 0) {
    const counts = {}
    for (const id of current) {
      const t = id.split('\t')[0]
      counts[t] = (counts[t] || 0) + 1
    }
    const summary = Object.entries(counts)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([t, n]) => `${t}: ${n}`)
      .join(', ')
    console.log(`PASS (${current.length} baselined knip findings; ${summary})`)
    return
  }
  for (const f of failures) console.error(`FAIL: ${f}`)
  process.exit(1)
}

module.exports = { evaluate, identitiesFromReport, parseBaseline }

if (require.main === module) main()
