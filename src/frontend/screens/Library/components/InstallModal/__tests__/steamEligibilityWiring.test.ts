import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Phase 34.13, Plan 11, Task 3 -- cross-file wiring gates for D-25.
 *
 * `InstallModal/index.tsx` and `SteamDialog/index.tsx` both reach the UI
 * kit's transitive stylesheet imports and can never be imported by a test
 * in this project (`src/frontend/jest.config.js`'s docstring: no jsdom, no
 * react-test-renderer). These are therefore comment-stripped SOURCE gates,
 * read with `readFileSync` and passed through `stripSourceComments` before
 * every assertion. VACUITY BOUNDARY: they prove the code SAYS what it must,
 * not that anything paints -- `34.13-VALIDATION.md` risk 1 ("store-flip !=
 * dialog renders") applies in full. 34.13-13's blocking manual gate is the
 * only evidence any of this actually renders.
 */

const FRONTEND_ROOT = join(__dirname, '..', '..', '..', '..', '..')

function stripped(relativePath: string): string {
  return stripSourceComments(
    readFileSync(join(FRONTEND_ROOT, relativePath), 'utf8')
  )
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function toFrontendRelative(absolutePath: string): string {
  return absolutePath
    .slice(FRONTEND_ROOT.length + 1)
    .split(sep)
    .join('/')
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1
}

/**
 * 34.13 review B-WR-06, as a THROWING helper bounded to the `<SteamDialog>`
 * arm.
 *
 * The property that matters is "inside the STEAM arm, the loading row comes
 * before the WineSelector mount". The previous inline assertion searched for
 * `<WineSelector` with a START OFFSET of the loading row's own index, which
 * makes the result mathematically incapable of being smaller -- it collapsed
 * to "a <WineSelector exists somewhere at or after the loading row" and said
 * nothing about the Steam arm at all. `installModalSource.test.ts`'s
 * `assertSteamWineSelectorHidesSharedPrefix` already uses the correct
 * pattern: bound the search to the arm first, then search WITHOUT an offset.
 */
function assertLoadingRowPrecedesSteamWineSelector(source: string): void {
  const start = source.indexOf('<SteamDialog')
  const end = source.indexOf('</SteamDialog>', start)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      'assertLoadingRowPrecedesSteamWineSelector: the <SteamDialog> arm was not found'
    )
  }
  const arm = source.slice(start, end)
  const rowIndex = arm.indexOf('<EligibilityLoadingRow')
  const wineSelectorIndex = arm.indexOf('<WineSelector') // NO start offset
  if (rowIndex === -1 || wineSelectorIndex === -1) {
    throw new Error(
      'assertLoadingRowPrecedesSteamWineSelector: a required mount is missing from the Steam arm'
    )
  }
  if (rowIndex > wineSelectorIndex) {
    throw new Error(
      'assertLoadingRowPrecedesSteamWineSelector: the loading row does not precede <WineSelector> inside the Steam arm'
    )
  }
}

// ---------------------------------------------------------------------
// Group A -- the quick path can never fire a probe (D-25's load-bearing
// negative; T-34.13-11-06)
// ---------------------------------------------------------------------

describe('Group A: the quick path can never fire a probe', () => {
  it('A1: state/InstallGameModal.ts contains ZERO matches of isSteamBottleEligible -- a non-zero count is a decision-level contradiction with D-25, not a bug to patch here (that file is 34.13-08 owned)', () => {
    const source = stripped('state/InstallGameModal.ts')
    expect(source.includes('isSteamBottleEligible')).toBe(false)
  })

  it('A2: the mount gate still exists -- InstallGameWrapper\'s "if (!installGameModalState.isOpen)" early return is WHY the quick path cannot probe: the component owning the hook does not mount unless the modal is open, and quick install never opens it', () => {
    const source = stripped('screens/Library/components/InstallModal/index.tsx')
    expect(source).toContain('if (!installGameModalState.isOpen)')
  })

  // Every file whose comment-stripped source contains the literal string
  // `isSteamBottleEligible` MUST be one of these. Sound because for this
  // channel the IPC channel name and the preload API-METHOD name are
  // IDENTICAL (34.13-07 records this) -- a single-token search cannot miss
  // a frontend caller the way a census keyed on the wrong namespace would.
  const ALLOWLIST = [
    // This plan's probe module and its own two test files.
    'screens/Library/components/InstallModal/steamEligibilityProbe.ts',
    'screens/Library/components/InstallModal/__tests__/steamEligibilityProbe.test.ts',
    'screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts',
    // 34.13-09's post-install consumer on a different surface, named
    // explicitly by this plan's <deliberate_exclusions>.
    'screens/Game/GamePage/components/SteamBottleSetup.tsx',
    'screens/Game/GamePage/components/__tests__/steamBottleSetupSeeding.test.ts',
    // DELTA from the plan's literal allowlist (which named five entries:
    // this plan's probe module + its two test files + SteamBottleSetup.tsx
    // + its test). The census also finds this SIXTH file:
    // `state/__tests__/InstallGameModal.test.ts` -- 34.13-08's OWN Group-E1
    // absence gate embeds the literal string `isSteamBottleEligible` inside
    // a real (non-comment) regex-literal source line
    // (`/steamInstallFormOpens|...|isSteamBottleEligible|.../g`), which
    // survives `stripSourceComments` because it does not start with `//`,
    // `*` or `/*`. This is a genuine hit, not a census defect -- recorded
    // per this plan's own instruction to follow the source over the plan's
    // assumed shape.
    'state/__tests__/InstallGameModal.test.ts'
  ]

  it('A3: recursive frontend census -- every file whose source matches isSteamBottleEligible is on the explicit allowlist', () => {
    const hits = walk(FRONTEND_ROOT)
      .filter((file) =>
        stripSourceComments(readFileSync(file, 'utf8')).includes(
          'isSteamBottleEligible'
        )
      )
      .map(toFrontendRelative)

    for (const hit of hits) {
      expect(ALLOWLIST).toContain(hit)
    }
    // Non-vacuity: the walker DOES find a known-present file.
    expect(hits).toContain(
      'screens/Library/components/InstallModal/steamEligibilityProbe.ts'
    )
  })

  it('A3 non-vacuity: the matcher DOES hit an inline known-bad specimen', () => {
    const specimen = stripSourceComments("const x = 'isSteamBottleEligible'")
    expect(specimen.includes('isSteamBottleEligible')).toBe(true)
  })

  it('A3: the allowlist does NOT contain state/InstallGameModal.ts (the install chokepoint itself)', () => {
    expect(ALLOWLIST).not.toContain('state/InstallGameModal.ts')
  })

  it('A4: steamEligibilityProbe is imported by exactly ONE non-test file under src/frontend, and it is InstallModal/index.tsx', () => {
    const importers = walk(FRONTEND_ROOT)
      .filter((file) => !file.includes('__tests__'))
      .filter((file) =>
        stripSourceComments(readFileSync(file, 'utf8')).includes(
          "from './steamEligibilityProbe'"
        )
      )
      .map(toFrontendRelative)

    expect(importers).toEqual([
      'screens/Library/components/InstallModal/index.tsx'
    ])
  })

  it('A4 non-vacuity: a specimen importing from a different relative path is NOT matched', () => {
    const specimen = stripSourceComments(
      "import { useSteamBottleEligibility } from '../steamEligibilityProbe'"
    )
    expect(specimen.includes("from './steamEligibilityProbe'")).toBe(false)
  })
})

// ---------------------------------------------------------------------
// Group B -- the loading row is mounted, in the right slot, behind the
// right guard
// ---------------------------------------------------------------------

describe('Group B: the loading row is mounted, in the right slot, behind the right guard', () => {
  const source = stripped('screens/Library/components/InstallModal/index.tsx')

  it('B1: <EligibilityLoadingRow appears exactly once, imported from SteamDialog/', () => {
    expect(countOccurrences(source, '<EligibilityLoadingRow')).toBe(1)
    expect(source).toContain("from './SteamDialog/EligibilityLoadingRow'")
  })

  it('B2: eligibility.pending appears within the 150 characters immediately preceding the mount', () => {
    const mountIndex = source.indexOf('<EligibilityLoadingRow')
    expect(mountIndex).toBeGreaterThan(-1)
    const preceding = source.slice(Math.max(0, mountIndex - 150), mountIndex)
    expect(preceding).toContain('eligibility.pending')
  })

  it('B3: <EligibilityLoadingRow precedes the Steam <WineSelector mount', () => {
    expect(() =>
      assertLoadingRowPrecedesSteamWineSelector(source)
    ).not.toThrow()
  })

  it('B3-RED: the gate itself trips on a known-bad input DERIVED FROM THE REAL SOURCE with the two mounts swapped', () => {
    // 34.13 review B-WR-06: the previous "non-vacuity" spec built a
    // hand-written string literal and re-ran plain `indexOf` on it. It
    // exercised `String.prototype.indexOf`, never B3's logic -- verbatim the
    // WR-09 defect, left standing one directory away from where WR-09 was
    // fixed. This drives the REAL helper against a specimen derived from the
    // REAL source.
    const knownBad = source
      .replace('<EligibilityLoadingRow', '@@ROW@@')
      .replace('<WineSelector', '<EligibilityLoadingRow')
      .replace('@@ROW@@', '<WineSelector')
    expect(knownBad).not.toBe(source)
    expect(() => assertLoadingRowPrecedesSteamWineSelector(knownBad)).toThrow(
      /does not precede/
    )
  })

  it('B3-RED-b: the gate trips when the loading row is moved OUTSIDE the Steam arm -- the property the old offset-search version could not measure at all', () => {
    // The old assertion searched for `<WineSelector` STARTING AT the loading
    // row's index, which is mathematically incapable of returning a smaller
    // number. It collapsed to "a <WineSelector exists somewhere at or after
    // the loading row" and said nothing about the STEAM mount, so it would
    // have passed just as happily with the row hoisted above the ThirdParty
    // arm instead.
    const armStart = source.indexOf('<SteamDialog')
    const knownBad =
      source.slice(0, armStart).replace(/$/, '<EligibilityLoadingRow />') +
      source.slice(armStart).replace('<EligibilityLoadingRow', '<Placeholder')
    expect(() => assertLoadingRowPrecedesSteamWineSelector(knownBad)).toThrow(
      /a required mount is missing/
    )
  })

  it('B4: useSteamBottleEligibility( appears exactly once and applyEligibilityPending( appears exactly once -- one hook call, one wrap, no second re-derivation', () => {
    expect(countOccurrences(source, 'useSteamBottleEligibility(')).toBe(1)
    expect(countOccurrences(source, 'applyEligibilityPending(')).toBe(1)
  })

  it('B5: zero matches of a hand-rolled suppression -- no "&& !pending", no "&& !eligibility.pending" appended to any gating. field read', () => {
    expect(source.includes('&& !pending')).toBe(false)
    expect(source.includes('&& !eligibility.pending')).toBe(false)
  })

  it('B5 non-vacuity: an inline specimen with a hand-rolled suppression trips the same check', () => {
    const specimen = 'gating.wineSection && !pending'
    expect(specimen.includes('&& !pending')).toBe(true)
  })

  // ── 34.13 review B-WR-03 ────────────────────────────────────────────────
  //
  // B-WR-05's whole premise is that this file locks every decision
  // `InstallModal/index.tsx` encodes. B-WR-02's fix then landed real
  // behaviour into that file WITHOUT extending any gate here: a repo-wide
  // grep for `applyLibraryFetchPending` / `steamLibrariesSettled` outside
  // `steamEligibilityProbe.test.ts` (which covers the PURE function only)
  // returned nothing. So deleting the wrap and re-initialising to `[]`
  // reproduced the exact pre-fix defect with all 308 partition-B tests still
  // green — verbatim the B-WR-05 defect class, one commit later. B4's
  // `applyEligibilityPending(` count of 1 survives that revert untouched, and
  // B5's ban on `&& !pending` is not something a revert ADDS.
  //
  // A pure-function suite proves the function is CORRECT. These prove it is
  // CALLED, which is the half that closes the finding.

  it('B6 (B-WR-02): the raw verdict is wrapped by applyLibraryFetchPending, fed by steamLibrariesSettled', () => {
    expect(countOccurrences(source, 'applyLibraryFetchPending(')).toBe(1)
    const wrapIdx = source.indexOf('applyLibraryFetchPending(')
    expect(source.slice(wrapIdx, wrapIdx + 200)).toContain(
      'steamLibrariesSettled'
    )
  })

  it('B7 (B-WR-02): the library fetch is a THREE-state discriminated union, and a REJECTION is settled', () => {
    const flat = source.replace(/\s+/g, ' ')
    // The union itself: pending / ok / failed. A two-state
    // `SteamDialogLibraryOption[] | null` cannot express "asked and failed",
    // which is how the round-1 fix suppressed the notice permanently.
    expect(flat).toMatch(/\{ phase: 'pending' \}/)
    expect(flat).toMatch(
      /\{ phase: 'ok'; targets: SteamDialogLibraryOption\[\] \}/
    )
    expect(flat).toMatch(/\{ phase: 'failed' \}/)
    // ...and `settled` must be "not pending", never "not the initial value".
    expect(flat).toContain("libraryFetch.phase !== 'pending'")
    // The rejection handler must reach 'failed'. Bounded to the `.catch(`
    // that follows the fetch, so a `'failed'` written anywhere else in the
    // file cannot satisfy this.
    const fetchIdx = flat.indexOf('.listSteamLibraryTargets()')
    expect(fetchIdx).toBeGreaterThan(-1)
    const catchIdx = flat.indexOf('.catch(', fetchIdx)
    expect(catchIdx).toBeGreaterThan(fetchIdx)
    expect(flat.slice(catchIdx, catchIdx + 400)).toContain(
      "setLibraryFetch({ phase: 'failed' })"
    )
    expect(flat.slice(catchIdx, catchIdx + 400)).not.toContain(
      "setLibraryFetch({ phase: 'pending' })"
    )
  })

  it('B6/B7-RED: known-bads DERIVED FROM THE REAL SOURCE break each obligation', () => {
    // (a) delete the wrap -- the pre-B-WR-02 shape.
    const noWrap = source.replace(
      /applyLibraryFetchPending\(\s*([\s\S]*?),\s*steamLibrariesSettled\s*\)/,
      '$1'
    )
    expect(noWrap).not.toBe(source)
    expect(countOccurrences(noWrap, 'applyLibraryFetchPending(')).toBe(0)

    // (b) send the rejection back to 'pending' -- the ITERATION-2 shape,
    // which is the one that suppressed the notice forever. Note it leaves
    // the union, `settled`, the wrap and B4/B5 all intact, so every OTHER
    // gate in this file stays green on it: that is precisely why the defect
    // shipped.
    const rejectToPending = source.replace(
      "setLibraryFetch({ phase: 'failed' })",
      "setLibraryFetch({ phase: 'pending' })"
    )
    expect(rejectToPending).not.toBe(source)
    const flat = rejectToPending.replace(/\s+/g, ' ')
    const catchIdx = flat.indexOf(
      '.catch(',
      flat.indexOf('.listSteamLibraryTargets()')
    )
    expect(flat.slice(catchIdx, catchIdx + 400)).not.toContain(
      "setLibraryFetch({ phase: 'failed' })"
    )
    expect(countOccurrences(rejectToPending, 'applyLibraryFetchPending(')).toBe(
      1
    )
  })
})

// ---------------------------------------------------------------------
// Group C -- the origin controls are deliberately UNTOUCHED (the
// inversion holds)
// ---------------------------------------------------------------------

describe('Group C: the origin controls are deliberately UNTOUCHED (the inversion holds)', () => {
  const ORIGIN_CONTROLS: Record<string, string> = {
    MainButton: 'screens/Game/GamePage/components/MainButton.tsx',
    GameCard: 'screens/Library/components/GameCard/index.tsx',
    GameSubMenu: 'screens/Game/GameSubMenu/index.tsx'
  }

  const FORBIDDEN_ORIGIN_TOKENS = [
    'checkingSteamInstallOptions',
    'useSteamInstallOptionsCheck',
    'isSteamInstallOptionsCheckActiveFor',
    'isSteamBottleEligible'
  ]

  it('D-25 inversion: no origin install control carries an eligibility busy state', () => {
    // Under the retired D-12 contract these three files were the busy
    // state's home. D-25 moved it inside the dialog, and the quick path
    // fires no probe at all -- so there is no latency here to cover.
    for (const path of Object.values(ORIGIN_CONTROLS)) {
      const source = stripped(path)
      for (const token of FORBIDDEN_ORIGIN_TOKENS) {
        expect(source.includes(token)).toBe(false)
      }
    }
  })

  it('non-vacuity: the same four searches DO hit an inline known-bad specimen', () => {
    const specimen = stripSourceComments(
      FORBIDDEN_ORIGIN_TOKENS.map((t) => `const x = '${t}'`).join('\n')
    )
    for (const token of FORBIDDEN_ORIGIN_TOKENS) {
      expect(specimen.includes(token)).toBe(true)
    }
  })

  it('C2: fa-spin counts in MainButton.tsx and GameCard/index.tsx are unchanged from their pre-plan values (2 and 1) -- this plan added no spinner to either', () => {
    expect(
      countOccurrences(stripped(ORIGIN_CONTROLS.MainButton), 'fa-spin')
    ).toBe(2)
    expect(
      countOccurrences(stripped(ORIGIN_CONTROLS.GameCard), 'fa-spin')
    ).toBe(1)
  })
})

// ---------------------------------------------------------------------
// Group D -- no new spinner component, no new stylesheet
// ---------------------------------------------------------------------

describe('Group D: no new spinner component, no new stylesheet', () => {
  it('D1: SteamDialog/ has no .css/.scss entry and no /spinner/i entry', () => {
    const dir = join(
      FRONTEND_ROOT,
      'screens/Library/components/InstallModal/SteamDialog'
    )
    const entries = readdirSync(dir)
    expect(entries.some((e) => /\.(css|scss)$/.test(e))).toBe(false)
    expect(entries.some((e) => /spinner/i.test(e))).toBe(false)
  })

  it('D1 non-vacuity: a specimen array containing a spinner/stylesheet entry trips the same checks', () => {
    const specimen = ['MySpinner.tsx', 'index.scss']
    expect(specimen.some((e) => /\.(css|scss)$/.test(e))).toBe(true)
    expect(specimen.some((e) => /spinner/i.test(e))).toBe(true)
  })
})

// ---------------------------------------------------------------------
// Group E (34.14) -- the depot resolution is CALLED, once, and feeds BOTH
// consumers
// ---------------------------------------------------------------------

/**
 * A pure-function suite (`steamPlatformRow.test.ts`) proves
 * `resolveDepotAvailability` is CORRECT. These prove it is CALLED, exactly
 * once, and that BOTH of its outputs reach the two places that must consume
 * them -- the same "correct != called" gap `steamEligibilityWiring.test.ts`
 * was created to close (34.13 review B-WR-02/B-WR-03).
 *
 * `flatten` collapses whitespace AND the space `prettier` inserts right
 * after a wrapped `(` / right before a wrapped `)` -- 34.14's own
 * `selectSteamPlatformOptions(...)` call site is long enough that `prettier`
 * wraps each argument onto its own line, so a plain
 * `.replace(/\s+/g, ' ')` (this file's Group B convention) would leave
 * `selectSteamPlatformOptions( platformRowMode, platforms,
 * windowsDepotOffered )` -- extra spaces the literal string match below
 * would then miss even though the call is correct.
 */
function flatten(source: string): string {
  return source
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
}

describe('Group E (34.14): the depot resolution is CALLED, once, and feeds BOTH consumers', () => {
  const source = stripped('screens/Library/components/InstallModal/index.tsx')

  it('E1: resolveDepotAvailability( appears exactly ONCE -- two calls would be two independent D-04 decisions that can disagree', () => {
    expect(countOccurrences(source, 'resolveDepotAvailability(')).toBe(1)
  })

  it('E1-RED: deleting the call trips E1, against a known-bad DERIVED FROM THE REAL SOURCE', () => {
    // The replacement breaks the exact token `resolveDepotAvailability(` by
    // inserting text BEFORE the `(` (not merely prefixing the identifier --
    // a prefix like `DELETED_resolveDepotAvailability(` still CONTAINS the
    // token as a substring and would make this known-bad vacuous).
    const knownBad = source.replace(
      'resolveDepotAvailability(',
      'resolveDepotAvailabilityDELETED('
    )
    expect(knownBad).not.toBe(source)
    expect(countOccurrences(knownBad, 'resolveDepotAvailability(')).toBe(0)
  })

  it('E2: within the 600 characters following the call, all SEVEN ResolveDepotAvailabilityInput property names appear -- a call missing the Windows seed pair silently loses D-05, a call missing probeSettled silently loses D-04, and a call missing the 34.15 D-12 mac seed pair silently loses D-12 the same way', () => {
    // 34.15 D-12 reconciliation: this gate was widened from FIVE property
    // names / a 400-char window to SEVEN / 600 chars. As shipped by 34.15-04,
    // this test would have stayed GREEN if `seedHasMacDepot` and
    // `probeHasMacDepot` had been silently dropped from the call -- it only
    // asserted presence of the five names it already knew about. The window
    // was widened (not merely the property list) because the larger object
    // literal -- now seven properties instead of five -- needs the extra
    // room to fit; the real distance measured against the shipped source is
    // 354 characters, so 600 carries real headroom, not a guess that the
    // current source already exceeds.
    const callIdx = source.indexOf('resolveDepotAvailability(')
    expect(callIdx).toBeGreaterThan(-1)
    const window = source.slice(callIdx, callIdx + 600)
    for (const prop of [
      'seedHasWindowsDepot',
      'seedHasMacDepot',
      'seedDepotSignalCaptured',
      'probeHasWindowsDepot',
      'probeHasMacDepot',
      'probeDepotSignalCaptured',
      'probeSettled'
    ]) {
      expect(window).toContain(prop)
    }
  })

  it('E2-RED (34.15 D-12): deleting the mac seed pair from the call trips E2, against a known-bad DERIVED FROM THE REAL SOURCE -- this is the reconciliation obligation itself, proven', () => {
    const knownBad = source
      .replace('seedHasMacDepot: hasMacDepot,\n      ', '')
      .replace('probeHasMacDepot: eligibility.hasMacDepot,\n      ', '')
    expect(knownBad).not.toBe(source)
    expect(knownBad).not.toContain('seedHasMacDepot')
    expect(knownBad).not.toContain('probeHasMacDepot')
    const callIdx = knownBad.indexOf('resolveDepotAvailability(')
    expect(callIdx).toBeGreaterThan(-1)
    const window = knownBad.slice(callIdx, callIdx + 600)
    expect(window).not.toContain('seedHasMacDepot')
    expect(window).not.toContain('probeHasMacDepot')
  })

  it('E3: windowsDepotOffered -- not the raw hasWindowsDepot -- is what reaches selectSteamPlatformOptions', () => {
    // 34.15 gap-closure round (code review WR-01) added a 4th argument,
    // macDepotOffered, to this call -- the literal below was widened to
    // match; the property under test (the THIRD argument is
    // windowsDepotOffered, never the raw hasWindowsDepot) is unchanged.
    const flat = flatten(source)
    expect(flat).toContain(
      'selectSteamPlatformOptions(platformRowMode, platforms, windowsDepotOffered, macDepotOffered)'
    )
    expect(flat).not.toContain(
      'selectSteamPlatformOptions(platformRowMode, platforms, hasWindowsDepot, macDepotOffered)'
    )
  })

  it('E3-RED: swapping the third argument back to hasWindowsDepot trips E3 -- this is the precise regression that would make D-04 fail-open render as no offer at all', () => {
    // Regex-derived (not a hand-written literal): the real call site is
    // wrapped across multiple lines by prettier, so a plain string replace
    // of the flattened form would not exercise the real source shape.
    const knownBad = source.replace(
      /selectSteamPlatformOptions\(([\s\S]*?)windowsDepotOffered([\s\S]*?)\)/,
      'selectSteamPlatformOptions($1hasWindowsDepot$2)'
    )
    expect(knownBad).not.toBe(source)
    const flat = flatten(knownBad)
    expect(flat).toContain(
      'selectSteamPlatformOptions(platformRowMode, platforms, hasWindowsDepot, macDepotOffered)'
    )
  })

  it('E3b (34.15 WR-01): macDepotOffered -- not a raw seed or omitted entirely -- is what reaches selectSteamPlatformOptions as the 4th argument', () => {
    const flat = flatten(source)
    expect(flat).toContain(
      'selectSteamPlatformOptions(platformRowMode, platforms, windowsDepotOffered, macDepotOffered)'
    )
  })

  it('E3b-RED: deleting the macDepotOffered argument trips E3b, against a known-bad DERIVED FROM THE REAL SOURCE', () => {
    const knownBad = source.replace(
      /selectSteamPlatformOptions\(([\s\S]*?),\s*macDepotOffered\s*\)/,
      'selectSteamPlatformOptions($1)'
    )
    expect(knownBad).not.toBe(source)
    const flat = flatten(knownBad)
    expect(flat).not.toContain(
      'selectSteamPlatformOptions(platformRowMode, platforms, windowsDepotOffered, macDepotOffered)'
    )
  })

  it("E4: depotSignalResolved appears inside the resolveSteamSectionGating( call's object literal AND inside its useMemo dependency array", () => {
    // Bounded to the memo's own span: from resolveSteamSectionGating( to the
    // FIRST `]` after it (the dep array's own closing bracket -- the object
    // literal above it uses `{}`, never `[]`, so this cannot false-bound on
    // an unrelated array written elsewhere in the file).
    const startIdx = source.indexOf('resolveSteamSectionGating(')
    expect(startIdx).toBeGreaterThan(-1)
    const closeIdx = source.indexOf(']', startIdx)
    expect(closeIdx).toBeGreaterThan(startIdx)
    const span = source.slice(startIdx, closeIdx + 1)
    expect(
      countOccurrences(span, 'depotSignalResolved')
    ).toBeGreaterThanOrEqual(2)
  })

  it("E4-RED: deleting depotSignalResolved from the dependency array (but NOT from the gating input object) trips E4 -- the stale-dep regression that pins the row at 'pending' forever", () => {
    const knownBad = source.replace(
      'depotSignalResolved,\n      steamLibraryList,',
      'steamLibraryList,'
    )
    expect(knownBad).not.toBe(source)
    const startIdx = knownBad.indexOf('resolveSteamSectionGating(')
    const closeIdx = knownBad.indexOf(']', startIdx)
    const span = knownBad.slice(startIdx, closeIdx + 1)
    // Only the gating-input occurrence survives -- exactly 1, not 0, proving
    // this known-bad targets the dep array specifically rather than
    // deleting the field outright (which E2/E4's object-literal half would
    // also catch, muddying which obligation actually tripped).
    expect(countOccurrences(span, 'depotSignalResolved')).toBe(1)
  })

  // ── D-01 co-occurrence proof (VALIDATION.md) ──────────────────────────
  //
  // D-01 claims the Install disable and the pending row are driven by the
  // SAME expression, not two flags that could desync. Asserting each
  // independently (as B2/B4 already do for the loading row, and as Task 1's
  // own acceptance criteria do for probeSettled) proves each EXISTS but not
  // that they are the SAME expression -- two independently-correct flags
  // fed from different sources would pass both existence checks and still
  // desync. This co-occurrence spec is what actually proves D-01.

  it("E5: eligibilityPending={eligibility.pending} (the Install-disable prop) and probeSettled: !eligibility.pending (resolveDepotAvailability's input) both read eligibility.pending -- the SAME expression, not two flags that could desync", () => {
    expect(
      countOccurrences(source, 'eligibilityPending={eligibility.pending}')
    ).toBe(1)
    expect(countOccurrences(source, 'probeSettled: !eligibility.pending')).toBe(
      1
    )
  })

  it('E5-RED: a known-bad DERIVED FROM THE REAL SOURCE feeding the Install-disable prop from a different identifier trips E5', () => {
    const knownBad = source.replace(
      'eligibilityPending={eligibility.pending}',
      'eligibilityPending={someOtherEligibilityFlag}'
    )
    expect(knownBad).not.toBe(source)
    expect(
      countOccurrences(knownBad, 'eligibilityPending={eligibility.pending}')
    ).toBe(0)
  })

  // ── 34.15 D-12/D-13 ──────────────────────────────────────────────────
  //
  // E6: `macDepotOffered`'s resolution moment (`depotSignalResolved`) must
  // also reach `SteamDialog`, so its header's glyph row (D-13) and this
  // file's own platform selector read the SAME resolution moment rather
  // than two independently-drifting ones.

  it('E6: depotSignalResolved={depotSignalResolved} reaches the <SteamDialog mount', () => {
    expect(
      countOccurrences(source, 'depotSignalResolved={depotSignalResolved}')
    ).toBe(1)
  })

  it('E6-RED: deleting the prop from the <SteamDialog mount trips E6, against a known-bad DERIVED FROM THE REAL SOURCE', () => {
    const knownBad = source.replace(
      'depotSignalResolved={depotSignalResolved}\n          ',
      ''
    )
    expect(knownBad).not.toBe(source)
    expect(
      countOccurrences(knownBad, 'depotSignalResolved={depotSignalResolved}')
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------
// Group F (34.15 D-15) -- 34.14's pending-row pin is NOT reopened by this
// phase's mac-side changes
// ---------------------------------------------------------------------
//
// 34.14's `readonlyPlatformValue('pending')` deliberately pins the disabled
// selector to display macOS during the same window in which D-13 (this
// phase) now suppresses the SteamDialog glyph row. That looks inconsistent
// and 34.15-CONTEXT.md D-15 records that it WAS considered: the selector is
// disabled, Install is disabled, and an `EligibilityLoadingRow` is on
// screen explaining the wait, so the displayed value is INERT, not an
// offer. This makes "we did not reopen 34.14's decision" a CHECKED
// property rather than a claim in a summary file.

describe("34.15 D-15: 34.14's pending-row pin is not reopened", () => {
  const source = stripped('screens/Library/components/InstallModal/index.tsx')

  it('readonlyPlatformValue( is still called in InstallModal/index.tsx', () => {
    expect(source).toContain('readonlyPlatformValue(')
  })

  it('<EligibilityLoadingRow still appears exactly once, unchanged from 34.14/34.13-11 (B1)', () => {
    expect(countOccurrences(source, '<EligibilityLoadingRow')).toBe(1)
  })
})

// Finish with a full-suite run in Task 3's own <verify> command
// (`pnpm test:ci`) -- this task edits the dialog router every install flow
// mounts, so any suite that flips red is a real regression.
