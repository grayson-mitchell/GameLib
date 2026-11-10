#!/usr/bin/env node
// Byte-identical move proof for quick 261111-buh (split of rpc_humble_login_open).
//
//   node verbatim_moves.cjs <tracer|full>
//
// Reads the base ref from `base-ref` next to this file, takes the HEAD copy of humble_open.rs
// from git at that ref, and checks that each HEAD line range of the handler body occurs as ONE
// contiguous run of byte-identical lines, exactly once, inside the fn that is supposed to own
// it. Blank lines and `//` comment lines are dropped on both sides so comments may move or take
// the permitted positional edits. Lines inside the handler / step fns that no run covers are
// printed as GLUE (signatures, call sites, tails) for manual review.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const mode = process.argv[2]
if (mode !== 'tracer' && mode !== 'full') {
  console.error('usage: node verbatim_moves.cjs <tracer|full>')
  process.exit(2)
}

const REL = 'src-tauri/src/login_window/humble_open.rs'
const here = __dirname
const ref = fs.readFileSync(path.join(here, 'base-ref'), 'utf8').trim()
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8'
}).trim()
const headText = execFileSync('git', ['show', `${ref}:${REL}`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})
const workText = fs.readFileSync(path.join(repoRoot, REL), 'utf8')

const split = (t) => t.split('\n').map((l) => l.replace(/\r$/, ''))
const headLines = split(headText)
const workLines = split(workText)

const HANDLER = 'rpc_humble_login_open'
const CLOSE = 'install_login_window_close_hook'

// 1-based inclusive HEAD ranges, from the plan's <interfaces> (26facda22).
const RANGES = [
  ['head', 90, 116],
  ['latch', 117, 188],
  ['route', 189, 196],
  ['build', 197, 496],
  ['barcomment', 497, 514],
  ['bar', 515, 557],
  ['presenta', 558, 597],
  ['nonmac', 598, 599],
  ['owner', 600, 603],
  ['presentb', 604, 641],
  ['record', 642, 651],
  ['close', 652, 715],
  ['tail', 716, 748]
]

const OWNER = {
  tracer: Object.fromEntries(
    RANGES.map(([n]) => [n, n === 'close' ? CLOSE : HANDLER])
  ),
  full: {
    head: HANDLER,
    latch: 'arm_visible_login_latch_macos',
    route: HANDLER,
    build: 'build_login_window',
    barcomment: HANDLER,
    bar: 'install_native_bar_for_sheet_macos',
    presenta: 'present_visible_login_window_macos',
    nonmac: HANDLER,
    owner: 'build_login_window',
    presentb: 'present_visible_login_window_macos',
    record: HANDLER,
    close: CLOSE,
    tail: HANDLER
  }
}[mode]

const isCode = (l) => l.trim() !== '' && !l.trim().startsWith('//')
const filtered = (lines) =>
  lines.map((t, i) => ({ n: i + 1, t })).filter((x) => isCode(x.t))

let failed = false
const fail = (msg) => {
  failed = true
  console.log(`FAIL ${msg}`)
}

// Tiling.
let expectNext = 90
for (const [name, a, b] of RANGES) {
  if (a !== expectNext || b < a) fail(`tiling: ${name} L${a}-${b} breaks at ${expectNext}`)
  expectNext = b + 1
}
if (expectNext !== 749) fail(`tiling: ranges end at ${expectNext - 1}, expected 748`)
if (headLines[89].indexOf(`fn ${HANDLER}(`) === -1) {
  fail('HEAD L90 is not the handler signature')
}
if (headLines[747] !== '}') fail('HEAD L748 is not the closing brace')

// Fn spans in the working file.
const spans = {}
{
  let cur = null
  for (let i = 0; i < workLines.length; i++) {
    const m = /^(?:pub\(crate\) )?fn (\w+)/.exec(workLines[i])
    if (m && !cur) {
      cur = { name: m[1], start: i + 1 }
      continue
    }
    if (cur && workLines[i] === '}') {
      cur.end = i + 1
      if (spans[cur.name]) fail(`duplicate fn ${cur.name}`)
      spans[cur.name] = cur
      cur = null
    }
  }
}

const wf = filtered(workLines)
const runs = {}
const covered = new Set()

for (const [name, a, b] of RANGES) {
  const head = filtered(headLines.slice(a - 1, b)).map((x) => x.t)
  if (name === 'barcomment') {
    if (head.length !== 0) fail(`barcomment holds ${head.length} code lines`)
    else console.log('OK barcomment (comment only)')
    continue
  }
  const hits = []
  for (let i = 0; i + head.length <= wf.length; i++) {
    let ok = true
    for (let j = 0; j < head.length; j++) {
      if (wf[i + j].t !== head[j]) {
        ok = false
        break
      }
    }
    if (ok) hits.push(i)
  }
  const owner = OWNER[name]
  if (hits.length !== 1) {
    fail(`${name} (HEAD L${a}-${b}): ${hits.length} contiguous runs found, expected exactly 1`)
    continue
  }
  const first = wf[hits[0]].n
  const last = wf[hits[0] + head.length - 1].n
  const span = spans[owner]
  if (!span) {
    fail(`${name}: owner fn ${owner} not found`)
    continue
  }
  if (first < span.start || last > span.end) {
    fail(`${name} -> expected in ${owner} (L${span.start}-${span.end}) but run is L${first}-${last}`)
    continue
  }
  runs[name] = { first, last, owner }
  for (let j = 0; j < head.length; j++) covered.add(wf[hits[0] + j].n)
  console.log(`OK ${name} (HEAD L${a}-${b}) -> ${owner} L${first}-${last}`)
}

if (mode === 'full') {
  const before = (x, y) => runs[x] && runs[y] && runs[x].last < runs[y].first
  const order = [
    ['head', 'route', 'handler'],
    ['route', 'nonmac', 'handler'],
    ['nonmac', 'record', 'handler'],
    ['record', 'tail', 'handler'],
    ['build', 'owner', 'build_login_window: owner block follows the build run'],
    ['presenta', 'presentb', 'present_visible_login_window_macos']
  ]
  for (const [x, y, why] of order) {
    if (!before(x, y)) fail(`order: ${x} must precede ${y} (${why})`)
    else console.log(`OK order ${x} < ${y} (${why})`)
  }
}

// Glue: code lines inside the handler / step spans not covered by any run.
const involved = new Set([HANDLER, ...Object.values(OWNER)])
for (const name of involved) {
  const span = spans[name]
  if (!span) {
    fail(`span for ${name} not found`)
    continue
  }
  for (const x of wf) {
    if (x.n >= span.start && x.n <= span.end && !covered.has(x.n)) {
      console.log(`GLUE L${x.n} [${name}]: ${x.t}`)
    }
  }
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
