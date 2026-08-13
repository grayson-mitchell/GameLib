#!/usr/bin/env node
'use strict'

// 34.9-C2-SWEEP-CHECK.cjs
//
// Re-pointable, dependency-free sweep predicate for `34.9-REVIEW-CYCLE2.md`'s eight findings.
// Derives "list A" live from the review file's own `### C2-NN` headings (never from any
// hand-written list) and scores every finding against `deferred-items.md`'s disposition table
// and, for DEFERRED rows, the structured `### N.` ledger section it points at. A FIXED row is
// scored only from an Independent-confirmation cell naming a non-`.planning/` artifact -- never
// from a plan SUMMARY's or a frontmatter `closes_findings`' claim.
//
// Usage: node 34.9-C2-SWEEP-CHECK.cjs <deferred-items.md path> <review path>
//
// Exit codes:
//   0  every list-A ID mapped, computed unmapped count is 0 and agrees with the document's own
//      stated count
//   1  a structural or scoring failure (missing heading, bad row shape, disagreement, any
//      unmapped ID once the document claims 0, an EXTRA-ROW, a DUPLICATE-ROW, ...)
//   2  list A is empty (LIST-A-EMPTY) -- an empty list A would make every membership check pass
//      vacuously, which is exactly the self-satisfying-assertion failure mode this script exists
//      to avoid

const fs = require('node:fs')

const HEADING = '## Code-review finding disposition — gap cycle 2 review (2026-08-13)'

function main() {
  const [, , deferredPath, reviewPath] = process.argv

  if (!deferredPath || !reviewPath) {
    console.log('USAGE: node 34.9-C2-SWEEP-CHECK.cjs <deferred-items.md> <review.md>')
    process.exitCode = 1
    return
  }

  const reviewText = fs.readFileSync(reviewPath, 'utf8')
  const deferredText = fs.readFileSync(deferredPath, 'utf8')

  // --- Step 1: derive list A live from the review's own `### C2-NN` headings. -----------------
  const listA = []
  {
    const headingRe = /^### (C2-\d{2})/gm
    let match
    while ((match = headingRe.exec(reviewText)) !== null) {
      listA.push(match[1])
    }
  }
  if (listA.length === 0) {
    console.log('LIST-A-EMPTY')
    process.exitCode = 2
    return
  }

  // --- Step 2: locate the disposition section. -------------------------------------------------
  const headingIdx = deferredText.indexOf(HEADING)
  if (headingIdx === -1) {
    console.log('MISSING-DISPOSITION-HEADING')
    process.exitCode = 1
    return
  }
  let sectionEnd = deferredText.length
  {
    const rest = deferredText.slice(headingIdx + HEADING.length)
    const nextHeading = rest.match(/^## /m)
    if (nextHeading) {
      sectionEnd = headingIdx + HEADING.length + nextHeading.index
    }
  }
  const section = deferredText.slice(headingIdx, sectionEnd)

  // --- Step 3: parse data rows, inside `section` only. ------------------------------------------
  const rows = new Map()
  {
    const lines = section.split('\n')
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(C2-\d{2})\s*\|/)
      if (!rowMatch) continue
      const id = rowMatch[1]

      let cells = line.split('|').map((c) => c.trim())
      if (cells.length > 0 && cells[0] === '') cells.shift()
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()

      const [finding, severity, disposition, evidence, ...confirmationRest] = cells
      const confirmation = confirmationRest.join(' | ')

      if (rows.has(id)) {
        console.log('DUPLICATE-ROW ' + id)
        process.exitCode = 1
        return
      }
      rows.set(id, { finding, severity, disposition, evidence, confirmation })
    }
  }

  // --- Step 4: set equality, both directions. ----------------------------------------------------
  const listASet = new Set(listA)
  for (const id of rows.keys()) {
    if (!listASet.has(id)) {
      console.log('EXTRA-ROW ' + id)
      process.exitCode = 1
      return
    }
  }

  // --- Step 5: score each row. --------------------------------------------------------------------
  const unmapped = []
  for (const id of listA) {
    const row = rows.get(id)
    if (!row) {
      unmapped.push([id, 'NO-ROW'])
      continue
    }

    const disposition = (row.disposition || '').trim()
    if (!/^(FIXED|DEFERRED)$/.test(disposition)) {
      unmapped.push([id, 'BAD-DISPOSITION'])
      continue
    }

    if (disposition === 'FIXED') {
      const evidence = row.evidence || ''
      const confirmation = row.confirmation || ''
      const evidenceOk = /34\.9-2[3-7]/.test(evidence)
      const confirmationOk =
        /meta\/|src\/|package\.json/.test(confirmation) &&
        !confirmation.includes('.planning/') &&
        !confirmation.includes('SUMMARY')
      if (!evidenceOk || !confirmationOk) {
        unmapped.push([id, 'FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING'])
      }
      continue
    }

    // DEFERRED
    const evidence = row.evidence || ''
    const itemRefMatch = evidence.match(/item (\d+)/)
    if (!itemRefMatch) {
      unmapped.push([id, 'ITEM-DOES-NOT-NAME-FINDING'])
      continue
    }
    const itemNumber = itemRefMatch[1]
    const itemHeadingRe = new RegExp('^### ' + itemNumber + '\\.', 'm')
    const itemHeadingMatch = deferredText.match(itemHeadingRe)
    if (!itemHeadingMatch) {
      unmapped.push([id, 'NO-SUCH-ITEM'])
      continue
    }
    const itemStart = itemHeadingMatch.index
    const afterHeading = deferredText.slice(itemStart + itemHeadingMatch[0].length)
    const nextHeading = afterHeading.match(/^#{2,3} /m)
    const itemEnd = nextHeading
      ? itemStart + itemHeadingMatch[0].length + nextHeading.index
      : deferredText.length
    const itemSection = deferredText.slice(itemStart, itemEnd)

    if (!itemSection.includes(id)) {
      unmapped.push([id, 'ITEM-DOES-NOT-NAME-FINDING'])
      continue
    }
    if (
      !itemSection.includes('OWNER:') ||
      !itemSection.includes('Named precondition') ||
      !itemSection.includes('Blocker')
    ) {
      unmapped.push([id, 'ITEM-NOT-STRUCTURED'])
      continue
    }
  }

  // --- Step 6: compare computed against stated. ---------------------------------------------------
  console.log('COMPUTED-UNMAPPED: ' + unmapped.length)
  for (const [id, reason] of unmapped) {
    console.log(id + ' ' + reason)
  }

  const countMatch = section.match(/Unmapped count:\s*\*\*(\d+)\*\*/)
  if (!countMatch) {
    console.log('NO-STATED-COUNT')
    process.exitCode = 1
    return
  }
  const statedCount = Number(countMatch[1])
  if (statedCount !== unmapped.length) {
    console.log('COUNT-DISAGREES stated=' + statedCount + ' computed=' + unmapped.length)
    process.exitCode = 1
    return
  }

  // --- Step 7: exit. --------------------------------------------------------------------------------
  if (unmapped.length === 0 && statedCount === 0) {
    const mapped = listA.length - unmapped.length
    console.log('C2-SWEEP-OK ' + mapped + '/' + listA.length + ' mapped, unmapped 0')
    process.exitCode = 0
    return
  }
  process.exitCode = 1
}

main()
