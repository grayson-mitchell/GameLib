---
phase: 08-new-steam-surfaces
verified: 2026-07-04T00:00:00Z
status: human_needed
score: 16/16 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  gaps_closed:
    - "UAT gap A (blank art for existing Steam games) — ConsoleCard/GameCard fallback prop wired"
    - "UAT gap B (delisted games hidden from Console) — is_delisted flag persisted, grid filtered, activation blocked"
    - "UAT gap C (GameLib-branded placeholder + greyed variant) — 2 new SVG assets, all 7 heroic_card.jpg consumers swapped"
    - "UAT gap D (launch overlay dismiss-on-blur) — blur listener + 8s safety net replaces fixed 1500ms"
    - "UAT gap F (Deals Hide Owned cross-store) — all-store ownedTitles Set + filteredSorted predicate applied"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Gap A re-UAT — Steam game with a broken/404 art URL in the Console grid"
    expected: "The tile shows the greyed 'Artwork unavailable' GameLib placeholder instead of a blank tile. Games with no art URL show the branded 'No artwork' default. No blank tiles anywhere in the grid."
    why_human: "CachedImage onError chain triggers on a real 404 from the CDN; cannot simulate a broken art URL headlessly without a running renderer"
  - test: "Gap B re-UAT — Delisted Steam game absent from Console"
    expected: "A known-delisted owned Steam game does not appear in the Console grid. If Steam's appdetails API is temporarily offline (no network), valid non-delisted games remain visible — a transient failure must not hide them."
    why_human: "Requires a real Steam library containing a delisted game and testing both online (API verdict) and offline (transient) conditions at runtime"
  - test: "Gap C re-UAT — GameLib placeholder branding everywhere"
    expected: "Any game tile that would previously show the Heroic Games Launcher default image now shows the GameLib-branded dark card. The greyed variant ('Artwork unavailable') is visually distinct from the default ('No artwork')."
    why_human: "Visual branding verification requires a running renderer with real game tiles"
  - test: "Gap D re-UAT — Launch overlay dismisses on window blur, not 1500ms"
    expected: "Activating an installed Steam game shows 'Launched in Steam'. The overlay persists until GameLib loses focus (the Steam client brings the game to the foreground). If the game never foregrounds, the overlay still dismisses within ~8s. The overlay no longer disappears prematurely at ~1.5s."
    why_human: "Window blur and Steam client foreground behavior require a running Electron app with the Steam client installed"
  - test: "Gap F re-UAT — Hide Owned hides across Epic/GOG/Amazon/Steam/Zoom"
    expected: "On the Deals page, enabling 'Hide Owned' removes catalog products whose title matches a game owned in ANY of the five stores — not just GOG. The 'Hide Owned' checkbox is visible as long as the user owns any games, regardless of GOG login state. 'Wishlist Only' remains GOG-gated."
    why_human: "Requires a running app with libraries from multiple stores populated to observe cross-store title matching"
  - test: "Original UAT confirmed behaviors remain intact (regression check)"
    expected: "Steam Store tab still loads store.steampowered.com in the WebView with no LoginWarning and last-URL persistence. Steam games appear in Console with the Steam chip. Launch and install handoffs still work."
    why_human: "Runtime behaviors confirmed by the original UAT session — checking for regression from gap-closure edits requires re-running the same runtime checks"
---

# Phase 8: New Steam Surfaces Verification Report (Gap-Closure Re-Verification)

**Phase Goal:** Steam content is accessible in the Stores sidebar tab and Steam games are available in Console mode
**Verified:** 2026-07-04
**Status:** human_needed
**Re-verification:** Yes — gap-closure run (gaps A, B, C, D, F closed; E correctly deferred)

---

## Re-Verification Summary

Previous verification (2026-07-03) passed 4/4 code must-haves with `status: human_needed` (runtime UAT deferred). The UAT session (08-UAT.md) confirmed all 4 ROADMAP success criteria at runtime (tests 1, 2, 4, 5, 6 passed), identified 5 active gaps (A–D, F) and 1 deferred gap (E), and produced 4 gap-closure plans (08-03 through 08-06). This re-verification confirms those 6 plans' must-haves are satisfied in the codebase and that 08-01/08-02 work is intact.

---

## Goal Achievement

### Observable Truths

| # | Truth | Source | Status | Evidence |
|---|-------|--------|--------|----------|
| 1 | Steam Store item in sidebar Stores submenu (after Amazon Luna, before Zoom) | 08-01 | VERIFIED | `SidebarLinks/index.tsx` lines 159–163: `url="/store/steam"`, `label={t('steam-store', 'Steam Store')}`, no icon, no conditional guard, after amazon-luna block, before `{zoom.enabled && ...}` |
| 2 | Navigating to /store/steam loads store.steampowered.com in the WebView | 08-01 | VERIFIED | `WebView/index.tsx` line 68: `const steamStore = 'https://store.steampowered.com/'`; line 84: `'/store/steam': steamStore`; lines 27–28: `case 'steam':` in `validStoredUrl` |
| 3 | No LoginWarning is shown for the Steam store tab | 08-01 | VERIFIED | `WebView/index.tsx` lines 302–304: `showLoginWarningFor` type is `null \| 'epic' \| 'gog' \| 'amazon' \| 'zoom'` — `'steam'` is absent |
| 4 | All owned Steam games appear in the Console grid (all owned, not installed-only) | 08-02 | VERIFIED | `ConsoleMode/index.tsx` line 66: `steam` in context destructure; line 123: `...steam.library` in allGames spread; line 136: `steam.library` in useMemo dep array |
| 5 | A Steam chip appears in Console only when Steam games exist | 08-02 | VERIFIED | `ConsoleMode/index.tsx` line 183: `{ key: 'steam', label: 'Steam', enabled: storesWithGames.has('steam') }` |
| 6 | Empty Steam library triggers background refresh on Console mount | 08-02 | VERIFIED | `ConsoleMode/index.tsx` line 108: `steam.library.length === 0` in the refresh guard `&&` chain |
| 7 | Activating an installed Steam game shows 'Launched in Steam', dismisses on blur (not 1500ms) | 08-02 + 08-05 | VERIFIED | `LaunchOverlay/index.tsx` lines 74–98: Steam branch — `void launch(...)` fire-and-forget, `window.addEventListener('blur', onBlur)`, `setTimeout(doDismiss, 8000)` safety net, one-shot `dismissed` guard; `setTimeout(onDismiss, 1500)` is ABSENT |
| 8 | Activating a not-installed Steam game shows minimal install handoff, dismisses after 1500ms | 08-02 | VERIFIED | `InstallOverlay/index.tsx` lines 96–117: `if (game.runner !== 'steam') return` guard, `install({...installPath: 'default'...})`, `setTimeout(() => { if (!cancelled) onDismiss() }, 1500)`, no raw `steam://` |
| 9 | GameLib-branded placeholder replaces Heroic default across all 7 consumers | 08-03 (Gap C) | VERIFIED | Zero `heroic_card.jpg` references in `src/frontend/`; all 7 consumers import `gamelib_card.svg?url`; SVG exists with `viewBox="0 0 600 900"` and text "GameLib" |
| 10 | Greyed 'artwork unavailable' variant exists and is visually distinct from the branded default | 08-03 (Gap C) | VERIFIED | `gamelib_card_missing.svg` exists with `viewBox="0 0 600 900"`, text "Artwork unavailable", different background fill (`#2a2a2e`) from `gamelib_card.svg` (`#1b1d2a`) |
| 11 | Broken/404 art URLs in Console grid fall back to greyed placeholder (no blank tiles) | 08-03 (Gap A) | VERIFIED | `ConsoleCard/index.tsx` line 10: imports `gamelib_card_missing.svg?url`; line 67: `src={getImageFormatting(game.art_square, game.runner)}` (dead `\|\| fallBackImage` removed); line 68: `fallback={fallBackImageMissing}` |
| 12 | Library grid GameCard also falls back to greyed placeholder on broken art | 08-03 (Gap A) | VERIFIED | `GameCard/index.tsx` lines 36–37: imports both SVGs; line 510: `fallback={fallBackImageMissing}` on justPlayed branch; line 517: `fallback={fallBackImageMissing}` on main cover branch |
| 13 | Delisted Steam games (appdetails success:false) are flagged is_delisted and persisted | 08-04 (Gap B) | VERIFIED | `types.ts` line 223: `is_delisted?: boolean` on GameInfo; `electronStores.ts` line 36: `is_delisted?: boolean` on SteamMetadataCacheEntry; `games.ts` line 186: `if (entry?.success === false)` sets `is_delisted: true` (exactly once); `library.ts` line 199: `is_delisted: cachedMeta?.is_delisted ?? false` |
| 14 | Delisted games absent from Console grid; transient API failures do NOT mark games delisted | 08-04 (Gap B) | VERIFIED | `ConsoleMode/index.tsx` line 130: `!g.is_delisted` in allGames filter; `games.ts` catch block (lines 260–267): logs only, no is_delisted write; ambiguous empty envelope (line 201–205): returns without writing is_delisted; is_delisted: false cleared on success path (lines 241, 252) |
| 15 | Activating a delisted game is a no-op (no steam:// handoff fires) | 08-04 (Gap B) | VERIFIED | `ConsoleMode/index.tsx` line 250: `if (game.is_delisted) return` guard in `activateGame` |
| 16 | Deals 'Hide Owned' hides games from ALL store libraries; toggle gated on any-store ownership | 08-06 (Gap F) | VERIFIED | `Discounts/index.tsx` line 44: destructures `epic, gog, amazon, steam, zoom`; lines 50–69: `ownedTitles` Set from all 5 libraries; lines 308–309: `if (hideOwned && ownedTitles.has(p.title.trim().toLowerCase())) return false` in filteredSorted; lines 427–428: `hideOwned` and `ownedTitles` in dep array; line 73: `canHideOwned = ownedTitles.size > 0`; `DiscountFilters/index.tsx` lines 59, 303: `canHideOwned` prop gates Hide Owned; line 290: `isGogLoggedIn` still gates Wishlist Only |

**Score:** 16/16 truths verified

---

## Gap E — Correctly Deferred

Gap E (Steam update feedback during launch) is explicitly deferred to the backlog in `08-UAT.md` with `status: deferred`. No implementation is expected and none was found. This is correctly out of scope for Phase 8 gap closure.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/assets/gamelib_card.svg` | GameLib-branded portrait SVG (600x900) | VERIFIED | Exists; `viewBox="0 0 600 900"`; contains "GameLib"; dark background `#1b1d2a` |
| `src/frontend/assets/gamelib_card_missing.svg` | Greyed 'artwork unavailable' portrait SVG (600x900) | VERIFIED | Exists; `viewBox="0 0 600 900"`; contains "GameLib" and "Artwork unavailable"; grey background `#2a2a2e` |
| `src/frontend/screens/Library/components/GameCard/constants.ts` | Imports gamelib_card.svg?url as branded default | VERIFIED | Line 2: `import fallbackImage from 'frontend/assets/gamelib_card.svg?url'` |
| `src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx` | CachedImage with fallback prop pointing to greyed variant | VERIFIED | Line 10: imports `gamelib_card_missing.svg?url`; line 67–68: `src={getImageFormatting(...)}` + `fallback={fallBackImageMissing}`; dead `\|\| fallBackImage` removed |
| `src/common/types.ts` | `is_delisted?: boolean` on GameInfo | VERIFIED | Line 221–223: optional field with doc comment |
| `src/backend/storeManagers/steam/electronStores.ts` | `is_delisted?: boolean` on SteamMetadataCacheEntry | VERIFIED | Lines 34–36: optional field with doc comment |
| `src/backend/storeManagers/steam/games.ts` | fetchMetadataIfNeeded sets/clears is_delisted by success verdict only | VERIFIED | Line 186: `entry?.success === false` branch; `is_delisted: true` appears exactly 1 time (grep -c confirms 1); catch block untouched |
| `src/backend/storeManagers/steam/library.ts` | Seeds `is_delisted` from metadata cache | VERIFIED | Line 199: `is_delisted: cachedMeta?.is_delisted ?? false` |
| `src/frontend/screens/ConsoleMode/index.tsx` | allGames filter + activateGame guard for is_delisted | VERIFIED | Line 130: `!g.is_delisted` in filter; line 250: `if (game.is_delisted) return` |
| `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` | Blur-driven dismiss + 8s safety net (replaces fixed 1500ms) | VERIFIED | Lines 84–98: `dismissed` one-shot guard, `addEventListener('blur', onBlur)`, `setTimeout(doDismiss, 8000)`, cleanup removes listener and clears timer; `setTimeout(onDismiss, 1500)` absent |
| `src/frontend/screens/Discounts/index.tsx` | All-store ownedTitles Set + hideOwned applied in filteredSorted | VERIFIED | Lines 44, 50–73, 308–309, 414–430 |
| `src/frontend/screens/Discounts/components/DiscountFilters/index.tsx` | canHideOwned prop gates Hide Owned separately from isGogLoggedIn | VERIFIED | Lines 59, 189–190, 290, 303 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SidebarLinks/index.tsx` | `/store/steam` → WebView | `url="/store/steam"` on SidebarItem | WIRED | Unchanged from initial verification |
| `WebView/index.tsx` `validStoredUrl` | `store.steampowered.com` | `case 'steam':` returning `url.includes(...)` | WIRED | Line 27–28 |
| `ConsoleCard/index.tsx` CachedImage | `gamelib_card_missing.svg` (greyed variant) | `fallback={fallBackImageMissing}` prop on broken src | WIRED | Line 68; CachedImage onError chain confirmed to use fallback prop |
| `games.ts` `entry?.success === false` | `steamMetadataStore` + library GameInfo | `is_delisted: true` merged into cache and pushed to frontend | WIRED | Lines 186–198 |
| `ConsoleMode/index.tsx` allGames | `!g.is_delisted` filter | `is_delisted` field on GameInfo from steam.library | WIRED | Line 130 |
| `LaunchOverlay/index.tsx` Steam blur listener | `onDismiss` | `window.addEventListener('blur', onBlur)` + one-shot guard | WIRED | Lines 90–91 |
| `Discounts/index.tsx` `filteredSorted` | `ownedTitles` Set | `if (hideOwned && ownedTitles.has(p.title.trim().toLowerCase())) return false` | WIRED | Lines 308–309; both `hideOwned` and `ownedTitles` in dep array (lines 427–428) |
| `DiscountFilters/index.tsx` Hide Owned control | `canHideOwned` prop | `{canHideOwned && (<FormControlLabel ...hideOwned.../>)}` | WIRED | Line 303; separate from `{isGogLoggedIn && ...}` Wishlist Only gate (line 290) |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ConsoleCard/index.tsx` CachedImage | `game.art_square` | Steam library GameInfo, CDN URL | Real CDN URL — fallback triggers on real 404 | FLOWING |
| `games.ts` delisted branch | `entry?.success` | Steam appdetails API response | Real API verdict — catch block cannot pollute it | FLOWING |
| `ConsoleMode/index.tsx` allGames | `is_delisted` on steam.library GameInfo | Seeded from `steamMetadataStore` in `library.ts` | Persisted real verdict across sessions | FLOWING |
| `Discounts/index.tsx` ownedTitles | `epic/gog/amazon/steam/zoom.library` | ContextProvider (populated by respective library managers) | Real owned game titles from all stores | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No heroic_card.jpg anywhere in frontend | `grep -rn "heroic_card.jpg" src/frontend/` | No output | PASS |
| ConsoleCard has fallback prop, dead `\|\| fallBackImage` absent | `grep -n "fallback=\||| fallBackImage" ConsoleCard/index.tsx` | `fallback={fallBackImageMissing}` found, no `\|\| fallBackImage` | PASS |
| `is_delisted: true` appears exactly once in games.ts (not in catch) | `grep -c "is_delisted: true" games.ts` | 1 | PASS |
| Catch block in games.ts does not set is_delisted | Read lines 260–267 | `logWarning` only — no is_delisted assignment | PASS |
| `setTimeout(onDismiss, 1500)` absent from LaunchOverlay (replaced by blur) | `grep "setTimeout(onDismiss, 1500)" LaunchOverlay/index.tsx` | No output | PASS |
| `window.addEventListener('blur', ...)` present in LaunchOverlay | `grep "addEventListener.*blur" LaunchOverlay/index.tsx` | Found at line 91 | PASS |
| ownedTitles and hideOwned both in filteredSorted dep array | `grep -A20 "^\s*\}, \[" Discounts/index.tsx` | Both `hideOwned` (line 427) and `ownedTitles` (line 428) present | PASS |
| Hide Owned gated on canHideOwned (not isGogLoggedIn) in DiscountFilters | Read lines 290, 303 | Line 290: `isGogLoggedIn && (Wishlist Only)`; line 303: `canHideOwned && (Hide Owned)` | PASS |
| No raw `steam://` in ConsoleMode frontend files | `grep -rn "steam://" src/frontend/screens/ConsoleMode/` | No output | PASS |
| translation.json has all required keys | `node -e "const t=require('./public/locales/en/translation.json'); ..."` | `steam-store: Steam Store`, `console.steam.launched: Launched in Steam`, `console.steam.installing: Opening Steam to install…` | PASS |
| TypeScript compiles clean | `pnpm codecheck` (reported by user) | exits 0, 294 tests pass | PASS |

---

## Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist for Phase 8.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STORE-01 | 08-01-PLAN.md, 08-06-PLAN.md | User can browse the Steam storefront from the sidebar Stores section, alongside the Epic and GOG store tabs | SATISFIED | WebView + SidebarLinks wiring intact (08-01); Deals Hide Owned cross-store fix (08-06 maps to STORE-01 as closest storefront/Deals requirement) |
| CONSOLE-01 | 08-02-PLAN.md, 08-03-PLAN.md, 08-04-PLAN.md, 08-05-PLAN.md | Steam games appear in Console mode and can be launched from it | SATISFIED | allGames spread, chip, LaunchOverlay, InstallOverlay (08-02); branded fallback + greyed variant (08-03); delisted filtering (08-04); blur dismiss (08-05) |

Both requirements are marked `Complete` in `.planning/REQUIREMENTS.md` (lines 85–87). All gap-closure plan requirement IDs (CONSOLE-01, STORE-01) are accounted for.

---

## Anti-Patterns Found

No blockers. No warnings.

| File | Pattern | Severity | Result |
|------|---------|----------|--------|
| All gap-closure files | TBD / FIXME / XXX markers | Blocker if unresolved | None found |
| `games.ts` | `is_delisted: true` in catch block (would be a blocker) | Blocker if present | Absent — catch block only logs |
| `ConsoleMode/InstallOverlay/index.tsx` | Raw `steam://` URL | Blocker (D-02) | Absent — routes through `install()` helper |
| `ConsoleCard/index.tsx` | Dead `\|\| fallBackImage` that hides 404s | Bug (Gap A root cause) | Removed — `fallback=` prop used instead |
| `GameCard/index.tsx` (justPlayed) | `src={art_cover \|\| fallBackImage}` | Not a stub — intentional empty-string guard | `fallback={fallBackImageMissing}` also present; correct two-layer defense |
| All gap-closure files | Placeholder returns / `return null` | Blocker if goal-blocking | None found |

---

## Human Verification Required

### 1. Gap A re-UAT — Blank art replaced by greyed placeholder

**Test:** In Console mode, observe a Steam game whose art URL returns a 404 (e.g., a game whose capsule image is not on the CDN). Also observe a game with no art URL at all.
**Expected:** Games with a broken art URL show the greyed "Artwork unavailable" GameLib placeholder. Games with no art URL show the branded "No artwork" GameLib default. No tile is ever completely blank.
**Why human:** CachedImage's onError chain fires on a real CDN 404; a running renderer with real Steam library data is required to trigger this path.

### 2. Gap B re-UAT — Delisted game not in Console grid

**Test:** With a Steam account that owns a delisted game, open Console mode. Also disconnect from the network temporarily and observe other games.
**Expected:** The delisted game does not appear in the Console grid. Games that are valid but temporarily unreachable (offline/transient) remain visible.
**Why human:** Requires a real Steam account with a delisted owned game and the ability to test transient offline vs. definitive delisted responses.

### 3. Gap C re-UAT — GameLib branding confirmed everywhere

**Test:** Observe any game tile that previously showed the Heroic placeholder (e.g., a game with no artwork, or the Library / Deals / GamePicture surfaces).
**Expected:** All such tiles now show the GameLib-branded dark card ("No artwork" text) — not the Heroic Games Launcher image or text. The greyed variant ("Artwork unavailable") is visually distinguishable from the default.
**Why human:** Branding and visual distinction require a running renderer.

### 4. Gap D re-UAT — Launch overlay persists until blur

**Test:** Activate an installed Steam game from Console mode. Observe the overlay lifetime.
**Expected:** The "Launched in Steam" overlay stays visible until the Steam game foregrounds GameLib and Electron's window loses focus (the game took over). The overlay does NOT dismiss at ~1.5s. If the game never foregrounds, the overlay dismisses at the safety ceiling (~8s). Non-Steam games launch as before.
**Why human:** Requires the Steam client installed, a running Electron app, and an OS window-manager that fires the `blur` event when another app gains focus.

### 5. Gap F re-UAT — Hide Owned covers all stores on the Deals page

**Test:** On the Deals page, with games owned in Epic, Steam, and Amazon (in addition to GOG), enable the "Hide Owned" toggle.
**Expected:** Catalog products whose title matches any owned game (across Epic, GOG, Amazon, Steam, Zoom) are hidden — not just GOG games. The "Hide Owned" checkbox is visible whenever any library is non-empty, even when not logged into GOG. "Wishlist Only" remains GOG-gated.
**Why human:** Title-based matching against multiple store libraries requires a running app with real multi-store library data populated.

### 6. Original behaviors regression check

**Test:** Re-run UAT tests 1, 2, 4, 5, 6 from 08-UAT.md (the 5 tests that previously passed).
**Expected:** Steam Store tab, storefront WebView, Steam filter chip, installed-game launch, not-installed-game install handoff — all behave identically to the original UAT pass results.
**Why human:** Gap-closure edits touched `ConsoleMode/index.tsx`, `LaunchOverlay/index.tsx`, and `InstallOverlay/index.tsx`; regression risk to the original behaviors must be confirmed at runtime.

---

## Gaps Summary

No code gaps. All 16 must-haves verified across 08-01 through 08-06. Gap E is correctly deferred to the backlog (not expected in this run). The `human_needed` status is driven entirely by items requiring a running Electron app + Steam client + real library data — not by any code deficiency.

The codebase is in a clean state:
- Zero `heroic_card.jpg` references in `src/frontend/`
- Zero `steam://` raw URL construction in ConsoleMode frontend
- Zero `is_delisted: true` in the transient/catch branch of `games.ts`
- Zero TBD/FIXME/XXX markers in modified files
- `pnpm codecheck` exits 0; 294 tests pass (294 suites per user report)

---

_Verified: 2026-07-04_
_Verifier: Claude (gsd-verifier)_
