/**
 * Phase 34.15 Plan 01 — D-01's bulk PICS platform-capture writer.
 *
 * WHAT this module is: today the Steam sync captures NO platform data up
 * front — `is_windows_native`/`is_mac_native`/`is_linux_native` are only
 * populated lazily, one game at a time, via `appdetails`
 * (`games.ts:654-656`). Across a real library this leaves most titles
 * `undefined`, which makes 34.14's D-04 fail-open load-bearing in ORDINARY
 * use rather than as a rare edge case. This module fetches
 * `appinfo.common.oslist` for every owned app in ONE bulk Steam CM PICS
 * `getProductInfo` call (D-01 — deliberately NOT batched `appdetails`; see
 * `34.15-CONTEXT.md` D-01 for why the ROADMAP's original direction was
 * overridden) and writes the result as a first-class captured signal (D-02).
 *
 * `depotSignalCaptured()` (`./metadataCapture`) stays byte-identical and is
 * IMPORTED here, never re-derived — reusing the exact predicate 34.14's own
 * gating reads makes "what this bulk job repairs" and "what the install
 * form calls unresolved" the same set BY CONSTRUCTION, not by coincidence
 * (D-04).
 *
 * THE NON-CONSEQUENCE (D-05, the single most important thing for a later
 * reader not to get wrong): this module makes an unresolved platform signal
 * RARE, not impossible. A PICS fail-soft, an absent/empty `oslist` for a
 * specific app, a cached-library early return, or a cold-start `init()` push
 * can all still leave `is_windows_native` `undefined` for a game the user
 * can already see in their library. Nothing downstream of this module — not
 * `hasSteamWindowsDepot`, not the install form's pending row, not the
 * Install-disable — may assume the data is complete after this ships.
 *
 * This plan does NOT wire this module into `SteamLibraryManager.refresh()`
 * — that is Plan 05. This module lands and is proven in isolation first.
 */

/**
 * Narrow, ADDITIONAL view of PICS appinfo's `common.oslist` field — mirrors
 * `depot.ts:175-180`'s `AppCommonName` pattern exactly. Deliberately NOT
 * folded into `depot/select.ts`'s shared depot-info type (which only needs
 * `depots`/`extended.listofdlc`, and is shared with the download
 * orchestrator — widening it here would be unrelated blast radius).
 * `AppInfoContent` (`@types/steam-user`) is a discriminated union where
 * `common` is not present on every variant, which is exactly why this
 * narrow local cast exists rather than a non-null assertion.
 */
export interface AppCommonOslist {
  common?: { oslist?: string }
}

/** The three platform booleans this module ever writes. Each is computed as
 *  token-PRESENT (an `=== true` semantics by construction, never an inverted
 *  "not confirmed absent" reading) — see `parseOslistPlatforms` below. */
export interface CapturedPlatforms {
  is_windows_native: boolean
  is_mac_native: boolean
  is_linux_native: boolean
}

// T-34.15-01-01: token vocabulary mirrors the EXISTING depot-level parser
// (`depot/select.ts:186-189`, `cfg.oslist.split(',').includes(os)`) — same
// lowercase `windows`/`macos`/`linux` tokens, comma-separated string, never
// an array. `osx` is accepted as a defensive legacy synonym for `macos`:
// the `oslist` wire shape is only MEDIUM confidence (sourced from
// third-party PICS dumps, not an authoritative `steam-user` type), so a
// legacy spelling must degrade to a correct capture rather than a silent
// miss (ASVS V5 — defensive parsing of Valve-controlled data).
const OSLIST_TOKEN_MAP: Record<string, keyof CapturedPlatforms> = {
  windows: 'is_windows_native',
  macos: 'is_mac_native',
  osx: 'is_mac_native',
  linux: 'is_linux_native'
}

/**
 * Parses PICS `appinfo.common.oslist` into the three platform booleans this
 * module writes, or `null` when nothing should be written at all (D-02: an
 * absent/empty/unrecognised `oslist` writes NOTHING — `undefined` stays
 * `undefined` rather than manufacturing a false "no platforms" capture).
 *
 * Returns `null` for: a non-string input, an empty string, a whitespace-only
 * string, or a string containing only unrecognised tokens. A string mixing
 * recognised and unrecognised tokens still yields a capture — only the
 * recognised tokens are unknown, not the whole answer.
 */
export function parseOslistPlatforms(
  oslist: unknown
): CapturedPlatforms | null {
  if (typeof oslist !== 'string') {
    return null
  }

  const tokens = oslist
    .split(',')
    .map((token) => String(token).trim().toLowerCase())
    .filter((token) => token.length > 0)

  if (tokens.length === 0) {
    return null
  }

  const captured: CapturedPlatforms = {
    is_windows_native: false,
    is_mac_native: false,
    is_linux_native: false
  }

  let recognisedAny = false
  for (const token of tokens) {
    const field = OSLIST_TOKEN_MAP[token]
    if (field) {
      captured[field] = true
      recognisedAny = true
    }
  }

  // A string of ONLY unrecognised tokens (e.g. a future/unknown Valve OS
  // token) is indistinguishable from "we learned nothing" — write nothing,
  // same as an absent oslist, rather than falsely claiming all-false.
  return recognisedAny ? captured : null
}
