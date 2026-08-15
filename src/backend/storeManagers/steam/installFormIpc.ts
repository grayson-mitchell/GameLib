/**
 * Phase 34.13 Plan 07 — the single shared handler body for the phase's only
 * new IPC surface: `isSteamBottleEligible` (D-09 + D-15's exposure half) and
 * `persistBottleWineVersion` (D-14). Imported by BOTH `src/backend/main.ts`
 * (Electron) and `src/backend/sidecar/steamAuthFlowRegistration.ts` (Tauri)
 * so the two runtimes are physically incapable of drifting — deliberately
 * NOT the `redeemSteamKey` "port the guard verbatim into both files"
 * precedent, which produced two copies of one trust boundary.
 */
import type { WineInstallation } from 'common/types'
import type { SteamBottleEligibilityVerdict } from 'common/types/steam'
import { logWarning, LogPrefix } from 'backend/logger'
import SteamGame from './games'
import { steamBottleConfigStore } from './electronStores'
import { persistBottleWineVersion } from './bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'

// T-21-05 pattern, reused a fourth time in this directory (depot.ts,
// installLocation.ts, clientSetup.ts). This is the ONE seam both the
// isSteamBottleEligible handler AND any future internal caller pass through,
// so guarding here covers the untrusted-IPC-input case at its true entry
// point without a second, duplicated guard in main.ts.
const NUMERIC_APP_ID = /^\d+$/

const WINE_INSTALLATION_TYPES = [
  'wine',
  'proton',
  'crossover',
  'toolkit'
] as const
type WineInstallationType = (typeof WINE_INSTALLATION_TYPES)[number]

/**
 * D-09 + D-15 (exposure half): resolves the backend-authoritative bottle
 * eligibility verdict for `appName`, plus the PERSISTED wine engine and
 * bottle name already sitting in `steamBottleConfigStore`. One round-trip
 * closes both — 34.13-11 reads `eligible`, 34.13-09 reads `wineVersion` /
 * `bottleName`.
 *
 * `appName` is rejected BEFORE `new SteamGame(...)` when it fails the
 * T-34.13-07-01 numeric guard: the eligibility path can reach an outbound
 * `appdetails` request built from the id, and its `string` type contract is
 * a compile-time claim the renderer cannot be held to at runtime. Fails
 * closed with `{ eligible: false }` — no `wineVersion`/`bottleName` are
 * computed on this path, since a rejected id never proves anything about
 * the (unrelated) bottle store.
 *
 * `checkBottleEligibility()` is awaited — never re-derived here — so a cold
 * metadata cache is forced to capture platform data first (D-09's whole
 * point: the frontend asks the backend, it never re-derives the answer).
 *
 * Deliberately reads `steamBottleConfigStore` DIRECTLY instead of calling
 * `getSteamBottleSettings()`: that helper's `wineVersion: storedWineVersion
 * ?? globalSettings.wineVersion` fallback means its `wineVersion` is NEVER
 * `undefined`, which would silently seed 34.13-09's engine-selection with
 * the user's GLOBAL wine engine (often GPTK on macOS) instead of leaving
 * `wineVersion` unset so `resolveSteamBottleEngine`'s CrossOver-preferring
 * derivation runs — re-opening the exact 17-06 UAT finding that derivation
 * exists to prevent. `bottleName` is read from the `wineCrossoverBottle` key
 * specifically (NOT the sibling `bottleName` key `steamBottleStatus` reads)
 * because that is the key the settings object the install actually runs
 * against is built from — the two agree in practice (`provisionBottle`
 * writes both to the same value) but are not interchangeable sources.
 */
export async function getSteamBottleEligibilityVerdict(
  appName: string
): Promise<SteamBottleEligibilityVerdict> {
  if (!NUMERIC_APP_ID.test(appName)) {
    logWarning(
      'getSteamBottleEligibilityVerdict: rejected non-numeric appName (T-34.13-07-01)',
      LogPrefix.Steam
    )
    return { eligible: false }
  }

  const eligible = await new SteamGame(appName).checkBottleEligibility()

  const wineVersion = steamBottleConfigStore.get_nodefault('wineVersion') as
    | WineInstallation
    | undefined
  const bottleName =
    (steamBottleConfigStore.get_nodefault('wineCrossoverBottle') as
      | string
      | undefined) ?? DEFAULT_STEAM_BOTTLE_NAME

  return { eligible, wineVersion, bottleName }
}

/**
 * D-14: validates an untrusted renderer payload and, only when it
 * structurally matches a `WineInstallation`, rebuilds a FRESH object from
 * known fields only and persists it via `bottle.ts`'s existing
 * `persistBottleWineVersion()` primitive — never forwarding the renderer's
 * object by reference. Forwarding it would let an unknown key ride along,
 * get persisted, and later surface again through `getSteamBottleSettings()`
 * inside a `GameSettings`.
 *
 * Takes `unknown`, not `WineInstallation`, for the same reason
 * `redeemSteamKey`'s main-process guard does (`main.ts:888-897`): the value
 * crosses a trust boundary, and its compile-time type is not something the
 * renderer can be held to at runtime.
 *
 * Deliberately does NOT reject a `'toolkit'` (GPTK) engine, or any other
 * non-CrossOver engine — backend engine rejection is an explicitly Deferred
 * Idea (CONTEXT.md `<deferred>`; D-16 is a frontend-only filter, and the
 * folded GPTK todo's backend half stays open). Do not harden this into scope
 * creep.
 *
 * Never logs the submitted `bin` path — a rejection names the failing field,
 * never the submitted value.
 */
export function persistInstallFormWineVersion(input: unknown): {
  status: 'done' | 'error'
  error?: string
} {
  if (typeof input !== 'object' || input === null) {
    logWarning(
      'persistInstallFormWineVersion: rejected a non-object payload (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-payload' }
  }

  const candidate = input as Record<string, unknown>
  const { bin, name, type, lib, lib32, wineserver } = candidate

  if (typeof bin !== 'string' || bin.length === 0) {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "bin" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-bin' }
  }
  if (typeof name !== 'string' || name.length === 0) {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "name" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-name' }
  }
  if (
    typeof type !== 'string' ||
    !WINE_INSTALLATION_TYPES.includes(type as WineInstallationType)
  ) {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "type" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-type' }
  }
  if (lib !== undefined && typeof lib !== 'string') {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "lib" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-lib' }
  }
  if (lib32 !== undefined && typeof lib32 !== 'string') {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "lib32" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-lib32' }
  }
  if (wineserver !== undefined && typeof wineserver !== 'string') {
    logWarning(
      'persistInstallFormWineVersion: rejected payload with an invalid "wineserver" field (T-34.13-07-02)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-wineserver' }
  }

  const rebuilt: WineInstallation = {
    bin,
    name,
    type: type as WineInstallationType
  }
  if (lib !== undefined) rebuilt.lib = lib
  if (lib32 !== undefined) rebuilt.lib32 = lib32
  if (wineserver !== undefined) rebuilt.wineserver = wineserver

  persistBottleWineVersion(rebuilt)
  return { status: 'done' }
}
