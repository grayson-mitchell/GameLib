#!/usr/bin/env node
'use strict'

// 34.9-REVIEW-SWEEP-CHECK.cjs (renamed from its gap-cycle-2-scoped predecessor, D-C4-04a)
//
// Cycle-agnostic, dependency-free (node:fs only) sweep predicate for every finding-disposition
// review file in this phase directory -- not one named cycle's review file. Derives "list A" live
// by globbing `*-REVIEW*.md` in the target directory and parsing every `^### <ID>` heading found
// (never from a hand-written list), so it works unchanged against a review file that does not exist
// yet at authoring time. Derives "list B" as the union of finding IDs appearing as `| <ID> | ... |`
// table rows anywhere in `deferred-items.md`, across every disposition section in the file, not
// inside one named section.
//
// Recognised finding-ID shapes: `C<n>-<nn>` (e.g. a gap-cycle finding), `CR-<nn>`, `WR-<nn>`,
// `IN-<nn>`.
//
// Usage: node 34.9-REVIEW-SWEEP-CHECK.cjs [directory]
//   <directory> defaults to this script's own directory.
//
// FIXED-row confirmation rule (tightened, C3-03). A FIXED row's Evidence cell and, when present,
// its separate Independent-confirmation cell are read together as one block of text ("the citation
// text") and scored in two independent passes:
//   1. Polarity (checked first, and REJECTS regardless of anything else in the row): a
//      case-insensitive deny-list of phrases that deny the fix (`not fixed`, `not actually fixed`,
//      `still has the bug`, `still broken`, `still fails`, `never landed`, `never added`,
//      `does not exist`). A match on the citation text fails the row with reason
//      FIXED-CONFIRMATION-DENIES-FIX, even if the same text also satisfies the acceptance rule
//      below -- a row cannot claim a fix while its own evidence denies it.
//   2. Acceptance: the citation text must NOT contain the word `summary` in any capitalisation
//      (case-insensitive, matching the convention POLARITY_DENY_PATTERNS already uses -- a plan
//      Summary is the phase's own narrative about its own effect, never independent proof), and must
//      contain EITHER a `meta/`, `src/` or `package.json` path reference, OR a reproducible-result
//      marker (`verdict` and `PASS` both present -- this project's own proof-document convention,
//      e.g. `34.9-PIPE-PROOF.md`'s `verdict PASS`). The artifact does not have to live outside
//      `.planning/` -- a citation to a reproducible command's own observed result is independent
//      evidence wherever the artifact lives; a document merely asserting its own correctness is
//      not, and that document-asserting-itself case is exactly what the SUMMARY ban and the
//      polarity check exist to catch instead.
// A FIXED row's Evidence cell must additionally cite a plan in this phase (`34\.9-\d+`, not a
// hard-coded range of plan numbers from any one gap cycle).
//
// DEFERRED-row structural rule (unchanged from the prior cycle-2-scoped tool): the Evidence cell
// must reference `item <N>`, and `deferred-items.md` must contain a `### <N>.` section that names
// the finding ID and contains the strings `OWNER:`, `Named precondition` and `Blocker`.
//
// A finding ID legitimately appears more than once in `deferred-items.md` when a per-cycle ledger
// table first opens a numbered ledger item and a later reconciliation table cross-references that
// same item by number -- this is not a data error, and is not rejected, as long as every appearance
// of the ID resolves to the same disposition category (FIXED or DEFERRED). Two rows for the same ID
// resolving to DIFFERENT categories is a genuine contradiction and fails as DUPLICATE-ROW.
//
// Exit codes:
//   0  every list-A ID mapped; computed unmapped count is 0
//   1  a structural or scoring failure (missing file, bad row shape, an unmapped ID, a
//      DUPLICATE-ROW conflict, ...)
//   2  list A is empty (LIST-A-EMPTY) -- an empty list A would make every membership check pass
//      vacuously, which is exactly the self-satisfying-assertion failure mode this script exists to
//      avoid

const fs = require('node:fs')

const ID_SHAPE = '(?:C\\d+-\\d{2}|CR-\\d{2}|WR-\\d{2}|IN-\\d{2})'
const HEADING_ID_RE = new RegExp('^### (' + ID_SHAPE + ')\\b', 'gm')
const ROW_ID_RE = new RegExp('^\\|\\s*(' + ID_SHAPE + ')\\s*\\|')
const REVIEW_FILENAME_RE = /-REVIEW.*\.md$/

const POLARITY_DENY_PATTERNS = [
  /not fixed/i,
  /not actually fixed/i,
  /still has the bug/i,
  /still broken/i,
  /still fails/i,
  /never landed/i,
  /never added/i,
  /does not exist/i
]

function joinPath(dir, name) {
  return dir.replace(/\/+$/, '') + '/' + name
}

function discoverReviewFiles(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && REVIEW_FILENAME_RE.test(e.name))
    .map((e) => e.name)
    .sort()
}

function deriveListA(dir, reviewFiles) {
  const listA = []
  const seen = new Set()
  for (const filename of reviewFiles) {
    const text = fs.readFileSync(joinPath(dir, filename), 'utf8')
    const re = new RegExp(HEADING_ID_RE.source, 'gm')
    let match
    while ((match = re.exec(text)) !== null) {
      const id = match[1]
      if (!seen.has(id)) {
        seen.add(id)
        listA.push(id)
      }
    }
  }
  return listA
}

// Parses every `| <ID> | ... |` row anywhere in deferredText -- not scoped to one named section --
// merging legitimate cross-referenced duplicates and failing on genuine category conflicts.
function parseDispositionRows(deferredText) {
  const rows = new Map()
  const lines = deferredText.split('\n')
  for (const line of lines) {
    const rowMatch = line.match(ROW_ID_RE)
    if (!rowMatch) continue
    const id = rowMatch[1]

    let cells = line.split('|').map((c) => c.trim())
    if (cells.length > 0 && cells[0] === '') cells.shift()
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()

    const [finding, severity, dispositionRaw, evidence, ...confirmationRest] = cells
    const confirmation = confirmationRest.join(' | ')
    const categoryMatch = (dispositionRaw || '').trim().match(/^(FIXED|DEFERRED)\b/)
    const category = categoryMatch ? categoryMatch[1] : null

    const existing = rows.get(id)
    if (existing) {
      if (existing.category !== category) {
        return { error: 'DUPLICATE-ROW ' + id }
      }
      // Consistent duplicate (e.g. a per-cycle ledger table's row and a later reconciliation
      // table's row for the same ID, both resolving to the same category) -- not an error. The
      // later occurrence in document order wins; both point at the same ledger item number for
      // DEFERRED rows, so which one wins does not change the scoring result.
    }
    rows.set(id, { finding, severity, dispositionRaw, category, evidence, confirmation })
  }
  return { rows }
}

function scoreFixedRow(row) {
  const evidence = row.evidence || ''
  const confirmation = row.confirmation || ''
  const combined = [evidence, confirmation].filter(Boolean).join(' | ')

  const deniesFix = POLARITY_DENY_PATTERNS.some((re) => re.test(combined))
  if (deniesFix) {
    return 'FIXED-CONFIRMATION-DENIES-FIX'
  }

  const evidenceOk = /34\.9-\d+/.test(evidence)
  const citesSummary = /SUMMARY/i.test(combined)
  const citesArtifact = /meta\/|src\/|package\.json/.test(combined)
  const citesReproducibleResult = /\bverdict\b/i.test(combined) && /\bPASS\b/.test(combined)
  const citationOk = !citesSummary && (citesArtifact || citesReproducibleResult)

  if (!evidenceOk || !citationOk) {
    return 'FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING'
  }
  return null
}

function main() {
  const dir = process.argv[2] ? process.argv[2] : __dirname

  const reviewFiles = discoverReviewFiles(dir)
  const listA = deriveListA(dir, reviewFiles)

  if (listA.length === 0) {
    console.log('LIST-A-EMPTY')
    process.exitCode = 2
    return
  }

  console.log('DISCOVERED-REVIEW-FILES: ' + reviewFiles.join(', '))
  console.log('LIST-A: ' + listA.length + ' IDs (' + listA.join(', ') + ')')

  const deferredPath = joinPath(dir, 'deferred-items.md')
  if (!fs.existsSync(deferredPath)) {
    console.log('MISSING-DEFERRED-ITEMS')
    process.exitCode = 1
    return
  }
  const deferredText = fs.readFileSync(deferredPath, 'utf8')

  const parsed = parseDispositionRows(deferredText)
  if (parsed.error) {
    console.log(parsed.error)
    process.exitCode = 1
    return
  }
  const rows = parsed.rows

  const unmapped = []
  for (const id of listA) {
    const row = rows.get(id)
    if (!row) {
      unmapped.push([id, 'NO-ROW'])
      continue
    }

    if (!row.category) {
      unmapped.push([id, 'BAD-DISPOSITION'])
      continue
    }

    if (row.category === 'FIXED') {
      const reason = scoreFixedRow(row)
      if (reason) unmapped.push([id, reason])
      continue
    }

    // DEFERRED -- item-reference + structural checks.
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

  console.log('COMPUTED-UNMAPPED: ' + unmapped.length)
  for (const [id, reason] of unmapped) {
    console.log(id + ' ' + reason)
  }

  if (unmapped.length === 0) {
    console.log('REVIEW-SWEEP-OK ' + listA.length + '/' + listA.length + ' mapped, unmapped 0')
    process.exitCode = 0
    return
  }
  process.exitCode = 1
}

main()
