import {
  hasSteamWindowsDepot,
  hasSteamMacDepot,
  selectSteamPlatformOptions,
  readonlyPlatformValue,
  hasSteamDepotSignalCaptured,
  resolveDepotAvailability,
  ResolveDepotAvailabilityInput
} from '../steamPlatformRow'
import type { SteamPlatformRowMode } from '../steamSectionGating'
import type { InstallPlatform } from 'common/types'

// Phase 34.13, Plan 12 -- exhaustive unit coverage for the D-17 depot gate
// and the omit-not-disable platform-row option list. This spec was run
// BEFORE `steamPlatformRow.ts` existed and failed while resolving the
// module, naming `hasSteamWindowsDepot`, `selectSteamPlatformOptions` and
// `readonlyPlatformValue` -- see the SUMMARY for the verbatim RED output.

// --- Fixtures ---------------------------------------------------------
//
// Mirrors `index.tsx:65-90`'s UNFILTERED `platforms` array: four entries,
// values 'linux' / 'Mac' / 'Windows' / 'Browser' in that order. `Windows`
// is deliberately `available: true` unconditionally (matching the real
// array) and `Mac` is deliberately `available: false` in this variant, so
// a test that accidentally filters on `available` -- instead of reading
// every entry regardless of that flag -- is distinguishable from one that
// does not.
interface PlatformFixture {
  name: string
  available: boolean
  value: InstallPlatform
}

const platforms: PlatformFixture[] = [
  { name: 'Linux', available: false, value: 'linux' },
  { name: 'macOS', available: false, value: 'Mac' },
  { name: 'Windows', available: true, value: 'Windows' },
  { name: 'Browser', available: false, value: 'Browser' }
]

const macEntry = platforms[1]
const windowsEntry = platforms[2]

const ALL_MODES: SteamPlatformRowMode[] = [
  'absent',
  'readonly-windows',
  'readonly-macos',
  'selectable',
  'pending'
]

describe('hasSteamWindowsDepot -- D-17 depot gate', () => {
  it('is_windows_native true -> true', () => {
    expect(hasSteamWindowsDepot({ is_windows_native: true })).toBe(true)
  })

  it('is_windows_native false -> false', () => {
    expect(hasSteamWindowsDepot({ is_windows_native: false })).toBe(false)
  })

  it('is_windows_native absent ({}) -> false -- the "never captured" case, not a redundant duplicate of false', () => {
    expect(hasSteamWindowsDepot({})).toBe(false)
  })

  it('gameInfo undefined -> false', () => {
    expect(hasSteamWindowsDepot(undefined)).toBe(false)
  })

  it('gameInfo null -> false', () => {
    expect(hasSteamWindowsDepot(null)).toBe(false)
  })
})

describe('selectSteamPlatformOptions -- omission, never disablement', () => {
  // The full cross-product: all four SteamPlatformRowMode members x
  // hasWindowsDepot both ways -- eight cases, the whole space.

  it("'absent' with hasWindowsDepot false returns []", () => {
    expect(selectSteamPlatformOptions('absent', platforms, false)).toEqual([])
  })

  it("'absent' with hasWindowsDepot true returns [] -- D-18's Linux row and the legacy one-platform case", () => {
    expect(selectSteamPlatformOptions('absent', platforms, true)).toEqual([])
  })

  it("'readonly-windows' with hasWindowsDepot false returns exactly one entry", () => {
    const result = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      false
    )
    expect(result).toEqual([windowsEntry])
  })

  it("'readonly-windows' with hasWindowsDepot true is invariant to the depot flag", () => {
    const withFalse = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      false
    )
    const withTrue = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      true
    )
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([windowsEntry])
  })

  it("'readonly-macos' with hasWindowsDepot false returns exactly one entry", () => {
    const result = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      false
    )
    expect(result).toEqual([macEntry])
  })

  it("'readonly-macos' with hasWindowsDepot true is invariant to the depot flag -- the depot flag can never leak into a row the user cannot change", () => {
    const withFalse = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      false
    )
    const withTrue = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      true
    )
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([macEntry])
  })

  it("'selectable' with hasWindowsDepot false returns no entry whose value is 'Windows'", () => {
    const result = selectSteamPlatformOptions('selectable', platforms, false)
    expect(result.some((p) => p.value === 'Windows')).toBe(false)
    expect(result).toHaveLength(1)
  })

  it("'selectable' with hasWindowsDepot true returns ['Mac', 'Windows'] in that order -- macOS first, matching UI-SPEC row 5's 'macOS (default, pre-selected)'", () => {
    const result = selectSteamPlatformOptions('selectable', platforms, true)
    expect(result.map((p) => p.value)).toEqual(['Mac', 'Windows'])
  })

  it("'pending' with hasWindowsDepot false returns exactly the macOS entry", () => {
    const result = selectSteamPlatformOptions('pending', platforms, false)
    expect(result).toEqual([macEntry])
  })

  it("'pending' with hasWindowsDepot true is invariant to the depot flag -- the depot flag can never leak into a row the user cannot change", () => {
    const withFalse = selectSteamPlatformOptions('pending', platforms, false)
    const withTrue = selectSteamPlatformOptions('pending', platforms, true)
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([macEntry])
  })

  it('every returned entry is a member (by reference) of the supplied platforms array -- the function can never fabricate an option', () => {
    for (const mode of ALL_MODES) {
      for (const hasWindowsDepot of [false, true]) {
        const result = selectSteamPlatformOptions(
          mode,
          platforms,
          hasWindowsDepot
        )
        for (const entry of result) {
          expect(platforms).toContain(entry)
        }
      }
    }
  })
})

describe('readonlyPlatformValue', () => {
  it("'readonly-windows' -> 'Windows'", () => {
    expect(readonlyPlatformValue('readonly-windows')).toBe('Windows')
  })

  it("'readonly-macos' -> 'Mac'", () => {
    expect(readonlyPlatformValue('readonly-macos')).toBe('Mac')
  })

  it("'absent' -> undefined", () => {
    expect(readonlyPlatformValue('absent')).toBeUndefined()
  })

  it("'selectable' -> undefined", () => {
    expect(readonlyPlatformValue('selectable')).toBeUndefined()
  })

  it("'pending' -> 'Mac'", () => {
    expect(readonlyPlatformValue('pending')).toBe('Mac')
  })
})

describe('the D-17 gates are not vacuous', () => {
  // Three saboteurs, each with the real function's exact signature, each
  // asserted to FAIL a specific expectation the real implementation
  // satisfies -- a concrete wrong value, not merely "differs from the real
  // implementation".

  it('treatsAbsentAsAvailable returns true for both {} and undefined where hasSteamWindowsDepot returns false -- the single most important saboteur here: `!!gameInfo?.is_windows_native` and `=== true` AGREE on every inhabitant of `boolean | undefined`, so a truthiness saboteur would prove nothing. The real defect 34.13-01 names is treating "never captured" as available, and this is its exact shape.', () => {
    const treatsAbsentAsAvailable = (
      gameInfo: { is_windows_native?: boolean } | null | undefined
    ): boolean => gameInfo?.is_windows_native !== false

    expect(treatsAbsentAsAvailable({})).toBe(true)
    expect(hasSteamWindowsDepot({})).toBe(false)

    expect(treatsAbsentAsAvailable(undefined)).toBe(true)
    expect(hasSteamWindowsDepot(undefined)).toBe(false)
  })

  it("includesWindowsRegardless ignores hasWindowsDepot in the 'selectable' branch and returns a 'Windows' entry for ('selectable', platforms, false)", () => {
    function includesWindowsRegardless<
      T extends { value: InstallPlatform }
    >(mode: SteamPlatformRowMode, ps: T[]): T[] {
      if (mode !== 'selectable') return []
      const mac = ps.find((p) => p.value === 'Mac')
      const win = ps.find((p) => p.value === 'Windows')
      return [mac, win].filter((p): p is T => Boolean(p))
    }

    const sabotaged = includesWindowsRegardless('selectable', platforms)
    expect(sabotaged.some((p) => p.value === 'Windows')).toBe(true)

    const real = selectSteamPlatformOptions('selectable', platforms, false)
    expect(real.some((p) => p.value === 'Windows')).toBe(false)
  })

  it("readonlyRowLeaksDepot returns ['Mac', 'Windows'] for 'readonly-macos' when hasWindowsDepot is true, where the real function returns one entry", () => {
    function readonlyRowLeaksDepot<T extends { value: InstallPlatform }>(
      mode: SteamPlatformRowMode,
      ps: T[],
      hasWindowsDepot: boolean
    ): T[] {
      if (mode !== 'readonly-macos') return []
      const mac = ps.find((p) => p.value === 'Mac')
      const win = hasWindowsDepot
        ? ps.find((p) => p.value === 'Windows')
        : undefined
      return [mac, win].filter((p): p is T => Boolean(p))
    }

    const sabotaged = readonlyRowLeaksDepot('readonly-macos', platforms, true)
    expect(sabotaged).toHaveLength(2)

    const real = selectSteamPlatformOptions('readonly-macos', platforms, true)
    expect(real).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------
// Phase 34.14, Plan 02, Task 3 -- D-04's fail-open and D-05's seed/resolve
// ---------------------------------------------------------------------

describe('hasSteamDepotSignalCaptured -- D-05 captured-signal gate', () => {
  it('steamPlatformsCaptured true -> true', () => {
    expect(hasSteamDepotSignalCaptured({ steamPlatformsCaptured: true })).toBe(
      true
    )
  })

  it('steamPlatformsCaptured false -> false', () => {
    expect(hasSteamDepotSignalCaptured({ steamPlatformsCaptured: false })).toBe(
      false
    )
  })

  it('steamPlatformsCaptured absent ({}) -> false', () => {
    expect(hasSteamDepotSignalCaptured({})).toBe(false)
  })

  it('gameInfo undefined -> false', () => {
    expect(hasSteamDepotSignalCaptured(undefined)).toBe(false)
  })

  it('gameInfo null -> false', () => {
    expect(hasSteamDepotSignalCaptured(null)).toBe(false)
  })
})

// 34.15 D-12 RECONCILIATION (reconciles CONTEXT.md D-12's claim that this
// widening "widens a function whose behaviour three shipped saboteur gates
// pin" against what the test file actually shows):
//
// Reading `describe('the D-17 gates are not vacuous', ...)` above shows that
// mapping is not accurate. `treatsAbsentAsAvailable` targets
// `hasSteamWindowsDepot`; `includesWindowsRegardless` and
// `readonlyRowLeaksDepot` target `selectSteamPlatformOptions`'s
// `'selectable'` and `'readonly-macos'` branches. NONE of the three reaches
// `resolveDepotAvailability`. Their fixtures (the shared `platforms` array
// and bare `{}`/`undefined` gameInfo shapes) are untouched by adding a mac
// output to this function, so all three stay green with ZERO changes -- and
// that block above is, in fact, byte-identical (verified via
// `git diff -U0` at task acceptance). The block below is the one D-12
// actually widens.
describe('resolveDepotAvailability -- D-04/D-05 in one pure function, widened by 34.15 D-12 for mac', () => {
  // The six-row truth table from 34.14-02-PLAN.md Task 3, each row now also
  // carrying seedHasMacDepot/probeHasMacDepot and asserting macDepotOffered.
  // Every row's original Windows assertion is UNCHANGED -- these rows still
  // pin exactly the Windows behaviour they always pinned.
  const rows: {
    name: string
    input: ResolveDepotAvailabilityInput
    depotSignalResolved: boolean
    windowsDepotOffered: boolean
    macDepotOffered: boolean
  }[] = [
    {
      name: 'D-05 seed: captured game never flashes pending',
      input: {
        seedDepotSignalCaptured: true,
        seedHasWindowsDepot: true,
        seedHasMacDepot: true,
        probeSettled: false,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: true,
      windowsDepotOffered: true,
      macDepotOffered: true
    },
    {
      name: "seed says captured-and-absent: 34.13's fence holds at first frame",
      input: {
        seedDepotSignalCaptured: true,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: false,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: true,
      windowsDepotOffered: false,
      macDepotOffered: false
    },
    {
      name: 'D-01: unresolved -> the pending row, Install disabled (seed uncaptured, probe unsettled)',
      input: {
        seedDepotSignalCaptured: false,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: false,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: false,
      windowsDepotOffered: false,
      macDepotOffered: false
    },
    {
      name: 'probe landed, depot present',
      input: {
        seedDepotSignalCaptured: false,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: true,
        probeDepotSignalCaptured: true,
        probeHasWindowsDepot: true,
        probeHasMacDepot: true
      },
      depotSignalResolved: true,
      windowsDepotOffered: true,
      macDepotOffered: true
    },
    {
      name: 'probe landed, depot CONFIRMED absent -> omit (D-04 branch a)',
      input: {
        seedDepotSignalCaptured: false,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: true,
        probeDepotSignalCaptured: true,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: true,
      windowsDepotOffered: false,
      macDepotOffered: false
    },
    {
      name: '34.15 D-12 ASYMMETRY ROW: probe settled UNCAPTURED -> Windows FAILS OPEN (D-04 branch b) but mac stays conservative even though probeHasMacDepot is true',
      input: {
        seedDepotSignalCaptured: false,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: true,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        // Deliberately true: proves macDepotOffered is false NOT because
        // hasMacDepot is false, but because the signal was never captured --
        // the same distinction D-04's fail-open makes for Windows, resolved
        // the opposite way for mac.
        probeHasMacDepot: true
      },
      depotSignalResolved: true,
      windowsDepotOffered: true,
      macDepotOffered: false
    },
    {
      name: 'mac: seed captured true, probe unsettled -> macDepotOffered true',
      input: {
        seedDepotSignalCaptured: true,
        seedHasWindowsDepot: false,
        seedHasMacDepot: true,
        probeSettled: false,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: true,
      windowsDepotOffered: false,
      macDepotOffered: true
    },
    {
      name: 'mac: seed captured false, probe unsettled -> macDepotOffered false',
      input: {
        seedDepotSignalCaptured: true,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: false,
        probeDepotSignalCaptured: false,
        probeHasWindowsDepot: false,
        probeHasMacDepot: false
      },
      depotSignalResolved: true,
      windowsDepotOffered: false,
      macDepotOffered: false
    },
    {
      name: 'mac: seed uncaptured, probe settled + captured + mac true -> macDepotOffered true',
      input: {
        seedDepotSignalCaptured: false,
        seedHasWindowsDepot: false,
        seedHasMacDepot: false,
        probeSettled: true,
        probeDepotSignalCaptured: true,
        probeHasWindowsDepot: false,
        probeHasMacDepot: true
      },
      depotSignalResolved: true,
      windowsDepotOffered: false,
      macDepotOffered: true
    }
  ]

  for (const row of rows) {
    it(`${row.name} -> depotSignalResolved: ${row.depotSignalResolved}, windowsDepotOffered: ${row.windowsDepotOffered}, macDepotOffered: ${row.macDepotOffered}`, () => {
      const result = resolveDepotAvailability(row.input)
      expect(result.depotSignalResolved).toBe(row.depotSignalResolved)
      expect(result.windowsDepotOffered).toBe(row.windowsDepotOffered)
      expect(result.macDepotOffered).toBe(row.macDepotOffered)
    })
  }

  it('macTreatsAbsentAsAvailable: a saboteur that copies the Windows fail-open clause onto the mac side disagrees with the real function on the D-04 fail-open row -- proving the asymmetry is non-vacuous', () => {
    function macTreatsAbsentAsAvailable(
      input: ResolveDepotAvailabilityInput
    ): boolean {
      const hasMacDepot = input.probeSettled
        ? input.probeHasMacDepot
        : input.seedHasMacDepot
      const depotSignalCaptured = input.probeSettled
        ? input.probeDepotSignalCaptured
        : input.seedDepotSignalCaptured
      // DEFECT: copies windowsDepotOffered's fail-open clause onto mac,
      // which 34.15 D-12 explicitly forbids.
      return hasMacDepot || (input.probeSettled && !depotSignalCaptured)
    }

    const failOpenRow: ResolveDepotAvailabilityInput = {
      seedDepotSignalCaptured: false,
      seedHasWindowsDepot: false,
      seedHasMacDepot: false,
      probeSettled: true,
      probeDepotSignalCaptured: false,
      probeHasWindowsDepot: false,
      probeHasMacDepot: true
    }

    expect(macTreatsAbsentAsAvailable(failOpenRow)).toBe(true)

    const real = resolveDepotAvailability(failOpenRow)
    expect(real.macDepotOffered).toBe(false)
  })

  it('macLoosensToNotFalse: a saboteur reading is_mac_native !== false (the ROADMAP-prohibited shape) disagrees with the real hasSteamMacDepot on {}', () => {
    function macLoosensToNotFalse(
      gameInfo: { is_mac_native?: boolean } | null | undefined
    ): boolean {
      return gameInfo?.is_mac_native !== false
    }

    expect(macLoosensToNotFalse({})).toBe(true)
    expect(hasSteamMacDepot({})).toBe(false)
  })

  it("failsClosedOnUnknown: a saboteur computing windowsDepotOffered = hasWindowsDepot alone (the fail-CLOSED shape, i.e. today's pre-34.14 behaviour) disagrees with the real function on the settled-uncaptured row -- proving D-04's fail-open direction is actually exercised", () => {
    function failsClosedOnUnknown(input: ResolveDepotAvailabilityInput): {
      depotSignalResolved: boolean
      windowsDepotOffered: boolean
    } {
      const hasWindowsDepot = input.probeSettled
        ? input.probeHasWindowsDepot
        : input.seedHasWindowsDepot
      const depotSignalCaptured = input.probeSettled
        ? input.probeDepotSignalCaptured
        : input.seedDepotSignalCaptured
      const depotSignalResolved = depotSignalCaptured || input.probeSettled
      // DEFECT (fail-CLOSED, the sibling `applyEligibilityFailure` shape):
      // trusts only the captured signal, never offering Windows once the
      // probe settles uncaptured.
      const windowsDepotOffered = hasWindowsDepot
      return { depotSignalResolved, windowsDepotOffered }
    }

    const settledUncapturedInput: ResolveDepotAvailabilityInput = {
      seedDepotSignalCaptured: false,
      seedHasWindowsDepot: false,
      seedHasMacDepot: false,
      probeSettled: true,
      probeDepotSignalCaptured: false,
      probeHasWindowsDepot: false,
      probeHasMacDepot: false
    }

    const sabotaged = failsClosedOnUnknown(settledUncapturedInput)
    expect(sabotaged.windowsDepotOffered).toBe(false)

    const real = resolveDepotAvailability(settledUncapturedInput)
    expect(real.windowsDepotOffered).toBe(true)
  })

  it('34.14 D-03: the meaningless pair (seed says captured=false but hasWindowsDepot=true, probe not settled) cannot leak into depotSignalResolved -- the row stays pending, never selectable', () => {
    const result = resolveDepotAvailability({
      seedDepotSignalCaptured: false,
      seedHasWindowsDepot: true,
      seedHasMacDepot: false,
      probeSettled: false,
      probeDepotSignalCaptured: false,
      probeHasWindowsDepot: false,
      probeHasMacDepot: false
    })
    expect(result.depotSignalResolved).toBe(false)
  })
})
