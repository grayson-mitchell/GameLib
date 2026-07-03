---
phase: 08-new-steam-surfaces
verified: 2026-07-03T12:00:00Z
status: human_needed
score: 4/4 must-haves verified (code wiring confirmed; 2 require runtime UAT)
re_verification: false
human_verification:
  - test: "Open Stores submenu and click Steam Store"
    expected: "store.steampowered.com loads inside the GameLib WebView with full WebviewControls (back/forward/reload); NO LoginWarning prompt is shown; navigating to a game page and returning restores the last-visited URL"
    why_human: "WebView rendering, last-URL persistence via sessionStorage, and absence of LoginWarning are runtime behaviors that cannot be observed headlessly"
  - test: "In Console mode, select an installed Steam game and activate it"
    expected: "The LaunchOverlay appears showing 'Launched in Steam' with the idle (green) spinner; it auto-dismisses after ~1500ms; no indefinite 'Launching' spinner hangs; BackHint is absent"
    why_human: "steam://rungameid handoff and the 1500ms auto-dismiss are runtime behaviors that require the Steam client to be installed"
  - test: "In Console mode, select a not-installed Steam game and activate it"
    expected: "The InstallOverlay appears showing only 'Opening Steam to install…' and the game title (no platform selector, wine picker, or install/cancel buttons); the Steam client's install flow opens; the overlay auto-dismisses after ~1500ms; pressing Escape dismisses immediately"
    why_human: "steam://install handoff and platform-selector suppression need a running app with the Steam client present to verify"
---

# Phase 8: New Steam Surfaces Verification Report

**Phase Goal:** Steam content is accessible in the Stores sidebar tab and Steam games are available in Console mode
**Verified:** 2026-07-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Steam tab appears in the sidebar Stores section alongside Epic and GOG store tabs | VERIFIED | `SidebarLinks/index.tsx` lines 159-163: `<SidebarItem className="SidebarLinks__subItem" url="/store/steam" label={t('steam-store', 'Steam Store')} />` — no icon prop, no conditional guard, positioned after Amazon Luna and before Zoom |
| 2 | The Steam store tab lets the user browse the Steam storefront from within GameLib (browse-only; purchasing remains in Steam's own flow) | VERIFIED (code wiring) / human_needed (runtime) | `WebView/index.tsx` line 68: `const steamStore = 'https://store.steampowered.com/'`; line 84: `'/store/steam': steamStore` in urls map; lines 27-28: `case 'steam':` in `validStoredUrl`; lines 302-304: `showLoginWarningFor` type is `null \| 'epic' \| 'gog' \| 'amazon' \| 'zoom'` (no steam branch — D-06 honored); partition untouched (D-07) |
| 3 | Steam games appear in Console mode | VERIFIED | `ConsoleMode/index.tsx` line 66: `steam` in context destructure; line 108: `steam.library.length === 0` in refresh guard; lines 123-124: `...steam.library` in allGames spread; line 134: `steam.library` in dep array; line 179: `{ key: 'steam', label: 'Steam', enabled: storesWithGames.has('steam') }` filter chip |
| 4 | A Steam game can be launched from Console mode | VERIFIED (code wiring) / human_needed (runtime) | `LaunchOverlay/index.tsx` lines 70-92: runner-conditional useEffect — Steam branch fires `launch()` fire-and-forget + `setTimeout(onDismiss, 1500)`; `InstallOverlay/index.tsx` lines 96-117: Steam-only useEffect fires `install()` + 1500ms auto-dismiss with cancelled-flag guard; no raw `steam://` in any ConsoleMode frontend file |

**Score:** 4/4 truths verified (code wiring complete)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/screens/WebView/index.tsx` | `case 'steam':` in `validStoredUrl`, `steamStore` constant, `/store/steam` in urls map, `showLoginWarningFor` union unchanged | VERIFIED | All four assertions hold: line 27-28 (`case 'steam':`), line 68 (`steamStore`), line 84 (`'/store/steam': steamStore`), lines 302-304 (union is `null \| 'epic' \| 'gog' \| 'amazon' \| 'zoom'`) |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` | Steam Store sub-item at `url="/store/steam"`, after Amazon Luna, before Zoom conditional | VERIFIED | Lines 159-163: `SidebarItem` with `className="SidebarLinks__subItem"`, `url="/store/steam"`, `label={t('steam-store', 'Steam Store')}` — no icon prop, no conditional guard |
| `src/frontend/screens/ConsoleMode/index.tsx` | `steam` in context destructure, `...steam.library` in allGames + dep array, `steam.library.length === 0` in refresh guard, Steam chip | VERIFIED | Lines 66, 108, 123, 134, 179 — all four changes present and substantive |
| `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` | Steam fire-and-forget branch, 1500ms auto-dismiss, idle spinner, "Launched in Steam" label, disabled hold-to-cancel, BackHint gated | VERIFIED | Lines 36, 70-92, 127-129, 132-134, 137, 139-145 — all spec requirements met; TS noImplicitReturns handled via `let cleanup` variable pattern (commit 1f226878) |
| `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx` | Steam-only useEffect with `install()` handoff + 1500ms timer, JSX branch suppressing fields/buttons for Steam | VERIFIED | Lines 96-117 (useEffect) and lines 279-285 (JSX branch) — minimal modal body for Steam, existing Escape dismiss and `console-modal-open` guard preserved |
| `public/locales/en/translation.json` | `steam-store`, `console.steam.launched`, `console.steam.installing` keys | VERIFIED | `"steam-store": "Steam Store"` (line 1230); `console.steam.launched === "Launched in Steam"` and `console.steam.installing === "Opening Steam to install…"` — confirmed via `node -e` runtime check |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SidebarLinks/index.tsx` | `/store/steam` route → WebView | `url="/store/steam"` on SidebarItem | WIRED | `store/:store` generic route in App.tsx covers `/store/steam`; no new route needed |
| `WebView/index.tsx` validStoredUrl | `https://store.steampowered.com/` | `case 'steam': return url.includes('store.steampowered.com')` | WIRED | Line 27-28; last-URL persistence via `last-url-steam` sessionStorage key works via existing `onNavigate` handler |
| `WebView/index.tsx` urls map | `steamStore` constant | `'/store/steam': steamStore` | WIRED | Line 84 |
| `ConsoleMode/index.tsx` allGames | `steam.library` from ContextProvider | `...steam.library` spread + dep array | WIRED | Lines 123-124, 134 — `steam` is extracted from `useContext(ContextProvider)` at line 66 |
| `LaunchOverlay/index.tsx` | backend `steam/games.ts` launch() | runner-agnostic `launch()` helper with `runner: game.runner as Runner` | WIRED | Lines 72-78 — no raw `steam://` in file; routes through existing validated backend |
| `InstallOverlay/index.tsx` | backend `steam/games.ts` install() | runner-agnostic `install()` helper | WIRED | Lines 99-108 — no raw `steam://` in file; D-02 compliance confirmed by grep |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ConsoleMode/index.tsx` allGames | `steam.library` | `ContextProvider` → `steam.library: GameInfo[]` (populated by Phase 2 SteamLibraryManager) | Yes — existing Steam library data from v1.0 | FLOWING |
| `WebView/index.tsx` | `steamStore` → `startUrl` | Hard-coded constant `'https://store.steampowered.com/'` | Real URL, no placeholder | FLOWING |
| `LaunchOverlay/index.tsx` | `game.runner === 'steam'` branch | `game` prop from ConsoleMode `launchingGame` state | Real `GameInfo` from steam.library | FLOWING |
| `InstallOverlay/index.tsx` | `game.runner === 'steam'` branch | `game` prop from ConsoleMode `installingGame` state | Real `GameInfo` from steam.library | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation (all new code typechecks cleanly) | `pnpm codecheck` (tsc --noEmit) | exits 0, no errors | PASS |
| translation.json is valid JSON with required keys | `node -e "const t=require('./public/locales/en/translation.json'); const s=t.console.steam; ..."` | `{"launched":"Launched in Steam","installing":"Opening Steam to install…"}` and `steam-store: Steam Store` | PASS |
| No raw `steam://` URL in ConsoleMode frontend files (D-02) | `grep -n "steam://" LaunchOverlay/index.tsx InstallOverlay/index.tsx index.tsx` | No matches | PASS |
| All 6 phase commits exist in git log | `git log --oneline fe7d6fe3 e16bf361 a399cfe5 bbd3e605 0eaa9d96 1f226878` | All 6 commits present | PASS |
| `showLoginWarningFor` union does NOT include `'steam'` (D-06) | `grep showLoginWarningFor WebView/index.tsx` | `null \| 'epic' \| 'gog' \| 'amazon' \| 'zoom'` — no steam | PASS |

---

## Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist for this phase and it is a UI-only phase with no CLI entry points.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STORE-01 | 08-01-PLAN.md | User can browse the Steam storefront from the sidebar Stores section, alongside the Epic and GOG store tabs | SATISFIED | WebView wiring + SidebarLinks sub-item both verified |
| CONSOLE-01 | 08-02-PLAN.md | Steam games appear in Console mode and can be launched from it | SATISFIED | allGames spread, filter chip, LaunchOverlay + InstallOverlay Steam branches all verified |

---

## Anti-Patterns Found

No blockers or warnings found.

| File | Pattern Checked | Result |
|------|-----------------|--------|
| `WebView/index.tsx` | LoginWarning steam branch (D-06 violation would be a blocker) | None found — union is `null \| 'epic' \| 'gog' \| 'amazon' \| 'zoom'` |
| `LaunchOverlay/index.tsx` | Raw `steam://` URL construction | None found |
| `InstallOverlay/index.tsx` | Raw `steam://` URL construction | None found |
| `ConsoleMode/index.tsx` | Raw `steam://` URL construction | None found |
| All phase files | TBD / FIXME / XXX markers | None found |
| `LaunchOverlay/index.tsx` | `return null` / placeholder patterns | None — substantive implementation |
| `InstallOverlay/index.tsx` | Hardcoded empty data that flows to render | None — JSX branch renders real `game.title` |

---

## Human Verification Required

### 1. Steam Store tab renders the Steam storefront

**Test:** Navigate to Stores in the sidebar, open the submenu, click "Steam Store"
**Expected:** The WebView loads `https://store.steampowered.com/` with the standard WebView chrome (back/forward/reload controls visible). No LoginWarning prompt appears. After navigating to a game's store page and then returning to the Steam Store tab via the sidebar, the last-visited page is restored (not the base URL).
**Why human:** WebView rendering, sessionStorage-based last-URL persistence, and the absence of a LoginWarning are runtime behaviors that cannot be confirmed headlessly.

### 2. Installed Steam game launches from Console mode

**Test:** Enter Console mode (/console), ensure a Steam game is shown in the grid (Steam chip enabled), select an installed Steam game and activate it
**Expected:** The LaunchOverlay appears showing "Launched in Steam" text with the idle (success-green) spinner and no "Hold to cancel" BackHint. The overlay auto-dismisses after approximately 1500ms. The Steam client opens/brings itself to focus and begins running the game. Non-Steam games in the same session still use the standard "Launching..." managed flow.
**Why human:** The steam://rungameid protocol handoff and the 1500ms timer behavior require the Steam client to be installed and a real Steam account with owned games.

### 3. Not-installed Steam game hands off to Steam install from Console mode

**Test:** Enter Console mode, select a Steam game that is NOT installed and activate it
**Expected:** The InstallOverlay appears showing only the "Opening Steam to install…" title and the game title — NO platform selector, wine picker, install path, or Install/Cancel buttons. The Steam client's install dialog opens. The overlay auto-dismisses after approximately 1500ms. Pressing Escape at any point dismisses the overlay immediately.
**Why human:** Verifying the suppression of the non-Steam install fields and the steam://install protocol handoff require a running app with the Steam client present.

---

## Gaps Summary

No gaps found. All 4 ROADMAP success criteria have verified code wiring:

- SC-1 (Steam tab in sidebar): Fully verifiable statically — VERIFIED.
- SC-2 (browse Steam storefront): Code wiring complete; runtime rendering is human_needed.
- SC-3 (Steam games in Console mode): Fully verifiable statically — VERIFIED.
- SC-4 (launch Steam game from Console): Code wiring complete; runtime handoff is human_needed.

The phase delivered substantive implementations across all 5 modified files. No stubs, no placeholder returns, no raw steam:// URL construction in frontend code, no debt markers. TypeScript compiles clean. The two human_needed items are inherent to runtime/OS behavior (WebView rendering and steam:// protocol handoff) — they are not indicative of incomplete implementation.

---

_Verified: 2026-07-03_
_Verifier: Claude (gsd-verifier)_
