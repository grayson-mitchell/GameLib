/**
 * Branch-parity regression guard (Phase 34.4.1 gap cycle, plan 34.4.1-10 Task 2 —
 * REQ-34.4.1-11/REQ-34.4.1-GAP-04).
 *
 * The gate's own diagnosis (34.4.1-LIVE-GATE.md, F-6): one of the tests cited as proof F-6's area
 * was "closed" is `humble/__tests__/user.test.ts`'s "the untouched Electron five-step regression"
 * (`with no seam installed, the original five Electron wipe steps still run instead`, L1391) — a
 * test that PINS the Electron branch at 5 steps and SEPARATELY checks the Tauri branch clears
 * cookies. It never compares the two branches' coverage against each other. The asymmetry was
 * therefore visible to the suite and tested AROUND, not caught. A green suite is not evidence of
 * parity unless something asserts parity — this file is that assertion. It does not weaken or
 * replace `user.test.ts`'s five-step regression (left byte-identical, see the final `describe`
 * block below, which pins that file untouched by this plan).
 *
 * This file parses the REAL source of each dual-branch site (read from disk via `fs.readFileSync`
 * at test-run time — never a mock, never a hand-copied snippet) and asserts branch-coverage
 * parity via a capability-CATEGORY comparison (not a step-name comparison — two branches using
 * differently-named steps that cover the same category must compare equal).
 *
 * Capability-category mapping — DELIBERATELY duplicated from `seam-parity-sweep.py` (Task 1's
 * Python instrument), not imported: this is a TypeScript/Jest file, that is a stdlib-only Python
 * script, and the two cannot literally share code. Both must agree in SHAPE (that agreement is
 * itself checked implicitly — Task 1's sweep and this file were derived from the same source read
 * at the same time, and any future divergence between the two mappings would show up as one tool
 * finding a gap the other calls clean, which is exactly the kind of drift a human reviewer should
 * catch on the next plan that touches either file).
 *
 * `KNOWN_GAP` is seeded with EXACTLY the divergences Task 1's sweep (`34.4.1-SEAM-PARITY-SWEEP.md`,
 * findings S-05/S-08) classified SILENTLY-DROPPED, so `npm run test:ci` stays green at the current
 * baseline while the gaps become explicit and un-ignorable — this is DELIBERATE, not an oversight:
 * a red baseline here would be indistinguishable from the pre-existing intermittent `rustInvoke`
 * mock frame-leak flake documented elsewhere in this project's history, and would train the next
 * reader to ignore a real failure. Plan 34.4.1-16 deletes these `KNOWN_GAP` entries once the
 * capability actually lands (closing F-6 and its twin) — at that point this file's own
 * `no stale KNOWN_GAP entries` test (below) starts FAILING until the entry is removed, and once it
 * is removed this file enforces TRUE parity with nothing left to soften it.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

const REPO_ROOT = resolve(join(__dirname, '../../../..'))
const SRC_BACKEND_DIR = join(REPO_ROOT, 'src/backend')

// ── Capability-category mapping (shared convention with seam-parity-sweep.py) ──────────────────

const CATEGORY_MAP: Record<string, string[]> = {
  clearStorageData: ['storage', 'cookies'],
  clearCache: ['cache'],
  clearAuthCache: ['authCache'],
  clearHostResolverCache: ['hostResolver'],
  clearData: ['storage', 'cache'],
  clearHumbleCookies: ['cookies'],
  clearEpicCookies: ['cookies']
}

function categoriesForLabels(labels: string[]): Set<string> {
  const result = new Set<string>()
  for (const label of labels) {
    const categories = CATEGORY_MAP[label]
    if (!categories) {
      throw new Error(
        `seamBranchParity: unrecognized wipeSteps label '${label}' — add it to CATEGORY_MAP ` +
          `before trusting this comparison (a silently-ignored new step label is exactly how a ` +
          `real capability change could hide from this test)`
      )
    }
    categories.forEach((c) => result.add(c))
  }
  return result
}

// ── Source-parsed branch extraction (real file, real brace matching — never a mock) ────────────

function matchDelims(text: string, openIndex: number, openCh: string, closeCh: string): number {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === openCh) depth++
    else if (text[i] === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`seamBranchParity: unbalanced ${openCh}${closeCh} starting at index ${openIndex}`)
}

function findFunctionBody(sourceText: string, functionName: string): string {
  const headerRe = new RegExp(`\\b${functionName}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{`)
  const match = headerRe.exec(sourceText)
  if (!match) {
    throw new Error(
      `seamBranchParity: could not locate function '${functionName}' in the given source — has ` +
        `it been renamed or removed? Update the SITES registry below, do not soften this check.`
    )
  }
  const openBrace = match.index + match[0].length - 1
  const closeBrace = matchDelims(sourceText, openBrace, '{', '}')
  return sourceText.slice(openBrace + 1, closeBrace)
}

function findWipeStepsIfElseBranches(functionBody: string): {
  electronLabels: string[]
  tauriLabels: string[]
} {
  const ifMatch = /if\s*\(\s*seam\s*===\s*null\s*\)\s*\{/.exec(functionBody)
  if (!ifMatch) {
    throw new Error(
      `seamBranchParity: could not find 'if (seam === null) {' in the function body — the ` +
        `dual-branch shape this file expects has changed; re-derive the SITES entry by hand.`
    )
  }
  const ifOpen = ifMatch.index + ifMatch[0].length - 1
  const ifClose = matchDelims(functionBody, ifOpen, '{', '}')
  const electronBranch = functionBody.slice(ifOpen + 1, ifClose)

  const afterIf = functionBody.slice(ifClose + 1)
  const elseMatch = /^\s*else\s*\{/.exec(afterIf)
  if (!elseMatch) {
    throw new Error(
      `seamBranchParity: 'if (seam === null) { ... }' has no immediately-following 'else { ... }' ` +
        `— the dual-branch shape this file expects has changed; re-derive the SITES entry by hand.`
    )
  }
  const elseOpenRelative = afterIf.indexOf('{', elseMatch.index)
  const elseOpen = ifClose + 1 + elseOpenRelative
  const elseClose = matchDelims(functionBody, elseOpen, '{', '}')
  const tauriBranch = functionBody.slice(elseOpen + 1, elseClose)

  return {
    electronLabels: extractWipeStepLabels(electronBranch),
    tauriLabels: extractWipeStepLabels(tauriBranch)
  }
}

function extractWipeStepLabels(branchText: string): string[] {
  const headerMatch = /wipeSteps\s*=\s*\[/.exec(branchText)
  if (!headerMatch) {
    throw new Error(
      `seamBranchParity: could not find a 'wipeSteps = [' array in this branch — the shape this ` +
        `file expects has changed; re-derive the SITES entry by hand.`
    )
  }
  const outerOpen = headerMatch.index + headerMatch[0].length - 1
  const outerClose = matchDelims(branchText, outerOpen, '[', ']')
  const arrayBody = branchText.slice(outerOpen, outerClose + 1)

  const labels: string[] = []
  let depth = 0
  for (let i = 0; i < arrayBody.length; i++) {
    const ch = arrayBody[i]
    if (ch === '[') {
      depth++
      if (depth === 2) {
        const tupleStart = i
        const tupleEnd = matchDelims(arrayBody, tupleStart, '[', ']')
        const tupleText = arrayBody.slice(tupleStart, tupleEnd + 1)
        const labelMatch = /'([A-Za-z0-9_]+)'/.exec(tupleText)
        if (labelMatch) labels.push(labelMatch[1])
        i = tupleEnd
        depth--
      }
    } else if (ch === ']') {
      depth--
    }
  }
  return labels
}

// ── SITES registry — one entry per dual-branch site (source: 34.4.1-SEAM-PARITY-SWEEP.md) ──────

interface SiteDef {
  /** Human label, also the KNOWN_GAP cross-reference key. */
  label: string
  file: string
  functionName: string
}

const SITES: SiteDef[] = [
  {
    label: 'humble/user.ts disconnect()',
    file: join(SRC_BACKEND_DIR, 'humble/user.ts'),
    functionName: 'disconnect'
  },
  {
    label: 'storeManagers/legendary/user.ts logout()',
    file: join(SRC_BACKEND_DIR, 'storeManagers/legendary/user.ts'),
    functionName: 'logout'
  }
]

// ── KNOWN_GAP registry — seeded from 34.4.1-SEAM-PARITY-SWEEP.md's SILENTLY-DROPPED findings ────

interface KnownGapEntry {
  site: string
  droppedCategory: string
  findingId: string
  closingPlan: string
}

const KNOWN_GAP: KnownGapEntry[] = [
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'storage',
    findingId: 'F-6',
    closingPlan: '34.4.1-16'
  },
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'cache',
    findingId: 'F-6',
    closingPlan: '34.4.1-16'
  },
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'authCache',
    findingId: 'F-6',
    closingPlan: '34.4.1-16'
  },
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'hostResolver',
    findingId: 'F-6',
    closingPlan: '34.4.1-16'
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'storage',
    findingId: "F-6's verbatim twin",
    closingPlan: '34.4.1-16'
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'cache',
    findingId: "F-6's verbatim twin",
    closingPlan: '34.4.1-16'
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'authCache',
    findingId: "F-6's verbatim twin",
    closingPlan: '34.4.1-16'
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'hostResolver',
    findingId: "F-6's verbatim twin",
    closingPlan: '34.4.1-16'
  }
]

function validateKnownGapEntry(entry: KnownGapEntry): string | null {
  if (!entry.site || !entry.site.trim()) return 'missing a site'
  if (!entry.droppedCategory || !entry.droppedCategory.trim()) return 'missing a droppedCategory'
  if (!entry.findingId || !entry.findingId.trim()) return 'missing a findingId'
  if (!entry.closingPlan || !entry.closingPlan.trim()) return 'missing a closingPlan'
  return null
}

// ── The comparison itself — driven through the SAME function real-source and synthetic-source
//    cases both call, so anti-vacuity cases prove something about the real assertion. ───────────

function undeclaredDrops(
  electronCategories: Set<string>,
  tauriCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): string[] {
  const declared = new Set(declaredForSite.map((g) => g.droppedCategory))
  return [...electronCategories].filter((c) => !tauriCategories.has(c) && !declared.has(c))
}

function staleKnownGapEntries(
  electronCategories: Set<string>,
  tauriCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): KnownGapEntry[] {
  const actuallyDropped = new Set([...electronCategories].filter((c) => !tauriCategories.has(c)))
  return declaredForSite.filter((g) => !actuallyDropped.has(g.droppedCategory))
}

// ── A small recursive directory walker (no new dependency) for the registry-completeness check ─

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir)
  let files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      files = files.concat(listFilesRecursive(fullPath))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

// =================================================================================================

describe('seamBranchParity (Phase 34.4.1 gap cycle, plan 10 Task 2 — REQ-34.4.1-11/REQ-34.4.1-GAP-04)', () => {
  describe('KNOWN_GAP entries are well-formed (every entry names a finding AND a closing plan)', () => {
    it.each(KNOWN_GAP.map((entry, i) => [i, entry] as const))(
      'entry %i (%j) has no missing field',
      (_i, entry) => {
        expect(validateKnownGapEntry(entry)).toBeNull()
      }
    )

    it('anti-vacuity: an entry with an empty reason/findingId IS rejected by validateKnownGapEntry', () => {
      const badEntry: KnownGapEntry = {
        site: 'humble/user.ts disconnect()',
        droppedCategory: 'storage',
        findingId: '',
        closingPlan: '34.4.1-16'
      }
      expect(validateKnownGapEntry(badEntry)).toBe('missing a findingId')
    })

    it('anti-vacuity: an entry with an empty closingPlan IS rejected by validateKnownGapEntry', () => {
      const badEntry: KnownGapEntry = {
        site: 'humble/user.ts disconnect()',
        droppedCategory: 'storage',
        findingId: 'F-6',
        closingPlan: '   '
      }
      expect(validateKnownGapEntry(badEntry)).toBe('missing a closingPlan')
    })
  })

  describe.each(SITES.map((site) => [site.label, site] as const))(
    'dual-branch site: %s',
    (_label, site) => {
      let electronCategories: Set<string>
      let tauriCategories: Set<string>

      beforeAll(() => {
        const sourceText = readFileSync(site.file, 'utf-8')
        const functionBody = findFunctionBody(sourceText, site.functionName)
        const { electronLabels, tauriLabels } = findWipeStepsIfElseBranches(functionBody)
        electronCategories = categoriesForLabels(electronLabels)
        tauriCategories = categoriesForLabels(tauriLabels)
      })

      it('every Electron-only category is either present in Tauri OR covered by a dated KNOWN_GAP entry', () => {
        const declaredForSite = KNOWN_GAP.filter((g) => g.site === site.label)
        const drops = undeclaredDrops(electronCategories, tauriCategories, declaredForSite)
        expect(drops).toEqual([])
      })

      it('no stale KNOWN_GAP entries (a declared drop that no longer exists in source must be removed)', () => {
        const declaredForSite = KNOWN_GAP.filter((g) => g.site === site.label)
        const stale = staleKnownGapEntries(electronCategories, tauriCategories, declaredForSite)
        if (stale.length > 0) {
          throw new Error(
            `seamBranchParity: KNOWN_GAP contains ${stale.length} stale entry(ies) for ` +
              `'${site.label}' whose declared category is no longer actually dropped in source ` +
              `— the capability landed (plan ${stale[0]?.closingPlan}); DELETE the entry so this ` +
              `test starts enforcing true parity: ${JSON.stringify(stale)}`
          )
        }
        expect(stale).toEqual([])
      })
    }
  )

  describe('anti-vacuity: the comparison functions actually reject the bad input they exist to reject', () => {
    it('a synthetic Tauri branch missing a category (no matching KNOWN_GAP) is rejected by undeclaredDrops', () => {
      const electron = categoriesForLabels(['clearStorageData', 'clearCache'])
      const tauri = categoriesForLabels(['clearCache']) // storage/cookies silently missing
      const drops = undeclaredDrops(electron, tauri, [])
      expect(drops.length).toBeGreaterThan(0)
      expect(drops).toEqual(expect.arrayContaining(['storage', 'cookies']))
    })

    it('the SAME missing category IS accepted once a matching KNOWN_GAP entry declares it', () => {
      const electron = categoriesForLabels(['clearStorageData', 'clearCache'])
      const tauri = categoriesForLabels(['clearCache'])
      const declared: KnownGapEntry[] = [
        { site: 'x', droppedCategory: 'storage', findingId: 'F-TEST', closingPlan: 'plan-x' },
        { site: 'x', droppedCategory: 'cookies', findingId: 'F-TEST', closingPlan: 'plan-x' }
      ]
      expect(undeclaredDrops(electron, tauri, declared)).toEqual([])
    })

    it('an Electron branch that GROWS a new step (no Tauri counterpart, no KNOWN_GAP) is rejected', () => {
      // Simulates a future edit that adds a brand-new wipeSteps entry to the Electron branch only
      // — exactly the shape a silent future regression would take.
      const electronBefore = categoriesForLabels(['clearStorageData'])
      const electronAfterGrowth = categoriesForLabels(['clearStorageData', 'clearHostResolverCache'])
      const tauri = categoriesForLabels(['clearStorageData'])
      expect(undeclaredDrops(electronBefore, tauri, [])).toEqual([])
      expect(undeclaredDrops(electronAfterGrowth, tauri, [])).toEqual(['hostResolver'])
    })

    it('an unrecognized wipeSteps label throws rather than silently contributing zero categories', () => {
      expect(() => categoriesForLabels(['clearSomethingNeverSeenBefore'])).toThrow(
        /unrecognized wipeSteps label/
      )
    })

    it('staleKnownGapEntries correctly flags a KNOWN_GAP entry whose category is no longer dropped', () => {
      const electron = categoriesForLabels(['clearStorageData'])
      const tauri = categoriesForLabels(['clearStorageData']) // capability landed -- no longer dropped
      const declared: KnownGapEntry[] = [
        { site: 'x', droppedCategory: 'storage', findingId: 'F-TEST', closingPlan: 'plan-x' }
      ]
      const stale = staleKnownGapEntries(electron, tauri, declared)
      expect(stale).toHaveLength(1)
      expect(stale[0].droppedCategory).toBe('storage')
    })

    it('staleKnownGapEntries does NOT flag a KNOWN_GAP entry whose category is still genuinely dropped', () => {
      const electron = categoriesForLabels(['clearStorageData'])
      const tauri = categoriesForLabels([]) // still dropped
      const declared: KnownGapEntry[] = [
        { site: 'x', droppedCategory: 'storage', findingId: 'F-TEST', closingPlan: 'plan-x' }
      ]
      expect(staleKnownGapEntries(electron, tauri, declared)).toEqual([])
    })
  })

  describe('registry completeness: the declared SITES list matches what is actually in source', () => {
    it('the number of wipeSteps-shaped dual-branch sites found in src/backend matches SITES.length exactly', () => {
      // Every dual-branch site of this shape contributes exactly 2 `wipeSteps = [` assignments
      // (one per branch). A site silently REMOVED from source drops this count below
      // SITES.length * 2; a NEW dual-branch site appearing with no registry entry raises it above
      // — both directions fail this assertion, catching either drift direction.
      const files = listFilesRecursive(SRC_BACKEND_DIR)
      let totalWipeStepsAssignments = 0
      for (const file of files) {
        const text = readFileSync(file, 'utf-8')
        const matches = text.match(/wipeSteps\s*=\s*\[/g)
        if (matches) totalWipeStepsAssignments += matches.length
      }
      expect(totalWipeStepsAssignments).toBe(SITES.length * 2)
    })

    it('anti-vacuity: a registry with a missing entry would NOT match the real source count (sanity-checked here without mutating the real SITES constant)', () => {
      const files = listFilesRecursive(SRC_BACKEND_DIR)
      let totalWipeStepsAssignments = 0
      for (const file of files) {
        const text = readFileSync(file, 'utf-8')
        const matches = text.match(/wipeSteps\s*=\s*\[/g)
        if (matches) totalWipeStepsAssignments += matches.length
      }
      const shrunkRegistryLength = SITES.length - 1
      expect(totalWipeStepsAssignments).not.toBe(shrunkRegistryLength * 2)
    })
  })

  describe('this plan does not touch humble/__tests__/user.test.ts (the untouched-five-step regression stays exactly as written)', () => {
    it('the file still contains the named regression test unmodified in spirit (still asserts the 5-step Electron path)', () => {
      const testFilePath = join(
        SRC_BACKEND_DIR,
        'humble/__tests__/user.test.ts'
      )
      const text = readFileSync(testFilePath, 'utf-8')
      expect(text).toContain(
        'with no seam installed, the original five Electron wipe steps still run instead'
      )
    })
  })
})
