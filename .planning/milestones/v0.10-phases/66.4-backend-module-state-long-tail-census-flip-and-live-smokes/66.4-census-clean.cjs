'use strict'
/**
 * 66.4 per-file census-zero checker.
 * Usage: node 66.4-census-clean.cjs [--no-paths-import] <file>...   (run from the repo root)
 * Exit 1 listing file:line:symbol for every listed file that still has census moduleState sites; with
 * --no-paths-import also exit 1 when a listed file imports/requires constants/paths or sidecar/pathShim.
 * A listed file that no longer exists passes ("deleted"). Exit 2 on no args.
 */
const fs = require('node:fs')
const path = require('node:path')

const REPO = process.cwd()
const { listModuleStateSites } = require(path.join(REPO, 'meta', 'backendDiCeilings.cjs'))

const argv = process.argv.slice(2)
const noPaths = argv.includes('--no-paths-import')
const files = argv.filter((a) => !a.startsWith('--')).map((f) => path.relative(REPO, path.resolve(REPO, f)).split(path.sep).join('/'))
if (files.length === 0) {
  console.error('usage: 66.4-census-clean.cjs [--no-paths-import] <file>...')
  process.exit(2)
}

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const PATHS_RE = /(?:from\s*|require\s*\(\s*|import\s*\(\s*|import\s+)['"][^'"]*(?:constants\/paths|sidecar\/pathShim|\/pathShim)['"]/

const rows = listModuleStateSites()
let bad = 0
for (const f of files) {
  const abs = path.join(REPO, f)
  if (!fs.existsSync(abs)) {
    console.log(`${f}: deleted`)
    continue
  }
  for (const r of rows.filter((x) => x.file === f)) {
    console.error(`${f}:${r.line}:${r.symbol} (${r.kind}) still counted`)
    bad++
  }
  if (noPaths && PATHS_RE.test(stripComments(fs.readFileSync(abs, 'utf8')))) {
    console.error(`${f}: still imports constants/paths or pathShim`)
    bad++
  }
}
if (bad > 0) process.exit(1)
console.log(`census-clean: ${files.length} file(s) ok`)
