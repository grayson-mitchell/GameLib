#!/usr/bin/env node
'use strict'

/*
 * ledger_inplace_check.cjs -- read-only harness for Phase 38 sitting 9, quick 260929-tmw.
 *
 * PROVES: the sitting-9 edit to 38-VERIFICATION.md was an IN-PLACE ANNOTATION. The open
 * `38-S16` entry gained exactly ONE new key, directly after `id`, and nothing else in the
 * frontmatter changed versus the pre-edit revision (`--rev`). In particular the item was NOT
 * moved to `human_verification_discharged` -- it is scored on BOTH matrix rows 5 and 7 and this
 * sitting ran only row 7.
 *
 * USAGE: node ledger_inplace_check.cjs --rev SHA --key NAME [--id 38-S16] [--file PATH]
 * Exits 1 on any FAIL. Read-only: it runs `git show` and reads the file, nothing else.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const yaml = require('js-yaml')

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const rev = arg('--rev')
const key = arg('--key')
const id = arg('--id', '38-S16')
const repo = path.resolve(__dirname, '..', '..', '..')
const file = arg(
  '--file',
  '.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md'
)
if (!rev || !key) {
  console.error('usage: --rev SHA --key NAME [--id ID] [--file PATH]')
  process.exit(2)
}

function frontmatter(text) {
  const lines = text.split('\n')
  const a = lines.findIndex((l) => l === '---')
  const b = lines.findIndex((l, i) => i > a && l === '---')
  return yaml.load(lines.slice(a + 1, b).join('\n'))
}

const before = frontmatter(
  execFileSync('git', ['show', `${rev}:${file}`], { cwd: repo, encoding: 'utf8' })
)
const after = frontmatter(fs.readFileSync(path.join(repo, file), 'utf8'))

const j = (v) => JSON.stringify(v)
let bad = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ': ' + detail}`)
  if (!ok) bad++
}
const hv = (fm) => fm.human_verification || []
const entry = (fm) => hv(fm).find((e) => e.id === id)
const eb = entry(before)
const ea = entry(after)

check('top-keys', j(Object.keys(before)) === j(Object.keys(after)))
check(
  'top-values',
  Object.keys(before)
    .filter((k) => k !== 'human_verification')
    .every((k) => j(before[k]) === j(after[k]))
)
check('open-ids', j(hv(before).map((e) => e.id)) === j(hv(after).map((e) => e.id)))
check(
  'other-open-entries',
  hv(before)
    .filter((e) => e.id !== id)
    .every((e) => j(e) === j(hv(after).find((x) => x.id === e.id)))
)
check('key-absent-at-rev', !!eb && !(key in eb))
check(
  'key-added',
  !!ea && Object.keys(ea)[1] === key && typeof ea[key] === 'string' && ea[key].length > 0,
  ea ? `second key is ${Object.keys(ea)[1]}` : 'entry missing on disk'
)
let rest = null
if (ea) {
  rest = { ...ea }
  delete rest[key]
}
check('entry-otherwise-unchanged', !!eb && !!rest && j(rest) === j(eb))

process.exit(bad ? 1 : 0)
