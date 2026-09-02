/**
 * Branch-parity regression guard (Phase 34.4.1 gap cycle, plan 34.4.1-10 Task 2 —
 * REQ-34.4.1-11/REQ-34.4.1-GAP-04), INVERTED by Phase 39 Plan 04 Task 2.
 *
 * ORIGINAL PURPOSE (kept for history — the mechanism below still descends from it): the gate's own
 * diagnosis (34.4.1-LIVE-GATE.md, F-6) found that a green suite had tested AROUND a real defect —
 * one test pinned the Electron branch's 5 wipe steps, a separate test checked the Tauri branch
 * cleared cookies, and nothing compared the two branches' COVERAGE against each other. This file
 * closed that gap by parsing the REAL source of each dual-branch `disconnect()`/`logout()` site
 * (via `fs.readFileSync` at test-run time — never a mock) and asserting capability-CATEGORY parity
 * between the two branches.
 *
 * WHY THIS FILE CHANGED SHAPE (Phase 39 Plan 04, REQ-39-03): Plan 04 collapsed both dual-branch
 * sites — `humble/user.ts`'s `disconnect()` and `storeManagers/legendary/user.ts`'s `logout()` —
 * to a single, unconditional, seam-driven `wipeSteps` array apiece. There is no Electron branch
 * left to compare against, so a parity comparison between two branches is no longer a coherent
 * assertion; keeping the old shape would mean either a vacuously-true check (nothing to diverge
 * from) or a hand-authored fake "Electron" side, neither of which is honest testing. INVERTED
 * (per this workstream's D-35-14-02 disposition vocabulary) instead of RETIRED, because the file's
 * real, still-live value survives the branch's removal: (1) a static, non-vacuous assertion that
 * NEITHER site has quietly regrown a dual-branch `if (seam === null)` wipe shape, and (2) the
 * F-6 lesson itself — that an uncovered capability must be DECLARED in source, not merely absent —
 * still applies, because `clearAuthCache`/`clearHostResolverCache` remain permanently uncoverable
 * under the seam (no in-page JS equivalent exists for either network-stack cache). This file keeps
 * asserting that residual is written down (`T-34.4.1-73`, `DECLARED`), backed by real source, for
 * both surviving single-path sites.
 *
 * `ORIGINAL_FIVE_STEP_CATEGORIES` (below) replaces the live-extracted "Electron branch" as the
 * reference point for "what capability categories used to exist here" — it is now a static
 * constant (the five step labels the deleted branch always used) rather than something read from
 * a branch that no longer exists in source. Comparing the surviving single path against this fixed
 * reference is what makes the DECLARED checks below still falsifiable: if a future plan actually
 * closes the `authCache`/`hostResolver` gap, the "no stale DECLARED entries" test goes red and
 * demands the entry be deleted, exactly mirroring `KNOWN_GAP`'s pre-existing discipline.
 *
 * `KNOWN_GAP` is unrelated to the branch collapse and is untouched by this inversion — it stays a
 * live, reusable, currently-empty mechanism for any future dual-branch site, general-purpose
 * regardless of whether either of today's two sites has one.
 *
 * The final `describe` block that used to pin `humble/__tests__/user.test.ts`'s five-step
 * regression test byte-for-byte is DELETED — that regression test named a branch Plan 04 (Task 3)
 * deliberately retired; keeping a guard that forbids retiring it would make Task 3 look like a
 * violation of a standing contract rather than the point of this phase.
 */

import { readFileSync } from 'fs'
import { join, resolve } from 'path'

const REPO_ROOT = resolve(join(__dirname, '../../../..'))
const SRC_BACKEND_DIR = join(REPO_ROOT, 'src/backend')

// ── Capability-category mapping (shared convention with seam-parity-sweep.py) ──────────────────
// UNCHANGED by this inversion — same keys, same values. If a future plan changes this shape,
// flag it for whichever plan owns seam-parity-sweep.py's duplicate copy (Phase 39 Plan 08).

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

// ── Source-parsed extraction (real file, real brace matching — never a mock) ───────────────────

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

/**
 * Phase 39 Plan 04 Task 2: the anti-regrowth check. Both sites this file watches used to hold an
 * `if (seam === null) { ...five-step Electron wipe... } else { ...seam wipe... }` shape; Plan 04
 * Task 1 deleted the `if` arm and promoted the `else` arm's `wipeSteps` to an unconditional
 * assignment. This function detects whether that dual-branch shape has quietly regrown — the
 * literal thing `ORIGINAL PURPOSE` used to compare, now inverted into "must never reappear".
 */
function hasDualBranchWipeShape(functionBody: string): boolean {
  const ifMatch = /if\s*\(\s*seam\s*===\s*null\s*\)\s*\{/.exec(functionBody)
  if (!ifMatch) return false
  const ifOpen = ifMatch.index + ifMatch[0].length - 1
  const ifClose = matchDelims(functionBody, ifOpen, '{', '}')
  const afterIf = functionBody.slice(ifClose + 1)
  return /^\s*else\s*\{/.test(afterIf)
}

/**
 * Extracts the wipeSteps labels from the SINGLE surviving array in a collapsed function body.
 * Anchored on `(?:const|let)\s+wipeSteps` (a declaration, never a comment mentioning the word)
 * so a prose comment like "the wipeSteps discipline below" or "a SEPARATE wipeSteps entry" —
 * both of which appear in the real source above the real declaration — can never be mistaken for
 * the array itself. The `=(?!>)` after the optional type annotation is required because Plan 04's
 * collapse combined the declaration and the assignment onto one line
 * (`const wipeSteps: Array<[string, () => Promise<unknown>]> = [`), and that type annotation's own
 * arrow function (`() => Promise<unknown>`) contains an `=` that a naive `wipeSteps\s*=\s*\[`
 * regex (the shape this file used pre-collapse) would stop at, or — worse — sail past into an
 * unrelated `= [` occurring later in the function body. Verified against both real files: this
 * regex was checked to correctly skip the arrow's `=>` and land on the real assignment.
 */
function extractWipeStepLabels(functionBody: string): string[] {
  const headerMatch =
    /(?:const|let)\s+wipeSteps\s*(?::[\s\S]*?)?=(?!>)\s*\[/.exec(functionBody)
  if (!headerMatch) {
    throw new Error(
      `seamBranchParity: could not find a 'wipeSteps = [' array in this function body — the ` +
        `shape this file expects has changed; re-derive the SITES entry by hand.`
    )
  }
  const outerOpen = headerMatch.index + headerMatch[0].length - 1
  const outerClose = matchDelims(functionBody, outerOpen, '[', ']')
  const arrayBody = functionBody.slice(outerOpen, outerClose + 1)

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

// ── The fixed reference point (replaces the live-extracted Electron branch) ────────────────────
// Verified against Task 1's own diff (`git show a2198f6e2`) for BOTH files: the deleted
// `if (seam === null)` arm in `humble/user.ts`'s disconnect() AND
// `storeManagers/legendary/user.ts`'s logout() built its `wipeSteps` from exactly these five
// `session`-backed calls, in this order. This is now a fixed historical fact, not something read
// from a branch that no longer exists.

const ORIGINAL_FIVE_STEP_LABELS = [
  'clearStorageData',
  'clearCache',
  'clearAuthCache',
  'clearHostResolverCache',
  'clearData'
] as const

const ORIGINAL_FIVE_STEP_CATEGORIES = categoriesForLabels([
  ...ORIGINAL_FIVE_STEP_LABELS
])

// ── SITES registry — one entry per collapsed site (source: 34.4.1-SEAM-PARITY-SWEEP.md) ────────

interface SiteDef {
  /** Human label, also the KNOWN_GAP/DECLARED cross-reference key. */
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
// Unrelated to the branch collapse; untouched by this inversion. Stays a live, reusable,
// currently-empty mechanism for any future dual-branch site added to SITES.

interface KnownGapEntry {
  site: string
  droppedCategory: string
  findingId: string
  closingPlan: string
}

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

// ── The comparison itself — driven through the SAME functions real-source and synthetic-source
//    cases both call, so anti-vacuity cases prove something about the real assertion. Post-Plan-04
//    these compare ORIGINAL_FIVE_STEP_CATEGORIES (fixed) against the surviving single path's
//    categories (live-extracted), rather than two live-extracted branches against each other. ────

function undeclaredDrops(
  originalCategories: Set<string>,
  currentCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): string[] {
  const declared = new Set(declaredForSite.map((g) => g.droppedCategory))
  return [...originalCategories].filter(
    (c) => !currentCategories.has(c) && !declared.has(c)
  )
}

function staleKnownGapEntries(
  originalCategories: Set<string>,
  currentCategories: Set<string>,
  declaredForSite: KnownGapEntry[]
): KnownGapEntry[] {
  const actuallyDropped = new Set(
    [...originalCategories].filter((c) => !currentCategories.has(c))
  )
  return declaredForSite.filter((g) => !actuallyDropped.has(g.droppedCategory))
}

// =================================================================================================

describe('seamBranchParity — INVERTED by Phase 39 Plan 04 Task 2 (was Phase 34.4.1 gap cycle, plan 10 Task 2 — REQ-34.4.1-11/REQ-34.4.1-GAP-04; now REQ-39-03)', () => {
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
    'collapsed site: %s',
    (_label, site) => {
      let sourceText: string
      let functionBody: string
      let currentCategories: Set<string>

      beforeAll(() => {
        sourceText = readFileSync(site.file, 'utf-8')
        functionBody = findFunctionBody(sourceText, site.functionName)
        currentCategories = categoriesForLabels(
          extractWipeStepLabels(functionBody)
        )
      })

      it('has NOT regrown a dual-branch `if (seam === null) { ... } else { ... }` wipe shape', () => {
        expect(hasDualBranchWipeShape(functionBody)).toBe(false)
      })

      it('every category dropped from the original five-step wipe is either present in the surviving path, covered by a dated KNOWN_GAP entry, or a validated DECLARED entry', () => {
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
          ORIGINAL_FIVE_STEP_CATEGORIES,
          currentCategories,
          softenedCategories
        )
        expect(drops).toEqual([])
      })

      it('no stale KNOWN_GAP entries (a declared drop that no longer exists in source must be removed)', () => {
        const declaredForSite = KNOWN_GAP.filter((g) => g.site === site.label)
        const stale = staleKnownGapEntries(
          ORIGINAL_FIVE_STEP_CATEGORIES,
          currentCategories,
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

      it('no stale DECLARED entries (a declared category no longer actually dropped from the original five must be removed)', () => {
        const declaredForSite = DECLARED.filter((d) => d.site === site.label)
        const actuallyDropped = new Set(
          [...ORIGINAL_FIVE_STEP_CATEGORIES].filter(
            (c) => !currentCategories.has(c)
          )
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
    it('a synthetic current-path missing a category (no matching KNOWN_GAP) is rejected by undeclaredDrops', () => {
      const original = categoriesForLabels(['clearStorageData', 'clearCache'])
      const current = categoriesForLabels(['clearCache']) // storage/cookies silently missing
      const drops = undeclaredDrops(original, current, [])
      expect(drops.length).toBeGreaterThan(0)
      expect(drops).toEqual(expect.arrayContaining(['storage', 'cookies']))
    })

    it('the SAME missing category IS accepted once a matching KNOWN_GAP entry declares it', () => {
      const original = categoriesForLabels(['clearStorageData', 'clearCache'])
      const current = categoriesForLabels(['clearCache'])
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
      expect(undeclaredDrops(original, current, declared)).toEqual([])
    })

    it('an unrecognized wipeSteps label throws rather than silently contributing zero categories', () => {
      expect(() =>
        categoriesForLabels(['clearSomethingNeverSeenBefore'])
      ).toThrow(/unrecognized wipeSteps label/)
    })

    it('staleKnownGapEntries correctly flags a KNOWN_GAP entry whose category is no longer dropped', () => {
      const original = categoriesForLabels(['clearStorageData'])
      const current = categoriesForLabels(['clearStorageData']) // capability landed -- no longer dropped
      const declared: KnownGapEntry[] = [
        {
          site: 'x',
          droppedCategory: 'storage',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        }
      ]
      const stale = staleKnownGapEntries(original, current, declared)
      expect(stale).toHaveLength(1)
      expect(stale[0].droppedCategory).toBe('storage')
    })

    it('staleKnownGapEntries does NOT flag a KNOWN_GAP entry whose category is still genuinely dropped', () => {
      const original = categoriesForLabels(['clearStorageData'])
      const current = categoriesForLabels([]) // still dropped
      const declared: KnownGapEntry[] = [
        {
          site: 'x',
          droppedCategory: 'storage',
          findingId: 'F-TEST',
          closingPlan: 'plan-x'
        }
      ]
      expect(staleKnownGapEntries(original, current, declared)).toEqual([])
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

    // ── anti-regrowth anti-vacuity (Phase 39 Plan 04 Task 2) ───────────────────────────────────
    // Proves hasDualBranchWipeShape actually detects the shape it exists to detect, so the two
    // "has NOT regrown" assertions above are not passing merely because the detector is inert.

    it('anti-vacuity: hasDualBranchWipeShape DETECTS a synthetic dual-branch wipe shape', () => {
      const synthetic = `
        const seam = getLoginWindowSeam()
        let wipeSteps
        if (seam === null) {
          const ses = session.fromPartition('x')
          wipeSteps = ['clearStorageData', async () => ses.clearStorageData()]
        } else {
          wipeSteps = ['clearHumbleCookies', async () => seam.clearCookies()]
        }
      `
      expect(hasDualBranchWipeShape(synthetic)).toBe(true)
    })

    it('anti-vacuity: hasDualBranchWipeShape does NOT fire on an `if (seam === null)` with no following `else` (a different, unrelated shape)', () => {
      const synthetic = `
        if (seam === null) {
          throw new Error('no seam installed')
        }
        const wipeSteps = ['clearHumbleCookies']
      `
      expect(hasDualBranchWipeShape(synthetic)).toBe(false)
    })

    it("anti-vacuity: extractWipeStepLabels correctly parses the collapsed single-line const-with-type-annotation shape (the exact shape Task 1 produced) without stopping at the arrow function's own `=>`", () => {
      const synthetic = `
        const seam = getLoginWindowSeamOrThrow()
        const wipeSteps: Array<[string, () => Promise<unknown>]> = [
          ['clearHumbleCookies', async () => seam.clearCookies()],
          ['clearHumbleStorage', async () => seam.clearStorage()]
        ]
      `
      expect(extractWipeStepLabels(synthetic)).toEqual([
        'clearHumbleCookies',
        'clearHumbleStorage'
      ])
    })
  })
})
