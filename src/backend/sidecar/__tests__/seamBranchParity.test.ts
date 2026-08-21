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
 * `KNOWN_GAP` was originally seeded with EXACTLY the divergences Task 1's sweep
 * (`34.4.1-SEAM-PARITY-SWEEP.md`, findings S-05/S-08) classified SILENTLY-DROPPED (`storage`/
 * `cache`/`authCache`/`hostResolver` for both sites), so `npm run test:ci` stayed green at the
 * then-current baseline while the gaps became explicit and un-ignorable. Plan 34.4.1-16 (this
 * plan) landed the storage-clear capability for both sites, closing the `storage`/`cache`
 * categories for real — those 4 `KNOWN_GAP` entries are DELETED below, not softened, per this
 * file's own `no stale KNOWN_GAP entries` test, which would otherwise fail on a stale entry.
 * `KNOWN_GAP` is now EMPTY (kept as a live, reusable mechanism for any future dual-branch site
 * added to `SITES`, not deleted as dead code).
 *
 * `authCache`/`hostResolver` were never closeable by this design (no in-page JS equivalent exists
 * for either network-stack cache) and are reclassified from `KNOWN_GAP` to `DECLARED` — a stricter
 * bar than mere id-proximity. A `DECLARED` entry is only honoured if `isDeclaredInSource()` finds
 * BOTH the entry's `threatId` AND at least one of its `categoryTerms` in the REAL source of the
 * file being compared (never in this test file alone) — this is the exact discipline
 * `seam-parity-sweep.py`'s own development caught itself needing (34.4.1-10-SUMMARY.md Deviation
 * #3: an id-only check is vacuously true for ANY module carrying a decision id at all, which would
 * have wrongly cleared a real defect). A `DECLARED` category that source review later closes for
 * real becomes a stale-`DECLARED` failure below, exactly mirroring `KNOWN_GAP`'s own discipline.
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
  clearEpicCookies: ['cookies'],
  // Phase 34.4.1 gap-cycle plan 16 (F-6 BLOCKING closure): the new storage-clear
  // wipeSteps entries, covering the categories the cookie-only step never touched.
  clearHumbleStorage: ['storage', 'cache'],
  clearEpicStorage: ['storage', 'cache']
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

function matchDelims(
  text: string,
  openIndex: number,
  openCh: string,
  closeCh: string
): number {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === openCh) depth++
    else if (text[i] === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(
    `seamBranchParity: unbalanced ${openCh}${closeCh} starting at index ${openIndex}`
  )
}

function findFunctionBody(sourceText: string, functionName: string): string {
  const headerRe = new RegExp(
    `\\b${functionName}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{`
  )
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

// Phase 34.4.1 gap-cycle plan 16 (F-6 BLOCKING closure): the storage-clear capability landed for
// BOTH sites (see CATEGORY_MAP's clearHumbleStorage/clearEpicStorage entries above), so the
// `storage`/`cache` KNOWN_GAP entries this array used to carry for both sites are DELETED, not
// softened — the capability genuinely closes them. KNOWN_GAP is intentionally empty; the
// mechanism stays live for any future dual-branch site added to SITES.
const KNOWN_GAP: KnownGapEntry[] = []

function validateKnownGapEntry(entry: KnownGapEntry): string | null {
  if (!entry.site || !entry.site.trim()) return 'missing a site'
  if (!entry.droppedCategory || !entry.droppedCategory.trim())
    return 'missing a droppedCategory'
  if (!entry.findingId || !entry.findingId.trim()) return 'missing a findingId'
  if (!entry.closingPlan || !entry.closingPlan.trim())
    return 'missing a closingPlan'
  return null
}

// ── DECLARED registry — categories with NO in-page JS equivalent, reclassified from KNOWN_GAP ──
//
// Unlike KNOWN_GAP (a bare assertion trusted from this test file alone), a DECLARED entry must be
// BACKED by real source: `isDeclaredInSource()` requires BOTH the entry's `threatId` AND at least
// one of its `categoryTerms` to appear in the ACTUAL file being compared (read from disk, same
// discipline as the rest of this file). This is what stops "declared" becoming a synonym for
// "ignored" — an id alone is not enough (34.4.1-10-SUMMARY.md Deviation #3 found and fixed exactly
// this vacuous-check shape in seam-parity-sweep.py's own development).

interface DeclaredEntry {
  site: string
  droppedCategory: string
  threatId: string
  /** At least one of these (case-insensitive) must appear in the source alongside `threatId`. */
  categoryTerms: string[]
}

const DECLARED: DeclaredEntry[] = [
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'authCache',
    threatId: 'T-34.4.1-73',
    categoryTerms: ['clearAuthCache', 'auth cache']
  },
  {
    site: 'humble/user.ts disconnect()',
    droppedCategory: 'hostResolver',
    threatId: 'T-34.4.1-73',
    categoryTerms: ['clearHostResolverCache', 'DNS resolver', 'host resolver']
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'authCache',
    threatId: 'T-34.4.1-73',
    categoryTerms: ['clearAuthCache', 'auth cache']
  },
  {
    site: 'storeManagers/legendary/user.ts logout()',
    droppedCategory: 'hostResolver',
    threatId: 'T-34.4.1-73',
    categoryTerms: ['clearHostResolverCache', 'DNS resolver', 'host resolver']
  }
]

/**
 * A DECLARED entry is only honoured if the REAL source of the file it names carries both its
 * threat id AND at least one of its category terms. An id with no matching term (the F-6 shape
 * seam-parity-sweep.py itself was built to catch) or a term with no id are both rejected.
 */
function isDeclaredInSource(sourceText: string, entry: DeclaredEntry): boolean {
  if (!sourceText.includes(entry.threatId)) return false
  const lower = sourceText.toLowerCase()
  return entry.categoryTerms.some((term) => lower.includes(term.toLowerCase()))
}

// ── The comparison itself — driven through the SAME function real-source and synthetic-source
//    cases both call, so anti-vacuity cases prove something about the real assertion. ───────────

function undeclaredDrops(
  electronCategories: Set<string>,
  tauriCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): string[] {
  const declared = new Set(declaredForSite.map((g) => g.droppedCategory))
  return [...electronCategories].filter(
    (c) => !tauriCategories.has(c) && !declared.has(c)
  )
}

function staleKnownGapEntries(
  electronCategories: Set<string>,
  tauriCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): KnownGapEntry[] {
  const actuallyDropped = new Set(
    [...electronCategories].filter((c) => !tauriCategories.has(c))
  )
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
    // Phase 34.4.1 gap-cycle plan 16: KNOWN_GAP is now empty (both sites' storage/cache gaps
    // closed for real). it.each rejects an empty table, so this check is skipped rather than
    // silently vacuous when there is nothing to iterate — a future KNOWN_GAP entry re-arms it.
    if (KNOWN_GAP.length > 0) {
      it.each(KNOWN_GAP.map((entry, i) => [i, entry] as const))(
        'entry %i (%j) has no missing field',
        (_i, entry) => {
          expect(validateKnownGapEntry(entry)).toBeNull()
        }
      )
    } else {
      it('KNOWN_GAP is currently empty by design (plan 16 closed the storage/cache gaps for real)', () => {
        expect(KNOWN_GAP).toEqual([])
      })
    }

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

  describe('DECLARED entries are well-formed (every entry names a threatId AND at least one category term)', () => {
    it.each(DECLARED.map((entry, i) => [i, entry] as const))(
      'entry %i (%j) has a non-empty threatId and a non-empty categoryTerms list',
      (_i, entry) => {
        expect(entry.threatId.trim().length).toBeGreaterThan(0)
        expect(entry.categoryTerms.length).toBeGreaterThan(0)
      }
    )
  })

  describe.each(SITES.map((site) => [site.label, site] as const))(
    'dual-branch site: %s',
    (_label, site) => {
      let sourceText: string
      let electronCategories: Set<string>
      let tauriCategories: Set<string>

      beforeAll(() => {
        sourceText = readFileSync(site.file, 'utf-8')
        const functionBody = findFunctionBody(sourceText, site.functionName)
        const { electronLabels, tauriLabels } =
          findWipeStepsIfElseBranches(functionBody)
        electronCategories = categoriesForLabels(electronLabels)
        tauriCategories = categoriesForLabels(tauriLabels)
      })

      it('every Electron-only category is either present in Tauri, covered by a dated KNOWN_GAP entry, or a validated DECLARED entry', () => {
        const knownGapForSite = KNOWN_GAP.filter((g) => g.site === site.label)
        const declaredForSite = DECLARED.filter((d) => d.site === site.label)
        const validDeclared = declaredForSite.filter((d) =>
          isDeclaredInSource(sourceText, d)
        )
        const softenedCategories: KnownGapEntry[] = [
          ...knownGapForSite,
          ...validDeclared.map((d) => ({
            site: d.site,
            droppedCategory: d.droppedCategory,
            findingId: d.threatId,
            closingPlan: 'n/a (DECLARED, not a gap)'
          }))
        ]
        const drops = undeclaredDrops(
          electronCategories,
          tauriCategories,
          softenedCategories
        )
        expect(drops).toEqual([])
      })

      it('no stale KNOWN_GAP entries (a declared drop that no longer exists in source must be removed)', () => {
        const declaredForSite = KNOWN_GAP.filter((g) => g.site === site.label)
        const stale = staleKnownGapEntries(
          electronCategories,
          tauriCategories,
          declaredForSite
        )
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

      it('no stale DECLARED entries (a declared category no longer actually dropped in Tauri must be removed)', () => {
        const declaredForSite = DECLARED.filter((d) => d.site === site.label)
        const actuallyDropped = new Set(
          [...electronCategories].filter((c) => !tauriCategories.has(c))
        )
        const stale = declaredForSite.filter(
          (d) => !actuallyDropped.has(d.droppedCategory)
        )
        if (stale.length > 0) {
          throw new Error(
            `seamBranchParity: DECLARED contains ${stale.length} stale entry(ies) for ` +
              `'${site.label}' whose category is no longer actually dropped in source — the ` +
              `capability landed; DELETE the entry: ${JSON.stringify(stale)}`
          )
        }
        expect(stale).toEqual([])
      })

      it('every DECLARED entry for this site is actually validated by isDeclaredInSource (not silently unmatched)', () => {
        const declaredForSite = DECLARED.filter((d) => d.site === site.label)
        for (const entry of declaredForSite) {
          expect(isDeclaredInSource(sourceText, entry)).toBe(true)
        }
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
        {
          site: 'x',
          droppedCategory: 'storage',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        },
        {
          site: 'x',
          droppedCategory: 'cookies',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        }
      ]
      expect(undeclaredDrops(electron, tauri, declared)).toEqual([])
    })

    it('an Electron branch that GROWS a new step (no Tauri counterpart, no KNOWN_GAP) is rejected', () => {
      // Simulates a future edit that adds a brand-new wipeSteps entry to the Electron branch only
      // — exactly the shape a silent future regression would take.
      const electronBefore = categoriesForLabels(['clearStorageData'])
      const electronAfterGrowth = categoriesForLabels([
        'clearStorageData',
        'clearHostResolverCache'
      ])
      const tauri = categoriesForLabels(['clearStorageData'])
      expect(undeclaredDrops(electronBefore, tauri, [])).toEqual([])
      expect(undeclaredDrops(electronAfterGrowth, tauri, [])).toEqual([
        'hostResolver'
      ])
    })

    it('an unrecognized wipeSteps label throws rather than silently contributing zero categories', () => {
      expect(() =>
        categoriesForLabels(['clearSomethingNeverSeenBefore'])
      ).toThrow(/unrecognized wipeSteps label/)
    })

    it('staleKnownGapEntries correctly flags a KNOWN_GAP entry whose category is no longer dropped', () => {
      const electron = categoriesForLabels(['clearStorageData'])
      const tauri = categoriesForLabels(['clearStorageData']) // capability landed -- no longer dropped
      const declared: KnownGapEntry[] = [
        {
          site: 'x',
          droppedCategory: 'storage',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        }
      ]
      const stale = staleKnownGapEntries(electron, tauri, declared)
      expect(stale).toHaveLength(1)
      expect(stale[0].droppedCategory).toBe('storage')
    })

    it('staleKnownGapEntries does NOT flag a KNOWN_GAP entry whose category is still genuinely dropped', () => {
      const electron = categoriesForLabels(['clearStorageData'])
      const tauri = categoriesForLabels([]) // still dropped
      const declared: KnownGapEntry[] = [
        {
          site: 'x',
          droppedCategory: 'storage',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        }
      ]
      expect(staleKnownGapEntries(electron, tauri, declared)).toEqual([])
    })

    // ── isDeclaredInSource anti-vacuity (Phase 34.4.1 gap-cycle plan 16 Task 3) ────────────────
    // Proves the DECLARED check itself rejects the bad input it exists to reject — the same
    // discipline seam-parity-sweep.py's own development needed after catching an empty-term-set
    // vacuous check (34.4.1-10-SUMMARY.md Deviation #3).

    it('anti-vacuity: a synthetic entry declaring a category with NO matching in-source comment (neither id nor term) is rejected', () => {
      const entry: DeclaredEntry = {
        site: 'x',
        droppedCategory: 'authCache',
        threatId: 'T-34.4.1-73',
        categoryTerms: ['clearAuthCache', 'auth cache']
      }
      const unrelatedSource = 'export function foo() { return 1 }'
      expect(isDeclaredInSource(unrelatedSource, entry)).toBe(false)
    })

    it('anti-vacuity: an id-only comment with NO category term present is rejected (the mirror-image of the F-6 shape)', () => {
      const entry: DeclaredEntry = {
        site: 'x',
        droppedCategory: 'authCache',
        threatId: 'T-34.4.1-73',
        categoryTerms: ['clearAuthCache', 'auth cache']
      }
      // Carries the threat id, but never names the category — exactly F-6's own original Tauri
      // branch comment shape (T-34.4.1-30 present, storage/cache/authCache/hostResolver absent).
      const idOnlySource =
        '// T-34.4.1-73: some unrelated decision, nothing else named here'
      expect(isDeclaredInSource(idOnlySource, entry)).toBe(false)
    })

    it('anti-vacuity: a category term with NO threat id present is rejected', () => {
      const entry: DeclaredEntry = {
        site: 'x',
        droppedCategory: 'authCache',
        threatId: 'T-34.4.1-73',
        categoryTerms: ['clearAuthCache', 'auth cache']
      }
      const termOnlySource = '// clearAuthCache is skipped here, no id cited'
      expect(isDeclaredInSource(termOnlySource, entry)).toBe(false)
    })

    it('isDeclaredInSource ACCEPTS when both the threat id and a category term are present', () => {
      const entry: DeclaredEntry = {
        site: 'x',
        droppedCategory: 'authCache',
        threatId: 'T-34.4.1-73',
        categoryTerms: ['clearAuthCache', 'auth cache']
      }
      const validSource =
        '// T-34.4.1-73: clearAuthCache has no in-page equivalent, DECLARED not dropped'
      expect(isDeclaredInSource(validSource, entry)).toBe(true)
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
