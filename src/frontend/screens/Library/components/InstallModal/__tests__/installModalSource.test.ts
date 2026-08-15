import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Phase 34.13, Plan 12, Task 3 -- comment-stripped source gates locking
 * every negative decision `InstallModal/index.tsx` encodes, proven against
 * inline known-bad specimens so a passing gate is evidence, not decoration.
 *
 * VACUITY BOUNDARY (read before trusting a green run here): these gates
 * prove the file's SOURCE encodes the right decisions -- they are NOT
 * evidence the modal actually renders. This repo's Frontend jest project
 * has no jsdom and no react-test-renderer, and `index.tsx` imports
 * `./index.scss` as its very first line, so no test in this repo can import
 * it and observe a real render (`34.13-VALIDATION.md` risk 1: "store-flip
 * != dialog renders"). `34.13-13`'s manual UAT gate is the ONLY evidence
 * any of this actually renders on screen.
 *
 * This file NEVER imports `../index` -- it reads the file as raw text and
 * strips comments first. Stripping is mandatory and load-bearing here
 * specifically: `index.tsx`'s own doc comments legitimately NAME
 * `availablePlatforms.length > 1`, `hasWine`, `crossoverOnly` and
 * `disabled` while explaining why each is or is not used -- an unstripped
 * grep would fail on the file's own explanations (the self-invalidating-
 * header defect class already ledgered against `steamSectionGating.ts` and
 * `SteamDialog/index.tsx`'s own source-gate files).
 *
 * TWO gates below are DELIBERATELY narrower than the plan's literal prose,
 * and this is a documented deviation, not an oversight -- see the SUMMARY's
 * "Deviations from Plan" section for the full reasoning:
 *
 *  - "Zero matches of `libraryCount`" (34.13-05 review-obligation block):
 *    `index.tsx` is the ONE file in this plan-set that legitimately
 *    CONSTRUCTS `SteamSectionGatingInput`, whose own field is literally
 *    named `libraryCount` (confirmed against the shipped
 *    `steamSectionGating.ts` in Task 2's upstream-contract check). An
 *    absolute zero-match gate would fail against Task 2's own mandated
 *    code. The gate below excludes exactly the single input-object
 *    property-key line (`libraryCount: steamLibraries.length`) using the
 *    same visible line-exclusion technique the neighbouring `length > 1`
 *    and `platformToInstall ===` gates already use, and is proven
 *    non-vacuous against a specimen containing a SECOND, illegitimate
 *    occurrence.
 *  - "Zero matches of `is_mac_native`": `index.tsx` predates this plan and
 *    already used `gameInfo?.is_mac_native` twice for the pre-existing,
 *    non-Steam default-platform-icon logic (`isMacNative` and
 *    `getDefaultplatform()`) -- functionality this plan does not touch and
 *    is out of scope to remove. The gate below excludes exactly those two
 *    pre-existing lines and is proven non-vacuous against a specimen
 *    containing a THIRD, D-09-shaped re-derivation.
 */

const INDEX_PATH = join(__dirname, '..', 'index.tsx')

function readIndexStripped(): string {
  return stripSourceComments(readFileSync(INDEX_PATH, 'utf8'))
}

// --- Shared, visible line-exclusion helper ---------------------------
//
// Explicit split / filter / join, per this plan's own instruction: "Build
// the excluded-line filter explicitly ... so the exclusion is visible
// rather than baked into a regex."
function excludingLines(
  source: string,
  isExcluded: (line: string) => boolean
): string {
  return source
    .split('\n')
    .filter((line) => !isExcluded(line))
    .join('\n')
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1
}

// ---------------------------------------------------------------------
// Block 1 -- D-03: the availablePlatforms.length > 1 guard is REPLACED,
// not supplemented
// ---------------------------------------------------------------------

describe('D-03: the availablePlatforms.length > 1 guard is REPLACED, not supplemented', () => {
  const stripped = readIndexStripped()

  it('the stripped source contains exactly ONE occurrence of availablePlatforms.length > 1, and its line also contains legacyPlatformRowMode', () => {
    expect(countOccurrences(stripped, 'availablePlatforms.length > 1')).toBe(
      1
    )
    const line = stripped
      .split('\n')
      .find((l) => l.includes('availablePlatforms.length > 1'))
    expect(line).toBeDefined()
    expect(line).toContain('legacyPlatformRowMode')
  })

  it("platformSelection's body contains zero occurrences of availablePlatforms", () => {
    const funcStart = stripped.indexOf('function platformSelection')
    const nextDeclStart = stripped.indexOf(
      'const showDownloadDialog',
      funcStart
    )
    // Both boundary indices must be real positions before slicing -- a
    // rename of either anchor must not silently produce an empty (and
    // therefore vacuously passing) slice.
    expect(funcStart).toBeGreaterThan(-1)
    expect(nextDeclStart).toBeGreaterThan(-1)
    expect(nextDeclStart).toBeGreaterThan(funcStart)

    const body = stripped.slice(funcStart, nextDeclStart)
    expect(body.includes('availablePlatforms')).toBe(false)
  })

  it('the verdict is READ, not merely imported -- steamGating.platformRow appears in the stripped source', () => {
    expect(stripped).toContain('steamGating.platformRow')
  })
})

// ---------------------------------------------------------------------
// Block 2 -- D-17: the Windows MenuItem is omitted, never disabled
// ---------------------------------------------------------------------

describe('D-17: the Windows MenuItem is omitted, never disabled', () => {
  const stripped = readIndexStripped()
  // Bounded span: a MenuItem opening tag through its attributes, up to
  // (but not across) the tag's own close.
  const MENU_ITEM_DISABLED = /<MenuItem(?:(?!\/?>)[\s\S]){0,200}?disabled/

  it('zero MenuItem carries a disabled attribute', () => {
    expect(MENU_ITEM_DISABLED.test(stripped)).toBe(false)
  })

  it('the same regex DOES match an inline known-bad specimen -- proving the gate above is non-vacuous', () => {
    const specimen = '<MenuItem value="Windows" key={1} disabled>'
    expect(MENU_ITEM_DISABLED.test(specimen)).toBe(true)
  })

  it('the depot gate is called from executable code -- selectSteamPlatformOptions( and hasSteamWindowsDepot( both present', () => {
    expect(stripped).toContain('selectSteamPlatformOptions(')
    expect(stripped).toContain('hasSteamWindowsDepot(')
  })

  it('is_windows_native appears nowhere in this file -- the comparison lives in steamPlatformRow.ts, the single implementation', () => {
    expect(countOccurrences(stripped, 'is_windows_native')).toBe(0)
  })
})

// ---------------------------------------------------------------------
// Block 3 -- 34.13-05 review obligation: no locally re-derived section
// condition
// ---------------------------------------------------------------------

describe('34.13-05 review obligation: no locally re-derived section condition', () => {
  const stripped = readIndexStripped()

  it('zero matches of /length\\s*>\\s*1/ once the single legacyPlatformRowMode line is excluded', () => {
    const filtered = excludingLines(stripped, (line) =>
      line.includes('legacyPlatformRowMode')
    )
    expect(/length\s*>\s*1/.test(filtered)).toBe(false)
  })

  it('the length>1 filtered-match check is non-vacuous -- a specimen with an unrelated length>1 line on a NON-legacyPlatformRowMode line still trips it', () => {
    const specimen = [
      'const legacyPlatformRowMode = availablePlatforms.length > 1',
      'const sneakyGuard = libraries.length > 1'
    ].join('\n')
    const filtered = excludingLines(specimen, (line) =>
      line.includes('legacyPlatformRowMode')
    )
    expect(/length\s*>\s*1/.test(filtered)).toBe(true)
  })

  it('zero occurrences of the libraryCount input-object key line -- the resolver input is fed from steamLibraries.length ONCE and never re-derived locally elsewhere', () => {
    // Deviation from the plan's literal "zero matches of libraryCount":
    // `SteamSectionGatingInput.libraryCount` is 34.13-05's own shipped
    // field name, and this file is the sole legitimate constructor of that
    // input object (Task 2, step E). The single property-key line is
    // excluded by the same visible-line technique used above; any OTHER
    // occurrence of `libraryCount` in the file would be a real
    // re-derivation and must still trip this gate.
    const filtered = excludingLines(stripped, (line) =>
      line.includes('libraryCount: steamLibraries.length')
    )
    expect(filtered.includes('libraryCount')).toBe(false)
  })

  it('the libraryCount filtered-match check is non-vacuous -- a second, illegitimate libraryCount occurrence still trips it', () => {
    const specimen = [
      'libraryCount: steamLibraries.length',
      'const sneakyLibraryCount = libraryCount > 1'
    ].join('\n')
    const filtered = excludingLines(specimen, (line) =>
      line.includes('libraryCount: steamLibraries.length')
    )
    expect(filtered.includes('libraryCount')).toBe(true)
  })

  it("zero matches of platformToInstall === 'Windows' as a section condition, except the hasWine declaration line", () => {
    const filtered = excludingLines(stripped, (line) =>
      line.includes('const hasWine =')
    )
    expect(filtered.includes("platformToInstall === 'Windows'")).toBe(false)
  })

  it("the platformToInstall === 'Windows' filtered-match check is non-vacuous -- a specimen with a second occurrence on a non-hasWine line still trips it", () => {
    const specimen = [
      "const hasWine = platformToInstall === 'Windows' && !isWin",
      "const showSomething = platformToInstall === 'Windows'"
    ].join('\n')
    const filtered = excludingLines(specimen, (line) =>
      line.includes('const hasWine =')
    )
    expect(filtered.includes("platformToInstall === 'Windows'")).toBe(true)
  })

  it('zero matches of mac_arch and steamPlatformsCaptured -- D-09s no-third-frontend-copy rule', () => {
    expect(countOccurrences(stripped, 'mac_arch')).toBe(0)
    expect(countOccurrences(stripped, 'steamPlatformsCaptured')).toBe(0)
  })

  it('is_mac_native appears only on the two pre-existing, non-Steam default-platform lines -- no D-09-shaped re-derivation was added', () => {
    // Deviation from the plan's literal "zero matches of is_mac_native":
    // `index.tsx` predates this plan and already reads
    // `gameInfo?.is_mac_native` twice for the generic (non-Steam)
    // default-platform-icon logic this plan does not touch. Both lines are
    // excluded by name; any OTHER occurrence would be a genuine D-09-shaped
    // re-derivation and must still trip this gate.
    const filtered = excludingLines(
      stripped,
      (line) =>
        line.includes('isMacNative = Boolean') ||
        line.includes('if (isMac && gameInfo?.is_mac_native)')
    )
    expect(filtered.includes('is_mac_native')).toBe(false)
  })

  it('the is_mac_native filtered-match check is non-vacuous -- a third, D-09-shaped occurrence still trips it', () => {
    const specimen = [
      'const isMacNative = Boolean(gameInfo?.is_mac_native)',
      'if (isMac && gameInfo?.is_mac_native) {',
      'const sneakyBottleEligible = gameInfo?.is_mac_native === false'
    ].join('\n')
    const filtered = excludingLines(
      specimen,
      (line) =>
        line.includes('isMacNative = Boolean') ||
        line.includes('if (isMac && gameInfo?.is_mac_native)')
    )
    expect(filtered.includes('is_mac_native')).toBe(true)
  })

  it('the stripped source contains steamGating.wineSection and does NOT contain "hasWine ?" -- every mount reads showWineSelector', () => {
    expect(stripped).toContain('steamGating.wineSection')
    expect(stripped.includes('hasWine ?')).toBe(false)
  })
})

// ---------------------------------------------------------------------
// Block 4 -- D-16 / D-05: the WineSelector props
// ---------------------------------------------------------------------

describe('D-16 / D-05: the WineSelector props', () => {
  const stripped = readIndexStripped()

  it('exactly one runner="steam" and exactly one bottleNameReadOnly', () => {
    expect(countOccurrences(stripped, 'runner="steam"')).toBe(1)
    expect(countOccurrences(stripped, 'bottleNameReadOnly')).toBe(1)
  })

  it('zero occurrences of crossoverOnly -- D-16 arrives through resolveCrossoverOnly\'s "??" runner-derived default (engineFilter.ts), never an explicit prop', () => {
    expect(countOccurrences(stripped, 'crossoverOnly')).toBe(0)
  })

  // -------------------------------------------------------------------
  // D-16 / Phase 17 CR-01 -- the shared-prefix toggle must NOT render on
  // the Steam path (34.13 review CR-01).
  //
  // The two count gates above were the gap that let this ship: they count
  // the props that ARE present and say nothing about the one that was
  // MISSING. This gate is written as a throwing helper (matching
  // `assertBoundedStatusDanger`'s shape in the sibling SteamDialog source
  // gate) so the SAME code path can be driven against a known-bad input
  // and observed to fail -- a count assertion inlined into an `it` can
  // never be proven RED.
  // -------------------------------------------------------------------

  function assertSteamWineSelectorHidesSharedPrefix(source: string): void {
    // Bound the search to the Steam arm specifically. `index.tsx` mounts
    // <WineSelector> four more times (ThirdParty/Download/Sideload), and
    // those callers must stay byte-for-byte unchanged -- a whole-file
    // count would pass just as happily if the prop landed on the wrong
    // one.
    const start = source.indexOf('<SteamDialog')
    const end = source.indexOf('</SteamDialog>', start)
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(
        'could not locate the <SteamDialog> ... </SteamDialog> arm -- the gate cannot be evaluated'
      )
    }
    const arm = source.slice(start, end)
    const n = countOccurrences(arm, 'hideSharedPrefixToggle')
    if (n !== 1) {
      throw new Error(
        `expected exactly 1 hideSharedPrefixToggle inside the SteamDialog arm, found ${n}`
      )
    }
  }

  it('the Steam <WineSelector> passes hideSharedPrefixToggle -- the shared GOG/Epic engine can never reach persistBottleWineVersion (D-16 / 17 CR-01)', () => {
    expect(() =>
      assertSteamWineSelectorHidesSharedPrefix(stripped)
    ).not.toThrow()
  })

  it('the hideSharedPrefixToggle gate is non-vacuous -- it THROWS against the real pre-fix source (this file with the prop line deleted)', () => {
    // Not a hand-built replica: this is the shipped source with exactly
    // the one prop line removed, i.e. byte-for-byte the state the review
    // found. A replica would drift silently from the production shape.
    const knownBad = excludingLines(stripped, (line) =>
      line.trim().startsWith('hideSharedPrefixToggle')
    )
    expect(knownBad).not.toContain('hideSharedPrefixToggle')
    expect(() =>
      assertSteamWineSelectorHidesSharedPrefix(knownBad)
    ).toThrow(/found 0/)
  })

  it('the hideSharedPrefixToggle gate also trips on a SECOND occurrence inside the arm', () => {
    const specimen = [
      '<SteamDialog>',
      '<WineSelector runner="steam" hideSharedPrefixToggle />',
      '<WineSelector hideSharedPrefixToggle />',
      '</SteamDialog>'
    ].join('\n')
    expect(() => assertSteamWineSelectorHidesSharedPrefix(specimen)).toThrow(
      /found 2/
    )
  })
})

// ---------------------------------------------------------------------
// Block 5 -- D-01: a Steam install can never reach DownloadDialog
// ---------------------------------------------------------------------

describe('D-01: a Steam install can never reach DownloadDialog', () => {
  const stripped = readIndexStripped()

  it('<SteamDialog appears exactly once, before every other sibling dialog tag', () => {
    expect(countOccurrences(stripped, '<SteamDialog')).toBe(1)
    const steamIndex = stripped.indexOf('<SteamDialog')
    for (const tag of [
      '<ThirdPartyDialog',
      '<ImportDialog',
      '<DownloadDialog',
      '<SideloadDialog'
    ]) {
      const otherIndex = stripped.indexOf(tag)
      expect(otherIndex).toBeGreaterThan(-1)
      expect(steamIndex).toBeLessThan(otherIndex)
    }
  })

  it('zero occurrences of "steam" (case-insensitive) inside the DownloadDialog arm', () => {
    const downloadStart = stripped.indexOf('<DownloadDialog')
    const sideloadStart = stripped.indexOf('<SideloadDialog')
    expect(downloadStart).toBeGreaterThan(-1)
    expect(sideloadStart).toBeGreaterThan(-1)
    expect(sideloadStart).toBeGreaterThan(downloadStart)
    const arm = stripped.slice(downloadStart, sideloadStart)
    expect(/steam/i.test(arm)).toBe(false)
  })

  it('getInstallInfo appears nowhere in this file (D-07)', () => {
    expect(countOccurrences(stripped, 'getInstallInfo')).toBe(0)
  })
})

// ---------------------------------------------------------------------
// Block 6 -- the stripper is load-bearing
// ---------------------------------------------------------------------

describe('the stripper is load-bearing', () => {
  it('strips a block-comment occurrence but keeps a real, executable occurrence', () => {
    const specimen = [
      '/* availablePlatforms.length > 1 was the old guard */',
      "const legacyPlatformRowMode = availablePlatforms.length > 1 ? 'selectable' : 'absent'"
    ].join('\n')
    const stripped = stripSourceComments(specimen)
    expect(countOccurrences(stripped, 'availablePlatforms.length > 1')).toBe(
      1
    )
  })
})

// Finish with a full-suite run in Task 3's own <verify> command
// (`pnpm test:ci`) -- this plan adds files only and edits one existing
// file, so any suite that flips red is a real regression, not an expected
// update.
