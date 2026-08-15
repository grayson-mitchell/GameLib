import {
  hasSteamWindowsDepot,
  selectSteamPlatformOptions,
  readonlyPlatformValue
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
  'selectable'
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
