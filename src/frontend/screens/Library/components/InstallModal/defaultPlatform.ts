/**
 * Which platform the install modal PRESELECTS (quick task `260824-u8b`).
 *
 * Extracted as a pure function so the Steam anti-regression case can be asserted directly, rather
 * than inferred from the component — this directory's existing convention (`steamPlatformRow.ts`,
 * `steamEligibilityProbe.ts`).
 *
 * ## The defect this fixes
 *
 * AVAILABILITY and DEFAULT were derived from two DIFFERENT signals, and for non-Steam runners they
 * disagreed:
 *
 * - availability (`platforms[]` in `index.tsx`): `isMac && (isSideload || isMacNative)`, where
 *   `isMacNative` is `gameInfo.is_mac_native` — the store's own library data.
 * - default: `isMac && macDepotOffered`, where `macDepotOffered` comes from
 *   `resolveDepotAvailability()` and is a STEAM DEPOT signal.
 *
 * A non-Steam title has no depot signal at all, so `macDepotOffered` was false and Windows was
 * preselected even while the macOS option sat in the selector. Measured 2026-08-24 on the Epic
 * title Phoenix Point (`legendary`, app_name `Iris`): `is_mac_native: true` and a real Mac manifest
 * (`legendary info Iris --platform Mac` -> version `1.30.75117M`, 22.58 GiB), yet the modal launched
 * `legendary install Iris --platform Windows`.
 */

import type { InstallPlatform, Runner } from 'common/types'

interface DefaultPlatformInput {
  /** Host is macOS. */
  isMac: boolean
  runner: Runner
  /** STEAM-only depot signal, from `resolveDepotAvailability()`. */
  macDepotOffered: boolean
  /** `gameInfo.is_mac_native` — the store library's own statement. */
  isMacNative: boolean
}

/**
 * The "this game offers a native Mac build" signal the DEFAULT should be derived from, per runner.
 *
 * Steam and non-Steam answer this question with different evidence, and conflating them is exactly
 * what caused the defect above:
 *
 * - **Steam** -> `macDepotOffered`. Steam's answer is a PROBE result that is legitimately
 *   UNRESOLVED at modal open (34.15 D-05: fail-soft sync, absent `oslist`, cached-library early
 *   returns, cold start), which is why the Steam path needs the `depotSignalResolved`
 *   re-derivation. Keep using it.
 * - **non-Steam** (legendary/gog/nile/humble/sideload) -> `isMacNative`. There is no depot probe
 *   here and never will be; `is_mac_native` is a direct statement from the store's library data,
 *   already resolved at open. It is the SAME field the availability seed uses, so default and
 *   availability can no longer disagree.
 */
export function resolveMacNativeOffered({
  runner,
  macDepotOffered,
  isMacNative
}: Omit<DefaultPlatformInput, 'isMac'>): boolean {
  return runner === 'steam' ? macDepotOffered : isMacNative
}

/**
 * The preselected platform.
 *
 * Steam behaviour is deliberately UNCHANGED — see the 34.15 D-14 note in `index.tsx` for why
 * Windows is the correct unknown-case answer there, and note that that reasoning is Steam-specific
 * and does not transfer to runners whose library data states mac-nativeness outright.
 */
export function resolveDefaultPlatform({
  isMac,
  runner,
  macDepotOffered,
  isMacNative
}: DefaultPlatformInput): InstallPlatform {
  const macOffered = resolveMacNativeOffered({
    runner,
    macDepotOffered,
    isMacNative
  })
  return isMac && macOffered ? 'Mac' : 'Windows'
}
