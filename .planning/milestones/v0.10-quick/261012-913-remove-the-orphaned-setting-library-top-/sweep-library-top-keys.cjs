#!/usr/bin/env node
'use strict'
// Quick 261012-913: remove the orphaned setting.library_top_section,
// setting.library_top_option (4 labels) and setting.maxRecentGames entries from
// every public/locales/*/translation.json, byte-preservingly.
//
// Output is the original text with whole lines removed. This script never writes
// through JSON.stringify.
//
// Usage (from the repo root):
//   node <this file> --dry-run
//   node <this file> --write
//   node <this file> --check [--against <git-ref>]

const fs = require('fs')
const path = require('path')
const { isDeepStrictEqual } = require('util')
const { execFileSync } = require('child_process')

const LOCALES_DIR = path.join('public', 'locales')
const EXPECTED_ABSENT = ['br', 'sl']
const EXPECTED_COUNT = 47
const OPTION_CHILDREN = new Set([
  'disabled',
  'favourites',
  'recently_played',
  'recently_played_installed'
])
const NAMES = ['library_top_section', 'library_top_option', 'maxRecentGames']

function fail(loc, msg) {
  console.error(`FAIL [${loc}]: ${msg}`)
  process.exit(1)
}

function population() {
  const dirs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  const withFile = dirs.filter((d) =>
    fs.existsSync(path.join(LOCALES_DIR, d, 'translation.json'))
  )
  const without = dirs.filter((d) => !withFile.includes(d))
  if (withFile.length !== EXPECTED_COUNT) {
    fail('*', `expected ${EXPECTED_COUNT} catalogues, found ${withFile.length}`)
  }
  if (
    without.length !== EXPECTED_ABSENT.length ||
    !EXPECTED_ABSENT.every((l) => without.includes(l))
  ) {
    fail('*', `directories without translation.json are [${without}], expected [${EXPECTED_ABSENT}]`)
  }
  return withFile
}

function fileOf(loc) {
  return path.join(LOCALES_DIR, loc, 'translation.json')
}

function stripKeys(obj, loc) {
  if (!obj || typeof obj.setting !== 'object' || obj.setting === null) {
    fail(loc, 'no setting object')
  }
  for (const n of NAMES) delete obj.setting[n]
  return obj
}

function plan(loc, text) {
  if (text.includes('\r')) fail(loc, 'contains CR')
  if (text.charCodeAt(0) === 0xfeff) fail(loc, 'has BOM')
  if (!text.endsWith('\n')) fail(loc, 'no trailing newline')
  const lines = text.split('\n')

  const settingOpen = []
  lines.forEach((l, i) => {
    if (l === '    "setting": {') settingOpen.push(i)
  })
  if (settingOpen.length !== 1) fail(loc, `setting opener count ${settingOpen.length}`)
  const sStart = settingOpen[0]
  let sEnd = -1
  for (let i = sStart + 1; i < lines.length; i++) {
    if (/^ {4}\},?$/.test(lines[i])) {
      sEnd = i
      break
    }
  }
  if (sEnd < 0) fail(loc, 'setting object end not found')

  const inRange = (i) => i > sStart && i < sEnd

  // option block
  const optOpen = []
  lines.forEach((l, i) => {
    if (l === '        "library_top_option": {') optOpen.push(i)
  })
  if (optOpen.length !== 1 || !inRange(optOpen[0])) {
    fail(loc, `library_top_option opener count ${optOpen.length} or outside setting`)
  }
  const oStart = optOpen[0]
  let oEnd = -1
  for (let i = oStart + 1; i < sEnd; i++) {
    if (/^ {8}\},?$/.test(lines[i])) {
      oEnd = i
      break
    }
  }
  if (oEnd < 0) fail(loc, 'library_top_option end not found')
  let children = 0
  for (let i = oStart + 1; i < oEnd; i++) {
    const m = /^ {12}"([A-Za-z_]+)": "/.exec(lines[i])
    if (!m) fail(loc, `unexpected option child line ${i + 1}: ${lines[i]}`)
    if (!OPTION_CHILDREN.has(m[1])) fail(loc, `unexpected option child ${m[1]}`)
    children++
  }

  const findScalar = (name) => {
    const prefix = `        "${name}": "`
    const idx = []
    lines.forEach((l, i) => {
      if (l.startsWith(prefix)) idx.push(i)
    })
    if (idx.length !== 1 || !inRange(idx[0])) {
      fail(loc, `${name} count ${idx.length} or outside setting`)
    }
    return idx[0]
  }
  const secIdx = findScalar('library_top_section')
  const maxIdx = findScalar('maxRecentGames')

  // no stray occurrences: every occurrence must be on a deleted line
  const del = new Set([secIdx, maxIdx])
  for (let i = oStart; i <= oEnd; i++) del.add(i)
  lines.forEach((l, i) => {
    if (!del.has(i) && NAMES.some((n) => l.includes(n))) {
      fail(loc, `stray occurrence at line ${i + 1}: ${l}`)
    }
  })
  // the option children names must not be on a name line elsewhere (they are generic
  // words, so only the three target names are checked above).

  // trailing comma defence
  const sorted = [...del].sort((a, b) => a - b)
  const runs = []
  for (const i of sorted) {
    const last = runs[runs.length - 1]
    if (last && last[1] === i - 1) last[1] = i
    else runs.push([i, i])
  }
  const commaStrip = new Set()
  let repairs = 0
  for (const [a, b] of runs) {
    let n = b + 1
    while (n < lines.length && lines[n].trim() === '') n++
    if (n < lines.length && lines[n].trim().startsWith('}')) {
      let p = a - 1
      while (p >= 0 && (del.has(p) || lines[p].trim() === '')) p--
      if (p >= 0 && lines[p].endsWith(',')) {
        commaStrip.add(p)
        repairs++
      }
    }
  }

  const out = []
  lines.forEach((l, i) => {
    if (del.has(i)) return
    out.push(commaStrip.has(i) ? l.slice(0, -1) : l)
  })
  return {
    text: out.join('\n'),
    deleted: sorted.map((i) => i + 1),
    children,
    repairs
  }
}

function verifyWritten(locs, before) {
  for (const loc of locs) {
    const text = fs.readFileSync(fileOf(loc), 'utf8')
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      fail(loc, `does not parse: ${e.message}`)
    }
    const expected = stripKeys(JSON.parse(before[loc]), loc)
    if (!isDeepStrictEqual(parsed, expected)) fail(loc, 'deep-equal to pre-edit minus keys failed')
    for (const n of NAMES) if (text.includes(n)) fail(loc, `still contains ${n}`)
  }
}

function check(locs, ref) {
  for (const loc of locs) {
    const text = fs.readFileSync(fileOf(loc), 'utf8')
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      fail(loc, `does not parse: ${e.message}`)
    }
    for (const n of NAMES) if (text.includes(n)) fail(loc, `still contains ${n}`)
    if (ref) {
      const blob = execFileSync(
        'git',
        ['show', `${ref}:public/locales/${loc}/translation.json`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      )
      const expected = stripKeys(JSON.parse(blob), loc)
      if (!isDeepStrictEqual(parsed, expected)) {
        fail(loc, `current parse != ${ref} parse minus the three keys`)
      }
    }
  }
  console.log(
    `check OK: ${locs.length} catalogues parse, zero occurrences of ${NAMES.join(', ')}` +
      (ref ? `, deep-equal to ${ref} minus those keys` : '')
  )
}

function main() {
  const args = process.argv.slice(2)
  const mode = args.find((a) => ['--dry-run', '--write', '--check'].includes(a))
  if (!mode) {
    console.error('usage: --dry-run | --write | --check [--against <ref>]')
    process.exit(2)
  }
  const locs = population()

  if (mode === '--check') {
    const ai = args.indexOf('--against')
    const ref = ai >= 0 ? args[ai + 1] : null
    if (ai >= 0 && !ref) fail('*', '--against needs a ref')
    check(locs, ref)
    return
  }

  const before = {}
  const results = {}
  let totalDeleted = 0
  let totalRepairs = 0
  for (const loc of locs) {
    const text = fs.readFileSync(fileOf(loc), 'utf8')
    before[loc] = text
    const r = plan(loc, text)
    results[loc] = r
    totalDeleted += r.deleted.length
    totalRepairs += r.repairs
    console.log(
      `${loc}: deleted lines ${r.deleted.join(',')} (children ${r.children}, repairs ${r.repairs})`
    )
  }
  if (mode === '--write') {
    for (const loc of locs) fs.writeFileSync(fileOf(loc), results[loc].text)
    verifyWritten(locs, before)
    console.log('write verified: all parse, deep-equal minus keys, no names remain')
  }
  console.log(
    `TOTAL: files ${locs.length}, lines deleted ${totalDeleted}, repairs ${totalRepairs}`
  )
}

main()
