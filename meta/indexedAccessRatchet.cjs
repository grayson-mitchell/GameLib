/**
 * Quick 261107-9lq. Holds `noUncheckedIndexedAccess` errors at a per-bucket
 * count while the flag stays OFF in tsconfig.json / tsconfig.meta.json.
 *
 * Why a ratchet and not the flag: a scoped tsconfig cannot work alone, because
 * tsc reports errors in every file of the program, imported files included.
 * So the scope lives here, in the bucket rules. The compiler runs with the
 * flag forced on over both tsconfigs, each error is put in a per-directory
 * bucket, and the buckets are compared with meta/indexedAccessBaseline.json.
 *
 * - ADOPTED_BUCKETS must be at 0 and must not appear in the baseline.
 * - Every other bucket is an EQUALITY ceiling (clippyRatchet style): growth
 *   fails, a new bucket fails, and a count BELOW the baseline fails too with
 *   "lower <bucket> to <n> in this commit". A baseline left above the real
 *   count is slack that later growth could hide in, which would defeat a
 *   shrink-only ratchet. The cost is one edited number per incidental fix.
 * - There is no --update flag: numbers move by hand.
 * - A config error, an empty program, or a diagnostic with no file fails. None
 *   of them can read as zero sites.
 *
 * It uses the TypeScript compiler API (like meta/lintScoped.cjs uses the
 * ESLint API): no shell, no lost exit code, no extra committed tsconfig, and
 * no child process for the fake-HOME rule to govern. tsconfig.meta.json pulls
 * in src files, so sites are deduplicated by file+start+code.
 *
 * Usage:
 *   node meta/indexedAccessRatchet.cjs [--list [prefix]]
 *        [--project <tsconfig>]... [--baseline <path>] [--root <dir>]
 *
 * Plain CommonJS; node: builtins plus typescript.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const ADOPTED_BUCKETS = [
  'src/backend/storeManagers/steam',
  'src/backend/storeManagers/gog',
  'src/backend/storeManagers/legendary',
  'src/backend/humble',
  'src/backend/storeManagers/steam (tests)',
  'src/backend/engine',
  'src/backend/__tests__',
  'src/backend/wine',
  'src/backend/utils',
  'src/backend/utils.ts',
  'src/backend/testUtils',
  'src/backend/downloadmanager',
  'src/backend/knownFixesRegistry.ts',
  'src/backend/launcher.ts',
  'src/backend/knownFixOverlayArchive.ts',
  'src/backend/save_sync.ts',
  'src/backend/storeSearch',
  'src/backend/wiki_game_info',
  'src/backend/signInProbe',
  'src/backend/scanners',
  'src/backend/storeManagers/sideload',
  'src/backend/appshell',
  'src/backend/logger',
  'src/backend/platform',
  'src/backend/steamgrid',
  'src/backend/storeManagers/nile',
  'src/frontend/state',
  'src/frontend/hooks',
  'src/frontend/styles',
  'src/common/winetricks',
  'src/common/reportProblem.ts',
  'src/common/knownFixOverlayCatalogue.ts',
  'src/common/types',
  'src/preload/__tests__',
  'src/preload/api'
]

/**
 * Pure: repo-relative POSIX path -> bucket name.
 * @param {string} rel
 */
function bucketOf(rel) {
  const parts = rel.split('/')
  const base = parts[parts.length - 1]
  if (parts[0] === 'meta') return 'meta'
  if (
    parts[0] === 'src' &&
    parts[1] === 'backend' &&
    parts[2] === 'storeManagers' &&
    parts.length > 3
  ) {
    const store = parts[3]
    const root = `src/backend/storeManagers/${store}`
    if (store === 'steam') {
      const isTest = parts.includes('__tests__') || base.includes('.test.')
      return isTest ? `${root} (tests)` : root
    }
    return root
  }
  if (parts[0] === 'src' && parts.length >= 3) {
    return `src/${parts[1]}/${parts[2]}`
  }
  return parts.slice(0, 2).join('/')
}

/**
 * Pure: diagnostics -> deduplicated sites and failures.
 * Each diagnostic is { file?: string (repo-relative or absolute), start, line,
 * col, code }. `root` is the absolute repo root.
 * @param {Array<{file?: string, start: number, line: number, col: number, code: number}>} diags
 * @param {string} root
 */
function tally(diags, root) {
  const counts = {}
  const sites = []
  const failures = []
  const files = {}
  const seen = new Set()
  for (const d of diags) {
    if (!d.file) {
      failures.push(
        `Diagnostic TS${d.code} has no file (config/global error, not a site).`
      )
      continue
    }
    const abs = path.resolve(root, d.file)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      failures.push(`Diagnostic TS${d.code} in ${d.file} is outside the repo.`)
      continue
    }
    const key = `${rel}|${d.start}|${d.code}`
    if (seen.has(key)) continue
    seen.add(key)
    const bucket = bucketOf(rel)
    counts[bucket] = (counts[bucket] || 0) + 1
    ;(files[bucket] = files[bucket] || new Set()).add(rel)
    sites.push({ file: rel, line: d.line, col: d.col, code: d.code, bucket })
  }
  return { counts, sites, failures, files }
}

/**
 * Pure: failure strings.
 * @param {ReturnType<typeof tally>} t
 * @param {Record<string, number>} baseline
 * @param {string[]} adopted
 * @param {string[]} [extra]
 */
function evaluate(t, baseline, adopted = ADOPTED_BUCKETS, extra = []) {
  const failures = [...extra, ...t.failures]
  for (const a of adopted) {
    if (baseline[a] !== undefined) {
      failures.push(`${a} is adopted and must not be listed in the baseline.`)
    }
    const n = t.counts[a] || 0
    if (n > 0) {
      const files = [...((t.files && t.files[a]) || [])].sort().join(', ')
      failures.push(
        `${n} site(s) in adopted bucket ${a} (must be 0): ${files} (run with --list).`
      )
    }
  }
  const names = new Set([...Object.keys(t.counts), ...Object.keys(baseline)])
  for (const b of [...names].sort()) {
    if (adopted.includes(b)) continue
    const count = t.counts[b] || 0
    const base = baseline[b]
    if (base === undefined) {
      failures.push(
        `${count} site(s) in new bucket ${b}, which has no baseline (run with --list).`
      )
    } else if (count > base) {
      failures.push(
        `${count - base} new site(s) in ${b}: ${count} found, baseline is ${base} (run with --list).`
      )
    } else if (count === 0) {
      failures.push(`${b} is at 0: delete it from the baseline in this commit.`)
    } else if (count < base) {
      failures.push(
        `${b} has ${count} site(s), below its baseline ${base}: lower ${b} to ${count} in this commit.`
      )
    }
  }
  return failures
}

function collect(projects, root) {
  const diags = []
  const errors = []
  let oldProgram
  for (const proj of projects) {
    const cfgPath = path.resolve(root, proj)
    const host = {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) =>
        errors.push(
          `${proj}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
        )
    }
    const parsed = ts.getParsedCommandLineOfConfigFile(
      cfgPath,
      { noUncheckedIndexedAccess: true, noEmit: true },
      host
    )
    if (!parsed) {
      errors.push(`${proj}: could not be parsed.`)
      continue
    }
    for (const e of parsed.errors) {
      errors.push(
        `${proj}: ${ts.flattenDiagnosticMessageText(e.messageText, '\n')}`
      )
    }
    if (parsed.fileNames.length === 0) {
      errors.push(`${proj}: no root files (empty program).`)
      continue
    }
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      projectReferences: parsed.projectReferences,
      oldProgram
    })
    oldProgram = program
    for (const d of [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics()
    ]) {
      errors.push(
        `${proj}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
      )
    }
    // The base programs are clean with the flag off, so every pre-emit
    // diagnostic is a flag site; none are filtered, so none can vanish.
    for (const d of ts.getPreEmitDiagnostics(program)) {
      if (!d.file || d.start === undefined) {
        diags.push({ file: undefined, start: 0, line: 0, col: 0, code: d.code })
        continue
      }
      const lc = d.file.getLineAndCharacterOfPosition(d.start)
      diags.push({
        file: d.file.fileName,
        start: d.start,
        line: lc.line + 1,
        col: lc.character + 1,
        code: d.code
      })
    }
  }
  return { diags, errors }
}

function main() {
  const argv = process.argv.slice(2)
  const projects = []
  let baselinePath
  let root = path.resolve(__dirname, '..')
  let list = false
  let prefix = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') projects.push(argv[++i])
    else if (a === '--baseline') baselinePath = argv[++i]
    else if (a === '--root') root = path.resolve(argv[++i])
    else if (a === '--list') {
      list = true
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) prefix = argv[++i]
    } else {
      console.error(`unknown argument ${a}`)
      process.exit(1)
    }
  }
  if (projects.length === 0)
    projects.push('tsconfig.json', 'tsconfig.meta.json')
  baselinePath = path.resolve(
    baselinePath || path.join(root, 'meta', 'indexedAccessBaseline.json')
  )
  let baseline
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  } catch (e) {
    console.error(`cannot read baseline ${baselinePath}: ${e.message}`)
    process.exit(1)
  }
  const { diags, errors } = collect(projects, root)
  const t = tally(diags, root)
  const names = new Set([...Object.keys(t.counts), ...Object.keys(baseline)])
  for (const b of [...names].sort()) {
    const base = ADOPTED_BUCKETS.includes(b)
      ? '0 (adopted)'
      : baseline[b] !== undefined
        ? baseline[b]
        : '-'
    console.log(`${b}: ${t.counts[b] || 0} (baseline ${base})`)
  }
  if (list) {
    for (const s of t.sites) {
      if (prefix && !s.file.startsWith(prefix)) continue
      console.log(`${s.file}:${s.line}:${s.col} TS${s.code}`)
    }
  }
  const failures = evaluate(t, baseline, ADOPTED_BUCKETS, errors)
  if (failures.length === 0) {
    console.log('PASS')
    return
  }
  for (const f of failures) console.error(`FAIL: ${f}`)
  process.exit(1)
}

module.exports = { bucketOf, tally, evaluate, ADOPTED_BUCKETS }

if (require.main === module) main()
