import { steamMetadataStore, SteamMetadataCacheEntry } from './electronStores'

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

/**
 * Read-modify-write merge of `platforms` into `steamMetadataStore`'s entry
 * for `appId` (D-02). T-18-02-04 / T-34.15-01-02: `CacheStore.set()`
 * (`backend/cache.ts:108`) REPLACES the entire stored value — there is no
 * merge method — so a wholesale `set()` with only the new fields would
 * silently drop `mac_arch_verified` / `mac_arch_source` /
 * `forcedWindowsViaBottle`, exactly the integrity failure `games.ts:692-731`
 * documents at length for the sibling per-game writer. Reading `existing`
 * FIRST and spreading it before the new fields is what makes every other
 * carry-forward field survive automatically, including ones added to
 * `SteamMetadataCacheEntry` after this module was written.
 *
 * Fields that MUST survive this merge (spread forward from `existing`, never
 * reconstructed field by field): `art_cover`, `art_square`, `extra`,
 * `is_delisted`, `mac_arch`, `mac_arch_verified`, `mac_arch_source`,
 * `forcedWindowsViaBottle`. `mac_arch` is NEVER inferred from PICS — this
 * writer never assigns it, so an absent `mac_arch` on `existing` stays
 * absent after the merge.
 *
 * Kept LOCAL to this module rather than added as a new named helper on
 * `./electronStores` (Claude's Discretion, D-02): a new shared merge surface
 * invites a future writer to misuse it for a different cache shape's
 * carry-forward rules, which do not generalise.
 */
export function mergePlatformCapture(
  appId: string,
  platforms: CapturedPlatforms
): void {
  const existing = steamMetadataStore.get(appId)

  // `art_cover`/`art_square`/`extra` are typed as REQUIRED on
  // SteamMetadataCacheEntry because every existing writer (games.ts) only
  // ever writes them alongside a freshly-fetched appdetails response. This
  // bulk PICS writer has no art source at all, and per D-04 its whole
  // purpose is to reach apps NO writer has touched yet — so `existing` can
  // legitimately be absent here where it never is for the per-game writer.
  // The narrow local cast documents that gap rather than inventing
  // placeholder art data; the on-disk store itself is untyped JSON, so a
  // partial entry is a legitimate runtime shape, not a corruption.
  const merged = {
    ...existing,
    is_windows_native: platforms.is_windows_native,
    is_mac_native: platforms.is_mac_native,
    is_linux_native: platforms.is_linux_native,
    platformsCaptured: true
  } as SteamMetadataCacheEntry

  steamMetadataStore.set(appId, merged)
}
