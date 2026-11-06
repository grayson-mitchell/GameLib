/**
 * Phase 62 plan 02 (D-13, D-14). Counts runner/store literal comparisons per
 * scope with the ESLint Node API and holds the count at an EQUALITY ceiling:
 * the count rising fails ("new runner literal"), and the count falling fails
 * too ("lower the ceiling in this commit"), so the ceiling in the repo always
 * equals the real count. There is no --update flag: ceilings move by hand in
 * the same commit that removes sites.
 *
 * The rule lives here, not in eslint.config.mjs, until both counts reach 0
 * (62-20 promotes it), because lintScoped.cjs SRC_CEILING counts every
 * warning and would absorb these.
 *
 * `--list` prints every site as path:line:col, grouped by scope, sorted.
 *
 * Plain CommonJS; uses the ESLint Node API, not a spawned binary, so a crash
 * cannot look like a pass.
 */

'use strict'

const path = require('node:path')
const { ESLint } = require('eslint')
const {
  SELECTORS,
  SCOPE_FILES,
  SCOPE_IGNORES
} = require('./runnerLiteralSelectors.cjs')

// Ceilings, each at its exact measured count for the ratified selector.
// 2026-11-06 62-02: FRONTEND_CEILING 136 measured with the ratified selector
const FRONTEND_CEILING = 136
// 2026-11-06 62-02: BACKEND_CEILING 65 measured with the ratified selector
// 2026-11-07 62-14: 65 -> 51, launcher.ts
// 2026-11-07 62-15: 51 -> 31, downloadmanager + gamedetails/dispatch
// 2026-11-07 62-15: 31 -> 24, tools + save_sync + utils + uninstaller + macArch
// 2026-11-07 62-16: 24 -> 16, sidecar registrations + oauthLoginCapture
// 2026-11-07 62-16: 16 -> 0, remaining backend sites
const BACKEND_CEILING = 0
// Floors: 50% of the measured file count (as lintScoped does).
const FRONTEND_MIN_FILES = 224 // 448 files measured
const BACKEND_MIN_FILES = 115 // 231 files measured

const REPO_ROOT = path.join(__dirname, '..')

const SCOPES = {
  frontend: {
    label: 'frontend',
    ceilingName: 'FRONTEND_CEILING',
    ceiling: FRONTEND_CEILING,
    minFiles: FRONTEND_MIN_FILES
  },
  backend: {
    label: 'backend',
    ceilingName: 'BACKEND_CEILING',
    ceiling: BACKEND_CEILING,
    minFiles: BACKEND_MIN_FILES
  }
}

/**
 * Pure: returns the list of failure strings for one scope.
 * @param {{count:number, files:number}} measured
 * @param {{label:string, ceilingName:string, ceiling:number, minFiles:number}} scope
 */
function evaluateScope(measured, scope) {
  const failures = []
  if (measured.files < scope.minFiles) {
    failures.push(
      `Scope "${scope.label}" matched ${measured.files} file(s), below its ` +
        `minFiles floor of ${scope.minFiles} (scope collapsed) -- fix the ` +
        'patterns, do not lower the floor.'
    )
  }
  if (measured.count > scope.ceiling) {
    failures.push(
      `${measured.count - scope.ceiling} new runner literal(s) in ${scope.label}: ` +
        `${measured.count} found, ${scope.ceilingName} is ${scope.ceiling}. ` +
        'Use storeCapabilities / isStore instead (run with --list).'
    )
  } else if (measured.count < scope.ceiling) {
    failures.push(
      `${scope.label} has ${measured.count} runner literal(s), below ` +
        `${scope.ceilingName} ${scope.ceiling}: lower ${scope.ceilingName} ` +
        `to ${measured.count} in this commit.`
    )
  }
  return failures
}

/**
 * @param {{frontend:{count:number,files:number}, backend:{count:number,files:number}}} counts
 * @param {Record<string, {label:string, ceilingName:string, ceiling:number, minFiles:number}>} [scopes]
 * @returns {string[]}
 */
function evaluate(counts, scopes = SCOPES) {
  const failures = []
  for (const name of Object.keys(scopes)) {
    failures.push(...evaluateScope(counts[name], scopes[name]))
  }
  return failures
}

/** Lints one scope; returns { count, files, sites }. */
async function countSites(name) {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: require('typescript-eslint').parser },
        rules: { 'no-restricted-syntax': ['warn', ...SELECTORS] }
      },
      { ignores: [...SCOPE_IGNORES] }
    ],
    errorOnUnmatchedPattern: false,
    cache: true,
    cacheLocation: path.join(
      REPO_ROOT,
      'node_modules',
      '.cache',
      `boundary-ratchet-${name}`
    )
  })
  const results = await eslint.lintFiles(SCOPE_FILES[name])
  const sites = []
  for (const r of results) {
    for (const m of r.messages) {
      if (m.ruleId === 'no-restricted-syntax') {
        sites.push(
          `${path.relative(REPO_ROOT, r.filePath)}:${m.line}:${m.column}`
        )
      }
    }
  }
  sites.sort()
  return { count: sites.length, files: results.length, sites }
}

async function main() {
  const list = process.argv.includes('--list')
  const measured = {
    frontend: await countSites('frontend'),
    backend: await countSites('backend')
  }
  if (list) {
    for (const name of Object.keys(SCOPES)) {
      console.log(`# ${name}`)
      for (const s of measured[name].sites) console.log(s)
    }
  }
  const failures = evaluate(measured)
  console.error(
    Object.keys(SCOPES)
      .map(
        (n) =>
          `${n}: ${measured[n].count}/${SCOPES[n].ceiling} (${measured[n].files} files)`
      )
      .join(' | ')
  )
  for (const f of failures) console.error(f)
  process.exit(failures.length === 0 ? 0 : 1)
}

module.exports = {
  evaluate,
  countSites,
  FRONTEND_CEILING,
  BACKEND_CEILING,
  FRONTEND_MIN_FILES,
  BACKEND_MIN_FILES
}

if (require.main === module) {
  main().catch((err) => {
    // A runner that crashes must never look like a pass.
    console.error('boundaryRatchet.cjs crashed:', err)
    process.exit(1)
  })
}
