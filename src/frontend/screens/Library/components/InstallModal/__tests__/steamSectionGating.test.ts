import { readFileSync } from 'fs'
import { join } from 'path'

import type { InstallPlatform } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  resolveSteamSectionGating,
  SteamSectionGatingInput,
  SteamSectionGatingVerdict
} from '../steamSectionGating'

// `34.13-UI-SPEC.md` "Section-Gating Matrix" (AMENDED, 8 rows, D-21..D-28),
// extended by Phase 34.14 (D-01/D-03) with two `'pending'` rows (9/10) that
// distinguish "depot signal not yet resolved" from "resolved, no Windows
// depot" (`'readonly-macos'`) -- 10 rows total, 144 combinations. No jsdom
// in this project (`jest.config.js`), so this pure-function proof is the
// only part of the matrix Jest can verify here -- see `steamSectionGating.ts`'s
// own header for the full rationale.
//
// Four parts, per 34.13-05-PLAN.md Task 1 (extended by 34.14-02-PLAN.md Task 1):
//   1. The row table -- 10 labelled descriptors, transcribed cell-by-cell
//      from the UI-SPEC (rows 1-8) or from 34.14-02-PLAN.md's own row
//      specification (rows 9/10), never borrowed from the implementation.
//   2. The row classifier (`rowOf`) -- maps a combination to its matrix
//      label using only the matrix's own stated conditions.
//   3. The combination sweep -- the full reachable 144-input space.
//   4. `assertMatrix` -- the reusable, collecting-not-first-fail harness
//      Task 3's saboteur suite depends on to name which rows a defect
//      breaks.

type RowLabel = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'

const ROW_LABELS: RowLabel[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10'
]

const FIELD_NAMES: (keyof SteamSectionGatingVerdict)[] = [
  'platformRow',
  'libraryDropdown',
  'wineSection',
  'freeSpaceLine',
  'contentLightNotice',
  'forceWindowsViaBottle'
]

// --- Part 1: the row table -------------------------------------------------
//
// Transcribed from `34.13-UI-SPEC.md` "Section-Gating Matrix" (re-verified
// 2026-08-15 against the live file; no discrepancy found -- see the plan's
// SUMMARY for the confirmation and one adjacent-section correction noted
// there for 34.13-10's benefit, not this module's).
//
// Rows 2/3's `platformRow` is the only depot-dependent cell (UI-SPEC rows
// 2/3 + "Interaction Contract: D-17 Platform-Switch" step 6): a mac-native
// game's platform row is `'selectable'` when it has a Windows depot,
// `'readonly-macos'` otherwise (the Windows `MenuItem` is simply absent).

const ROW_TABLE: Record<
  RowLabel,
  { expected: (input: SteamSectionGatingInput) => SteamSectionGatingVerdict }
> = {
  '1': {
    // Row 1: macOS, bottle-required (non-native/32-bit). No macOS option
    // exists for this game at all (D-03) -- read-only "Windows". No host
    // library (D-02 qualification: destination is the bottle's steamapps).
    // Wine section always visible (D-05/D-14). No free space (D-06/D-08
    // forbid it inside the wine/bottle path). Not content-light (D-20/Q6
    // scopes the notice to rows 5/7 only). Not a forced override (D-17's
    // override only applies to a mac-native game).
    expected: () => ({
      platformRow: 'readonly-windows',
      libraryDropdown: false,
      wineSection: true,
      freeSpaceLine: false,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '2': {
    // Row 2: macOS, mac-native, macOS selected (default), native install
    // OFF or ON-with-<=1-library. Platform row is selectable/readonly-macos
    // per depot (D-17). No dropdown/wine/free-space/notice -- nothing else
    // is relevant while macOS stays selected and there is no library
    // choice to offer.
    expected: (input) => ({
      platformRow: input.hasWindowsDepot ? 'selectable' : 'readonly-macos',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: false,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '3': {
    // Row 3: macOS, mac-native, macOS selected, native install ON with >1
    // library. Same platform row as row 2. Library dropdown + matching
    // free-space line appear (D-08); wine section stays absent (macOS is
    // still the selected platform).
    expected: (input) => ({
      platformRow: input.hasWindowsDepot ? 'selectable' : 'readonly-macos',
      libraryDropdown: true,
      wineSection: false,
      freeSpaceLine: true,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '4': {
    // Row 4: macOS, mac-native, Windows selected (forced via bottle).
    // Reached only from rows 2/3 by flipping the selector, and only when a
    // Windows depot exists (see `rowOf` below). Platform row is
    // selectable, showing Windows as the chosen value. Dropdown disappears
    // -- destination flips to the bottle's steamapps the instant Windows
    // is selected (D-02). Wine section appears. Free space is suppressed
    // (same D-06/D-08 rule as row 1).
    expected: () => ({
      platformRow: 'selectable',
      libraryDropdown: false,
      wineSection: true,
      freeSpaceLine: false,
      contentLightNotice: false,
      forceWindowsViaBottle: true
    })
  },
  '5': {
    // Row 5: Windows host, any Steam game, native OFF or ON-with-<=1.
    // Read-only "Windows" (D-19, only one option ever). No wine off-mac
    // (D-11/D-18). This is the content-light case (D-20/Q6).
    //
    // DISCREPANCY vs 34.13-05-PLAN.md's own <matrix_expectations> table
    // (recorded for the SUMMARY, per that section's own instruction that
    // the UI-SPEC wins on any disagreement): the plan's row-5/row-7 table
    // entries list `freeSpaceLine: true` / `contentLightNotice: false`.
    // That contradicts BOTH the live UI-SPEC table (`34.13-UI-SPEC.md`
    // "Section-Gating Matrix" row 5's "Free-space line" cell is literally
    // "NO") AND the plan's own prose two paragraphs below its table ("`CL`
    // is true for exactly these two rows", "`FS` equals `LD` in every one
    // of the 8 rows" -- `LD` is `false` here). Transcribed here from the
    // live UI-SPEC + the plan's own stated invariants, not from the
    // plan's literal table cells.
    expected: () => ({
      platformRow: 'readonly-windows',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: false,
      contentLightNotice: true,
      forceWindowsViaBottle: false
    })
  },
  '6': {
    // Row 6: Windows host, native ON with >1 library. Same read-only
    // platform row; dropdown + free-space line appear; no longer
    // content-light because a real choice is being offered.
    expected: () => ({
      platformRow: 'readonly-windows',
      libraryDropdown: true,
      wineSection: false,
      freeSpaceLine: true,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '7': {
    // Row 7: Linux host (or any unrecognised host, fail-closed), native
    // OFF or ON-with-<=1. Platform row does not render at all (D-18,
    // unconditional). Content-light case (D-20/Q6).
    //
    // Same DISCREPANCY as row 5 above (see that comment) -- transcribed
    // from the live UI-SPEC row 7's "Free-space line" cell (literally
    // "NO") rather than the plan's own literal `matrix_expectations` cell.
    expected: () => ({
      platformRow: 'absent',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: false,
      contentLightNotice: true,
      forceWindowsViaBottle: false
    })
  },
  '8': {
    // Row 8: Linux host, native ON with >1 library. Platform row still
    // absent; dropdown + free-space line appear; no longer content-light.
    expected: () => ({
      platformRow: 'absent',
      libraryDropdown: true,
      wineSection: false,
      freeSpaceLine: true,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '9': {
    // Row 9 (34.14 D-01/D-03): macOS, mac-native, depot signal NOT resolved
    // yet, no library choice. Platform row is `'pending'` -- DISTINCT from
    // `'readonly-macos'` by construction; collapsing the two is the exact
    // defect Phase 34.14 exists to end. No wine section (pending is not
    // selectable), no dropdown/free-space (no choice), not content-light
    // (Q6 scopes that notice to non-mac rows only, unchanged by this
    // phase), not a forced override.
    expected: () => ({
      platformRow: 'pending',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: false,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  },
  '10': {
    // Row 10 (34.14 D-01/D-03): same as Row 9, but WITH a library choice
    // (`nativeInstallOn && libraryCount > 1`). RESEARCH.md's Assumption A3
    // proposed a single Row 9 on the premise that "D-01 suppresses the
    // library dropdown while pending" -- that suppression lives in
    // `applyEligibilityPending`, a POST-processing step one layer above
    // this pure function. The matrix proves the pure function, which still
    // emits the dropdown per `hasChoice` regardless of `platformRow`.
    // Splitting by `hasChoice` also keeps this expectation closure literal
    // rather than re-deriving the implementation's own
    // `nativeInstallOn && libraryCount > 1` formula inside the expectation
    // table, which this file's header explicitly forbids.
    expected: () => ({
      platformRow: 'pending',
      libraryDropdown: true,
      wineSection: false,
      freeSpaceLine: true,
      contentLightNotice: false,
      forceWindowsViaBottle: false
    })
  }
}

// --- Part 2: the row classifier --------------------------------------------

function rowOf(input: SteamSectionGatingInput): RowLabel {
  const hasChoice = input.nativeInstallOn && input.libraryCount > 1

  if (input.hostPlatform === 'darwin') {
    if (input.bottleRequired) return '1'
    // 34.14 D-01/D-03: the depot signal must be resolved (either captured
    // at seed time or the eligibility probe has terminally settled) before
    // the depot question is even reachable -- this mirrors the read-order
    // seam `resolveSteamSectionGating` itself enforces (its own
    // `!input.depotSignalResolved` branch sits BEFORE the `hasWindowsDepot`
    // check). Rows 9/10 split on `hasChoice`, same as rows 2/3.
    if (!input.depotSignalResolved) {
      return hasChoice ? '10' : '9'
    }
    // Row 4's guard includes `hasWindowsDepot`: a game with no Windows
    // depot has no Windows `MenuItem` to select at all (UI-SPEC
    // "Interaction Contract" step 6), so a `selectedPlatform: 'Windows'`
    // on such a game is a STALE value the resolver must ignore (its own
    // `effectivePlatform` normalisation, Task 2 step 5) -- classifying it
    // as row 4 here would encode that bug into the expectations rather
    // than catch it.
    if (input.hasWindowsDepot && input.selectedPlatform === 'Windows') {
      return '4'
    }
    return hasChoice ? '3' : '2'
  }

  if (input.hostPlatform === 'win32') {
    return hasChoice ? '6' : '5'
  }

  // Linux-family bucket (includes ContextProvider's 'unknown' fallback,
  // covered separately by the defensive-normalisation block -- not part of
  // this 96-combination sweep, which only varies hostPlatform across
  // 'darwin' | 'win32' | 'linux').
  return hasChoice ? '8' : '7'
}

// --- Part 3: the combination sweep -----------------------------------------
//
// The full reachable input space: `hostPlatform` in {darwin, win32, linux};
// `bottleRequired` in {true, false} ON DARWIN ONLY (`isBottleEligible()`
// returns false for `!isMac`, `games.ts:1329` -- pinned `false` off-mac
// here, the defensive off-mac-true case is covered separately in Task 3);
// `nativeInstallOn` in {false, true}; `libraryCount` in {0, 1, 2} (0 and 1
// both exercise the "<=1" cells and are NOT interchangeable -- a `>= 1`
// off-by-one is caught only by the `1` fixture); `hasWindowsDepot` in
// {false, true}; `depotSignalResolved` (34.14 D-01/D-03) in {false, true};
// `selectedPlatform` in {'Mac', 'Windows'}.
//
// 34.14 excludes the meaningless `(hasWindowsDepot: true,
// depotSignalResolved: false)` pair from the sweep -- a depot flag can only
// have been written by a fetch that also stamped the captured flag (D-03).
// That combination is covered instead by a dedicated spec in the
// 'defensive normalisation' describe block below, per this plan's decision
// (2). Per host, the surviving (hasWindowsDepot, depotSignalResolved) pairs
// are (false,false), (false,true), (true,true) -- 3 of the 4 possible pairs.
//
// darwin: 2 bottleRequired * 2 nativeInstallOn * 3 libraryCount *
//   3 (depot x resolved pairs) * 2 selectedPlatform = 72.
// win32: 2 nativeInstallOn * 3 libraryCount * 3 * 2 selectedPlatform = 36.
// linux: 2 nativeInstallOn * 3 libraryCount * 3 * 2 selectedPlatform = 36.
// Total = 72 + 36 + 36 = 144.

function buildCombinations(): SteamSectionGatingInput[] {
  const hostPlatforms = ['darwin', 'win32', 'linux']
  const nativeInstallOnValues = [false, true]
  const libraryCounts = [0, 1, 2]
  const hasWindowsDepotValues = [false, true]
  const depotSignalResolvedValues = [false, true]
  const selectedPlatforms: InstallPlatform[] = ['Mac', 'Windows']

  const combinations: SteamSectionGatingInput[] = []

  for (const hostPlatform of hostPlatforms) {
    const bottleRequiredValues =
      hostPlatform === 'darwin' ? [true, false] : [false]
    for (const bottleRequired of bottleRequiredValues) {
      for (const nativeInstallOn of nativeInstallOnValues) {
        for (const libraryCount of libraryCounts) {
          for (const hasWindowsDepot of hasWindowsDepotValues) {
            for (const depotSignalResolved of depotSignalResolvedValues) {
              // The meaningless pair (D-03): a depot flag can only have
              // been written by a fetch that also stamped the captured
              // flag. Excluded from the sweep, covered separately below.
              if (hasWindowsDepot && !depotSignalResolved) {
                continue
              }
              for (const selectedPlatform of selectedPlatforms) {
                combinations.push({
                  hostPlatform,
                  bottleRequired,
                  nativeInstallOn,
                  libraryCount,
                  hasWindowsDepot,
                  depotSignalResolved,
                  selectedPlatform
                })
              }
            }
          }
        }
      }
    }
  }

  return combinations
}

const ALL_COMBINATIONS = buildCombinations()

// --- Part 4: assertMatrix, the reusable harness -----------------------------
//
// Runs every combination through the supplied gating function, compares
// each result to the row table's expectation, COLLECTS every mismatch
// rather than failing on the first one, and throws a single Error naming
// every distinct failing row label plus one sample offending input/field.
// Collecting-then-throwing is what lets Task 3's saboteur suite assert
// exactly which rows a given defect breaks.

interface MatrixFailure {
  row: RowLabel
  field: keyof SteamSectionGatingVerdict
  input: SteamSectionGatingInput
  expectedValue: unknown
  actualValue: unknown
}

function assertMatrix(
  fn: (input: SteamSectionGatingInput) => SteamSectionGatingVerdict
): void {
  const failures: MatrixFailure[] = []

  for (const input of ALL_COMBINATIONS) {
    const row = rowOf(input)
    const expected = ROW_TABLE[row].expected(input)
    const actual = fn(input)

    for (const field of FIELD_NAMES) {
      if (actual[field] !== expected[field]) {
        failures.push({
          row,
          field,
          input,
          expectedValue: expected[field],
          actualValue: actual[field]
        })
      }
    }
  }

  if (failures.length > 0) {
    const distinctRows = Array.from(
      new Set(failures.map((f) => `Row ${f.row}`))
    ).sort()
    const sample = failures[0]
    throw new Error(
      `Matrix harness found ${failures.length} mismatch(es) across ` +
        `${distinctRows.join(', ')}. Sample: Row ${sample.row}, field ` +
        `"${sample.field}", input=${JSON.stringify(sample.input)}, ` +
        `expected=${JSON.stringify(sample.expectedValue)}, ` +
        `actual=${JSON.stringify(sample.actualValue)}`
    )
  }
}

// --- Assertions --------------------------------------------------------

describe('combination sweep construction', () => {
  it('enumerates exactly 144 combinations (72 darwin + 36 win32 + 36 linux)', () => {
    expect(ALL_COMBINATIONS.length).toBe(144)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'darwin').length
    ).toBe(72)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'win32').length
    ).toBe(36)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'linux').length
    ).toBe(36)
  })

  it('includes all three of libraryCount 0, 1 and 2', () => {
    const counts = new Set(ALL_COMBINATIONS.map((c) => c.libraryCount))
    expect(counts).toEqual(new Set([0, 1, 2]))
  })

  it('34.14 D-03: the generator emits ZERO combinations where hasWindowsDepot is true and depotSignalResolved is false -- the meaningless pair is excluded from the sweep, not merely unasserted', () => {
    expect(
      ALL_COMBINATIONS.filter(
        (c) => c.hasWindowsDepot && !c.depotSignalResolved
      ).length
    ).toBe(0)
  })
})

describe('Section-Gating Matrix -- per-row proof (34.13-UI-SPEC.md amended 8 rows + 34.14 pending rows 9/10, 10 rows total)', () => {
  function runRow(label: RowLabel) {
    const slice = ALL_COMBINATIONS.filter((input) => rowOf(input) === label)
    // A row with zero matching combinations would make its own `it()`
    // vacuously pass -- fail loudly instead so the classifier itself stays
    // honest.
    expect(slice.length).toBeGreaterThan(0)
    for (const input of slice) {
      const expected = ROW_TABLE[label].expected(input)
      expect(resolveSteamSectionGating(input)).toEqual(expected)
    }
  }

  it('Row 1', () => runRow('1'))
  it('Row 2', () => runRow('2'))
  it('Row 3', () => runRow('3'))
  it('Row 4', () => runRow('4'))
  it('Row 5', () => runRow('5'))
  it('Row 6', () => runRow('6'))
  it('Row 7', () => runRow('7'))
  it('Row 8', () => runRow('8'))
  it('Row 9', () => runRow('9'))
  it('Row 10', () => runRow('10'))
})

describe('assertMatrix over the full sweep', () => {
  it('the real implementation passes the whole 144-combination harness in one run', () => {
    expect(() => assertMatrix(resolveSteamSectionGating)).not.toThrow()
  })
})

describe("Phase 21 D-09 zero-friction is NOT this module's concern", () => {
  // D-22/D-26: zero-friction is now preserved by 34.13-08's quick-install
  // path (D-23), not by a predicate in this module. This structural guard
  // replaces the retired plan draft's nine-NO-row "must never auto-open"
  // block: a future re-introduction of an `opens`-shaped key must fail
  // loudly here rather than quietly re-creating an auto-open trigger.
  it('SteamSectionGatingVerdict carries exactly the six named fields, never an opens-shaped key', () => {
    const verdict = resolveSteamSectionGating({
      hostPlatform: 'darwin',
      bottleRequired: false,
      nativeInstallOn: false,
      libraryCount: 0,
      hasWindowsDepot: false,
      depotSignalResolved: true,
      selectedPlatform: 'Mac'
    })
    expect(Object.keys(verdict).sort()).toEqual([
      'contentLightNotice',
      'forceWindowsViaBottle',
      'freeSpaceLine',
      'libraryDropdown',
      'platformRow',
      'wineSection'
    ])
  })
})

// ---------------------------------------------------------------------
// Task 3, Block 1 -- the matrix harness rejects known-bad gating functions
// ---------------------------------------------------------------------
//
// Permanent, in-CI answer to "an assertion that cannot fail against a
// deliberately-broken gating function is not evidence" (34.13-VALIDATION.md
// risk 4, "one click-through != coverage" -- pinned here at the unit level).
// Each saboteur delegates to the real `resolveSteamSectionGating` and then
// introduces ONE specific, named defect. Asserting a bare `.toThrow()`
// would not be sufficient -- a saboteur that breaks the WRONG rows would
// still pass it -- so every assertion below names the exact row labels the
// thrown message must contain, and only those.

/**
 * Runs `assertMatrix(saboteur)`, asserts it throws, and asserts the thrown
 * message names EXACTLY `expectedRows` -- no fewer, no more. This is what
 * makes each saboteur test a proof that the harness bites on the SPECIFIC
 * rows the saboteur is documented to break, not merely that it bites
 * somewhere.
 */
function expectSaboteurBreaksExactlyRows(
  saboteur: (input: SteamSectionGatingInput) => SteamSectionGatingVerdict,
  expectedRows: RowLabel[]
): void {
  let thrown: Error | undefined
  try {
    assertMatrix(saboteur)
  } catch (e) {
    thrown = e as Error
  }
  expect(thrown).toBeDefined()
  // 34.14 landmine C: the prior matcher used a SINGLE digit class, which
  // captured "Row 10" as "Row 1", silently mis-reporting which rows a
  // saboteur broke now that a two-digit row exists. Fixed below to match
  // one-or-more digits.
  const mentionedRows = Array.from(
    new Set((thrown as Error).message.match(/Row \d+/g) ?? [])
  ).sort()
  const expected = expectedRows.map((row) => `Row ${row}`).sort()
  expect(mentionedRows).toEqual(expected)
}

describe('the matrix harness rejects known-bad gating functions', () => {
  it('libraryDropdownIgnoresNativeInstall: drops the nativeInstallOn conjunct from hasChoice -- breaks Row 2, Row 5, Row 7, Row 9', () => {
    function libraryDropdownIgnoresNativeInstall(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      // DEFECT: libraryCount > 1 alone shows a dropdown, ignoring whether
      // native install is even ON.
      const sabotagedHasChoice = input.libraryCount > 1
      const libraryDropdown = !real.wineSection && sabotagedHasChoice
      return { ...real, libraryDropdown }
    }
    // 34.14: Row 9 (the darwin pending "no choice" row) also breaks -- its
    // "no dropdown" cell can be produced by nativeInstallOn=false with
    // libraryCount>1, which this defect wrongly shows a dropdown for, same
    // as Rows 2/5/7. Row 10 (pending "has choice") is unaffected -- its
    // dropdown is already true.
    expectSaboteurBreaksExactlyRows(libraryDropdownIgnoresNativeInstall, [
      '2',
      '5',
      '7',
      '9'
    ])
  })

  it('libraryDropdownOffByOne: uses libraryCount >= 1 instead of > 1 -- breaks Row 2, Row 5, Row 7, Row 9', () => {
    function libraryDropdownOffByOne(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      // DEFECT: >= 1 instead of > 1 -- a single library already counts as
      // "a choice."
      const sabotagedHasChoice =
        input.nativeInstallOn && input.libraryCount >= 1
      const libraryDropdown = !real.wineSection && sabotagedHasChoice
      return { ...real, libraryDropdown }
    }
    // 34.14: Row 9 also breaks, same reasoning as
    // libraryDropdownIgnoresNativeInstall above -- a libraryCount of 1 with
    // native install ON wrongly shows a dropdown on the pending "no choice"
    // row.
    expectSaboteurBreaksExactlyRows(libraryDropdownOffByOne, [
      '2',
      '5',
      '7',
      '9'
    ])
  })

  it('platformRowAlwaysReadonlyWindows: the un-amended D-03, before D-17/D-18/D-19 -- breaks Row 2, Row 3, Row 4, Row 7, Row 8, Row 9, Row 10', () => {
    function platformRowAlwaysReadonlyWindows(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      return { ...real, platformRow: 'readonly-windows' }
    }
    // 34.14: Rows 9/10 also break -- their real platformRow is `'pending'`,
    // which (like `'selectable'`/`'readonly-macos'`/`'absent'` on the other
    // broken rows) differs from the sabotaged constant `'readonly-windows'`.
    expectSaboteurBreaksExactlyRows(platformRowAlwaysReadonlyWindows, [
      '2',
      '3',
      '4',
      '7',
      '8',
      '9',
      '10'
    ])
  })

  // 34.14: unchanged -- this defect's guard (`isLinuxFamily`) never matches
  // a darwin host, so it cannot touch the new pending rows (9/10), both of
  // which are darwin-only.
  it('linuxPlatformRowRenders: returns readonly-windows on the Linux-family bucket -- breaks Row 7, Row 8', () => {
    function linuxPlatformRowRenders(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      const isLinuxFamily =
        input.hostPlatform !== 'darwin' && input.hostPlatform !== 'win32'
      if (isLinuxFamily) {
        return { ...real, platformRow: 'readonly-windows' }
      }
      return real
    }
    expectSaboteurBreaksExactlyRows(linuxPlatformRowRenders, ['7', '8'])
  })

  // 34.14 REVISED FINDING (superseding the original "unchanged" call): this
  // saboteur's OWN local `effectivePlatform` re-derivation is a two-armed
  // if/else ('selectable' -> selectedPlatform, 'readonly-macos' -> 'Mac',
  // else -> 'Windows') written before `'pending'` existed. It does not know
  // about `'pending'`, so it falls into the `else -> 'Windows'` arm for
  // rows 9/10, which combined with the dropped `isMac &&` guard makes
  // `wineSection` wrongly `true` there too -- independent of, and in
  // addition to, the isMac-guard defect on the non-mac rows (5/6/7/8). Rows
  // 9/10 therefore also break, caught only by re-running this saboteur
  // AFTER Task 2 landed 'pending' (not from static reasoning alone).
  it('windowsHostGetsWineSection: drops the isMac guard from wineSection -- breaks Row 5, Row 6, Row 7, Row 8, Row 9, Row 10', () => {
    function windowsHostGetsWineSection(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      const effectivePlatform: InstallPlatform =
        real.platformRow === 'selectable'
          ? input.selectedPlatform
          : real.platformRow === 'readonly-macos'
            ? 'Mac'
            : 'Windows'
      const effectiveBottleRequired =
        input.hostPlatform === 'darwin' && input.bottleRequired
      // DEFECT: the real formula is
      // `isMac && (effectiveBottleRequired || effectivePlatform === 'Windows')`
      // -- the `isMac &&` guard is dropped here.
      const wineSection =
        effectiveBottleRequired || effectivePlatform === 'Windows'
      return { ...real, wineSection }
    }
    expectSaboteurBreaksExactlyRows(windowsHostGetsWineSection, [
      '5',
      '6',
      '7',
      '8',
      '9',
      '10'
    ])
  })

  it('selectableWithoutWindowsDepot: offers selectable when hasWindowsDepot is false -- breaks Row 2, Row 3, Row 9, Row 10', () => {
    function selectableWithoutWindowsDepot(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      // DEFECT: every non-bottle-required mac-native combination becomes
      // selectable, even with no Windows depot (the Windows MenuItem must
      // be ABSENT, not present-but-disabled -- 34.13-01's `=== true`
      // contract). This defect's condition does not check
      // `depotSignalResolved` at all, so it also wrongly forces the
      // pending rows (9/10) to `'selectable'` -- exactly the D-03
      // regression this phase exists to prevent.
      if (input.hostPlatform === 'darwin' && !input.bottleRequired) {
        return { ...real, platformRow: 'selectable' }
      }
      return real
    }
    expectSaboteurBreaksExactlyRows(selectableWithoutWindowsDepot, [
      '2',
      '3',
      '9',
      '10'
    ])
  })

  // 34.14: unchanged -- rows 9/10 always have `wineSection: false` (pending
  // joins the readonly-macos arm, never the wine branch), so dropping the
  // `!wineSection` term has no effect on them; only wine-carrying rows
  // (1/4) are affected.
  it('libraryDropdownDuringBottleInstall: drops the !wineSection term -- breaks Row 1, Row 4', () => {
    function libraryDropdownDuringBottleInstall(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      // DEFECT: the destination is the bottle's steamapps whenever
      // wineSection is true (D-02), but this drops that qualification --
      // a host-library dropdown would lie about where the game goes.
      const hasChoice = input.nativeInstallOn && input.libraryCount > 1
      const libraryDropdown = hasChoice
      return { ...real, libraryDropdown }
    }
    expectSaboteurBreaksExactlyRows(libraryDropdownDuringBottleInstall, [
      '1',
      '4'
    ])
  })

  it('freeSpaceAlwaysShown: returns freeSpaceLine true unconditionally -- breaks Row 1, Row 2, Row 4, Row 5, Row 7, Row 9', () => {
    function freeSpaceAlwaysShown(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      return { ...real, freeSpaceLine: true }
    }
    // 34.14: Row 9 also breaks -- its real freeSpaceLine is false (no
    // library choice). Row 10 is unaffected -- its real value is already
    // true.
    expectSaboteurBreaksExactlyRows(freeSpaceAlwaysShown, [
      '1',
      '2',
      '4',
      '5',
      '7',
      '9'
    ])
  })

  it('contentLightNoticeEverywhere: returns contentLightNotice true unconditionally -- breaks Row 1, Row 2, Row 3, Row 4, Row 6, Row 8, Row 9, Row 10', () => {
    function contentLightNoticeEverywhere(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      return { ...real, contentLightNotice: true }
    }
    // 34.14: Rows 9/10 also break -- their real contentLightNotice is false
    // (Q6 scopes the notice to non-mac rows; rows 9/10 are darwin).
    expectSaboteurBreaksExactlyRows(contentLightNoticeEverywhere, [
      '1',
      '2',
      '3',
      '4',
      '6',
      '8',
      '9',
      '10'
    ])
  })

  it('contentLightNoticeOnMac: extends the notice to a macOS row with no sections -- breaks Row 2, Row 9', () => {
    function contentLightNoticeOnMac(
      input: SteamSectionGatingInput
    ): SteamSectionGatingVerdict {
      const real = resolveSteamSectionGating(input)
      // DEFECT: "surely a mac row with nothing else showing is content-
      // light too" -- it is not. Row 2 always carries a live, actionable
      // platform selector (Q6 deliberately scopes the notice to non-mac
      // rows only). Targeted at exactly Row 2's shape: mac host, no wine
      // section, no library dropdown. 34.14: Row 9 shares that exact shape
      // (darwin, no wine, no dropdown) and also breaks; Row 10 has
      // `libraryDropdown: true` so the condition never fires there.
      if (
        input.hostPlatform === 'darwin' &&
        !real.wineSection &&
        !real.libraryDropdown
      ) {
        return { ...real, contentLightNotice: true }
      }
      return real
    }
    expectSaboteurBreaksExactlyRows(contentLightNoticeOnMac, ['2', '9'])
  })
})

// ---------------------------------------------------------------------
// Task 3, Block 2 -- row coverage
// ---------------------------------------------------------------------

describe('row coverage', () => {
  it('the 144-combination sweep classifies to exactly the 10 expected labels, each hit at least once', () => {
    const distinctLabels = Array.from(
      new Set(ALL_COMBINATIONS.map((input) => rowOf(input)))
    ).sort()
    expect(distinctLabels).toEqual([...ROW_LABELS].sort())
    for (const label of ROW_LABELS) {
      expect(ALL_COMBINATIONS.some((input) => rowOf(input) === label)).toBe(
        true
      )
    }
  })

  it('rowOf never produces a letter-suffixed label or a label above 10 -- the concrete guard against re-importing the retired 16-row table', () => {
    for (const input of ALL_COMBINATIONS) {
      const label = rowOf(input)
      expect(ROW_TABLE[label]).toBeDefined()
      expect(/^\d+[a-z]$/.test(label)).toBe(false)
      expect(Number(label)).toBeLessThanOrEqual(10)
    }
  })
})

// ---------------------------------------------------------------------
// Task 3, Block 3 -- defensive normalisation (cases the matrix does not
// enumerate)
// ---------------------------------------------------------------------

describe('defensive normalisation (cases the matrix does not enumerate)', () => {
  it('bottleRequired true off-mac never produces a wine surface (isBottleEligible() is mac-only, games.ts:1329) -- structurally unreachable today, not a matrix row', () => {
    for (const hostPlatform of ['win32', 'linux']) {
      const verdict = resolveSteamSectionGating({
        hostPlatform,
        bottleRequired: true,
        nativeInstallOn: false,
        libraryCount: 0,
        hasWindowsDepot: false,
        depotSignalResolved: true,
        selectedPlatform: 'Windows'
      })
      expect(verdict.wineSection).toBe(false)
      expect(verdict.forceWindowsViaBottle).toBe(false)
    }
  })

  it("hostPlatform 'unknown' behaves as the Linux-family bucket -- fail-closed per D-18, a discretion call the UI-SPEC does not itself enumerate", () => {
    const contentLightCase = resolveSteamSectionGating({
      hostPlatform: 'unknown',
      bottleRequired: false,
      nativeInstallOn: false,
      libraryCount: 0,
      hasWindowsDepot: false,
      depotSignalResolved: true,
      selectedPlatform: 'Mac'
    })
    expect(contentLightCase.platformRow).toBe('absent')
    expect(contentLightCase.contentLightNotice).toBe(true)

    const choiceCase = resolveSteamSectionGating({
      hostPlatform: 'unknown',
      bottleRequired: false,
      nativeInstallOn: true,
      libraryCount: 2,
      hasWindowsDepot: false,
      depotSignalResolved: true,
      selectedPlatform: 'Mac'
    })
    expect(choiceCase.platformRow).toBe('absent')
    expect(choiceCase.libraryDropdown).toBe(true)
    expect(choiceCase.contentLightNotice).toBe(false)
  })

  it("34.14 D-03: a stale/meaningless depot flag (hasWindowsDepot: true, depotSignalResolved: false) can never unlock the Windows option -- this combination is EXCLUDED from the 144-combination sweep (it cannot occur in practice) but must still fail closed to 'pending', never 'selectable'", () => {
    const verdict = resolveSteamSectionGating({
      hostPlatform: 'darwin',
      bottleRequired: false,
      nativeInstallOn: false,
      libraryCount: 0,
      hasWindowsDepot: true,
      depotSignalResolved: false,
      selectedPlatform: 'Mac'
    })
    expect(verdict.platformRow).toBe('pending')
    expect(verdict.platformRow).not.toBe('selectable')
  })

  it('selectedPlatform is invariant on every non-selectable row -- proves the effectivePlatform normalisation actually holds', () => {
    for (const input of ALL_COMBINATIONS) {
      const macVariant = resolveSteamSectionGating({
        ...input,
        selectedPlatform: 'Mac'
      })
      if (macVariant.platformRow === 'selectable') {
        // Only a selectable row may legitimately respond to
        // selectedPlatform -- that is rows 2/3 <-> 4, exercised by the
        // per-row proof above, not this invariance check.
        continue
      }
      const windowsVariant = resolveSteamSectionGating({
        ...input,
        selectedPlatform: 'Windows'
      })
      expect(windowsVariant).toEqual(macVariant)
    }
  })

  it('NaN and negative libraryCount fail closed toward "no choice offered" (NaN > 1 evaluates false, the conservative direction)', () => {
    for (const libraryCount of [Number.NaN, -1]) {
      const verdict = resolveSteamSectionGating({
        hostPlatform: 'win32',
        bottleRequired: false,
        nativeInstallOn: true,
        libraryCount,
        hasWindowsDepot: false,
        depotSignalResolved: true,
        selectedPlatform: 'Windows'
      })
      expect(verdict.libraryDropdown).toBe(false)
      expect(verdict.freeSpaceLine).toBe(false)
      expect(verdict.contentLightNotice).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------
// Task 3, Block 4 -- the two source gates (D-09, D-22/D-26)
// ---------------------------------------------------------------------
//
// Both gates run over `stripSourceComments`-stripped source: the module's
// own header comment legitimately NAMES `alwaysShowOn`, `opens` and
// `is_mac_native` while explaining that they are retired or arrive as
// pre-computed inputs, so an UNSTRIPPED assertion would fail on the
// module's own explanation of why they are absent -- the
// self-invalidating-header defect class this repo has already ledgered.
// The stripper is proven non-vacuous first, against an inline specimen,
// before either gate trusts it.

const MODULE_PATH = join(__dirname, '..', 'steamSectionGating.ts')

function readModuleStripped(): string {
  return stripSourceComments(readFileSync(MODULE_PATH, 'utf8'))
}

describe('stripSourceComments is proven non-vacuous before either source gate trusts it', () => {
  it('removes a banned identifier written inside a comment, keeps one written outside', () => {
    const specimen = [
      '// mentions alwaysShowOn only to explain it is retired',
      'const opensCount = 1'
    ].join('\n')
    const stripped = stripSourceComments(specimen)
    expect(stripped).not.toMatch(/alwaysShowOn/)
    expect(stripped).toMatch(/opensCount/)
  })
})

describe('D-09: no eligibility re-derivation in the renderer', () => {
  it('is_mac_native, mac_arch, platformsCaptured, steamPlatformsCaptured appear nowhere in stripped source', () => {
    const stripped = readModuleStripped()
    for (const banned of [
      'is_mac_native',
      'mac_arch',
      'platformsCaptured',
      'steamPlatformsCaptured'
    ]) {
      expect(stripped).not.toMatch(new RegExp(banned))
    }
  })
})

describe('D-22/D-26: the retired trigger model is structurally absent', () => {
  // Permanent guard against a future contributor re-adding an auto-open
  // predicate here because a consumer "needed to know whether to render",
  // silently resurrecting the auto-open triggers D-22 retired.
  it('alwaysShow, alwaysShowOn, steamInstallFormOpens, SteamInstallTriggerInput and a bare `opens` identifier appear nowhere in stripped source', () => {
    const stripped = readModuleStripped()
    for (const banned of [
      'alwaysShow',
      'alwaysShowOn',
      'steamInstallFormOpens',
      'SteamInstallTriggerInput'
    ]) {
      expect(stripped).not.toMatch(new RegExp(banned))
    }
    expect(stripped).not.toMatch(/\bopens\b/)
  })
})
