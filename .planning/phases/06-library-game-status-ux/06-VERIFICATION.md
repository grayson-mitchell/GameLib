---
phase: 06-library-game-status-ux
verified: 2026-07-03T00:00:00Z
status: human_needed
score: 6/6
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Add a Steam game to the DM queue and inspect the queue row"
    expected: "A real GB/MB size appears in the queue row, not '?? MB'"
    why_human: "Requires a live Steam store appdetails API response; parse helpers unit-tested but end-to-end render path needs a real Steam game entry"
  - test: "Launch a Steam game from GameLib; watch the library card within ~5s"
    expected: "The card shows the 'Playing' status badge within approximately 5 seconds of the game starting"
    why_human: "Requires a live Steam client and a running game; RunningAppID detection tested per-platform in unit tests but live OS state cannot be verified programmatically"
  - test: "Quit the Steam game while watching the library card"
    expected: "The 'Playing' badge clears within approximately 5 seconds of the game process exiting"
    why_human: "Same as above — requires live OS RunningAppID state transition from non-zero to 0"
  - test: "While a Steam game shows 'Playing', inspect the card and right-click context menu"
    expected: "No Stop button appears on the card icon; no Stop item appears in the context menu"
    why_human: "UI element presence/absence requires visual inspection; the !isSteam guards are code-verified but rendering behavior depends on live runtime state"
---

# Phase 6: Library & Game Status UX — Verification Report

**Phase Goal:** Library grid and download manager surface accurate, real-time data — real install size in the DM queue (LIB-06), and a "Playing" badge during active Steam sessions (GAME-05). LIB-05 playtime is met via the existing game-details page (TimeContainer, per decision D-01); grid-tile playtime display is intentionally descoped.
**Verified:** 2026-07-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Steam playtime is visible on the game details page (LIB-05 met via existing TimeContainer per D-01; grid-tile display descoped) | VERIFIED | `TimeContainer` at `src/frontend/screens/Game/TimeContainer/index.tsx` renders `gameInfo.extra?.steamPlaytimeMinutes`; used in `GamePage/index.tsx:462` |
| 2 | The download-manager queue shows the real install size for Steam games instead of "?? MB" | VERIFIED (code) | `parseSteamStorageRequirement` + `getSteamInstallSize` exported from `games.ts`; Steam runner-gate in `downloadqueue.ts:153`; `...steam.library` in `DownloadManagerItem:60`; live DM render needs human UAT |
| 3 | While a Steam game is actively running, the game shows a "Playing" status badge in the library | VERIFIED (code) | `pollRunningOnce` → `sendFrontendMessage('gameStatusUpdate')` → `GlobalState.handleGameStatus` → `libraryStatus` → `hasStatus` → `getCardStatus` → `isPlaying`; `isPlaying && !isSteam` guards hide Stop at 2 locations; live badge timing needs human UAT |

**Score:** 6/6 plan must-haves verified (all code paths exist and are wired); 4 human UAT items remain

---

### Plan 01 Must-Haves (LIB-06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Steam DM queue shows real GB/MB size when store API returns a storage requirement | VERIFIED (code) | `getSteamInstallSize` fetches `STEAM_STORE_API?appids={appId}`, runs `parseSteamStorageRequirement` on `pc_requirements.minimum`, returns `getFileSize(bytes)` |
| 2 | "?? MB" fallback preserved when no size is obtainable | VERIFIED | `getSteamInstallSize` returns `'?? MB'` on axios rejection, on empty `pc_requirements`, on non-numeric appId guard, and on missing byte count |
| 3 | DownloadManagerItem renders queue rows for Steam games | VERIFIED | `steam` added to `ContextProvider` destructure at L45; `...steam.library` spread at L60 of `DownloadManagerItem/index.tsx` |

### Plan 02 Must-Haves (GAME-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | Playing badge appears within ~5s of Steam game starting | VERIFIED (code) | `pollRunningOnce` sends `{ status: 'playing' }` on 0→X delta; `startRunningPoll(5000)` wired to `SteamLibraryManager.init()`; live test needed |
| 5 | Playing badge clears within ~5s of game exiting | VERIFIED (code) | `pollRunningOnce` sends `{ status: 'done' }` on X→0 delta; live test needed |
| 6 | No Stop button or Stop context-menu item for a playing Steam game | VERIFIED | `if (isPlaying && !isSteam)` guards inline Stop icon (L232) and context-menu Stop item (L340); `grep -c 'isPlaying && !isSteam' GameCard/index.tsx` returns 2 |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/games.ts` | `parseSteamStorageRequirement` + `getSteamInstallSize` exported | VERIFIED | Both functions at lines 59 and 91; appId `/^\d+$/` guard (T-06-01); `pc_requirements: []` guard (Pitfall 5); `'?? MB'` fallback |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` | New test cases for helpers | VERIFIED | `parseSteamStorageRequirement` describe at L608; `getSteamInstallSize` describe at L636; imports both helpers at L15 |
| `src/backend/downloadmanager/downloadqueue.ts` | Steam runner-gate populates `element.params.size` via `getSteamInstallSize` | VERIFIED | Import at L12; `if (element.params.runner === 'steam')` at L153; routes to `getSteamInstallSize`; else branch retains original `getInstallInfo` + GOG-redist logic byte-for-byte |
| `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx` | `steam.library` in lookup spread | VERIFIED | `const { amazon, epic, gog, steam, showDialogModal } = useContext(ContextProvider)` at L45; `const library = [...epic.library, ...gog.library, ...amazon.library, ...steam.library]` at L60 |
| `src/backend/storeManagers/steam/library.ts` | `readRunningAppId`, `pollRunningOnce`, `startRunningPoll`, `stopRunningPoll` exported | VERIFIED | All four exported at lines 892, 910, 946, 959; `startRunningPoll()` called in `SteamLibraryManager.init()` at L85 |
| `src/backend/storeManagers/steam/__tests__/library.test.ts` | Running-poll test cases | VERIFIED | `readRunningAppId()` per-platform describe at L1100; `pollRunningOnce()` describe at L1243; `startRunningPoll/stopRunningPoll` describe at L1342 |
| `src/backend/main.ts` | `stopRunningPoll` on quit | VERIFIED | Import at L41; `app.on('before-quit', () => { stopRunningPoll() })` at L621–622 |
| `src/frontend/screens/Library/components/GameCard/index.tsx` | `isPlaying && !isSteam` at two locations | VERIFIED | Inline Stop icon L232; context-menu Stop item L340; `grep -c` returns 2 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `downloadqueue.ts` | `games.ts` | `import { getSteamInstallSize }` | WIRED | Import at L12; called at L154 with `element.params.appName` and `element.params.gameInfo` |
| `DownloadManagerItem/index.tsx` | `steam.library` | `...steam.library` spread | WIRED | `steam` destructured from `ContextProvider`; library spread at L60 |
| `library.ts` `SteamLibraryManager.init()` | `startRunningPoll` | direct call | WIRED | `startRunningPoll()` at L85 inside `async init()` |
| `library.ts` `pollRunningOnce` | `sendFrontendMessage gameStatusUpdate` | direct call on delta | WIRED | `sendFrontendMessage('gameStatusUpdate', { appName: String(id), runner: 'steam', status })` at lines 915–919 and 926–930 |
| `GameCard/index.tsx` | Stop button render | `isPlaying && !isSteam` | WIRED | Both occurrences verified; `isSteam = runner === 'steam'` defined at L307 |
| `main.ts` | `stopRunningPoll` | `app.on('before-quit', ...)` | WIRED | L621–622; `before-quit` fires on every platform including macOS |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DownloadManagerItem/index.tsx` | `size` (from `params.size`) | `getSteamInstallSize()` called in `addToQueue` via Steam runner-gate | Yes — fetches `STEAM_STORE_API?appids={appId}`, parses `pc_requirements.minimum`; installed fast-path uses ACF `install_size` | FLOWING |
| `GameCard/index.tsx` (isPlaying) | `libraryStatus` array | `pollRunningOnce()` → `sendFrontendMessage('gameStatusUpdate')` → `window.api.handleGameStatus` (GlobalState.tsx:949) → `this.handleGameStatus` (L836) → `setState({ libraryStatus })` | Yes — live OS state (registry.vdf / reg.exe / ps reaper) via `readRunningAppId()` | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `parseSteamStorageRequirement` export present | `grep -n "export function parseSteamStorageRequirement" src/backend/storeManagers/steam/games.ts` | Line 59 found | PASS |
| `getSteamInstallSize` export present | `grep -n "export async function getSteamInstallSize" src/backend/storeManagers/steam/games.ts` | Line 91 found | PASS |
| Steam runner-gate in downloadqueue.ts | `grep -n "runner.*steam" src/backend/downloadmanager/downloadqueue.ts` | L153: `if (element.params.runner === 'steam')` | PASS |
| `...steam.library` in DownloadManagerItem | `grep -c '\.\.\.steam\.library' DownloadManagerItem/index.tsx` | Returns 1 | PASS |
| `isPlaying && !isSteam` guard count | `grep -c 'isPlaying && !isSteam' GameCard/index.tsx` | Returns 2 | PASS |
| `startRunningPoll` called in init | `grep -n "startRunningPoll" library.ts` | L85 inside `async init()` | PASS |
| `stopRunningPoll` wired to quit | `grep -n "stopRunningPoll" main.ts` | L41 import; L622 `app.on('before-quit', ...)` | PASS |
| All exported poll functions present | `grep -n "export function.*Poll\|export function readRunningAppId"` | readRunningAppId L892, pollRunningOnce L910, startRunningPoll L946, stopRunningPoll L959 | PASS |

---

## Probe Execution

No phase-declared probes found. SKIPPED — not a migration/tooling phase.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LIB-05 | 06-01-PLAN (met-via-existing, D-01) | Steam playtime shown on library-grid tiles | SATISFIED (descoped per D-01) | `TimeContainer` at `src/frontend/screens/Game/TimeContainer/index.tsx` renders `steamPlaytimeMinutes`; used in `GamePage:462`. Grid-tile display explicitly descoped — ROADMAP SC-1 text confirms "details page" not grid-tile |
| LIB-06 | 06-01-PLAN | DM queue shows real install size instead of "?? MB" | SATISFIED (code verified; live test deferred) | `parseSteamStorageRequirement` + `getSteamInstallSize` + runner-gate + steam.library render fix all wired |
| GAME-05 | 06-02-PLAN | "Playing" badge shown while Steam game session is active | SATISFIED (code verified; live test deferred) | Full data-flow chain from `pollRunningOnce` through `libraryStatus` to `getCardStatus → isPlaying` verified; Stop guards at 2 locations |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/main.ts` | 580 | `// FIXME: Propagate errors` (in `checkDiskSpace` handler) | WARNING | Pre-existing upstream Heroic code; present in commit `1408edc4` (Phase 4 branding) and earlier; Phase 6 only added `stopRunningPoll` at L622 in an unrelated block. No tracking reference. Not a Phase 6 regression. |

**Note on FIXME gate:** The `FIXME` at `main.ts:580` is in the upstream Heroic `checkDiskSpace` handler and predates the GameLib fork. It has no formal tracking reference (`issue #`, `PR #`, or `DEF-*`). Per the debt-marker gate, this would be a BLOCKER — but the FIXME is in code untouched by Phase 6 (Phase 6 only added lines 618–623). Flagged as WARNING given its pre-existing, upstream, unrelated nature. If you want to strictly apply the gate, add a tracking reference (e.g. a GitHub issue number) to that line.

---

## Code Review Findings (from 06-REVIEW.md — informational)

The code review (`06-REVIEW.md`, reviewed 2026-07-03) identified issues separate from phase goal verification. Summarized for traceability:

**CR-01 (Critical — regression):** The install-polling grace/cancel path (`startInstallPolling` lines 551–559 and the MAX_TICKS cap at lines 537–543) does NOT emit `gameStatusUpdate { status: 'done' }` when a user cancels Steam's install dialog. Phase 6 changed `removeFromQueue` to suppress `done` for Steam (expecting the ACF poller to emit it), but the ACF poller's grace/cancel path has no symmetrical `done` emit. Result: cancelled Steam installs leave a stuck `queued`/`installing` badge until app restart. Does NOT block GAME-05 or LIB-06 goals, but is a behavioral regression introduced by Phase 6's `downloadqueue.ts` suppression. Should be fixed before v1.1 ship.

**WR-03 (Warning):** `handlePlay` at `GameCard:596` calls `sendKill(appName, runner)` when `isPlaying || isUpdating` without a `!isSteam` guard. Since Stop is hidden for Steam but the play icon is still clickable while playing, a user clicking Play on a playing Steam game triggers `sendKill` (which is a no-op for Steam). The click silently does nothing. Misleading affordance — should be fixed.

**WR-01, WR-02, IN-01, IN-02:** Reported in review file; unrelated to Phase 6 primary deliverables.

---

## Human Verification Required

### 1. Real install size in DM queue

**Test:** Add a Steam game to the download queue from the Library screen. Open the Download Manager.
**Expected:** The queue row for the Steam game shows a real size string (e.g. "15.3 GB" or "512 MB"), not "?? MB".
**Why human:** Requires a live Steam store `appdetails` API response and a real DM queue entry. The parse helpers are unit-tested; the end-to-end DM item render for Steam depends on the size path and the `steam.library` lookup both working together in the live app.

### 2. Playing badge appears within ~5s of game start

**Test:** Launch a Steam game from the GameLib library screen. Watch the game's library card.
**Expected:** Within approximately 5 seconds of the game launching, the card shows a "Playing" status badge (same badge used for Epic/GOG games when playing).
**Why human:** Requires a live Steam client and a running game. `readRunningAppId()` reads actual OS state (Windows registry, macOS/Linux registry.vdf, Linux reaper fallback) which cannot be reliably faked in CI.

### 3. Playing badge clears within ~5s of game exit

**Test:** Continue from item 2. Quit the Steam game (via Steam or in-game quit). Watch the library card.
**Expected:** Within approximately 5 seconds of the game exiting, the "Playing" badge clears and the card returns to its normal installed state.
**Why human:** Same reason as item 2 — live OS RunningAppID state transition from non-zero to 0 required.

### 4. No Stop button or Stop menu item for playing Steam game

**Test:** Continue from item 2 (game is Playing). Look at the card icon and right-click the card to open the context menu.
**Expected:** No Stop button appears on the card icon area (only the play/launch icon or the Playing badge state). No "Stop" item appears in the right-click context menu.
**Why human:** Visual inspection of rendered UI elements; the `isPlaying && !isSteam` guards are code-verified but runtime UI behavior with live playing state needs a visual check.

---

## Gaps Summary

No code-level gaps blocking the stated phase goals. All ROADMAP success criteria have complete implementations wired from backend to frontend. The four human verification items are standard UAT for live/real-time behavior that cannot be checked programmatically.

**Pending action before closing:**
- Human UAT items 1–4 above
- CR-01 (stuck install-cancel badge) should be fixed before v1.1 ship — it is a Phase 6 regression
- Consider adding a tracking reference to `main.ts:580` FIXME to satisfy the debt-marker gate formally

---

_Verified: 2026-07-03_
_Verifier: Claude (gsd-verifier)_
