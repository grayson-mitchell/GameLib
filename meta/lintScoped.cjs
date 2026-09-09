/**
 * Quick task 260909-s8x. `pnpm lint` used to be one `eslint --max-warnings
 * N .` invocation with a single ceiling shared by production and test code.
 * That let a test-file warning "hide" under production headroom (or vice
 * versa) as long as the SUM stayed under N. This runner replaces the single
 * ceiling with two independent ones -- production and tests -- so a
 * regression in either population can never be absorbed by headroom in the
 * other.
 *
 * This file is the SINGLE SOURCE OF TRUTH for both scopes: the glob
 * patterns, the two ceilings, the two cache locations, and the two
 * file-count floors. `package.json`'s `lint`, `lint:src` and `lint:tests`
 * scripts all route through this one file so the three can never drift
 * apart from each other.
 *
 * Deliberately a plain CommonJS `.cjs` file (matches `meta/runTs.cjs`).
 * `eslint.config.mjs`'s own `ignores` block already excludes every `.cjs`
 * file, so this one is not itself linted -- it must still be kept
 * prettier-clean by hand.
 *
 * Uses the ESLint Node API (`require('eslint').ESLint`) directly -- NOT a
 * spawned binary. `require.resolve('eslint/bin/eslint.js')` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` on eslint 9.29.0, and this repo's own
 * history is a catalogue of shell/exit-code fail-open shapes (`esbuild |
 * node -` swallowing a nonzero exit; `spawnSync` blocking signal handlers;
 * `prettier --check` resolving a different config from a `cd`-ed copy and
 * reporting clean). Calling the API directly removes that entire class of
 * failure -- there is no shell and no exit code to lose.
 *
 * Argv contract: `--src` runs only the production scope, `--tests` runs
 * only the test scope, and no selector runs BOTH, unconditionally, one
 * after the other -- never short-circuiting. See the decision comment on
 * `main()` below for why the aggregate case does not chain with `&&`.
 */

'use strict'

const { ESLint } = require('eslint')

// Ceilings measured 2026-09-09 against commit 8f0d7ff20 (the tip of
// fix/steam-native-install-stability immediately after this quick task's
// Task 1 config-edit commit landed). See
// .planning/quick/260909-s8x-split-the-lint-ratchet-into-separate-pro/260909-s8x-LINT-BASELINE.md
// for the full verbatim measurement transcripts, the plan-vs-measured
// reconciliation, and how to legitimately move either number.
//
// Neither ceiling carries padding: each sits at its exact measured warning
// count for its scope. N-1 must be RED and N must be GREEN.
const SRC_CEILING = 1123
const TESTS_CEILING = 638

// Each floor is 50% of the same commit's measured linted-file count for
// that scope, rounded down (src: 751 files -> 375; tests: 441 files ->
// 220). This is NOT a drift ratchet -- this repo deletes files routinely,
// and the floor is not meant to track that. It exists solely to catch
// SCOPE COLLAPSE: a glob pattern that silently starts matching nothing
// lints zero files, produces zero warnings, and a zero-headroom warning
// ceiling cannot tell "zero warnings because the scope is clean" apart
// from "zero warnings because nothing was linted" -- both pass. A floor
// well below the measured count still catches a collapse to zero (or to
// any implausibly small remainder) without being a second ceiling in
// disguise.
const SRC_MIN_FILES = 375
const TESTS_MIN_FILES = 220

const SCOPES = {
  src: {
    label: 'production',
    eslintOptions: {
      cache: true,
      cacheLocation: '.eslintcache-src',
      ignorePatterns: ['**/__tests__/**', '**/__mocks__/**']
    },
    patterns: ['.'],
    maxWarnings: SRC_CEILING,
    minFiles: SRC_MIN_FILES
  },
  tests: {
    label: 'tests',
    eslintOptions: {
      cache: true,
      cacheLocation: '.eslintcache-tests',
      // A future glob edit that matches nothing must not abort the run --
      // the `minFiles` floor below is what is supposed to catch that
      // instead, so it needs the chance to run rather than eslint throwing
      // first.
      errorOnUnmatchedPattern: false
    },
    patterns: [
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/__mocks__/**/*.ts',
      '**/__mocks__/**/*.tsx'
    ],
    maxWarnings: TESTS_CEILING,
    minFiles: TESTS_MIN_FILES
  }
}

/**
 * Lints one scope and reports every failing condition it finds -- it does
 * NOT short-circuit on the first failure, because a developer who only
 * ever sees the first reported problem for a scope has to make a second
 * round trip to discover the second one.
 *
 * @param {string} name 'src' or 'tests'
 * @returns {Promise<boolean>} true if the scope passed
 */
async function runScope(name) {
  const scope = SCOPES[name]
  const eslint = new ESLint(scope.eslintOptions)
  const results = await eslint.lintFiles(scope.patterns)

  const formatter = await eslint.loadFormatter('stylish')
  const output = formatter.format(results)
  if (output) {
    console.log(output)
  }

  let errorCount = 0
  let warningCount = 0
  for (const result of results) {
    errorCount += result.errorCount
    warningCount += result.warningCount
  }

  const failures = []

  if (errorCount > 0) {
    failures.push(`${errorCount} error(s) in the ${scope.label} scope.`)
  }

  if (results.length < scope.minFiles) {
    failures.push(
      `Scope "${scope.label}" linted ${results.length} file(s), below its ` +
        `minFiles floor of ${scope.minFiles}. A scope that silently matches ` +
        'fewer files than this either collapsed to near-nothing or its ' +
        'patterns are wrong -- fix the patterns, do not lower the floor.'
    )
  }

  if (warningCount > scope.maxWarnings) {
    // Kept in ESLint's own wording so existing greps/expectations against
    // "ESLint found too many warnings" still bind against this runner.
    failures.push(
      `ESLint found too many warnings (maximum: ${scope.maxWarnings}).`
    )
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure)
    }
    return false
  }

  return true
}

/**
 * Decision (recorded in full in 260909-s8x-LINT-BASELINE.md): with no
 * selector flag, this runs BOTH scopes unconditionally and ORs their
 * failures together (fails if EITHER scope fails), rather than being
 * implemented as `pnpm lint:src && pnpm lint:tests`. The `&&` form is
 * exit-code-correct but reports only half the picture: a production
 * failure would stop the command before the test scope ever runs, so a
 * developer who fixes the production regression has to push a second time
 * to discover a test-scope regression that was sitting there the whole
 * time. Since the entire point of this split is that both populations are
 * independently visible, chaining them back together defeats it.
 */
async function main() {
  const args = new Set(process.argv.slice(2))
  const runSrc = args.has('--src')
  const runTests = args.has('--tests')
  const runBoth = !runSrc && !runTests

  const results = []

  if (runSrc || runBoth) {
    results.push(['production', await runScope('src')])
  }
  if (runTests || runBoth) {
    results.push(['tests', await runScope('tests')])
  }

  console.log(
    results
      .map(([label, ok]) => `${label}: ${ok ? 'PASS' : 'FAIL'}`)
      .join(' | ')
  )

  const ok = results.every(([, passed]) => passed)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  // A runner that crashes must never look like a pass.
  console.error('lintScoped.cjs crashed:', err)
  process.exit(1)
})
