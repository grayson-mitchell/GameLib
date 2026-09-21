/**
 * Quick task 260922-9um. `pnpm find-deadcode` used to be `ts-prune --error`,
 * which exits non-zero on ANY finding. This fork has 256 findings, so the
 * gate has NEVER exited 0 in its recorded history (five recorded Lint-job
 * runs, all red, back to 2026-07-14). A gate that is red unconditionally
 * cannot signal a new regression: a genuinely new dead export would be
 * invisible among 256 and the job would be red either way. This runner
 * replaces the unconditional `--error` with a two-population baseline
 * ratchet against two committed ledgers, so the gate is GREEN at HEAD and
 * goes RED on any change to either population in either direction.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the gate: the two baseline
 * paths, the parse of ts-prune's output shape, and the identity reduction.
 * `package.json`'s `find-deadcode` script routes through it, and the script
 * NAME is unchanged so `.github/workflows/lint.yml`'s `Find dead code` step
 * keeps binding without an edit to the workflow.
 *
 * Deliberately a plain CommonJS `.cjs` file (matches `meta/lintScoped.cjs`
 * and `meta/runTs.cjs`). `eslint.config.mjs`'s own `ignores` block already
 * excludes every `.cjs` file, so this one is not itself linted -- it must
 * still be kept prettier-clean by hand, because `prettier --check .` DOES
 * cover `.cjs`.
 *
 * ---------------------------------------------------------------------------
 * ts-prune internals. Both of these were read out of
 * `node_modules/ts-prune/lib/*.js` at 0.10.3, and the natural first guess is
 * wrong in both cases. They are recorded here because the deep import below
 * looks like a mistake until you know why it is not.
 *
 * 1. `require('ts-prune')` IS A TRAP. The package `main` (`lib/index.js`)
 *    calls `getConfig()`, `run(config)` and `process.exit()` at MODULE
 *    SCOPE -- merely requiring it runs the whole tool and kills the process,
 *    which would make this file impossible to unit-test. Deep-import
 *    `ts-prune/lib/runner` instead, which only exports `run`. ts-prune's
 *    package.json has no `exports` field, so the deep path resolves.
 *
 * 2. Do NOT call `getConfig()` from `ts-prune/lib/configurator`. It parses
 *    `process.argv` through the `commander` global singleton -- i.e. OUR
 *    argv, not ts-prune's. Any flag this runner ever grows could silently
 *    change what ts-prune analyses. `.ts-prunerc` is read directly instead
 *    (see `readIgnorePattern`), so the gate has zero coupling to argv.
 *
 * 3. `config.ignore` is matched against the WHOLE FORMATTED LINE, not just
 *    the path, despite ts-prune's CLI help calling it a "Path ignore RegExp
 *    pattern": `lib/runner.js` does
 *    `presented.filter(file => !file.match(config.ignore))` where
 *    `presented` is the array of already-formatted strings. So `ignore`
 *    COULD be used to hide ` (used in module)` wholesale. That is
 *    deliberately refused -- see the rejected options below.
 * ---------------------------------------------------------------------------
 * Rejected options, recorded so they read as decided rather than overlooked.
 *
 * - Drop `--error` / make the step report-only. This is the "widen the gate
 *   to admit what failed it" move `CLAUDE.md` forbids. It makes the job
 *   green and buys nothing at all.
 *
 * - Use `.ts-prunerc`'s `ignore` to hide every ` (used in module)` line.
 *   Leaves 52 findings, so the job stays RED anyway, AND permanently blinds
 *   the 204-strong over-broad-export population, leaving it unbounded.
 *
 * - Delete the 52 non-`(used in module)` findings. ~18 are deliberate
 *   compile-time type assertions in
 *   `src/backend/platform/__tests__/types.usage.test.ts`, and several are
 *   ts-prune PARSE ARTIFACTS (`satisfies`, `Record`, `readonly` -- not
 *   identifiers at all). Real blast radius, and it still leaves the 204
 *   unbounded. Rejected as the remedy for THIS task, not forever.
 *
 * - A `--update-baseline` flag. Deliberately absent, and its absence is the
 *   core of the design: it would destroy the `#` annotations that document
 *   the false-positive clusters in place, and it would be a one-keystroke
 *   way to admit a new finding. There is no code path in this file that adds
 *   an entry to a baseline. See `checkPopulation`.
 *
 * - A `minFiles`-style scope-collapse floor of the kind `lintScoped.cjs`
 *   carries. See the comment on `checkPopulation` for why it would be
 *   redundant here, and therefore worse than nothing.
 */

'use strict'

const fs = require('fs')
const path = require('path')

// Deep import, NOT `require('ts-prune')` -- see trap 1 in the header.
const { run } = require('ts-prune/lib/runner')

const REPO_ROOT = path.join(__dirname, '..')
const RC_PATH = path.join(REPO_ROOT, '.ts-prunerc')

// ts-prune's OWN default for `config.project`, reproduced here as a literal
// because `getConfig()` -- which is where that default normally comes from --
// is deliberately not called (trap 2 in the header). This is not optional
// and it does not default: `lib/runner.js` does
// `path.join(process.cwd(), config.project)` unguarded, so omitting it
// raises `TypeError: The "path" argument must be of type string` rather than
// falling back to anything. `.ts-prunerc` carries only `ignore`, so it is
// not the source for this value either.
const TS_PRUNE_PROJECT = 'tsconfig.json'

const POPULATIONS = {
  unreachable: {
    label: 'unreachable',
    baseline: path.join(__dirname, 'deadcode-baseline-unreachable.txt')
  },
  usedInModule: {
    label: 'used-in-module',
    baseline: path.join(__dirname, 'deadcode-baseline-used-in-module.txt')
  }
}

// `${file}:${line} - ${name}${usedInModule ? ' (used in module)' : ''}`
// -- `lib/presenter.js`. `file` is repo-relative (ts-prune strips
// `process.cwd()` and then a leading `/`).
const FINDING_RE = /^(.+):(\d+) - (.+?)( \(used in module\))?$/

const USED_IN_MODULE_SUFFIX = ' (used in module)'

/**
 * Reads the `ignore` pattern from `.ts-prunerc`, which stays the SINGLE
 * source of that pattern -- it is not duplicated into this file, so the
 * committed rc and the gate can never drift apart.
 *
 * A missing file or a missing `ignore` key is a hard failure rather than a
 * fallback to some hardcoded default. A silent default is the fail-open
 * shape this repo has repeatedly recorded lessons about: it would let the
 * gate quietly analyse a different population than the committed baselines
 * were measured from.
 *
 * @param {string} rcPath
 * @returns {string} the raw `ignore` RegExp pattern
 */
function readIgnorePattern(rcPath) {
  if (!fs.existsSync(rcPath)) {
    throw new Error(
      `findDeadcode: ${rcPath} does not exist. This gate reads its ignore ` +
        'pattern from .ts-prunerc and deliberately has no hardcoded ' +
        'fallback -- restore the file rather than adding a default here.'
    )
  }

  const parsed = JSON.parse(fs.readFileSync(rcPath, 'utf-8'))
  if (typeof parsed.ignore !== 'string') {
    throw new Error(
      `findDeadcode: ${rcPath} has no string "ignore" key. The committed ` +
        'baselines were measured WITH that pattern applied, so running ' +
        'without it would report a different population.'
    )
  }

  return parsed.ignore
}

/**
 * Runs ts-prune and returns every formatted finding line.
 *
 * `run(config, output)` has signature `(config, output = console.log) =>
 * number`: it invokes `output(line)` once per post-filter finding and
 * returns the post-filter count. Passing a collector callback yields every
 * line without touching stdout.
 *
 * The returned count is asserted against the number of collected lines. It
 * is a cheap self-check that the collector saw everything -- if a future
 * ts-prune ever filtered or batched differently, a collector that silently
 * saw fewer lines would shrink the measured population and the gate would
 * fail OPEN.
 *
 * ts-prune resolves both the tsconfig and the repo-relative paths in its
 * output against `process.cwd()`, so this chdirs to the repo root and
 * restores afterwards. Without it the gate's answer would depend on where
 * it was invoked from, and the identities would not match the committed
 * baselines.
 *
 * @returns {string[]} formatted finding lines
 */
function collectFindings() {
  const ignore = readIgnorePattern(RC_PATH)
  const lines = []

  const previousCwd = process.cwd()
  let count
  try {
    process.chdir(REPO_ROOT)
    count = run({ project: TS_PRUNE_PROJECT, ignore }, (line) => {
      lines.push(line)
    })
  } finally {
    process.chdir(previousCwd)
  }

  if (count !== lines.length) {
    throw new Error(
      `findDeadcode: ts-prune reported ${count} finding(s) but the ` +
        `collector saw ${lines.length}. The collector callback contract has ` +
        'changed; this gate would under-report until that is understood.'
    )
  }

  return lines
}

/**
 * Parses one formatted ts-prune line.
 *
 * A line that does not parse is a HARD FAILURE, never silently dropped.
 * This is deliberate and load-bearing: ts-prune's output format is an
 * unversioned contract on a deep-imported private module path, and if it
 * ever changes, silently dropping the lines that no longer parse would
 * shrink the measured population -- every baseline entry would come back as
 * `removed` at best, or, if the change were partial, a real new finding
 * could be dropped and the gate would pass while missing it. A format
 * change must go LOUD.
 *
 * @param {string} line
 * @returns {{ path: string, line: number, name: string,
 *   usedInModule: boolean }}
 */
function parseFinding(line) {
  const match = FINDING_RE.exec(line)
  if (!match) {
    throw new Error(
      `findDeadcode: could not parse ts-prune output line: ${JSON.stringify(
        line
      )}. Expected "<path>:<line> - <name>" optionally followed by ` +
        `"${USED_IN_MODULE_SUFFIX}". ts-prune's output format has probably ` +
        'changed -- fix this parser, do not make it skip what it cannot read.'
    )
  }

  return {
    path: match[1],
    line: Number(match[2]),
    name: match[3],
    usedInModule: match[4] !== undefined
  }
}

/**
 * Reduces a finding to the identity the baselines are keyed by.
 *
 * The LINE NUMBER IS DELIBERATELY DROPPED. That is what stops an ordinary
 * edit above a finding -- an added import, a reflowed comment -- from
 * churning the baseline and demanding an unrelated one-line diff on every
 * commit. A baseline that churns for reasons unconnected to dead code stops
 * being read, and an unread ledger is not a gate.
 *
 * @param {{ path: string, name: string }} finding
 * @returns {string}
 */
function identityOf(finding) {
  return `${finding.path} - ${finding.name}`
}

/**
 * Splits findings into two INDEPENDENT populations:
 *
 * - `unreachable`: no ` (used in module)` suffix. ts-prune found no
 *   importer at all (52 today).
 * - `usedInModule`: has the suffix. The export IS used, inside its own
 *   file, so this is an unnecessarily-broad `export` keyword rather than
 *   dead code (204 today).
 *
 * They are checked separately, carried across from `lintScoped.cjs`'s
 * header: a regression in either population must never be absorbable by
 * headroom in the other. This repo also has a recorded lesson that one flag
 * guarding two invariants breaks the moment either is tightened. The two
 * populations also have genuinely different remedies -- delete the symbol
 * vs. drop the `export` keyword -- so collapsing them would also collapse
 * the instruction the failure message can give.
 *
 * @param {Array<{ usedInModule: boolean }>} findings
 * @returns {{ unreachable: object[], usedInModule: object[] }}
 */
function partitionFindings(findings) {
  const unreachable = []
  const usedInModule = []

  for (const finding of findings) {
    if (finding.usedInModule) {
      usedInModule.push(finding)
    } else {
      unreachable.push(finding)
    }
  }

  return { unreachable, usedInModule }
}

/**
 * Parses a baseline ledger into a SET of identities.
 *
 * Blank lines and `#` comment lines are stripped. The `#` lines are
 * LOAD-BEARING, not decoration: they are where the false-positive clusters
 * (the `types.usage.test.ts` compile-time assertions, the
 * `satisfies`/`Record`/`readonly` parse artifacts) are annotated in place,
 * which is what turns an opaque 256 into a documented inventory. That is
 * also the reason there is no regeneration command -- it would delete them.
 *
 * Both sides of the comparison are SETS. ts-prune can emit two findings at
 * the same `path:line` (measured: `satisfies` and `readonly` at
 * `.../FilterFacetGroup/selectionCount.ts:46`); those carry distinct names
 * and so are distinct identities, but nothing in ts-prune's output
 * guarantees identity uniqueness in general. Comparing as sets means the
 * gate never has to reason about multiplicity, in either direction.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function parseBaseline(text) {
  const identities = new Set()

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) {
      continue
    }
    identities.add(line)
  }

  return identities
}

/**
 * @param {Set<string>} baselineSet
 * @param {Set<string>} foundSet
 * @returns {{ added: string[], removed: string[] }}
 */
function diffAgainstBaseline(baselineSet, foundSet) {
  const added = []
  const removed = []

  for (const identity of foundSet) {
    if (!baselineSet.has(identity)) {
      added.push(identity)
    }
  }
  for (const identity of baselineSet) {
    if (!foundSet.has(identity)) {
      removed.push(identity)
    }
  }

  added.sort()
  removed.sort()

  return { added, removed }
}

/**
 * @param {string} baselinePath
 * @returns {Set<string>}
 */
function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `findDeadcode: baseline ${baselinePath} does not exist. This gate ` +
        'requires committed baselines and has NO auto-create path -- a gate ' +
        'that writes its own baseline on first run passes trivially, which ' +
        'is exactly the green-check-proving-nothing shape this replaces.'
    )
  }

  return parseBaseline(fs.readFileSync(baselinePath, 'utf-8'))
}

/**
 * Checks one population against its own committed ledger.
 *
 * THE BASELINE IS A FROZEN LEGACY LEDGER THAT MAY ONLY SHRINK. Both diff
 * directions are failures, and zero headroom is deliberate -- it matches
 * `lintScoped.cjs`'s documented stance that "N-1 must be RED and N must be
 * GREEN":
 *
 * - An `added` identity is a NEW finding. It is resolved AT THE SOURCE, and
 *   the three legitimate remedies are named in the failure message. Editing
 *   the baseline is not one of them, and is deliberately not suggested.
 * - A `removed` identity means the baseline lists code that no longer
 *   exists. That is also a failure: a ledger carrying stale entries stops
 *   being an accurate census, and this repo has a long shelf of recorded
 *   lessons about trusting an inaccurate census. The remedy is a one-line
 *   deletion from the named file, which the message spells out.
 *
 * The consequence worth stating outright: because every new finding is
 * resolved at the source and never admitted to the ledger, THERE IS NO
 * CODE PATH HERE THAT ADDS A BASELINE ENTRY. The ledger can only ever get
 * smaller. There is nothing to abuse.
 *
 * DELIBERATELY NO SCOPE-COLLAPSE FLOOR of the `SRC_MIN_FILES` /
 * `TESTS_MIN_FILES` kind that `lintScoped.cjs` carries. That floor exists
 * there because a glob matching nothing lints zero files, produces zero
 * warnings, and silently passes a CEILING. This check is not a ceiling: it
 * is an exact SET comparison. If ts-prune analysed nothing, all ~256
 * baseline entries come back `removed` and the gate is ALREADY red. A
 * second mechanism would add no coverage while making the gate look like it
 * covers more than it does -- the green-check-proving-nothing pattern
 * `CLAUDE.md` keeps stamping out. It is absent on purpose, not by oversight.
 *
 * @param {{ label: string, baseline: string }} population
 * @param {object[]} findings
 * @returns {{ ok: boolean, summary: string, failures: string[] }}
 */
function checkPopulation(population, findings) {
  const foundSet = new Set(findings.map(identityOf))
  const baselineSet = readBaseline(population.baseline)
  const { added, removed } = diffAgainstBaseline(baselineSet, foundSet)

  const failures = []
  const relativeBaseline = path.relative(REPO_ROOT, population.baseline)

  if (added.length > 0) {
    failures.push(
      [
        `${population.label}: ${added.length} NEW finding(s) not in ` +
          `${relativeBaseline}:`,
        ...added.map((identity) => `  + ${identity}`),
        'Resolve each one AT THE SOURCE. Do not add it to the baseline:',
        '  (a) delete the dead export, if it really is dead; or',
        '  (b) drop the `export` keyword, if the symbol is only used ' +
          'inside its own module; or',
        '  (c) if the export is deliberate, mark it at the site with ' +
          '`// ts-prune-ignore-next` plus a comment saying WHY. This fork ' +
          'already does exactly that at src/backend/utils.ts:1809, ' +
          'src/backend/recent_games/recent_games.ts:64, and ' +
          'src/common/types/ipc.ts:81 and :185.'
      ].join('\n')
    )
  }

  if (removed.length > 0) {
    failures.push(
      [
        `${population.label}: ${removed.length} baseline entr(ies) in ` +
          `${relativeBaseline} no longer found:`,
        ...removed.map((identity) => `  - ${identity}`),
        `Delete each of those lines from ${relativeBaseline}. The ledger ` +
          'may only shrink, and a stale entry makes it an inaccurate census.'
      ].join('\n')
    )
  }

  const summary =
    failures.length === 0
      ? `${population.label}: ${foundSet.size} OK`
      : `${population.label}: ${foundSet.size} FAIL`

  return { ok: failures.length === 0, summary, failures }
}

/**
 * Reports EVERY failing condition across BOTH populations before exiting,
 * never short-circuiting on the first. Same reasoning as
 * `lintScoped.cjs`'s `runScope`/`main`: a developer who only ever sees the
 * first reported problem has to make a second round trip to discover the
 * second one, and the whole point of splitting the populations is that both
 * are independently visible.
 */
function main() {
  const findings = collectFindings().map(parseFinding)
  const partitioned = partitionFindings(findings)

  const results = [
    checkPopulation(POPULATIONS.unreachable, partitioned.unreachable),
    checkPopulation(POPULATIONS.usedInModule, partitioned.usedInModule)
  ]

  for (const result of results) {
    for (const failure of result.failures) {
      console.error(failure)
    }
  }

  console.log(results.map((result) => result.summary).join(' | '))

  process.exit(results.every((result) => result.ok) ? 0 : 1)
}

// `main()` runs ONLY as a CLI, so `meta/__tests__/findDeadcode.test.ts` can
// require this file for the pure helpers without starting a real ts-prune
// run. Precedent: `meta/runTs.cjs`.
if (require.main === module) {
  try {
    main()
  } catch (err) {
    // A runner that crashes must never look like a pass.
    console.error('findDeadcode.cjs crashed:', err)
    process.exit(1)
  }
}

module.exports = {
  parseFinding,
  identityOf,
  partitionFindings,
  parseBaseline,
  diffAgainstBaseline,
  readIgnorePattern,
  collectFindings
}
