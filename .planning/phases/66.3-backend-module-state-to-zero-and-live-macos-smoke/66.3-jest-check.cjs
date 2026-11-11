'use strict'
/**
 * 66.3 baseline-gated jest runner.
 * Usage: node 66.3-jest-check.cjs [--baseline <file>] [--write-baseline] [--from-json <file>] [<jest path args>...]
 * Runs jest --json; the JSON decides (jest's exit code is ignored). Exit 1 on any failure not in the baseline,
 * 2 on missing/unparseable JSON, zero suites, or a missing baseline in check mode.
 * Baseline policy: later plans may delete lines that now pass; no plan adds a line. A plan that cannot
 * reach baseline stops and reports instead of widening the file.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO = process.cwd()
let baseline = path.join(__dirname, '66.3-jest-baseline.txt')
let writeBaseline = false
let fromJson = null
const jestArgs = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--baseline') baseline = argv[++i]
  else if (a === '--write-baseline') writeBaseline = true
  else if (a === '--from-json') fromJson = argv[++i]
  else if (a.startsWith('--') && a !== '--') {
    console.error(
      'usage: 66.3-jest-check.cjs [--baseline f] [--write-baseline] [--from-json f] [jest paths...]'
    )
    process.exit(2)
  } else jestArgs.push(a)
}
if (!baseline || fromJson === undefined) {
  console.error('usage: 66.3-jest-check.cjs [--baseline f] [--write-baseline] [--from-json f] [jest paths...]')
  process.exit(2)
}

let jsonFile = fromJson
let cmd = null
if (!jsonFile) {
  jsonFile = path.join(os.tmpdir(), `66.3-jest-${process.pid}.json`)
  const args = ['jest', '--json', `--outputFile=${jsonFile}`, '--maxWorkers=2']
  if (jestArgs.length === 0) args.push('--silent')
  args.push(...jestArgs)
  cmd = `pnpm ${args.join(' ')}`
  spawnSync('pnpm', args, { stdio: 'inherit', cwd: REPO })
}
let res
try {
  res = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
} catch (e) {
  console.error(`jest JSON missing or unparseable: ${jsonFile} (${e.message})`)
  process.exit(2)
}
if (!res.numTotalTestSuites) {
  console.error('jest ran zero suites; refusing to pass vacuously')
  process.exit(2)
}
const toRel = (p) => path.relative(REPO, p).split(path.sep).join('/')
const keys = new Set()
for (const tr of res.testResults || []) {
  const rel = path.isAbsolute(tr.name) ? toRel(tr.name) : tr.name
  let any = false
  for (const ar of tr.assertionResults || []) {
    if (ar.status === 'failed') {
      keys.add(`${rel} › ${ar.fullName}`)
      any = true
    }
  }
  if (tr.status === 'failed' && !any) keys.add(`${rel} › <suite failed to run>`)
}
const sorted = [...keys].sort()

if (writeBaseline) {
  const head = [
    `# 66.3 jest failure baseline, measured ${new Date().toISOString().slice(0, 10)}`,
    `# command: ${cmd || '(from json)'}`,
    `# failed tests ${res.numFailedTests}/${res.numTotalTests}, failed suites ${res.numFailedTestSuites}/${res.numTotalTestSuites}`,
    '# policy: lines may be deleted when they pass; never added.'
  ]
  fs.writeFileSync(baseline, [...head, ...sorted].join('\n') + '\n')
  console.log(
    `wrote ${sorted.length} keys to ${baseline} (tests ${res.numFailedTests}/${res.numTotalTests}, suites ${res.numFailedTestSuites}/${res.numTotalTestSuites})`
  )
  process.exit(0)
}
if (!fs.existsSync(baseline)) {
  console.error(`baseline file missing: ${baseline}`)
  process.exit(2)
}
const base = new Set(
  fs
    .readFileSync(baseline, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
)
const fresh = sorted.filter((k) => !base.has(k))
if (fresh.length) {
  console.log('NEW jest failures (not in 66.3-jest-baseline.txt):')
  for (const k of fresh) console.log(`  ${k}`)
  process.exit(1)
}
const ran = new Set((res.testResults || []).map((t) => toRel(t.name)))
const nowPass = [...base].filter(
  (k) => ran.has(k.split(' › ')[0]) && !keys.has(k)
)
console.log(`jest: ${sorted.length} failing, all in baseline`)
if (nowPass.length) {
  console.log('baseline entries in scope that now pass:')
  for (const k of nowPass) console.log(`  ${k}`)
}
process.exit(0)
