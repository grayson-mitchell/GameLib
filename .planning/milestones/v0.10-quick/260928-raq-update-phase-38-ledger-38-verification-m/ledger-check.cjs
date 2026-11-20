#!/usr/bin/env node
'use strict'

/*
 * ledger-check.cjs — quick-task harness for quick 260928-raq.
 *
 * WHY THIS EXISTS: Phase 38's ledger (38-VERIFICATION.md) went invisible to
 * gsd-core's `audit-uat` when its frontmatter stopped being valid YAML — the
 * `score` field picked up an unescaped `: ` sequence in `e09fbc652` and
 * `38-S08`'s `result` field picked up six unescaped double quotes in
 * `aaae8a1d2` (both 2026-09-23). Under `@opengsd/gsd-core` 1.14.0,
 * `extractFrontmatter` returns `{}` for a file whose frontmatter fails to
 * parse, so `status` reads as `undefined`, the `human_needed` gate never
 * opens, and the phase silently drops out of `audit-uat`'s `by_phase` map
 * with no error and no `parse_gap`. This script exists to make every edit in
 * quick 260928-raq checkable on demand. IT IS A QUICK-TASK HARNESS, NOT A CI
 * GATE — it is not wired into `pnpm planning-gates` and nothing runs it
 * automatically.
 *
 * USAGE — ledger mode (the default; `--open`, `--discharged` and `--retired`
 * are all required):
 *
 *   node ledger-check.cjs --open N --discharged N --retired N [flags...]
 *
 * Ledger-mode flags:
 *   --rev <commit>                  Read the ledger from `git show
 *                                    <commit>:<path>` instead of disk. The
 *                                    audit-uat check then prints SKIP,
 *                                    because audit-uat reads only the live
 *                                    tree.
 *   --open-ids <csv>                The set of `human_verification` ids must
 *                                    equal this comma-separated list.
 *   --discharged-includes <csv>     Each id must be present in
 *                                    `human_verification_discharged` with a
 *                                    non-empty string `result`.
 *   --includes <scope>=<substring>  Repeatable. scope is one of
 *                                    `open:<id>:<field>`,
 *                                    `discharged:<id>:<field>`,
 *                                    `retired:<id>:<field>` or `top:<key>`.
 *                                    Asserts the field is a string
 *                                    containing the substring.
 *   --no-stale-premise              For every `human_verification` entry,
 *                                    `blocked_by`, `why_human` and
 *                                    `platform_gate` must not contain, case-
 *                                    insensitively, any STALE_PREMISE phrase.
 *   --human-uat                     38-HUMAN-UAT.md frontmatter parses to a
 *                                    mapping, and its `source` is an array of
 *                                    exactly 3 strings.
 *   --origin40                      The Phase 40 VERIFICATION.md frontmatter
 *                                    parses, `deferred` has exactly 6
 *                                    entries, and the entries whose
 *                                    `evidence` contains `38-E01` and
 *                                    `38-E02` each carry a non-empty string
 *                                    `outcome_2026_09_28`.
 *   --syntax-preserved-from <rev>   Asserts the LIVE ledger's parsed `score`
 *                                    and `38-S08.result` equal the raw text
 *                                    at <rev>, modulo YAML unescaping.
 *
 * USAGE — census mode (runs no ledger checks):
 *
 *   node ledger-check.cjs --census [--expect-bad N]
 *
 * OUTPUT: one line per check — `PASS <check>`, `FAIL <check>: <detail>`, or
 * `SKIP <check>: <reason>`. A SKIP is never counted as a pass. Exit code is 1
 * if any check FAILs, 0 otherwise.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../../..')
const LEDGER_REL =
  '.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md'
const HUMAN_UAT_REL =
  '.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md'
const LEDGER_PATH = path.join(ROOT, LEDGER_REL)
const HUMAN_UAT_PATH = path.join(ROOT, HUMAN_UAT_REL)
const GSD_CORE_LIB = path.join(
  os.homedir(),
  '.claude',
  'gsd-core',
  'bin',
  'lib'
)
const GSD_TOOLS = path.join(
  os.homedir(),
  '.claude',
  'gsd-core',
  'bin',
  'gsd-tools.cjs'
)

// Copied character-for-character from the plan's "Stale-premise phrases" list
// (260928-raq-PLAN.md <verification>). These are the exact wording, measured
// at planning time, that must NOT survive in any open item's `blocked_by`,
// `why_human` or `platform_gate` once Task 2 has run.
const STALE_PREMISE = [
  'implementation exists yet',
  'code path exists to observe yet',
  'no code path to observe yet',
  'blocked on those items landing first',
  'backends to exist first',
  'until those backends land'
]

const results = []
function pass(check, detail) {
  results.push({ level: 'PASS', check, detail })
}
function fail(check, detail) {
  results.push({ level: 'FAIL', check, detail })
}
function skip(check, detail) {
  results.push({ level: 'SKIP', check, detail })
}

function printResults() {
  for (const r of results) {
    if (r.level === 'PASS') {
      console.log(`PASS ${r.check}${r.detail ? ': ' + r.detail : ''}`)
    } else if (r.level === 'SKIP') {
      console.log(`SKIP ${r.check}: ${r.detail}`)
    } else {
      console.log(`FAIL ${r.check}: ${r.detail}`)
    }
  }
}

function anyFail() {
  return results.some((r) => r.level === 'FAIL')
}

// --- argument parsing ---
function parseArgs(argv) {
  const args = { includes: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--open':
        args.open = Number(argv[++i])
        break
      case '--discharged':
        args.discharged = Number(argv[++i])
        break
      case '--retired':
        args.retired = Number(argv[++i])
        break
      case '--rev':
        args.rev = argv[++i]
        break
      case '--open-ids':
        args.openIds = argv[++i].split(',')
        break
      case '--discharged-includes':
        args.dischargedIncludes = argv[++i].split(',')
        break
      case '--includes':
        args.includes.push(argv[++i])
        break
      case '--no-stale-premise':
        args.noStalePremise = true
        break
      case '--human-uat':
        args.humanUat = true
        break
      case '--origin40':
        args.origin40 = true
        break
      case '--syntax-preserved-from':
        args.syntaxPreservedFrom = argv[++i]
        break
      case '--census':
        args.census = true
        break
      case '--expect-bad':
        args.expectBad = Number(argv[++i])
        break
      default:
        console.error(`Unknown argument: ${a}`)
        process.exit(2)
    }
  }
  return args
}

// --- generic helpers ---

/** The lines between a first line equal to `---` and the next line equal to `---`. */
function extractFrontmatterRegion(content) {
  const lines = content.split(/\r\n|\n/)
  if (lines[0] !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i
      break
    }
  }
  if (end === -1) return null
  return lines.slice(1, end).join('\n')
}

function readFromDisk(absPath) {
  return fs.readFileSync(absPath, 'utf8')
}

function readFromRev(rev, relPath) {
  return execFileSync('git', ['show', `${rev}:${relPath}`], {
    cwd: ROOT,
    encoding: 'utf8'
  })
}

function checkJsYamlVersion(yaml) {
  const pkg = require('js-yaml/package.json')
  if (!pkg.version.startsWith('4.')) {
    fail('js-yaml-version', `expected 4.x, found ${pkg.version}`)
    return false
  }
  pass('js-yaml-version', pkg.version)
  return true
}

function findPhase40File() {
  const phasesDir = path.join(ROOT, '.planning/phases')
  const dirs = fs.readdirSync(phasesDir).filter((d) => d.startsWith('40-'))
  const matches = []
  for (const d of dirs) {
    const p = path.join(phasesDir, d, '40-VERIFICATION.md')
    if (fs.existsSync(p)) matches.push(p)
  }
  return matches
}

function frontmatterExceptionMessage(e) {
  // js-yaml's YAMLException already carries "at line N, column M" in its
  // message — no need to re-derive line/column ourselves.
  return e && e.message ? e.message : String(e)
}

// --- ledger mode ---

function runLedgerMode(args, yaml) {
  if (
    args.open === undefined ||
    args.discharged === undefined ||
    args.retired === undefined
  ) {
    console.error(
      '--open, --discharged and --retired are all required in ledger mode'
    )
    process.exit(2)
  }

  const content = args.rev
    ? readFromRev(args.rev, LEDGER_REL)
    : readFromDisk(LEDGER_PATH)

  let doc = null
  let region = null
  try {
    region = extractFrontmatterRegion(content)
    if (region === null) throw new Error('no frontmatter fence (---) found')
    doc = yaml.load(region)
  } catch (e) {
    fail('frontmatter-parse', frontmatterExceptionMessage(e))
    // Every other ledger check depends on a parsed document. Report them all
    // as SKIP rather than silently omitting them, so a reader sees exactly
    // what could not be checked.
    skip('status', 'frontmatter did not parse')
    skip('array-lengths', 'frontmatter did not parse')
    skip('unique-ids', 'frontmatter did not parse')
    skip('gsd-core-status', 'frontmatter did not parse')
    skip('gsd-core-item-count', 'frontmatter did not parse')
    skip('audit-uat', 'frontmatter did not parse')
    if (args.openIds) skip('open-ids', 'frontmatter did not parse')
    if (args.dischargedIncludes)
      skip('discharged-includes', 'frontmatter did not parse')
    for (const inc of args.includes)
      skip(`includes:${inc}`, 'frontmatter did not parse')
    if (args.noStalePremise)
      skip('no-stale-premise', 'frontmatter did not parse')
    if (args.syntaxPreservedFrom)
      skip('syntax-preserved', 'frontmatter did not parse')
    return
  }
  pass('frontmatter-parse')

  const openArr = Array.isArray(doc.human_verification)
    ? doc.human_verification
    : []
  const dischargedArr = Array.isArray(doc.human_verification_discharged)
    ? doc.human_verification_discharged
    : []
  const retiredArr = Array.isArray(doc.human_verification_retired)
    ? doc.human_verification_retired
    : []

  if (doc.status === 'human_needed') {
    pass('status')
  } else {
    fail(
      'status',
      `expected 'human_needed', found ${JSON.stringify(doc.status)}`
    )
  }

  if (openArr.length === args.open) {
    pass('open-length', String(openArr.length))
  } else {
    fail('open-length', `expected ${args.open}, found ${openArr.length}`)
  }
  if (dischargedArr.length === args.discharged) {
    pass('discharged-length', String(dischargedArr.length))
  } else {
    fail(
      'discharged-length',
      `expected ${args.discharged}, found ${dischargedArr.length}`
    )
  }
  if (retiredArr.length === args.retired) {
    pass('retired-length', String(retiredArr.length))
  } else {
    fail(
      'retired-length',
      `expected ${args.retired}, found ${retiredArr.length}`
    )
  }

  const allIds = [...openArr, ...dischargedArr, ...retiredArr].map(
    (e) => e && e.id
  )
  const seen = new Set()
  const dupes = new Set()
  for (const id of allIds) {
    if (seen.has(id)) dupes.add(id)
    seen.add(id)
  }
  if (dupes.size === 0) {
    pass('unique-ids')
  } else {
    fail('unique-ids', `duplicate id(s): ${[...dupes].join(', ')}`)
  }

  // --- gsd-core cross-check ---
  const { extractFrontmatter } = require(
    path.join(GSD_CORE_LIB, 'frontmatter.cjs')
  )
  const { parseVerificationItems } = require(path.join(GSD_CORE_LIB, 'uat.cjs'))
  const fm = extractFrontmatter(content, LEDGER_REL)
  if (fm.status === 'human_needed') {
    pass('gsd-core-status')
  } else {
    fail(
      'gsd-core-status',
      `extractFrontmatter().status = ${JSON.stringify(fm.status)}`
    )
  }
  const gsdItems = parseVerificationItems(content, 'human_needed', LEDGER_REL)
  if (gsdItems.length === args.open) {
    pass('gsd-core-item-count', String(gsdItems.length))
  } else {
    fail(
      'gsd-core-item-count',
      `expected ${args.open}, found ${gsdItems.length}`
    )
  }

  // --- audit-uat check ---
  if (args.rev) {
    skip('audit-uat', 'audit-uat reads only the live tree, not git revisions')
  } else {
    try {
      const raw = execFileSync('node', [GSD_TOOLS, 'audit-uat', '--raw'], {
        cwd: ROOT,
        encoding: 'utf8'
      })
      const auditDoc = JSON.parse(raw)
      const byPhase38 =
        auditDoc.summary &&
        auditDoc.summary.by_phase &&
        auditDoc.summary.by_phase['38']
      if (byPhase38 === args.open) {
        pass('audit-uat-by-phase-38', String(byPhase38))
      } else {
        fail(
          'audit-uat-by-phase-38',
          `expected ${args.open}, found ${JSON.stringify(byPhase38)}`
        )
      }
      const parseGapFiles = auditDoc.summary && auditDoc.summary.parse_gap_files
      if (parseGapFiles === 0) {
        pass('audit-uat-parse-gap-files', '0')
      } else {
        fail(
          'audit-uat-parse-gap-files',
          `expected 0, found ${JSON.stringify(parseGapFiles)}`
        )
      }
      pass(
        'audit-uat-total-items',
        String(auditDoc.summary && auditDoc.summary.total_items)
      )
    } catch (e) {
      fail('audit-uat', frontmatterExceptionMessage(e))
    }
  }

  // --- --open-ids ---
  if (args.openIds) {
    const actual = openArr.map((e) => e.id).sort()
    const expected = [...args.openIds].sort()
    const same =
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i])
    if (same) {
      pass('open-ids')
    } else {
      fail(
        'open-ids',
        `expected {${expected.join(',')}}, found {${actual.join(',')}}`
      )
    }
  }

  // --- --discharged-includes ---
  if (args.dischargedIncludes) {
    const missing = []
    for (const id of args.dischargedIncludes) {
      const entry = dischargedArr.find((e) => e.id === id)
      if (!entry) {
        missing.push(`${id} (absent)`)
      } else if (
        typeof entry.result !== 'string' ||
        entry.result.length === 0
      ) {
        missing.push(`${id} (no non-empty result)`)
      }
    }
    if (missing.length === 0) {
      pass('discharged-includes')
    } else {
      fail('discharged-includes', missing.join('; '))
    }
  }

  // --- --includes ---
  function arrayForScope(scope) {
    if (scope === 'open') return openArr
    if (scope === 'discharged') return dischargedArr
    if (scope === 'retired') return retiredArr
    return null
  }
  for (const inc of args.includes) {
    const eqIdx = inc.indexOf('=')
    if (eqIdx === -1) {
      fail(
        `includes:${inc}`,
        'malformed --includes value, expected <scope>=<substring>'
      )
      continue
    }
    const scopeSpec = inc.slice(0, eqIdx)
    const substring = inc.slice(eqIdx + 1)
    const parts = scopeSpec.split(':')
    if (parts[0] === 'top') {
      const key = parts.slice(1).join(':')
      const value = doc[key]
      if (typeof value === 'string' && value.includes(substring)) {
        pass(`includes:${scopeSpec}`)
      } else {
        fail(
          `includes:${scopeSpec}`,
          `top-level '${key}' does not contain "${substring}"`
        )
      }
      continue
    }
    const arr = arrayForScope(parts[0])
    const id = parts[1]
    const field = parts.slice(2).join(':')
    if (!arr) {
      fail(`includes:${scopeSpec}`, `unknown scope '${parts[0]}'`)
      continue
    }
    const entry = arr.find((e) => e && e.id === id)
    if (!entry) {
      fail(`includes:${scopeSpec}`, `no entry with id '${id}' in ${parts[0]}`)
      continue
    }
    const value = entry[field]
    if (typeof value === 'string' && value.includes(substring)) {
      pass(`includes:${scopeSpec}`)
    } else {
      fail(
        `includes:${scopeSpec}`,
        `field '${field}' does not contain "${substring}"`
      )
    }
  }

  // --- --no-stale-premise ---
  if (args.noStalePremise) {
    const hits = []
    for (const entry of openArr) {
      for (const field of ['blocked_by', 'why_human', 'platform_gate']) {
        const value = entry[field]
        if (typeof value !== 'string') continue
        const lower = value.toLowerCase()
        for (const phrase of STALE_PREMISE) {
          if (lower.includes(phrase.toLowerCase())) {
            hits.push(`${entry.id}.${field}`)
          }
        }
      }
    }
    if (hits.length === 0) {
      pass('no-stale-premise')
    } else {
      for (const h of hits) fail('stale-premise', h)
    }
  }

  // --- --human-uat ---
  if (args.humanUat) {
    try {
      const huContent = readFromDisk(HUMAN_UAT_PATH)
      const huRegion = extractFrontmatterRegion(huContent)
      if (huRegion === null) throw new Error('no frontmatter fence found')
      const huDoc = yaml.load(huRegion)
      if (huDoc && typeof huDoc === 'object' && !Array.isArray(huDoc)) {
        pass('human-uat-frontmatter-parse')
      } else {
        fail(
          'human-uat-frontmatter-parse',
          'frontmatter did not parse to a mapping'
        )
      }
      const source = huDoc && huDoc.source
      if (
        Array.isArray(source) &&
        source.length === 3 &&
        source.every((s) => typeof s === 'string')
      ) {
        pass('human-uat-source')
      } else {
        fail(
          'human-uat-source',
          `expected an array of exactly 3 strings, found ${JSON.stringify(source)}`
        )
      }
    } catch (e) {
      fail('human-uat', frontmatterExceptionMessage(e))
    }
  }

  // --- --origin40 ---
  if (args.origin40) {
    try {
      const matches = findPhase40File()
      if (matches.length !== 1) {
        fail(
          'origin40-single-match',
          `expected exactly 1 match, found ${matches.length}`
        )
      } else {
        pass('origin40-single-match')
        const p40Content = readFromDisk(matches[0])
        const p40Region = extractFrontmatterRegion(p40Content)
        if (p40Region === null) throw new Error('no frontmatter fence found')
        const p40Doc = yaml.load(p40Region)
        const deferred = Array.isArray(p40Doc.deferred) ? p40Doc.deferred : []
        if (deferred.length === 6) {
          pass('origin40-deferred-length')
        } else {
          fail(
            'origin40-deferred-length',
            `expected 6, found ${deferred.length}`
          )
        }
        for (const marker of ['38-E01', '38-E02']) {
          const entry = deferred.find(
            (e) => typeof e.evidence === 'string' && e.evidence.includes(marker)
          )
          if (!entry) {
            fail(
              'origin40-outcome',
              `no deferred entry with evidence containing '${marker}'`
            )
          } else if (
            typeof entry.outcome_2026_09_28 !== 'string' ||
            entry.outcome_2026_09_28.length === 0
          ) {
            fail(
              'origin40-outcome',
              `entry for '${marker}' has no non-empty outcome_2026_09_28`
            )
          } else {
            pass(`origin40-outcome:${marker}`)
          }
        }
      }
    } catch (e) {
      fail('origin40', frontmatterExceptionMessage(e))
    }
  }

  // --- --syntax-preserved-from ---
  if (args.syntaxPreservedFrom) {
    try {
      const oldContent = readFromRev(args.syntaxPreservedFrom, LEDGER_REL)
      const oldLines = oldContent.split(/\r\n|\n/)

      // score
      const scoreLine = oldLines.find((l) => l.startsWith('score: '))
      if (!scoreLine)
        throw new Error(
          `no line starting 'score: ' found at ${args.syntaxPreservedFrom}`
        )
      const rawScore = scoreLine.slice('score: '.length)
      const expectedScore = rawScore.replace(/''/g, "'")
      const parsedScore = doc.score
      if (parsedScore === expectedScore) {
        pass('syntax-preserved-score')
      } else {
        fail(
          'syntax-preserved-score',
          `parsed score does not match ${args.syntaxPreservedFrom}'s raw text (apostrophe-collapsed)`
        )
      }

      // 38-S08 result
      const idLineIdx = oldLines.findIndex((l) => l.includes('id: "38-S08"'))
      if (idLineIdx === -1)
        throw new Error(
          `no '38-S08' id line found at ${args.syntaxPreservedFrom}`
        )
      const resultLine = oldLines[idLineIdx + 1]
      const openMarker = 'result: "'
      const openIdx = resultLine.indexOf(openMarker)
      if (openIdx === -1)
        throw new Error('38-S08 result line does not start with result: "')
      const contentStart = openIdx + openMarker.length
      const lastQuoteIdx = resultLine.lastIndexOf('"')
      const rawInner = resultLine.slice(contentStart, lastQuoteIdx)
      const dischargedEntry = dischargedArr.find((e) => e.id === '38-S08')
      const parsedResult = dischargedEntry && dischargedEntry.result
      if (parsedResult === rawInner) {
        pass('syntax-preserved-38-S08-result')
      } else {
        fail(
          'syntax-preserved-38-S08-result',
          `parsed 38-S08 result does not match ${args.syntaxPreservedFrom}'s raw inner text exactly`
        )
      }
    } catch (e) {
      fail('syntax-preserved', frontmatterExceptionMessage(e))
    }
  }
}

// --- census mode ---

function walkForUatFiles(dir, matches) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkForUatFiles(full, matches)
    } else if (
      entry.isFile() &&
      /-(VERIFICATION|UAT|HUMAN-UAT)\.md$/.test(entry.name)
    ) {
      matches.push(full)
    }
  }
}

function runCensusMode(args, yaml) {
  const phasesDir = path.join(ROOT, '.planning/phases')
  const files = []
  walkForUatFiles(phasesDir, files)
  files.sort()

  let ok = 0
  let noFrontmatter = 0
  const bad = []

  for (const f of files) {
    const content = readFromDisk(f)
    const region = extractFrontmatterRegion(content)
    if (region === null) {
      noFrontmatter++
      continue
    }
    try {
      yaml.load(region)
      ok++
    } catch (e) {
      bad.push({
        file: path.relative(ROOT, f),
        reason: frontmatterExceptionMessage(e)
      })
    }
  }

  console.log(
    `census: ${ok} ok, ${noFrontmatter} no-frontmatter, ${bad.length} bad`
  )
  for (const b of bad) {
    console.log(`  bad: ${b.file} — ${b.reason}`)
  }

  if (args.expectBad !== undefined) {
    if (bad.length === args.expectBad) {
      pass('census-expect-bad', String(bad.length))
    } else {
      fail(
        'census-expect-bad',
        `expected ${args.expectBad}, found ${bad.length}`
      )
    }
  } else {
    pass(
      'census',
      `${ok} ok, ${noFrontmatter} no-frontmatter, ${bad.length} bad`
    )
  }
}

// --- main ---

function main() {
  const args = parseArgs(process.argv.slice(2))
  const yaml = require('js-yaml')

  if (!checkJsYamlVersion(yaml)) {
    printResults()
    process.exit(1)
  }

  if (args.census) {
    runCensusMode(args, yaml)
  } else {
    runLedgerMode(args, yaml)
  }

  printResults()
  process.exit(anyFail() ? 1 : 0)
}

main()
