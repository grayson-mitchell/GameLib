import type { InstallPlatform } from 'common/types'
import {
  resolveSteamSectionGating,
  SteamSectionGatingInput,
  SteamSectionGatingVerdict
} from '../steamSectionGating'

// `34.13-UI-SPEC.md` "Section-Gating Matrix" (AMENDED, 8 rows, D-21..D-28)
// executed exhaustively. No jsdom in this project (`jest.config.js`), so
// this pure-function proof is the only part of the matrix Jest can verify
// here -- see `steamSectionGating.ts`'s own header for the full rationale.
//
// Four parts, per 34.13-05-PLAN.md Task 1:
//   1. The row table -- 8 labelled descriptors, transcribed cell-by-cell
//      from the UI-SPEC, never borrowed from the implementation.
//   2. The row classifier (`rowOf`) -- maps a combination to its matrix
//      label using only the matrix's own stated conditions.
//   3. The combination sweep -- the full reachable 96-input space.
//   4. `assertMatrix` -- the reusable, collecting-not-first-fail harness
//      Task 3's saboteur suite depends on to name which rows a defect
//      breaks.

type RowLabel = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'

const ROW_LABELS: RowLabel[] = ['1', '2', '3', '4', '5', '6', '7', '8']

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
    expected: () => ({
      platformRow: 'readonly-windows',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: true,
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
    expected: () => ({
      platformRow: 'absent',
      libraryDropdown: false,
      wineSection: false,
      freeSpaceLine: true,
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
  }
}

// --- Part 2: the row classifier --------------------------------------------

function rowOf(input: SteamSectionGatingInput): RowLabel {
  const hasChoice = input.nativeInstallOn && input.libraryCount > 1

  if (input.hostPlatform === 'darwin') {
    if (input.bottleRequired) return '1'
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
// {false, true}; `selectedPlatform` in {'Mac', 'Windows'}.
//
// 48 darwin (2 bottleRequired * 2 nativeInstallOn * 3 libraryCount *
// 2 hasWindowsDepot * 2 selectedPlatform) + 24 win32 + 24 linux = 96.

function buildCombinations(): SteamSectionGatingInput[] {
  const hostPlatforms = ['darwin', 'win32', 'linux']
  const nativeInstallOnValues = [false, true]
  const libraryCounts = [0, 1, 2]
  const hasWindowsDepotValues = [false, true]
  const selectedPlatforms: InstallPlatform[] = ['Mac', 'Windows']

  const combinations: SteamSectionGatingInput[] = []

  for (const hostPlatform of hostPlatforms) {
    const bottleRequiredValues = hostPlatform === 'darwin' ? [true, false] : [false]
    for (const bottleRequired of bottleRequiredValues) {
      for (const nativeInstallOn of nativeInstallOnValues) {
        for (const libraryCount of libraryCounts) {
          for (const hasWindowsDepot of hasWindowsDepotValues) {
            for (const selectedPlatform of selectedPlatforms) {
              combinations.push({
                hostPlatform,
                bottleRequired,
                nativeInstallOn,
                libraryCount,
                hasWindowsDepot,
                selectedPlatform
              })
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
  it('enumerates exactly 96 combinations (48 darwin + 24 win32 + 24 linux)', () => {
    expect(ALL_COMBINATIONS.length).toBe(96)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'darwin').length
    ).toBe(48)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'win32').length
    ).toBe(24)
    expect(
      ALL_COMBINATIONS.filter((c) => c.hostPlatform === 'linux').length
    ).toBe(24)
  })

  it('includes all three of libraryCount 0, 1 and 2', () => {
    const counts = new Set(ALL_COMBINATIONS.map((c) => c.libraryCount))
    expect(counts).toEqual(new Set([0, 1, 2]))
  })
})

describe('Section-Gating Matrix -- per-row proof (34.13-UI-SPEC.md, amended, 8 rows)', () => {
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
})

describe('assertMatrix over the full sweep', () => {
  it('the real implementation passes the whole 96-combination harness in one run', () => {
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
