---
status: partial
phase: 07-game-details-enrichment
source: [ROADMAP.md success criteria, PROJECT.md Phase 07 decisions, STATE.md pending todo]
started: 2026-07-04T07:10:00Z
updated: 2026-07-04T07:30:00Z
---

## Current Test

[paused — 2 root-cause Steam platform-data bugs found (supported-platform refetch guard + hardcoded install platform). Tests 4-7 blocked on the fix. Resume after fixing.]

## Tests

### 1. Platform support icons on the game details page (DETAIL-01)
expected: On a Steam game's details page, the Install-info panel shows platform icons reflecting supported platforms (Windows / macOS / Linux). Windows-only shows just Windows; Mac-native adds the Apple glyph; Linux-native adds the Tux glyph.
result: issue
reported: "For steam games does not seem to work — multiplatform games on Steam only seem to have the Windows icon."
severity: major

### 2. Runner-agnostic platform icons (DETAIL-01)
expected: The same platform icons render on a NON-Steam game (Epic / GOG / Amazon) details page — the icons are runner-agnostic FontAwesome brand glyphs, not Steam-only.
result: pass
observations: "Works for GOG games. Cosmetic: platform icons are almost on top of each other — add ~5px spacing between them."

### 3. Compatibility overlay on a Mac-native game (DETAIL-02, macOS)
expected: On macOS, open a Mac-supported Steam game. An AppleGamingWiki compatibility rating pill is overlaid on the game art. The pill's color reflects the tier (Perfect/Playable → success/green, Runs/Borderline → warning/yellow, Unplayable → danger/red).
result: issue
reported: "7 Days to Die installed on macOS: supported platforms shows Windows only, and 'installed platform: Windows' (both incorrect — it's the Mac build and the game supports Mac)."
severity: major
analysis: "Confirms + extends test 1. is_mac_native is false for a genuinely Mac-native Steam game, so (a) platform icons show Windows only and (b) the DETAIL-02 overlay gate (platform==='darwin' && is_mac_native) fails → no compat overlay. NEW symptom: the 'installed platform' field also reports Windows for a Mac install — Steam install-platform detection is wrong too. Root Steam platform-data bug blocks tests 1, 3, 4, 5."

### 4. Overlay gating — hidden on Windows-only / non-macOS (DETAIL-02)
expected: The compatibility overlay does NOT appear on a Windows-only Steam game (no Mac platform listing), and does NOT appear at all when not on macOS. Gate is platform==='darwin' && is_mac_native.
result: blocked
blocked_by: prior-phase
reason: "Cascade of the is_mac_native platform-data bug (test 1/3). Since is_mac_native is false for the cached library, the gate can't be meaningfully tested until the platform-flag refetch is fixed."

### 5. "Unrated" pill for Mac games with no rating (DETAIL-02)
expected: A Mac-native Steam game that has no AppleGamingWiki rating still shows an overlay pill, reading "Unrated" (neutral/default color) rather than showing nothing.
result: blocked
blocked_by: prior-phase
reason: "Cascade: no Mac-native game currently reports is_mac_native=true (test 1/3 bug), so the overlay (and its Unrated state) never renders. Retest after the platform-flag fix."

### 6. CrossOver ↔ Wine rating-source toggle (DETAIL-02)
expected: In the Accessibility settings screen (macOS only), the rating-source toggle (appleRatingSource: CrossOver default / Wine) is present. Switching it changes the rating shown on BOTH surfaces (the art overlay pill and the game-details compat row) to that source's rating.
result: blocked
blocked_by: prior-phase
reason: "Cascade: overlay/rating surfaces depend on is_mac_native (test 1/3 bug). Retest after the platform-flag fix. (The Accessibility toggle presence could be checked independently but the both-surfaces behavior can't.)"

### 7. Pill click-through (DETAIL-02)
expected: Clicking the compatibility pill opens the corresponding AppleGamingWiki page / rating source for the game (click-through works).
result: blocked
blocked_by: prior-phase
reason: "Cascade: no pill renders until is_mac_native is fixed (test 1/3 bug). Retest after the platform-flag fix."

## Summary

total: 7
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 4

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
