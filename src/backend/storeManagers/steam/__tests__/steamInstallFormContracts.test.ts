/**
 * Contract gate for phase 34.13 plan 01 — five new cross-cutting type
 * declarations (D-17) plus one deliberate absence (D-26), landed in a single
 * Wave-1 plan so waves 2+ never collide on `src/common/types.ts`.
 *
 * This plan ships ZERO behavior change. Every assertion here is either a
 * compile-time literal check (the field/interface exists with the right
 * shape) or a source-text check over a comment-stripped file (a declaration
 * — or, for D-26, an absence — actually landed in the right place). Nothing
 * in this file imports `backend/config` or `../electronStores` at runtime:
 * those two files are asserted against via `readFileSync`, because a
 * runtime import of either would pull `electron-store` into the Backend
 * jest project for a plan that has no reason to touch it.
 *
 * Path arithmetic and describe-block style follow the in-repo precedent,
 * `nativeInstallSetting.test.ts`'s `readFileSync(join(__dirname,
 * '../../../../common/types.ts'), 'utf8')` pattern.
 *
 * IMPORTANT — describe block 3 (D-26) is NOT part of the four-identifier RED
 * proof. It asserts an ABSENCE that already holds on the pre-edit tree, so
 * it is expected to be GREEN in both the RED run (before Task 2) and the
 * GREEN run (after Task 2). The other three describe blocks (1, 2, 4) are
 * expected to fail before Task 2 declares `steamForceWindowsViaBottle`,
 * `is_windows_native`, `forcedWindowsViaBottle` and
 * `SteamBottleEligibilityVerdict`.
 *
 * Empirical note (discovered RED-proving this gate, Rule 1 fix applied
 * before this file's first commit): this repo's `tsconfig.json` sets
 * `compilerOptions.isolatedModules: true`, which makes ts-jest transpile
 * each file independently rather than type-check against the full program.
 * Excess-property checks on a typed object literal and missing-export
 * errors on a `import type` therefore NEVER surface as a jest failure here
 * — the plan's assumed "ts-jest type errors (TS2353/TS2339)" failure mode
 * does not occur in this project's jest config. Every identifier this gate
 * must RED-prove is therefore ALSO asserted via a comment-stripped
 * source-text `toMatch`, exactly like the two `electronStores.ts` checks —
 * the compile-time literals are kept for documentation/editor value and for
 * `pnpm codecheck` (`tsc --noEmit`, a real full-program check) but are not
 * load-bearing for this gate's RED proof.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { GameInfo, InstallArgs } from 'common/types'
import type { SteamBottleEligibilityVerdict } from 'common/types/steam'

const commonTypesSource = stripSourceComments(
  readFileSync(join(__dirname, '../../../../common/types.ts'), 'utf8')
)

const steamCommonTypesSource = stripSourceComments(
  readFileSync(join(__dirname, '../../../../common/types/steam.ts'), 'utf8')
)

const electronStoresSource = stripSourceComments(
  readFileSync(join(__dirname, '../electronStores.ts'), 'utf8')
)

const backendConfigSource = stripSourceComments(
  readFileSync(join(__dirname, '../../../config.ts'), 'utf8')
)

describe('D-17: Windows-via-bottle install override', () => {
  it('accepts steamForceWindowsViaBottle: true on InstallArgs alongside platformToInstall', () => {
    const args: InstallArgs = {
      path: '/tmp/install-path',
      platformToInstall: 'Windows',
      steamForceWindowsViaBottle: true
    }
    expect(args.steamForceWindowsViaBottle).toBe(true)
  })

  it('treats an absent steamForceWindowsViaBottle as the legal legacy/no-override shape', () => {
    const args: InstallArgs = {
      path: '/tmp/install-path',
      platformToInstall: 'Windows'
    }
    expect(args.steamForceWindowsViaBottle).toBeUndefined()
  })

  it('leaves platformToInstall: InstallPlatform declared unchanged on InstallArgs — the override is additive, not a reinterpretation', () => {
    // Regression guard: a future "simplification" that folds the override
    // back into platformToInstall would route every mac-native install into
    // the bottle, because installSteamGame() hardcodes platformToInstall:
    // 'Windows' for every Steam install already.
    expect(commonTypesSource).toMatch(
      /platformToInstall:\s*InstallPlatform/
    )
  })

  it('declares InstallArgs.steamForceWindowsViaBottle?: boolean in common/types.ts source', () => {
    expect(commonTypesSource).toMatch(
      /steamForceWindowsViaBottle\?:\s*boolean/
    )
  })
})

describe('D-17: Windows depot-availability signal and forced-install verdict', () => {
  it('accepts GameInfo.is_windows_native: true', () => {
    const info: Partial<GameInfo> = {
      app_name: 'test-app',
      is_windows_native: true
    }
    expect(info.is_windows_native).toBe(true)
  })

  it('declares GameInfo.is_windows_native?: boolean in common/types.ts source', () => {
    expect(commonTypesSource).toMatch(/is_windows_native\?:\s*boolean/)
  })

  it('declares SteamMetadataCacheEntry.is_windows_native?: boolean in electronStores.ts source', () => {
    expect(electronStoresSource).toMatch(/is_windows_native\?:\s*boolean/)
  })

  it('declares SteamMetadataCacheEntry.forcedWindowsViaBottle?: boolean in electronStores.ts source', () => {
    expect(electronStoresSource).toMatch(
      /forcedWindowsViaBottle\?:\s*boolean/
    )
  })

  it('accepts a forcedWindowsViaBottle: true literal and also compiles with the key entirely absent (pinning optionality)', () => {
    type SteamMetadataCacheEntryShape = {
      forcedWindowsViaBottle?: boolean
    }
    const withFlag: SteamMetadataCacheEntryShape = {
      forcedWindowsViaBottle: true
    }
    const withoutFlag: SteamMetadataCacheEntryShape = {}
    expect(withFlag.forcedWindowsViaBottle).toBe(true)
    expect(withoutFlag.forcedWindowsViaBottle).toBeUndefined()
  })
})

describe('D-26: the always-show setting is RETIRED, not declared', () => {
  // D-26 cut D-13's global always-show setting outright — the caret's
  // "Install with options…" affordance (D-21) replaces it, and plan
  // 34.13-04 (which would have built its UI/backend accessor) is deleted
  // from disk. These two assertions are the guard against a future
  // executor reviving the key from `34.13-PATTERNS.md`'s retired trap
  // section. Both assertions are expected to be GREEN already, on the
  // pre-edit (RED) tree, because the key was never declared — this block
  // is a regression gate against revival, not a RED-proven declaration
  // gate, and is deliberately excluded from the four-identifier RED proof.
  it('D-26 cut the setting because D-21\'s caret puts the options dialog one click away on every surface — AppSettings declares no alwaysShowSteamInstallForm key', () => {
    expect(commonTypesSource).not.toMatch(/alwaysShowSteamInstallForm/)
  })

  it('D-26 cut the setting because a global GlobalConfig toggle for the same one-click capability is dead weight — getFactoryDefaults() seeds no alwaysShowSteamInstallForm default', () => {
    expect(backendConfigSource).not.toMatch(/alwaysShowSteamInstallForm/)
  })
})

describe('isSteamBottleEligible verdict shape', () => {
  it('declares export interface SteamBottleEligibilityVerdict in common/types/steam.ts source', () => {
    expect(steamCommonTypesSource).toMatch(
      /export interface SteamBottleEligibilityVerdict/
    )
  })

  it('SteamBottleEligibilityVerdict is importable from common/types/steam and accepts { eligible: true } alone', () => {
    const minimal: SteamBottleEligibilityVerdict = { eligible: true }
    expect(minimal.eligible).toBe(true)
  })

  it('SteamBottleEligibilityVerdict accepts eligible, wineVersion and bottleName fully populated', () => {
    const full: SteamBottleEligibilityVerdict = {
      eligible: true,
      wineVersion: {
        bin: '/usr/bin/wine',
        name: 'GE-Proton',
        type: 'proton'
      },
      bottleName: 'GameLib'
    }
    expect(full.eligible).toBe(true)
    expect(full.bottleName).toBe('GameLib')
  })

  it('requires eligible: boolean (minimal literal must supply it)', () => {
    const minimal: SteamBottleEligibilityVerdict = { eligible: false }
    expect(typeof minimal.eligible).toBe('boolean')
  })
})
