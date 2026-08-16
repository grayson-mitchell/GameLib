import { logInfo, logError, LogPrefix } from 'backend/logger'
import { steamMetadataStore, SteamMetadataCacheEntry } from './electronStores'
import { depotSignalCaptured } from './metadataCapture'
import { withTimeout, STEAM_PICS_BULK_TIMEOUT_MS } from './withTimeout'
import { resolvePlatformWrite } from './platformPrecedence'

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
 *
 * Quick task 260816-qcn (WR-02/CR-01): this writer no longer clobbers
 * unconditionally. `resolvePlatformWrite` (`./platformPrecedence`) decides,
 * by strict timestamp comparison, whether THIS PICS capture or the entry
 * already on disk survives. When declined, this function returns WITHOUT
 * calling `.set()` at all — a rewrite would only burn two
 * `notifyStoreChanged` IPC messages persisting values already there. See
 * `./platformPrecedence`'s header for the full D-A/D-B rule: the ordering is
 * now explicit and auditable, and a silently-lost write is impossible, but a
 * genuine appdetails-vs-PICS disagreement is NOT reconciled by this — which
 * answer survives still depends on which sync ran last; `platformsSource` /
 * `platformsCapturedAt` are what make that inspectable. Do not describe
 * WR-02 as closed.
 */
export function mergePlatformCapture(
  appId: string,
  platforms: CapturedPlatforms
): void {
  const existing = steamMetadataStore.get(appId)

  const resolution = resolvePlatformWrite(
    existing,
    platforms,
    'pics',
    Date.now()
  )

  if (!resolution.accepted) {
    // Declined: `existing` already carries a strictly newer, complete
    // platform capture. Do not rewrite it.
    return
  }

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
    is_windows_native: resolution.platforms.is_windows_native,
    is_mac_native: resolution.platforms.is_mac_native,
    is_linux_native: resolution.platforms.is_linux_native,
    platformsCaptured: true,
    platformsSource: resolution.platformsSource,
    platformsCapturedAt: resolution.platformsCapturedAt
  } as SteamMetadataCacheEntry

  steamMetadataStore.set(appId, merged)
}

// ── D-C serialisation: a module-local promise-chain mutex ───────────────────
//
// Quick task 260816-qcn: `captureOwnedAppPlatforms`'s scope-then-write is a
// read-modify-write that must be atomic with respect to ANOTHER BULK RUN of
// itself. Without this, two concurrent calls both scope off the SAME stale
// snapshot of `steamMetadataStore`, and the second run cannot see the
// first's writes -- the exact shape of the 34.15 D-16 UAT finding F-2, where
// a single Electron `origin=mount` fired two concurrent `refresh()` calls
// and the second re-scoped all 378 apps. This lock does NOT exclude the
// `appdetails` writer in `games.ts` -- that writer's own read-modify-write
// is synchronous and therefore already atomic on its own, and cross-writer
// ordering between the two DIFFERENT writers is `resolvePlatformWrite`'s
// job, not this lock's.
let platformCaptureChain: Promise<unknown> = Promise.resolve()

/**
 * Runs `section` after every previously-queued section has settled,
 * REGARDLESS of that prior section's outcome (resolved or rejected). The
 * module-local chain is re-pointed at a swallowed-outcome continuation
 * BEFORE this call returns, so a rejected section can never poison the
 * chain for every later caller -- the caller of THIS call still observes
 * the real (un-swallowed) rejection via the returned promise.
 *
 * Exported for the test that proves the lock does not wedge (T-qcn-02).
 */
export async function withPlatformCaptureLock<T>(
  section: () => Promise<T>
): Promise<T> {
  const run = platformCaptureChain.then(section, section)
  platformCaptureChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Narrow STRUCTURAL client interface (not the real `steam-user` type) so
 *  this module is unit-testable with a plain object and no `steam-user`
 *  import. `library.ts` casts the real authenticated client to this shape
 *  (Plan 05), mirroring `depot.ts`'s narrow-cast convention for undocumented
 *  or partially-typed `steam-user` surfaces. */
export interface PlatformCapturePicsClient {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{
    apps?: Record<number, { appinfo?: unknown }>
    unknownApps?: number[]
  }>
}

export interface PlatformCaptureSummary {
  scopedCount: number
  capturedCount: number
  skippedCount: number
  failed: boolean
}

/**
 * D-04-scoped, D-03 fail-soft bulk PICS platform capture. Scopes to apps
 * whose depot signal was never captured, fetches `appinfo.common.oslist` for
 * all of them in ONE `getProductInfo` call (no chunking — mirrors
 * `depot.ts:466-486`'s `fetchDlcInfos` zero-chunking precedent verbatim,
 * bounded only by `STEAM_PICS_BULK_TIMEOUT_MS`, sized against node-steam-user
 * issue #144's documented large-library PICS slowness), and merges each
 * result via `mergePlatformCapture`.
 *
 * This function MUST NOT throw under any input — D-03 requires the sync to
 * fail soft and continue on a PICS timeout or error. Fail-CLOSED is this
 * repo's house default; this is the SECOND deliberate exception (34.14 D-04's
 * depot fail-open is the first). Aborting the sync on a PICS failure would
 * trade "incomplete metadata" for "no library" — defect 2's exact shape. A
 * later reviewer must not "fix" this back to fail-closed.
 */
export async function captureOwnedAppPlatforms(
  client: PlatformCapturePicsClient,
  appIds: number[]
): Promise<PlatformCaptureSummary> {
  // 34.15-09 reconciliation (D-07 orchestrator finding #2): the `try` below
  // now starts BEFORE the `depotSignalCaptured`/`steamMetadataStore.get`
  // filter step, not after it. This function's own doc comment above says
  // it "MUST NOT throw under any input" -- but the filter step used to run
  // OUTSIDE the try, so a synchronous throw from `steamMetadataStore.get()`
  // (however unlikely for an in-memory electron-store read) would have
  // propagated as a rejected promise straight through `library.ts`'s
  // Step 1.5 call site, which carries NO try/catch of its own precisely
  // because this function is contracted never to need one. On the unscoped
  // mount-time path (`init()`'s `runOnceWhenOnline(() => this.refresh())`,
  // no `.catch` anywhere in the chain) that would have been exactly the
  // silent unhandled-rejection hole D-07 exists to close. Moving the `try`
  // up closes the gap completely rather than leaving it as a documented but
  // unclosed exception to the function's own contract.
  //
  // `scopedCount` is a mutable OUTER binding (rather than reading
  // `scoped.length` from inside the catch) precisely because `scoped` itself
  // may never be computed if the filter step is what throws -- the catch
  // needs a value that is always defined. It starts at `appIds.length` (the
  // most honest answer when the filter never completed: "every id was
  // still unresolved as far as this call could tell") and is narrowed to
  // the real scoped count the moment the filter succeeds.
  let scopedCount = appIds.length
  try {
    // D-C: the scope-then-write below runs inside `withPlatformCaptureLock`
    // so a concurrent call to this same function cannot scope off a stale
    // snapshot -- see the lock's own doc comment above for the F-2 shape
    // this closes. Placed INSIDE this `try` (not around the whole function)
    // for the same D-07 finding #2 reason the filter step itself was moved
    // in here: the lock/queue primitive is new, and this function's
    // never-throws contract must cover it too.
    return await withPlatformCaptureLock(async () => {
      // D-04: reuse depotSignalCaptured() verbatim — never re-derive its
      // logic. This is what makes "what the bulk job repairs" and "what the
      // install form calls unresolved" the same set BY CONSTRUCTION.
      const scoped = appIds.filter(
        (id) => !depotSignalCaptured(steamMetadataStore.get(String(id)))
      )
      scopedCount = scoped.length

      if (scoped.length === 0) {
        // Converging steady state: after the first sync repairs the
        // residue + never-fetched games, subsequent syncs ask for little
        // or nothing, and this branch means literally no PICS call is
        // made.
        return {
          scopedCount: 0,
          capturedCount: 0,
          skippedCount: 0,
          failed: false
        }
      }

      const response = await withTimeout(
        client.getProductInfo(scoped, [], true),
        STEAM_PICS_BULK_TIMEOUT_MS,
        'captureOwnedAppPlatforms getProductInfo'
      )

      let capturedCount = 0
      let skippedCount = 0

      for (const id of scoped) {
        // An id that came back in `unknownApps` (delisted / token-gated) is
        // treated identically to an entirely absent entry — skip, do not
        // trust whatever (if anything) `apps` happens to hold for it.
        const isUnknownApp = response.unknownApps?.includes(id) === true
        const entry = isUnknownApp ? undefined : response.apps?.[id]
        const appinfo = entry?.appinfo as AppCommonOslist | undefined
        const parsed = appinfo
          ? parseOslistPlatforms(appinfo.common?.oslist)
          : null

        // Missing entry, missing appinfo, missing common, or an
        // absent/empty/unrecognised oslist all collapse to the same "write
        // nothing for this app" outcome via parseOslistPlatforms's null
        // return. This deliberately DIVERGES from fetchAppInfo's single-app
        // precedent (`depot.ts:456-460`), which THROWS on a missing entry —
        // that throwing shape must not be copied into this fail-soft bulk
        // path; a missing/ambiguous per-app answer here is an ordinary,
        // expected outcome, not an error.
        if (!parsed) {
          skippedCount += 1
          continue
        }

        mergePlatformCapture(String(id), parsed)
        capturedCount += 1
      }

      logInfo(
        `Steam bulk platform capture: scoped=${scoped.length} captured=${capturedCount} skipped=${skippedCount}`,
        LogPrefix.Steam
      )

      return {
        scopedCount: scoped.length,
        capturedCount,
        skippedCount,
        failed: false
      }
    })
  } catch (err) {
    // T-34.15-01-03 / D-03: a PICS timeout or error (including the bulk
    // socket itself rejecting) logs and returns a failure summary. This
    // function never throws — the caller (Plan 05's refresh() wiring)
    // proceeds to today's cache-only hydration on a failed capture.
    logError(['Steam bulk platform capture failed:', err], LogPrefix.Steam)
    return {
      scopedCount,
      capturedCount: 0,
      skippedCount: 0,
      failed: true
    }
  }
}
