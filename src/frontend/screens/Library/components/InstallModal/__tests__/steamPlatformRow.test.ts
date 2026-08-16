import {
  hasSteamWindowsDepot,
  hasSteamMacDepot,
  selectSteamPlatformOptions,
  readonlyPlatformValue,
  hasSteamDepotSignalCaptured,
  resolveDepotAvailability,
  resolveSteamHeaderPlatforms,
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
  //
  // 34.15 gap-closure round (code review WR-01) added a fourth parameter,
  // `hasMacDepot`. It is meaningful ONLY to the `'selectable'` branch (see
  // that branch's own dedicated 2x2 matrix below) -- every other mode below
  // passes a fixed `true` for it and asserts the result is UNCHANGED,
  // proving the parameter genuinely has no effect on those branches rather
  // than merely being unused by coincidence.

  it("'absent' with hasWindowsDepot false returns []", () => {
    expect(
      selectSteamPlatformOptions('absent', platforms, false, true)
    ).toEqual([])
  })

  it("'absent' with hasWindowsDepot true returns [] -- D-18's Linux row and the legacy one-platform case", () => {
    expect(selectSteamPlatformOptions('absent', platforms, true, true)).toEqual(
      []
    )
  })

  it("'readonly-windows' with hasWindowsDepot false returns exactly one entry", () => {
    const result = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      false,
      true
    )
    expect(result).toEqual([windowsEntry])
  })

  it("'readonly-windows' with hasWindowsDepot true is invariant to the depot flag", () => {
    const withFalse = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      false,
      true
    )
    const withTrue = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      true,
      true
    )
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([windowsEntry])
  })

  it("'readonly-windows' is invariant to hasMacDepot too -- neither depot flag may leak into a row the user cannot change", () => {
    const withMacFalse = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      true,
      false
    )
    const withMacTrue = selectSteamPlatformOptions(
      'readonly-windows',
      platforms,
      true,
      true
    )
    expect(withMacFalse).toEqual(withMacTrue)
    expect(withMacFalse).toEqual([windowsEntry])
  })

  it("'readonly-macos' with hasWindowsDepot false returns exactly one entry", () => {
    const result = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      false,
      true
    )
    expect(result).toEqual([macEntry])
  })

  it("'readonly-macos' with hasWindowsDepot true is invariant to the depot flag -- the depot flag can never leak into a row the user cannot change", () => {
    const withFalse = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      false,
      true
    )
    const withTrue = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      true,
      true
    )
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([macEntry])
  })

  it("'readonly-macos' is invariant to hasMacDepot too -- this row is reached only when the game IS mac-native (steamSectionGating's own branch ordering), so this parameter has no additional gate to apply here", () => {
    const withMacFalse = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      true,
      false
    )
    const withMacTrue = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      true,
      true
    )
    expect(withMacFalse).toEqual(withMacTrue)
    expect(withMacFalse).toEqual([macEntry])
  })

  // 34.15 gap-closure round (code review WR-01) -- full 2x2 matrix. Prior to
  // this fix, `'selectable'`'s macEntry was unconditional (see the
  // `macIncludedRegardless` saboteur in the non-vacuity block below); this
  // matrix REPLACES the two single-dimension tests that used to pin that
  // unconditional shape.

  it("'selectable' with hasWindowsDepot false and hasMacDepot false returns []", () => {
    const result = selectSteamPlatformOptions(
      'selectable',
      platforms,
      false,
      false
    )
    expect(result).toEqual([])
  })

  it("'selectable' with hasWindowsDepot true and hasMacDepot false returns only 'Windows' -- 34.15 WR-01: the mac entry is no longer offered unconditionally for a game whose mac depot was never confirmed", () => {
    const result = selectSteamPlatformOptions(
      'selectable',
      platforms,
      true,
      false
    )
    expect(result.map((p) => p.value)).toEqual(['Windows'])
  })

  it("'selectable' with hasWindowsDepot false and hasMacDepot true returns only 'Mac'", () => {
    const result = selectSteamPlatformOptions(
      'selectable',
      platforms,
      false,
      true
    )
    expect(result.map((p) => p.value)).toEqual(['Mac'])
  })

  it("'selectable' with hasWindowsDepot true and hasMacDepot true returns ['Mac', 'Windows'] in that order -- macOS first, matching UI-SPEC row 5's 'macOS (default, pre-selected)'", () => {
    const result = selectSteamPlatformOptions(
      'selectable',
      platforms,
      true,
      true
    )
    expect(result.map((p) => p.value)).toEqual(['Mac', 'Windows'])
  })

  it("'pending' with hasWindowsDepot false returns exactly the macOS entry", () => {
    const result = selectSteamPlatformOptions('pending', platforms, false, true)
    expect(result).toEqual([macEntry])
  })

  it("'pending' with hasWindowsDepot true is invariant to the depot flag -- the depot flag can never leak into a row the user cannot change", () => {
    const withFalse = selectSteamPlatformOptions(
      'pending',
      platforms,
      false,
      true
    )
    const withTrue = selectSteamPlatformOptions(
      'pending',
      platforms,
      true,
      true
    )
    expect(withTrue).toEqual(withFalse)
    expect(withTrue).toEqual([macEntry])
  })

  it("'pending' is invariant to hasMacDepot too -- the pending row's macOS pin (34.14 D-15) does not read this parameter at all", () => {
    const withMacFalse = selectSteamPlatformOptions(
      'pending',
      platforms,
      true,
      false
    )
    const withMacTrue = selectSteamPlatformOptions(
      'pending',
      platforms,
      true,
      true
    )
    expect(withMacFalse).toEqual(withMacTrue)
    expect(withMacFalse).toEqual([macEntry])
  })

  it('every returned entry is a member (by reference) of the supplied platforms array -- the function can never fabricate an option', () => {
    for (const mode of ALL_MODES) {
      for (const hasWindowsDepot of [false, true]) {
        for (const hasMacDepot of [false, true]) {
          const result = selectSteamPlatformOptions(
            mode,
            platforms,
            hasWindowsDepot,
            hasMacDepot
          )
          for (const entry of result) {
            expect(platforms).toContain(entry)
          }
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
    function includesWindowsRegardless<T extends { value: InstallPlatform }>(
      mode: SteamPlatformRowMode,
      ps: T[]
    ): T[] {
      if (mode !== 'selectable') return []
      const mac = ps.find((p) => p.value === 'Mac')
      const win = ps.find((p) => p.value === 'Windows')
      return [mac, win].filter((p): p is T => Boolean(p))
    }

    const sabotaged = includesWindowsRegardless('selectable', platforms)
    expect(sabotaged.some((p) => p.value === 'Windows')).toBe(true)

    // 34.15 gap-closure round (WR-01) added a required 4th parameter
    // (`hasMacDepot`) to the real function's signature -- mechanical only,
    // this saboteur/assertion pair is otherwise untouched. `true` is passed
    // because this assertion concerns Windows omission only and is
    // invariant to the mac parameter's value.
    const real = selectSteamPlatformOptions(
      'selectable',
      platforms,
      false,
      true
    )
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

    // 34.15 gap-closure round (WR-01): mechanical 4th-argument addition
    // only -- 'readonly-macos' does not read hasMacDepot at all (see the
    // "is invariant to hasMacDepot too" test above), so its value here is
    // arbitrary.
    const real = selectSteamPlatformOptions(
      'readonly-macos',
      platforms,
      true,
      true
    )
    expect(real).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------
// 34.15 gap-closure round -- code review WR-01: the 'selectable' branch's
// macEntry is no longer unconditional
// ---------------------------------------------------------------------
//
// Pre-fix, `selectSteamPlatformOptions`'s 'selectable' case included the Mac
// entry regardless of `hasMacDepot` -- unlike the Windows entry immediately
// beside it, which was already correctly gated on `hasWindowsDepot`. This
// let the dropdown offer "macOS" for a game whose mac depot was never
// confirmed: `resolveSteamSectionGating` enters `'selectable'` whenever
// `windowsDepotOffered` is true (which 34.14 D-04 fails OPEN to when the
// eligibility probe times out) with NO corresponding check that the game's
// mac depot was ever confirmed. That directly contradicted 34.15 D-14's own
// rule for `macDepotOffered` ("an uncaptured or unresolved signal yields
// `false`, full stop") -- honored for the platform DEFAULT, but not for the
// option LIST.

describe("34.15 WR-01: 'selectable' no longer offers macOS unconditionally", () => {
  it('macIncludedRegardless (the exact pre-fix shape) disagrees with the real function on the reachable WR-01 state: windowsDepotOffered true (D-04 fail-open) + macDepotOffered false (never confirmed)', () => {
    function macIncludedRegardless<T extends { value: InstallPlatform }>(
      mode: SteamPlatformRowMode,
      ps: T[],
      hasWindowsDepot: boolean
    ): T[] {
      if (mode !== 'selectable') return []
      // DEFECT (the exact pre-fix production shape): the Mac entry was
      // found unconditionally, never gated on a mac-depot flag at all.
      const mac = ps.find((p) => p.value === 'Mac')
      const win = hasWindowsDepot
        ? ps.find((p) => p.value === 'Windows')
        : undefined
      return [mac, win].filter((p): p is T => Boolean(p))
    }

    // The reachable state the code review named: the eligibility probe
    // timed out, so `platformsCaptured` stays false -> `macDepotOffered`
    // stays false (D-14's conservative rule) -- but `windowsDepotOffered`
    // fails OPEN to true (34.14 D-04), so `resolveSteamSectionGating` still
    // routes to `'selectable'`.
    const windowsDepotOffered = true
    const macDepotOffered = false

    const sabotaged = macIncludedRegardless(
      'selectable',
      platforms,
      windowsDepotOffered
    )
    expect(sabotaged.some((p) => p.value === 'Mac')).toBe(true)

    const real = selectSteamPlatformOptions(
      'selectable',
      platforms,
      windowsDepotOffered,
      macDepotOffered
    )
    expect(real.some((p) => p.value === 'Mac')).toBe(false)
    expect(real.map((p) => p.value)).toEqual(['Windows'])
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

// ---------------------------------------------------------------------
// 34.15 gap-closure round -- code review CR-01: the SteamDialog header glyph
// row's CONTENT, not merely its gate
// ---------------------------------------------------------------------
//
// `steamDialogSource.test.ts`'s D-13 block (pre-existing) proves the header
// row is GATED on `depotSignalResolved` -- it asserts nothing about what the
// row shows once that gate opens. `resolveSteamHeaderPlatforms` is the pure
// function that decides the CONTENT; these tests are the ones that actually
// close CR-01, run against a FILLED specimen (the module-level `platforms`
// fixture above, which mirrors the real `index.tsx` shape exactly: Windows
// `available: true` unconditionally, Mac `available: false` -- the stale,
// seed-derived answer for a game whose `gameInfo.is_mac_native` is
// undefined/false).

describe('resolveSteamHeaderPlatforms -- 34.15 CR-01: header content reads the RESOLVED signal, not the stale seed', () => {
  it('the reachable CR-01 state: macDepotOffered true while the seed platforms entry says Mac unavailable -- the header now includes Mac', () => {
    // This is the exact defect: `platforms[1]` (Mac) is `available: false`
    // in this fixture -- the frozen `gameInfo.is_mac_native` seed -- while
    // the live probe has since resolved `macDepotOffered: true`. A
    // pre-fix reader of `availablePlatforms` (== `platforms.filter(p =>
    // p.available)`) would omit Mac here; the real function must not.
    const result = resolveSteamHeaderPlatforms(platforms, true, true)
    expect(result.map((p) => p.value)).toContain('Mac')
  })

  it("the mirror CR-01 state: platformRow === 'readonly-macos' shape (windowsDepotOffered false, macDepotOffered true) -- the header must NOT show a Windows glyph, even though the seed's Windows entry is available: true unconditionally", () => {
    const result = resolveSteamHeaderPlatforms(platforms, false, true)
    expect(result.map((p) => p.value)).not.toContain('Windows')
    expect(result.map((p) => p.value)).toEqual(['Mac'])
  })

  it('both depots unresolved/absent (windowsDepotOffered false, macDepotOffered false) -- the header shows neither, matching D-13\'s "no icons is honest" rule for the content half of the row', () => {
    const result = resolveSteamHeaderPlatforms(platforms, false, false)
    expect(result.map((p) => p.value)).toEqual([])
  })

  it('both depots confirmed (windowsDepotOffered true, macDepotOffered true) -- the header shows both, in platforms array order', () => {
    const result = resolveSteamHeaderPlatforms(platforms, true, true)
    expect(result.map((p) => p.value)).toEqual(['Mac', 'Windows'])
  })

  it('Linux and Browser entries pass through on their own available flag, untouched by either depot parameter -- neither has a depot-signal-uncertainty concept', () => {
    const allFalse = resolveSteamHeaderPlatforms(platforms, false, false)
    const allTrue = resolveSteamHeaderPlatforms(platforms, true, true)
    // The fixture's Linux/Browser entries are both `available: false` --
    // absent from every combination above and below.
    expect(allFalse.map((p) => p.value)).not.toContain('linux')
    expect(allFalse.map((p) => p.value)).not.toContain('Browser')
    expect(allTrue.map((p) => p.value)).not.toContain('linux')
    expect(allTrue.map((p) => p.value)).not.toContain('Browser')

    const sideloadLikePlatforms: PlatformFixture[] = [
      { name: 'Linux', available: true, value: 'linux' },
      { name: 'macOS', available: false, value: 'Mac' },
      { name: 'Windows', available: true, value: 'Windows' },
      { name: 'Browser', available: true, value: 'Browser' }
    ]
    const withLinuxAndBrowserAvailable = resolveSteamHeaderPlatforms(
      sideloadLikePlatforms,
      false,
      false
    )
    // Linux/Browser still pass through on `available` even while BOTH depot
    // params are false -- proving they are genuinely independent of the two
    // gated entries, not merely coincidentally absent above.
    expect(withLinuxAndBrowserAvailable.map((p) => p.value)).toEqual([
      'linux',
      'Browser'
    ])
  })

  it('RED: readAvailableFlag (the exact pre-fix behaviour -- `platforms.filter(p => p.available)`, i.e. what availablePlatforms itself computes) disagrees with the real function on the reachable CR-01 state', () => {
    function readAvailableFlag<T extends { available: boolean }>(ps: T[]): T[] {
      return ps.filter((p) => p.available)
    }

    // Same reachable state as the first test above: seed says Mac
    // unavailable, live probe says macDepotOffered true.
    const sabotaged = readAvailableFlag(platforms)
    expect(sabotaged.map((p) => p.value)).not.toContain('Mac')

    const real = resolveSteamHeaderPlatforms(platforms, true, true)
    expect(real.map((p) => p.value)).toContain('Mac')
    expect(sabotaged).not.toEqual(real)
  })

  it('RED: readAvailableFlag also disagrees with the real function on the mirror state -- the seed Windows entry is available: true unconditionally and would leak through', () => {
    function readAvailableFlag<T extends { available: boolean }>(ps: T[]): T[] {
      return ps.filter((p) => p.available)
    }

    const sabotaged = readAvailableFlag(platforms)
    expect(sabotaged.map((p) => p.value)).toContain('Windows')

    const real = resolveSteamHeaderPlatforms(platforms, false, true)
    expect(real.map((p) => p.value)).not.toContain('Windows')
    expect(sabotaged).not.toEqual(real)
  })

  it('every returned entry is a member (by reference) of the supplied platforms array -- the function can never fabricate an entry', () => {
    for (const windowsDepotOffered of [false, true]) {
      for (const macDepotOffered of [false, true]) {
        const result = resolveSteamHeaderPlatforms(
          platforms,
          windowsDepotOffered,
          macDepotOffered
        )
        for (const entry of result) {
          expect(platforms).toContain(entry)
        }
      }
    }
  })
})
