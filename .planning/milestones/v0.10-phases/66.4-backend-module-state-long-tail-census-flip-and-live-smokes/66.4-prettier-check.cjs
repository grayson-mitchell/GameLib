'use strict'
/**
 * Exact-path prettier check (gamelib-conventions formatter rule).
 * Usage: node 66.4-prettier-check.cjs [--cascade] <path>...
 */
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
const cascade = args.includes('--cascade')
const paths = args.filter((a) => a !== '--cascade')
if (paths.length === 0) {
  console.error('usage: 66.4-prettier-check.cjs [--cascade] <path>...')
  process.exit(2)
}
const sh = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8' })
const notIgnored = (p) => {
  const r = sh('npx', ['prettier', '--file-info', p])
  try {
    return JSON.parse(r.stdout).ignored === false
  } catch {
    console.error(`could not parse prettier --file-info for ${p}`)
    process.exit(2)
  }
}
const check = []
for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log(`deleted, skipped: ${p}`)
    continue
  }
  if (fs.statSync(p).isDirectory()) {
    console.error(`directory given, exact file paths only: ${p}`)
    process.exit(1)
  }
  if (!notIgnored(p)) {
    console.log(`prettier-ignored, skipped: ${p}`)
    continue
  }
  check.push(p)
}
const written = [
  ...sh('git', ['diff', '--name-only', 'HEAD', '--', 'src', 'meta']).stdout.split('\n'),
  ...sh('git', ['ls-files', '--others', '--exclude-standard', '--', 'src', 'meta']).stdout.split('\n')
].filter((f) => f && fs.existsSync(f) && !paths.includes(f) && notIgnored(f))
if (written.length) {
  if (!cascade) {
    console.error("written but not declared in this task's verify list:")
    for (const f of written) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log('cascade paths (undeclared, checked):')
  for (const f of written) console.log(`  ${f}`)
  check.push(...written)
}
if (check.length === 0) {
  console.log('every declared path is prettier-ignored or deleted; prettier --check omitted')
  process.exit(0)
}
const r = spawnSync('npx', ['prettier', '--check', ...check], { stdio: 'inherit' })
process.exit(r.status ?? 1)
