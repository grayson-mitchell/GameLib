'use strict'
/**
 * Phase 70 (70-03): read-only flip probe. TEMPORARY: removed by 70-11.
 *
 * Type-checks the whole repo (root tsconfig.json) as if `GameInfo` were
 * already the union `GameInfoByRunner[Runner]` and the nested store keys had
 * been deleted. The substitution is served in memory through a CompilerHost
 * for src/common/types.ts; nothing is written to disk and no child is
 * started.
 *
 * Exit code: 1 when a diagnostic falls in a file matching any `--only` prefix
 * (after `--non-test` filtering), or when a diagnostic has no file. With no
 * `--only` the probe is a report and exits 0.
 */
const path = require('node:path')
const ts = require('typescript')

const FAT_BEGIN = '// PHASE70-FLIP-PROBE: fat-begin'
const FAT_END = '// PHASE70-FLIP-PROBE: fat-end'
const KEYS_BEGIN = '// PHASE70-FLIP-PROBE: store-keys-begin'
const KEYS_END = '// PHASE70-FLIP-PROBE: store-keys-end'
const UNION = 'export type GameInfo = GameInfoByRunner[Runner]'

/**
 * Line indexes of every line containing the marker.
 * @param {string[]} lines
 * @param {string} marker
 */
function markerLines(lines, marker) {
  const out = []
  lines.forEach((l, i) => {
    if (l.includes(marker)) out.push(i)
  })
  return out
}

/** @param {string} text */
function applyFlip(text) {
  const lines = text.split('\n')
  const fatB = markerLines(lines, FAT_BEGIN)
  const fatE = markerLines(lines, FAT_END)
  if (fatB.length !== 1) {
    throw new Error(`${FAT_BEGIN}: expected exactly 1, found ${fatB.length}`)
  }
  if (fatE.length !== 1) {
    throw new Error(`${FAT_END}: expected exactly 1, found ${fatE.length}`)
  }
  if (fatE[0] < fatB[0]) {
    throw new Error(`${FAT_BEGIN}: unbalanced (end precedes begin)`)
  }
  const keyB = markerLines(lines, KEYS_BEGIN)
  const keyE = markerLines(lines, KEYS_END)
  if (keyB.length !== keyE.length) {
    throw new Error(
      `${KEYS_BEGIN}: unbalanced (${keyB.length} begin, ${keyE.length} end)`
    )
  }
  const drop = new Set()
  for (let i = 0; i < keyB.length; i++) {
    if (keyE[i] < keyB[i] || (i + 1 < keyB.length && keyB[i + 1] < keyE[i])) {
      throw new Error(`${KEYS_BEGIN}: unbalanced (pair ${i} out of order)`)
    }
    for (let j = keyB[i]; j <= keyE[i]; j++) drop.add(j)
  }
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (i === fatB[0]) out.push(UNION)
    if (i >= fatB[0] && i <= fatE[0]) continue
    if (drop.has(i)) continue
    out.push(lines[i])
  }
  return out.join('\n')
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { only: [], nonTest: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only') {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) {
        throw new Error('--only requires a value')
      }
      opts.only.push(v)
    } else if (a === '--non-test') opts.nonTest = true
    else if (a === '--json') opts.json = true
    else throw new Error(`unknown argument: ${a}`)
  }
  return opts
}

/** @param {string} p repo-relative POSIX path */
function classify(p) {
  return {
    test: p.includes('__tests__') || /\.test\./.test(p),
    storeManagers: p.startsWith('src/backend/storeManagers/')
  }
}

/** @param {{root: string, only?: string[], nonTest?: boolean}} options */
function runProbe({ root, only = [], nonTest = false }) {
  const cfgPath = path.join(root, 'tsconfig.json')
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root)
  const typesPath = path.resolve(root, 'src/common/types.ts')
  const host = ts.createCompilerHost(parsed.options)
  const origGet = host.getSourceFile.bind(host)
  const origRead = host.readFile.bind(host)
  host.readFile = (f) => {
    const t = origRead(f)
    return t !== undefined && path.resolve(f) === typesPath ? applyFlip(t) : t
  }
  host.getSourceFile = (f, lang, onErr, shouldCreate) => {
    if (path.resolve(f) === typesPath) {
      const t = origRead(f)
      if (t === undefined) return undefined
      return ts.createSourceFile(f, applyFlip(t), lang, true)
    }
    return origGet(f, lang, onErr, shouldCreate)
  }
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host
  })
  const diags = ts.getPreEmitDiagnostics(program)
  const byFile = new Map()
  let global = 0
  for (const d of diags) {
    if (!d.file) {
      global++
      continue
    }
    const rel = path.relative(root, d.file.fileName).split(path.sep).join('/')
    if (rel.startsWith('..')) continue
    const e = byFile.get(rel) ?? { file: rel, count: 0, messages: [] }
    e.count++
    if (e.messages.length < 3) {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0)
      e.messages.push(
        `${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
      )
    }
    byFile.set(rel, e)
  }
  const files = [...byFile.values()]
    .map((e) => ({ ...e, ...classify(e.file) }))
    .sort((a, b) => a.file.localeCompare(b.file))
  const scoped = nonTest ? files.filter((f) => !f.test) : files
  const failing = scoped.filter((f) => only.some((p) => f.file.startsWith(p)))
  const buckets = { smNonTest: 0, smTest: 0, outsideNonTest: 0, outsideTest: 0 }
  for (const f of files) {
    const k =
      (f.storeManagers ? 'sm' : 'outside') + (f.test ? 'Test' : 'NonTest')
    buckets[k] += f.count
  }
  return { files, buckets, global, failing }
}

function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    return 2
  }
  const r = runProbe({
    root: path.join(__dirname, '..'),
    only: opts.only,
    nonTest: opts.nonTest
  })
  if (opts.json) {
    console.log(JSON.stringify(r, null, 2))
  } else {
    for (const f of r.files) {
      console.log(
        `${String(f.count).padStart(4)}  ${f.test ? 'test    ' : 'non-test'}  ${f.storeManagers ? 'SM ' : '   '}  ${f.file}`
      )
    }
    console.log(JSON.stringify(r.buckets), `global=${r.global}`)
  }
  return r.failing.length > 0 || r.global > 0 ? 1 : 0
}

module.exports = { applyFlip, parseArgs, classify, runProbe }

if (require.main === module) process.exit(main())
