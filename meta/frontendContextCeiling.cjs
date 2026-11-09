'use strict'
/**
 * Phase 69 (69-02, D-12): shrink-only ratchet for the number of non-test
 * src/frontend files that import state/ContextProvider.
 *
 * Metric: IMPORT DECLARATIONS (and `export ... from` re-exports) whose module
 * specifier resolves to src/frontend/state/ContextProvider, taken with the
 * TypeScript compiler API (`ts.createSourceFile`, no type-check). Comments
 * never count; `useContext` calls are not the metric.
 *
 * Baselines live in meta/frontendContextCeiling/<area>.json, shape
 * { "contextImports": { "<repo-relative path>": n } }. Each path belongs to
 * exactly one shard, chosen by its path prefix (SHARD_PREFIXES below). A
 * missing shard file or an empty object is fine: conversion plans delete a
 * shard once its last entry is removed.
 *
 * Contract: a file above its entry fails (grew); below fails (shrank: lower it
 * in this commit); an entry for a missing file or a file now at 0 fails
 * (stale); a zero entry fails; a nonzero file in no shard fails (new). There
 * is NO update flag: numbers move by hand in the commit that removes the
 * import. A scanned-file floor makes "scanned nothing" fail rather than pass.
 *
 * `--shard <name>` restricts evaluation to the paths in that shard (floor
 * still applies).
 *
 * End state: when every shard is empty, plan 69-24 deletes this script, its
 * shards, its tests and its three wiring points (package.json, lint.yml,
 * .husky/pre-push) in the same commit as ContextProvider.tsx (D-12: no ESLint
 * ban afterwards).
 */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_BASELINE_DIR = path.join(__dirname, 'frontendContextCeiling')
const SKIP_DIRS = new Set([
  '__tests__',
  '__mocks__',
  'testUtils',
  'node_modules'
])
// Floor: about half of the non-test src/frontend .ts/.tsx files scanned on
// 2026-11-10 (455 files).
const DEFAULT_MIN_FRONTEND_FILES = 228

const TARGET = 'src/frontend/state/ContextProvider'
const SHARD_KEY = 'contextImports'

// Longest prefix wins. Prefixes are relative to src/frontend/.
const SHARD_PREFIXES = [
  ['App.tsx', 'app'],
  ['state/', 'state'],
  ['hooks/', 'hooks'],
  ['components/UI/NavShell/', 'components-ui-navshell'],
  ['components/UI/', 'components-ui'],
  ['screens/Settings/components/', 'screens-settings-components'],
  ['screens/Settings/sections/', 'screens-settings-sections'],
  ['screens/Library/components/InstallModal/', 'screens-library-installmodal'],
  ['screens/Library/', 'screens-library'],
  ['screens/Game/', 'screens-game'],
  ['screens/DownloadManager/', 'screens-downloads'],
  ['screens/ConsoleMode/', 'screens-console'],
  ['screens/Login/', 'screens-login'],
  ['screens/WebView/', 'screens-webview']
]
const FALLBACK_SHARD = 'screens-other'

const toPosix = (p) => p.split(path.sep).join('/')

/** Shard name a repo-relative src/frontend path belongs to. */
function shardFor(repoRelPath) {
  const rel = repoRelPath.replace(/^src\/frontend\//, '')
  let best = null
  for (const [prefix, name] of SHARD_PREFIXES) {
    if (rel.startsWith(prefix) && (!best || prefix.length > best[0].length))
      best = [prefix, name]
  }
  return best ? best[1] : FALLBACK_SHARD
}

const parse = (text, fileName) =>
  ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)

function resolvesToTarget(spec, importerRel) {
  let p
  if (spec.startsWith('.'))
    p = path.posix.normalize(
      path.posix.join(path.posix.dirname(importerRel), spec)
    )
  else if (spec.startsWith('frontend/')) p = `src/${spec}`
  else if (spec.startsWith('src/frontend/')) p = spec
  else return false
  p = p.replace(/\.(tsx?|js|jsx)$/, '')
  return p === TARGET
}

/** @param {string} importerRel repo-relative POSIX path of the file */
function countContextImports(sourceText, importerRel = 'src/frontend/x.ts') {
  const sf = parse(sourceText, importerRel)
  let n = 0
  const hit = (spec) =>
    spec &&
    ts.isStringLiteralLike(spec) &&
    resolvesToTarget(spec.text, importerRel)
  for (const st of sf.statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      hit(st.moduleSpecifier)
    )
      n += 1
  }
  return n
}

function walkTs(dir, out) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkTs(full, out)
      continue
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function census(root = REPO_ROOT) {
  const result = { contextImports: {}, frontendFiles: 0 }
  const isTest = (f) => /\.(test\.tsx?|d\.ts)$/.test(f)
  for (const f of walkTs(path.join(root, 'src', 'frontend'), []).sort()) {
    if (isTest(f)) continue
    result.frontendFiles += 1
    const rel = toPosix(path.relative(root, f))
    const text = fs.readFileSync(f, 'utf8')
    if (!text.includes('ContextProvider')) continue
    const n = countContextImports(text, rel)
    if (n > 0) result.contextImports[rel] = n
  }
  return result
}

const isPlainObject = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reads every *.json in dir. Returns { merged, shardOf, failures }. */
function loadShards(dir = DEFAULT_BASELINE_DIR) {
  const merged = {}
  const shardOf = {}
  const failures = []
  const names = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : []
  for (const name of names) {
    let data
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch (e) {
      failures.push(`cannot read shard ${name}: ${e.message}`)
      continue
    }
    if (!isPlainObject(data)) {
      failures.push(`shard ${name}: top level must be an object`)
      continue
    }
    const shardName = name.replace(/\.json$/, '')
    for (const key of Object.keys(data)) {
      if (key !== SHARD_KEY) {
        failures.push(`shard ${name}: unknown key "${key}"`)
        continue
      }
      if (!isPlainObject(data[key])) {
        failures.push(`shard ${name}: "${key}" must be an object`)
        continue
      }
      for (const file of Object.keys(data[key])) {
        const value = data[key][file]
        if (!(Number.isInteger(value) && value > 0)) {
          failures.push(
            `shard ${name}: ${file} must be a positive integer (a zero entry is removed, not kept)`
          )
          continue
        }
        if (Object.prototype.hasOwnProperty.call(merged, file)) {
          failures.push(
            `duplicate: ${file} appears in two shards (second: ${name})`
          )
          continue
        }
        if (shardFor(file) !== shardName) {
          failures.push(
            `wrong shard: ${file} belongs in ${shardFor(file)}.json, not ${name}`
          )
          continue
        }
        merged[file] = value
        shardOf[file] = shardName
      }
    }
  }
  return { merged, shardOf, failures }
}

/** Pure. Returns failure strings (empty = pass). */
function evaluate(merged, current) {
  const failures = []
  for (const file of Object.keys(current).sort()) {
    const n = current[file]
    const b = merged[file]
    if (b === undefined)
      failures.push(
        `new violation: ${file} has ${n} ContextProvider import(s) and no baseline entry; use uiState (or another domain store) instead`
      )
    else if (n > b) failures.push(`grew: ${file} ${n} > baseline ${b}`)
    else if (n < b)
      failures.push(
        `shrank: lower ${file} to ${n} in this commit (baseline says ${b})`
      )
  }
  for (const file of Object.keys(merged).sort()) {
    if (merged[file] === 0)
      failures.push(`zero entry: remove ${file} in this commit`)
    else if (current[file] === undefined)
      failures.push(
        `stale baseline entry: ${file} (no import left; remove the entry in this commit)`
      )
  }
  return failures
}

function parseArgs(argv) {
  const out = {
    root: undefined,
    baselineDir: undefined,
    shard: undefined,
    minFrontendFiles: DEFAULT_MIN_FRONTEND_FILES
  }
  const flags = {
    '--root': 'root',
    '--baseline-dir': 'baselineDir',
    '--shard': 'shard',
    '--min-files': 'minFrontendFiles'
  }
  for (let i = 0; i < argv.length; i++) {
    const key = flags[argv[i]]
    if (!key) throw new Error(`unknown argument: ${argv[i]}`)
    const v = argv[i + 1]
    if (v === undefined || v === '' || v.startsWith('--'))
      throw new Error(`${argv[i]} needs a value`)
    i += 1
    if (key === 'minFrontendFiles') {
      const num = Number(v)
      if (!Number.isInteger(num) || num < 1)
        throw new Error(
          `invalid ${argv[i - 1]}: ${v} (need a positive integer)`
        )
      out[key] = num
    } else out[key] = v
  }
  return out
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`FAIL: ${e.message}`)
    process.exit(1)
  }
  const root = args.root ? path.resolve(args.root) : REPO_ROOT
  const dir = args.baselineDir
    ? path.resolve(args.baselineDir)
    : DEFAULT_BASELINE_DIR
  const current = census(root)
  const failures = []
  if (current.frontendFiles < args.minFrontendFiles)
    failures.push(
      `scanned only ${current.frontendFiles} frontend files, below the floor of ${args.minFrontendFiles}; the scan is broken`
    )
  const loaded = loadShards(dir)
  failures.push(...loaded.failures)
  let merged = loaded.merged
  let cur = current.contextImports
  if (args.shard !== undefined) {
    const shardFile = path.join(dir, `${args.shard}.json`)
    if (!fs.existsSync(shardFile)) {
      failures.push(`unknown shard: ${args.shard} (no ${shardFile})`)
    } else {
      const only = (o) =>
        Object.fromEntries(
          Object.entries(o).filter(([k]) => loaded.shardOf[k] === args.shard)
        )
      const inShard = new Set(Object.keys(only(merged)))
      merged = only(merged)
      cur = Object.fromEntries(
        Object.entries(cur).filter(([k]) => inShard.has(k))
      )
    }
  }
  failures.push(...evaluate(merged, cur))
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL: ${f}`)
    process.exit(1)
  }
  const total = Object.values(cur).reduce((a, b) => a + b, 0)
  console.log(
    `frontend-context-ceiling: PASS imports=${total} (${Object.keys(cur).length} files, ${current.frontendFiles} scanned)`
  )
}

module.exports = {
  DEFAULT_MIN_FRONTEND_FILES,
  census,
  countContextImports,
  evaluate,
  loadShards,
  parseArgs,
  shardFor
}

if (require.main === module) main()
