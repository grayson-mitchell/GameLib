#!/usr/bin/env node
// Prints sorted unique "<suite basename> :: <assertion fullName>" lines for every failed
// assertion in a jest --json output file, and "<suite basename> :: SUITE-ERROR" for a failed
// suite with no failed assertions. Used to compare failing sets before and after quick 261111-buh.
'use strict'
const fs = require('fs')

const file = process.argv[2]
if (!file) {
  console.error('usage: node jest_failing.cjs <jest-json>')
  process.exit(2)
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'))
const lines = new Set()
for (const suite of report.testResults || []) {
  const base = String(suite.name).split(/[\\/]/).pop()
  const failed = (suite.assertionResults || []).filter(
    (a) => a.status === 'failed'
  )
  for (const a of failed) lines.add(`${base} :: ${a.fullName}`)
  if (failed.length === 0 && suite.status === 'failed') {
    lines.add(`${base} :: SUITE-ERROR`)
  }
}
const out = [...lines].sort()
if (out.length) process.stdout.write(out.join('\n') + '\n')
