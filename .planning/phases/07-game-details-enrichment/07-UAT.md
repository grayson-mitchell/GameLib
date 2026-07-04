---
status: testing
phase: 07-game-details-enrichment
source: [ROADMAP.md success criteria, PROJECT.md Phase 07 decisions, STATE.md pending todo]
started: 2026-07-04T07:10:00Z
updated: 2026-07-04T09:00:00Z
---

## Current Test

number: 7
name: Pill click-through (DETAIL-02)
expected: |
  Clicking the compatibility pill opens the corresponding AppleGamingWiki /
  CodeWeavers CrossOver page for the game (click-through works).
awaiting: user response

## Tests

### 1. Platform support icons on the game details page (DETAIL-01)
expected: On a Steam game's details page, the Install-info panel shows platform icons reflecting supported platforms (Windows / macOS / Linux). Windows-only shows just Windows; Mac-native adds the Apple glyph; Linux-native adds the Tux glyph.
result: pass
reported: "Re-test after GAP 1/2 fix: macOS glyph now shows on 7 Days to Die, and installed platform reads Mac. (Icon spacing still not visible — see test 2; GAP 3 re-fixed at top level, pending one more rebuild.)"
history: "Originally issue (Windows-only) — fixed by self-healing platform re-fetch (51a1c08e) + install-platform derivation (c9dd267a)."

### 2. Runner-agnostic platform icons (DETAIL-01)
expected: The same platform icons render on a NON-Steam game (Epic / GOG / Amazon) details page — the icons are runner-agnostic FontAwesome brand glyphs, not Steam-only — AND the icons now have visible spacing between them.
result: pass
observations: "Runner-agnostic rendering works; spacing fix (f737caad) confirmed after rebuild."

### 3. Compatibility overlay on a WINDOWS Steam game (DETAIL-02, macOS)
expected: On macOS, open a WINDOWS-only Steam game (no Mac-native build). An AppleGamingWiki compatibility rating pill is overlaid on the game art — the rating measures how well the Windows game runs on macOS via Wine/CrossOver. The pill's color reflects the tier (Perfect/Playable → success/green, Runs/Borderline → warning/yellow, Unplayable → danger/red).
result: pass
reported: "Initially 'no pill' — pill was actually rendering top-left but hidden BEHIND the store logo (.store-icon also top-left). Confirmed via investigation. Fixed by right-justifying the pill (GamePicture/index.css: left→right). Gate inversion works — pill appears on a Windows-only game on macOS."
observations: "DETAIL-02 gate verified working. Cosmetic collision with store logo fixed (right-justified)."
analysis: "DESIGN CORRECTION (supersedes D-13). The DETAIL-02 overlay gate was semantically BACKWARDS. AppleGamingWiki CrossOver/Wine ratings measure how well a WINDOWS game runs on macOS via a translation layer; a Mac-NATIVE game runs natively and needs no such rating. Gate inverted from `platform==='darwin' && is_mac_native` to `platform==='darwin' && !is_mac_native`."
resolution: "GATE INVERTED (ed4ff48b) to `platform==='darwin' && !gameInfo.is_mac_native`; AppleRatingOverlay doc comment updated; D-13 marked superseded in STATE.md. User chose always-show (Unrated when no rating). Re-verifying after rebuild — pill should now appear on WINDOWS games on macOS."

### 4. Overlay gating — hidden on Mac-native / non-macOS (DETAIL-02)
expected: The compatibility overlay does NOT appear on a Mac-NATIVE Steam game (it runs natively, no translation-layer rating needed), and does NOT appear at all when not on macOS. Gate is platform==='darwin' && !is_mac_native.
result: pass
observations: "No pill on a Mac-native game — gate correctly hides the overlay for native builds."

### 5. "Unrated" pill for Windows games with no rating (DETAIL-02)
expected: A Windows Steam game (on macOS) that has no AppleGamingWiki rating still shows an overlay pill, reading "Unrated" (neutral/default color) rather than showing nothing.
result: pass
reported: "After the fix + restart: 'Runs' pill shows on Alan Wake (real CrossOver rating). Confirmed the whole pipeline works — real ratings display, Unrated only for genuine no-rating games."
severity: major
history: "Originally issue (everything 'Unrated'). Root cause: Cloudflare 403 on axios default UA (fetch never succeeded). Fixed via browser UA + cache self-heal + no-page marker."
api_verification: "Confirmed the fetch pipeline live for 'Alan Wake' (pageid 1305): crossoverRating='Runs' (matches the wiki), wineRating='unknown', crossoverLink='alan-wake'. Parser + regexes + default 'crossover' source all correct — proving the fix surfaces real ratings once the stale null cache self-heals. ratingTier('runs') → warning/yellow, label 'Runs'."
analysis: "The narrow 'Unrated fallback' behavior works, but the underlying rating data never reaches the pill. ROOT CAUSE CONFIRMED via on-disk cache inspection: all 26 entries in gamelib/store_cache/wikigameinfo.json have applegamingwiki=null (incl. Wasteland 2/3, Pillars of Eternity, Dead Island — which DO have wiki ratings). wikiGameInfoStore (src/backend/wiki_game_info/electronStore.ts) uses a 30-day TTL with NO invalidateCheck, so entries cached before AppleGamingWiki data was populated never re-fetch. The parser regexes (applegamingwiki/constants.ts) were verified to MATCH current live wikitext, and the default rating source is correctly 'crossover' — so the fault is purely the stale, non-invalidating cache."

### 6. CrossOver ↔ Wine rating-source toggle (DETAIL-02)
expected: In the Accessibility settings screen (macOS only), the rating-source toggle (appleRatingSource: CrossOver default / Wine) is present. Switching it changes the rating shown on BOTH surfaces (the art overlay pill and the game-details compat row) to that source's rating.
result: pass
reported: "Works — toggling CrossOver/Wine updates both the art pill and the details compat row. Follow-up: toggle was in the WRONG place (Accessibility); moved to Settings › General per user."
observations: "Rating-source toggle relocated from Accessibility screen to Settings › General (macOS-only, global settings). New i18n keys under setting.apple_rating_source*; old accessibility.* keys removed. tsc + lint clean."

### 7. Pill click-through (DETAIL-02)
expected: Clicking the compatibility pill opens the corresponding AppleGamingWiki page / rating source for the game (click-through works).
result: [pending]
reason: "Unblocked — pill renders now (test 3)."

## Summary

total: 7
passed: 6
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

- truth: "Multiplatform Steam games show all supported-platform icons (Windows/macOS/Linux) on the game details page."
  status: failed
  reason: "User reported (tests 1 + 3): multiplatform Steam games (e.g. 7 Days to Die, which supports Mac) only show the Windows icon. GOG works, so the runner-agnostic rendering is fine — the Steam is_mac_native/is_linux_native flags are false."
  severity: major
  test: 1
  root_cause: "games.ts:157 — fetchMetadataIfNeeded (the ONLY place is_mac_native/is_linux_native are captured from appdetails) is gated on `if (!existing.art_cover)`. Any game whose art was cached in a prior session (the whole pre-Phase-7 library) skips the fetch, so the flags stay at their `false` default (library.ts:196-197). DETAIL-01 works only for freshly-synced/uncached games."
  artifacts:
    - path: "src/backend/storeManagers/steam/games.ts"
      issue: "line 157 refetch guard `!existing.art_cover` never re-fetches platform flags for already-cached games"
    - path: "src/backend/storeManagers/steam/library.ts"
      issue: "lines 196-197 default is_mac_native/is_linux_native to false, coercing the 'never fetched' state to 'Windows-only'"
  missing:
    - "Re-fetch appdetails when platform flags were never captured. Needs a sentinel (e.g. cachedMeta.is_mac_native === undefined in the store, or a platformsCaptured/metadata-version marker) since GameInfo coerces the flag to false. Self-healing one-time re-fetch for existing caches."
  class: bug

- truth: "The game details page shows the correct INSTALLED platform for a Steam game (macOS build shows macOS, not Windows)."
  status: failed
  reason: "User reported (test 3): 7 Days to Die installed on macOS shows 'installed platform: Windows' — wrong."
  severity: major
  test: 3
  root_cause: "src/backend/storeManagers/steam/library.ts hardcodes `platform: 'Windows' as const` in all install-info construction sites (lines 205, 325, 486). The installed platform is never derived from the actual install; it is a constant."
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      issue: "platform: 'Windows' as const hardcoded at 205, 325, 486"
  missing:
    - "Derive the installed platform (Mac build on macOS installs are the Mac depot). At minimum stop hardcoding Windows; ideally reflect the host/native platform for the installed build."
  class: bug

- truth: "Platform icons on the game details page have visible spacing between them."
  status: failed
  reason: "User reported (test 2): platform icons are almost on top of each other; add ~5px spacing between them."
  severity: cosmetic
  test: 2
  root_cause: "Platform-icon list in the Install-info TabPanel lacks inter-icon spacing/gap."
  artifacts: []
  missing:
    - "Add ~5px gap between platform icons."
  class: ui-polish

- truth: "The DETAIL-02 compatibility pill is not obscured by the store logo on the cover art."
  status: resolved
  reason: "User (test 3): pill was rendering but hidden BEHIND the store logo — both were top-left (.appleRatingPill left: var(--space-xs); .store-icon left: 0.5rem). The gate inversion itself works; this was purely a layout collision."
  severity: cosmetic
  test: 3
  root_cause: "GamePicture/index.css positioned .appleRatingPill top-LEFT, the same corner as .store-icon; the store logo painted over it."
  artifacts:
    - path: "src/frontend/screens/Game/GamePicture/index.css"
      issue: "pill left-justified into the store-logo corner"
  missing:
    - "FIXED: right-justify the pill (left → right: var(--space-xs)) so it sits in the free top-right corner."
  debug_session: ""
  class: ui-polish (fixed in-session)

- truth: "The DETAIL-02 pill shows the game's REAL AppleGamingWiki CrossOver/Wine rating (not always 'Unrated') for games that have one."
  status: failed
  reason: "User reported (test 5): every game shows 'Unrated', including games confirmed to have wiki ratings. Real ratings never display."
  severity: major
  test: 5
  root_cause: "TWO compounding faults. (1) PRIMARY — the AppleGamingWiki MediaWiki API sits behind Cloudflare that returns 403 (HTML challenge) to requests without a browser User-Agent. backend/utils.ts axiosClient sets NO User-Agent, so axios sends 'axios/x.y' → 403 → getPageID/getWikiText receive HTML → data.query throws → getInfoFromAppleGamingWiki catch returns null. VERIFIED via curl: UA 'axios/1.13.5' and empty UA → HTTP 403; Chrome UA → HTTP 200 JSON (both the search and parse endpoints). This is why the fetch has NEVER succeeded and all 26 cache entries are null — not pre-feature staleness. (2) SECONDARY — wikiGameInfoStore caches WikiInfo for 30 days (electronStore.ts) so even after fixing the UA, the stale null entries would be served until expiry (CacheStore.invalidateCheck at cache.ts:67-69 only runs POST-expiry). Both had to be fixed."
  artifacts:
    - path: "src/backend/wiki_game_info/applegamingwiki/utils.ts"
      issue: "getPageID/getWikiText sent no browser User-Agent → Cloudflare 403 → parse throws → null (the real cause of universal 'Unrated')"
    - path: "src/backend/wiki_game_info/wiki_game_info.ts"
      issue: "cache hit returned verbatim; a null applegamingwiki (macOS) served up to 30 days, so the UA fix alone wouldn't self-heal existing caches"
  missing:
    - "FIXED (primary): send a browser User-Agent on both AppleGamingWiki requests (mirrors howlongtobeat/utils.ts). Confirmed Alan Wake → crossoverRating 'Runs' via the exact pipeline."
    - "FIXED (secondary): getWikiGameInfo treats a cache hit as a MISS when isMac && !cachedResponse.applegamingwiki, so existing null caches self-heal on next visit; getInfoFromAppleGamingWiki returns a cacheable empty 'checked, none found' marker (not null) when no page exists. 30-day TTL remains the refresh path for rating changes."
  debug_session: ""
  class: bug
