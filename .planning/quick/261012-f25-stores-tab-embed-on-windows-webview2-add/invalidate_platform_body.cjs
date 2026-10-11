#!/usr/bin/env node
/**
 * quick 261012-f25, Task 2: key-presence-only invalidation of the stale machine translations of
 * `webview.unavailable.platform.body` (D-09; precedent quick 260925-88h and 261004-bz3).
 *
 * For every non-English locale it removes, IN PLACE and line-wise (never parse + re-serialise):
 *   - the `"body": ...` line under webview > unavailable > platform in public/locales/<l>/gamelib.json
 *   - the `"webview.unavailable.platform.body"` entry in public/locales/<l>/gamelib.mt.json
 * No translation is written. The locales fall back to English until the next MT re-fill.
 *
 *   node invalidate_platform_body.cjs           do the edits, print INVALIDATED gamelib=<n> mt=<n>
 *   node invalidate_platform_body.cjs --check   edit nothing; prove each file == BASE minus that key
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const REPO = path.resolve(__dirname, '..', '..', '..')
const LOCALES = path.join(REPO, 'public', 'locales')
const KEY_PATH = ['webview', 'unavailable', 'platform', 'body']
const DOTTED = KEY_PATH.join('.')
const NEW_COPY =
  "GameLib can't open this page in its in-app store and wiki browser."
const EXPECTED = 48

const CHECK = process.argv.includes('--check')

function die(msg) {
  console.error(msg)
  process.exit(1)
}

const locales = fs
  .readdirSync(LOCALES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'en')
  .map((d) => d.name)
  .sort()

function hasNested(obj, keyPath) {
  let cur = obj
  for (const k of keyPath) {
    if (cur === null || typeof cur !== 'object' || !(k in cur)) return false
    cur = cur[k]
  }
  return true
}

function deleteNested(obj, keyPath) {
  let cur = obj
  for (const k of keyPath.slice(0, -1)) cur = cur[k]
  delete cur[keyPath[keyPath.length - 1]]
}

// Census (live census wins; any mismatch is an error, never a silent skip).
const catalogues = []
const sidecars = []
for (const l of CHECK ? [] : locales) {
  const cat = path.join(LOCALES, l, 'gamelib.json')
  const mt = path.join(LOCALES, l, 'gamelib.mt.json')
  if (fs.existsSync(cat) && hasNested(JSON.parse(fs.readFileSync(cat, 'utf8')), KEY_PATH)) {
    catalogues.push({ locale: l, file: cat })
  } else {
    console.error(`census: ${l}/gamelib.json does not hold ${DOTTED}`)
  }
  if (fs.existsSync(mt) && JSON.parse(fs.readFileSync(mt, 'utf8')).keys.includes(DOTTED)) {
    sidecars.push({ locale: l, file: mt })
  } else {
    console.error(`census: ${l}/gamelib.mt.json does not list ${DOTTED}`)
  }
}
if (!CHECK) {
  console.log(
    `census: locales=${locales.length} catalogues=${catalogues.length} sidecars=${sidecars.length}`
  )
  if (catalogues.length !== EXPECTED || sidecars.length !== EXPECTED) {
    die(`census differs from the measured ${EXPECTED}/${EXPECTED}; investigate before editing`)
  }
}

/** Splits keeping the `\r` of CRLF files attached to its line (we split on `\n` only). */
function splitLines(text) {
  return text.split('\n')
}

function isBlank(line) {
  return line.trim() === ''
}

/**
 * Removes line `idx` and applies the structural trailing-comma rule: if the next non-empty line
 * after it starts with `}` or `]`, strip the trailing comma from the previous non-empty line.
 */
function removeLine(lines, idx) {
  let next = idx + 1
  while (next < lines.length && isBlank(lines[next])) next++
  let prev = idx - 1
  while (prev >= 0 && isBlank(lines[prev])) prev--
  const closes =
    next < lines.length &&
    (lines[next].trim().startsWith('}') || lines[next].trim().startsWith(']'))
  if (closes && prev >= 0) {
    const cr = lines[prev].endsWith('\r') ? '\r' : ''
    const body = cr ? lines[prev].slice(0, -1) : lines[prev]
    if (body.endsWith(',')) lines[prev] = body.slice(0, -1) + cr
  }
  lines.splice(idx, 1)
}

const PUSH = /^"([^"]+)":\s*[{[]$/

function editCatalogue(file) {
  const lines = splitLines(fs.readFileSync(file, 'utf8'))
  const stack = []
  const hits = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t === '{' && stack.length === 0) {
      stack.push('')
      return
    }
    const push = PUSH.exec(t)
    if (push) {
      stack.push(push[1])
      return
    }
    if (t === '}' || t === '},' || t === ']' || t === '],') {
      stack.pop()
      return
    }
    if (t.startsWith('"body":') && stack.slice(1).join('.') === 'webview.unavailable.platform') {
      hits.push(i)
    }
  })
  if (hits.length !== 1) die(`${file}: expected exactly 1 target line, found ${hits.length}`)
  removeLine(lines, hits[0])
  fs.writeFileSync(file, lines.join('\n'))
}

function editSidecar(file) {
  const lines = splitLines(fs.readFileSync(file, 'utf8'))
  const hits = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t === `"${DOTTED}"` || t === `"${DOTTED}",`) hits.push(i)
  })
  if (hits.length !== 1) die(`${file}: expected exactly 1 sidecar entry, found ${hits.length}`)
  removeLine(lines, hits[0])
  fs.writeFileSync(file, lines.join('\n'))
}

if (!CHECK) {
  for (const c of catalogues) editCatalogue(c.file)
  for (const s of sidecars) editSidecar(s.file)
  console.log(`INVALIDATED gamelib=${catalogues.length} mt=${sidecars.length}`)
  process.exit(0)
}

// --check: after a successful edit the census above would already have failed (the key is gone),
// so --check runs its own census-free pass over every non-en locale.
function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const base = fs.readFileSync(path.join(__dirname, 'BASE.sha'), 'utf8').trim()
const failures = []
let okCat = 0
let okMt = 0

function rel(file) {
  return path.relative(REPO, file).split(path.sep).join('/')
}

for (const l of locales) {
  for (const kind of ['gamelib.json', 'gamelib.mt.json']) {
    const file = path.join(LOCALES, l, kind)
    const r = rel(file)
    try {
      const cur = fs.readFileSync(file, 'utf8')
      const curParsed = JSON.parse(cur)
      const baseText = git(['show', `${base}:${r}`])
      const baseParsed = JSON.parse(baseText)
      if (kind === 'gamelib.json') {
        deleteNested(baseParsed, KEY_PATH)
      } else {
        baseParsed.keys = baseParsed.keys.filter((k) => k !== DOTTED)
      }
      if (JSON.stringify(curParsed) !== JSON.stringify(baseParsed)) {
        failures.push(`${r}: not equal to BASE minus ${DOTTED}`)
        continue
      }
      const dropped = baseText.split('\n').length - cur.split('\n').length
      if (dropped !== 1) {
        failures.push(`${r}: line count dropped by ${dropped}, expected 1`)
        continue
      }
      if (kind === 'gamelib.json') okCat++
      else okMt++
    } catch (e) {
      failures.push(`${r}: ${e.message}`)
    }
  }
}

const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en', 'gamelib.json'), 'utf8'))
const enValue = KEY_PATH.reduce((acc, k) => (acc ? acc[k] : undefined), en)
if (enValue !== NEW_COPY) failures.push(`en/gamelib.json: value is not the new copy: ${enValue}`)

if (failures.length > 0 || okCat !== EXPECTED || okMt !== EXPECTED) {
  console.error(failures.join('\n'))
  die(`CHECK FAILED gamelib=${okCat} mt=${okMt}`)
}
console.log(`CHECK OK gamelib=${okCat} mt=${okMt} en=new-copy`)
