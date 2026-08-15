/**
 * Phase 34.13 Plan 07 — the single shared handler body for the phase's only
 * new IPC surface: `isSteamBottleEligible` (D-09 + D-15's exposure half) and
 * `persistBottleWineVersion` (D-14). Imported by BOTH `src/backend/main.ts`
 * (Electron) and `src/backend/sidecar/steamAuthFlowRegistration.ts` (Tauri)
 * so the two runtimes are physically incapable of drifting — deliberately
 * NOT the `redeemSteamKey` "port the guard verbatim into both files"
 * precedent, which produced two copies of one trust boundary.
 *
 * Phase 34.14 (D-02/D-03) widened `getSteamBottleEligibilityVerdict`'s return
 * with the `hasWindowsDepot` / `platformsCaptured` pair, read from
 * `steamMetadataStore` immediately after `checkBottleEligibility()` has
 * already forced and awaited `ensurePlatformsCaptured()`. Because this file
 * is never forked, the widening reaches both runtimes at once with no
 * further edit to either registration site.
 */
import type { WineInstallation } from 'common/types'
import type { SteamBottleEligibilityVerdict } from 'common/types/steam'
import { logWarning, LogPrefix } from 'backend/logger'
import { GlobalConfig } from 'backend/config'
import SteamGame from './games'
import { steamBottleConfigStore, steamMetadataStore } from './electronStores'
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
  appName: unknown
): Promise<SteamBottleEligibilityVerdict> {
  // Takes `unknown`, not `string` (34.13 review WR-10) — the same reason
  // `persistInstallFormWineVersion` below does. The Tauri registration used
  // to cast (`args[0] as string`) while the file's own block comment claimed
  // the payload was "passed through UNCAST", which made the comment false
  // AND left a real hole: `NUMERIC_APP_ID.test(123)` coerces the number to
  // `'123'` and PASSES, after which `new SteamGame(123 as unknown as string)`
  // carries a number as `this.appId` through every downstream
  // `steamMetadataStore.get(this.appId)` and template-literal path. One
  // typeof guard here covers BOTH runtimes, so neither registration needs a
  // cast.
  if (typeof appName !== 'string' || !NUMERIC_APP_ID.test(appName)) {
    logWarning(
      'getSteamBottleEligibilityVerdict: rejected non-string or non-numeric appName (T-34.13-07-01)',
      LogPrefix.Steam
    )
    // An invalid appName is a REJECTED REQUEST, not an "unknown depot" state
    // — eligible: false short-circuits routing before the depot question is
    // ever asked, so this platformsCaptured: false must NOT be read as a
    // D-04 fail-open trigger. Without this note a future reader will assume
    // every platformsCaptured: false return means "offer Windows".
    return { eligible: false, hasWindowsDepot: false, platformsCaptured: false }
  }

  const eligible = await new SteamGame(appName).checkBottleEligibility()

  // No new fetch and no new await occur here: the checkBottleEligibility()
  // call above has ALREADY driven ensurePlatformsCaptured() to completion or
  // to its METADATA_FETCH_TIMEOUT_MS deadline (D-02's entire mechanism), so
  // this is a read of an already-paid-for result. Both comparisons are
  // `=== true` — undefined means "never captured" on BOTH fields and must
  // never coerce.
  const cached = steamMetadataStore.get(appName)
  const hasWindowsDepot = cached?.is_windows_native === true
  const platformsCaptured = cached?.platformsCaptured === true

  const wineVersion = steamBottleConfigStore.get_nodefault('wineVersion')
  const bottleName =
    steamBottleConfigStore.get_nodefault('wineCrossoverBottle') ??
    DEFAULT_STEAM_BOTTLE_NAME

  return {
    eligible,
    hasWindowsDepot,
    platformsCaptured,
    wineVersion,
    bottleName
  }
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
 * 34.13 review A-04 / A-15 — PROVENANCE, which is a different question from
 * TYPE and is why the `type: 'crossover'` fast-path added by 539bc979c does
 * not close this. Everything this seam validated was SHAPE, so
 * `{ bin: '/Users/x/Downloads/anything', name: 'X', type: 'crossover' }` was
 * accepted, persisted DURABLY into `steamBottleConfigStore`, and then spawned
 * on the next bottled Steam operation: `getSteamBottleSettings()` hands it to
 * `runWineCommand`, `launcher.ts` does `wineVersion.bin.replaceAll("'", '')`
 * and spawns it, and `wineserver` is spawned with no existence check at all.
 * `validWine()` is purely `existsSync(bin)` — it proves the file is THERE,
 * never that GameLib discovered it. Every legitimate value on this path comes
 * from `getAlternativeWine()`, so membership in that list is the check that
 * was missing.
 *
 * FAILS CLOSED, and that is safe here rather than a wedge: refusing the
 * persist degrades to exactly the behaviour D-15 already guarantees — the
 * guided bottle setup derives its own engine when nothing was persisted —
 * which is what `SteamDialog.handleInstall`'s own comment states as the
 * contract for a failed persist. So an empty or unavailable detection list
 * costs the user nothing beyond re-choosing.
 *
 * Async because `getAlternativeWine()` is. Both registrations
 * (`main.ts`, `sidecar/steamAuthFlowRegistration.ts`) already wrap the call in
 * an `async` handler that `return`s it, so the returned promise is awaited by
 * the IPC layer with no call-site change — the "signature change ripples
 * through two runtime registrations" concern recorded when A-04 was skipped
 * does not apply.
 *
 * Never logs the submitted `bin` path — a rejection names the failing field,
 * never the submitted value.
 */
export async function persistInstallFormWineVersion(input: unknown): Promise<{
  status: 'done' | 'error'
  error?: string
}> {
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

  // PROVENANCE (A-04/A-15): the `bin` must be one GameLib itself detected.
  // A rejecting/throwing detector is treated as "cannot vouch" and fails
  // closed — see this function's own JSDoc for why that degrades safely.
  let detected: WineInstallation[]
  try {
    detected = await GlobalConfig.get().getAlternativeWine()
  } catch (error) {
    logWarning(
      `persistInstallFormWineVersion: could not enumerate detected wine engines, refusing to persist (${String(
        error
      )})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'unknown-bin' }
  }
  if (!detected.some((engine) => engine.bin === bin)) {
    logWarning(
      'persistInstallFormWineVersion: rejected a payload whose "bin" is not among the engines GameLib detected (T-34.13-07-02 provenance half)',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'unknown-bin' }
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
