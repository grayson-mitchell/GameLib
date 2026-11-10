import axios from 'axios'
import { ExtraInfo, GameInfo } from 'common/types'
import { parseMetacriticScore } from 'common/metacriticScore'
import { logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from '../../ipc'
import { knownFixSaysMac32 } from './macArchKnownFix'
import { resolvePlatformWrite } from './platformPrecedence'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import { STEAM_STORE_API, NUMERIC_APP_ID } from './gameConstants'
import { macArchFromMinOS } from './gameRequirements'
import type SteamGame from './games'

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

/**
 * Fetches title, description, genres, and artwork from the Steam store
 * appdetails API.  Deduplicates concurrent calls via module-level
 * `pendingFetches` Set (T-2-03 mitigation): the appId is added to the Set
 * BEFORE the first await so subsequent synchronous callers see it immediately.
 *
 * On success: caches metadata in steamMetadataStore (D-05) and pushes the
 * enriched GameInfo to the frontend via sendFrontendMessage.
 * On failure: logs a warning and returns silently (no throw).
 *
 * @internal Lifted from SteamGame (65-13); do not call from outside steam/.
 */
export async function fetchMetadataIfNeeded(
  steamGame: SteamGame,
  current: GameInfo
): Promise<void> {
  // Guard: if a fetch is already in-flight for this appId, return immediately
  // (pendingFetches.add MUST come before the await — prevents T-2-03 race)
  if (pendingFetches.has(steamGame.appId)) return

  // Guard: non-numeric appId rejected before any URL is constructed (T-06-01),
  // matching the sibling chokepoints getSteamInstallSize and
  // buildSteamProtocolUrl. 08.1 review WR-03: this method interpolates
  // `steamGame.appId` into a store.steampowered.com query string AND into two
  // cdn.cloudflare.steamstatic.com image URLs that are pushed to the renderer
  // as <img src>, so it is exactly the shape those two already validate.
  // Placed AFTER the dedup check and BEFORE the syncing-indicator flip so a
  // rejected appId cannot leave the indicator stuck on.
  if (!NUMERIC_APP_ID.test(steamGame.appId)) {
    logWarning(
      `SteamGame: fetchMetadataIfNeeded rejected a non-numeric appId (T-06-01)`,
      LogPrefix.Steam
    )
    return
  }
  // Notify the frontend a background metadata/art sync is starting (the first
  // pending fetch flips the indicator on; the last one flips it off below).
  if (pendingFetches.size === 0) {
    sendFrontendMessage('steamMetadataSyncing', { syncing: true })
  }
  pendingFetches.add(steamGame.appId)

  // Throttle: wait for a concurrency slot so a cold cache doesn't open
  // hundreds of parallel Steam CDN connections at once (mass ETIMEDOUT).
  await acquireMetadataSlot()

  try {
    const resp = await axios.get(
      `${STEAM_STORE_API}?appids=${steamGame.appId}`,
      {
        timeout: METADATA_FETCH_TIMEOUT_MS
      }
    )

    const entry = resp.data?.[steamGame.appId]
    const data = entry?.data

    if (entry?.success === false) {
      // GAP-B: Definitive verdict — Steam says this app no longer exists (delisted).
      // Persist the flag without wiping cached art/extra so the entry can be reverted
      // if Steam re-lists the app. Push the updated GameInfo so the frontend drops it live.
      const delistedInfo: GameInfo = { ...current, is_delisted: true }
      const existing = steamGame.deps.stores.steam.steamMetadataStore.get(
        steamGame.appId
      )
      steamGame.deps.stores.steam.steamMetadataStore.set(steamGame.appId, {
        ...(existing ?? {
          art_cover: '',
          art_square: '',
          extra: { reqs: [] }
        }),
        is_delisted: delistedInfo.is_delisted
      })
      library.set(steamGame.appId, delistedInfo)
      sendFrontendMessage('pushGameToLibrary', delistedInfo)
      return
    }

    if (!data) {
      // Ambiguous / empty envelope — treat as transient (network, rate-limit).
      // MUST NOT set is_delisted here; a network blip must not hide owned games.
      return
    }

    const artBase = `${STEAM_CDN_BASE}/${steamGame.appId}`
    const art_cover = `${artBase}/header.jpg`
    // Portrait library capsule (2:3) — matches the portrait game tile. The
    // landscape capsule_616x353 only filled a cropped center strip of the tile.
    const art_square = `${artBase}/library_600x900.jpg`

    // Build extra — preserve existing fields (especially steamPlaytimeMinutes)
    // T-2-02: short_description stored as plain string only, never HTML-parsed
    const extra: ExtraInfo = {
      ...current.extra,
      reqs: current.extra?.reqs ?? [],
      about: {
        description: data.short_description ?? '',
        shortDescription: data.short_description ?? ''
      },
      genres: (data.genres ?? []).map(
        (g: { id: string; description: string }) => g.description
      )
    }

    // DETAIL-01: capture native platform support from appdetails, for all
    // three platforms. D-17: the Windows flag is a pre-install
    // depot-availability signal for the install form's selectable macOS
    // platform row — it comes from this SAME response, so it adds no new
    // network call, no PICS query, and involves none of the four install
    // branches' routing logic.
    const is_mac_native = !!data.platforms?.mac
    const is_linux_native = !!data.platforms?.linux
    const is_windows_native = !!data.platforms?.windows

    // Quick 261029-sbi: appdetails `metacritic.score` (a number), validated
    // by the shared parser. Absent keeps whatever was already captured.
    const metacritic_score = parseMetacriticScore(data.metacritic?.score)

    // Quick task 260816-qcn (WR-02/CR-01): this appdetails fetch is one of
    // TWO independent writers of the platform triple — platformCapture.ts's
    // bulk PICS `oslist` capture is the other. resolvePlatformWrite (D-A)
    // decides, by strict timestamp comparison, whether THIS write's triple
    // or the EXISTING cached triple is the one actually used below. See
    // `./platformPrecedence`'s header for the full rule and its honesty
    // limit (D-B): freshest-write-wins makes the ordering explicit and
    // auditable and makes a silently-lost write impossible — it does NOT
    // reconcile a genuine appdetails-vs-PICS disagreement. When the two
    // sources disagree about an app, the surviving answer still depends on
    // which sync ran most recently; `platformsSource`/`platformsCapturedAt`
    // are what make that outcome inspectable after the fact. Do not
    // describe WR-02 as closed.
    const existingMeta = steamGame.deps.stores.steam.steamMetadataStore.get(
      steamGame.appId
    )
    const resolution = resolvePlatformWrite(
      existingMeta,
      { is_windows_native, is_mac_native, is_linux_native },
      'appdetails',
      Date.now()
    )
    // The EFFECTIVE triple — NEVER the raw appdetails values above — is
    // used everywhere downstream in this function. A declined cache write
    // that still pushed the raw appdetails triple to the frontend would
    // recreate CR-01's exact shape (a stale seed reaching the install
    // dialog's glyph row) with the polarity flipped.
    const {
      is_windows_native: effectiveIsWindowsNative,
      is_mac_native: effectiveIsMacNative,
      is_linux_native: effectiveIsLinuxNative
    } = resolution.platforms

    // MAC32-01 (direction B): derive the pre-install arch hint from the
    // SAME appdetails response — no separate network/PICS call. Gated:
    //  1. Never overwrite a Mach-O-verified entry (post-install ground
    //     truth always wins — a cheap heuristic must not regress a
    //     confirmed fact, T-18-02-04).
    //  2. Only compute when the EFFECTIVE is_mac_native is true (Pitfall 2;
    //     quick task 260816-qcn: gated on the EFFECTIVE flag, never the raw
    //     appdetails one, so a declined write cannot derive mac_arch from a
    //     platform triple that just lost the precedence decision) — a false
    //     is_mac_native already routes correctly via the existing
    //     isBottleEligible() D-11 OR-branch, making this signal moot.
    const macArchVerified = existingMeta?.mac_arch_verified === true
    const knownFix32 = knownFixSaysMac32(steamGame.appId, existingMeta)
    const mac_arch: GameInfo['mac_arch'] = macArchVerified
      ? existingMeta.mac_arch
      : knownFix32
        ? '32'
        : effectiveIsMacNative
          ? macArchFromMinOS(data.mac_requirements?.minimum)
          : // A retracted known-fix seed must not leave an orphan '32'.
            existingMeta?.mac_arch_source === 'known-fix'
            ? undefined
            : existingMeta?.mac_arch

    const updated: GameInfo = {
      ...current,
      title: data.name ?? current.title,
      art_cover,
      art_square,
      is_mac_native: effectiveIsMacNative,
      is_linux_native: effectiveIsLinuxNative,
      is_windows_native: effectiveIsWindowsNative,
      mac_arch,
      // GAP-B: clear any stale delisted flag — the app is available again.
      is_delisted: false,
      // Phase 17 D-08 reconciliation: this push only happens after a
      // successful appdetails fetch, which is exactly when platforms are
      // captured — mirrors steamMetadataStore.platformsCaptured below.
      steamPlatformsCaptured: true,
      metacritic_score: metacritic_score ?? existingMeta?.metacritic_score,
      extra
    }

    // Persist metadata for next session (D-05, indefinite cache).
    // platformsCaptured:true records that appdetails `platforms` was read, so
    // getGameInfo won't re-fetch this game again for platform data (self-heal once).
    // T-18-02-04: steamMetadataStore.set REPLACES the entire entry (electron-store
    // Store.set), so a Mach-O-verified verdict (mac_arch_verified/mac_arch_source)
    // AND the D-17 (34.13-14) persisted forcedWindowsViaBottle verdict must
    // both be explicitly carried forward here — otherwise the NEXT
    // fetchMetadataIfNeeded call (next launch/resync) would silently drop
    // either: mac_arch would regress to the min-OS heuristic and a forced
    // game would revert to native routing intermittently.
    //
    // 34.13 review A-19: a third carry-forward, `nativeBottleInstall`, was
    // REMOVED with the field itself. Every carry-forward here is a standing
    // obligation on every future writer of this payload, so a field with no
    // reader is not free — it is a permanent tax plus an invitation to
    // trust it.
    //
    // Quick task 260816-qcn: `platformsSource`/`platformsCapturedAt` are two
    // MORE standing carry-forward obligations, added by resolvePlatformWrite
    // (D-A). This literal is ENUMERATED, not a `...existing` spread, so both
    // MUST be listed explicitly here or a declined write would erase the
    // stamp it is honouring — the exact T-18-02-04 trap this comment block
    // already documents at length for the fields above.
    steamGame.deps.stores.steam.steamMetadataStore.set(steamGame.appId, {
      art_cover,
      art_square,
      extra,
      is_mac_native: effectiveIsMacNative,
      is_linux_native: effectiveIsLinuxNative,
      is_windows_native: effectiveIsWindowsNative,
      is_delisted: false,
      platformsCaptured: true,
      platformsSource: resolution.platformsSource,
      platformsCapturedAt: resolution.platformsCapturedAt,
      mac_arch,
      ...(macArchVerified
        ? {
            mac_arch_verified: true as const,
            ...(existingMeta?.mac_arch_source
              ? { mac_arch_source: existingMeta.mac_arch_source }
              : {})
          }
        : // Fifth carry-forward on this enumerated write. Re-derived from the
          // curated file rather than copied from existingMeta, so an
          // in-flight fetch that read existingMeta before the seed landed
          // cannot drop it (quick 261027-bqe). Never sets mac_arch_verified.
          knownFix32
          ? { mac_arch_source: 'known-fix' as const }
          : effectiveIsMacNative
            ? { mac_arch_source: 'minos' as const }
            : {}),
      ...(existingMeta?.forcedWindowsViaBottle === true
        ? { forcedWindowsViaBottle: true as const }
        : {}),
      // D-51-07: the persisted bridge verdict (scan/userRoute/
      // identityFallback/etc.) is a FOURTH standing carry-forward
      // obligation on this enumerated write, identical in shape to
      // forcedWindowsViaBottle just above -- steamMetadataStore.set
      // REPLACES the whole entry (T-18-02-04), so a declined/refreshed
      // appdetails write would otherwise silently wipe a scan result the
      // bridge already paid for.
      ...(existingMeta?.bridge ? { bridge: existingMeta.bridge } : {}),
      // Quick 261029-sbi: SIXTH standing carry-forward on this enumerated
      // write (same T-18-02-04 trap). A fresh score wins; otherwise the
      // existing score and captured flag are carried, never invented.
      ...(metacritic_score !== undefined
        ? { metacritic_score, metacriticCaptured: true as const }
        : {
            ...(existingMeta?.metacritic_score !== undefined
              ? { metacritic_score: existingMeta.metacritic_score }
              : {}),
            ...(existingMeta?.metacriticCaptured === true
              ? { metacriticCaptured: true as const }
              : {})
          })
    })

    // Update in-memory library so subsequent getGameInfo calls return enriched data
    library.set(steamGame.appId, updated)

    // Push enriched entry to frontend — GameCard re-renders with real art + title
    sendFrontendMessage('pushGameToLibrary', updated)
  } catch (err) {
    logWarning(
      [`Steam metadata fetch failed for appId ${steamGame.appId}:`, err],
      LogPrefix.Steam
    )
  } finally {
    releaseMetadataSlot()
    pendingFetches.delete(steamGame.appId)
    // Last pending fetch drained — turn the sync indicator off.
    if (pendingFetches.size === 0) {
      sendFrontendMessage('steamMetadataSyncing', { syncing: false })
    }
  }
}
