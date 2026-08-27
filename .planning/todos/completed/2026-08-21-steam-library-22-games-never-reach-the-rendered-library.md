---
created: 2026-08-21
title: "22 owned Steam games are in the store but never reach the rendered library"
area: steam
status: CLOSED
severity: major
files:
  - src/frontend/state/GlobalState.tsx
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
---

## Symptom

Library header reads **`356 of 356`** with **no filters active**, while the backend logs
`Steam library sync complete: 378 games` on every sync. **22 owned games never appear on
screen.** Two confirmed missing by name: **Wasteland 3** (719040) and **Len's Island**
(1335830). Both are INSTALLED and neither is delisted.

Observed 2026-08-21 under `pnpm tauri:dev` during phase 34.13's UAT gate. Not reproduced
under Electron in the same session (not tested there).

## Ruled out, with evidence

| candidate | evidence it is NOT the cause |
|---|---|
| active filters | header shows `356 of 356`; numerator == unfiltered denominator |
| DLC exclusion | `steam_library.json` has **0** entries with `install.is_dlc` |
| missing metadata | **0** entries lack a `steam_metadata.json` record |
| `nonAvailableGames` | Tauri WKWebView `~/Library/WebKit/com.gamelib.shell/WebsiteData/LocalStorage` is EMPTY. Electron's copy holds one appid (206060) and is a different store the Tauri app never reads |
| delisted | accounts for only **9** of 22 (see the sibling false-delisted todo); Wasteland 3 and Len's Island are `is_delisted: false` |
| "installed games are hidden" | over-predicts: 26 installed + 9 delisted - 1 overlap = **34**, not 22 |

The persisted store is provably CORRECT at the moment the entries are invisible:
`steam_library.json` holds all 378 with right titles, paths and install state. **The loss is
downstream of the store.**

## Leading hypothesis (NOT established)

Steam has no synchronous cache hydration on mount — it rebuilds from `[]` via async per-game
`pushGameToLibrary` events. Under Tauri, `send` channels fail **silently by construction**:
no rejection, no timeout, no console output. Dropped pushes would produce exactly this
signature, and the complete absence of channel errors in the log is consistent with that
rather than evidence against it.

**Do not treat this as diagnosed.** Confirming it requires reading the renderer's
`state.steam.library` array length in DevTools and comparing against 378.

## Relationship to the parked vanish defect

Same family as `.planning/debug/uninstall-game-vanishes.md` (parked 2026-07-22): entry present
and correct in the store while invisible on screen. That session eliminated search matching,
platform filter, delisted state and the installed/installing partition, and concluded the
fault is something `SteamLibraryManager.refresh()` does to the frontend that a single
`pushGameToLibrary` upsert does not. **This report is a steadier reproduction** — it is a
standing count mismatch, not a transient post-uninstall flicker, so it can be measured without
catching a race.

## Why this matters more than it looks

Nothing in the app or the test suite compares the RENDERED count against the STORE count, so a
launcher silently omitting owned games from the library is invisible to every existing gate.

## How to apply

Add a startup (or dev-only) assertion that the renderer's per-runner library length matches the
persisted store's, and log loudly on mismatch. That check is what turns this class of defect
from "a user notices a game is missing" into a failing gate.

## Resolution (2026-08-21)

Root cause was two compounding defects, NOT the send-drop/IPC hypothesis this todo's leading
hypothesis proposed (that was live-tested and refuted — `libraryUnion` held all 400 entries
including both named-missing appIds; the loss was inside `filterLibrary`, not transport):

1. **Backend hydration race** — `SteamGame.getGameInfo()` (`steam/games.ts`) returned `{}` for any
   appId not yet in the in-memory `library` Map, which happens before
   `SteamLibraryManager.refresh()`'s async CM sync finishes populating it. Any `isGameAvailable()`
   call landing in that window resolved `false` for an owned, correctly-installed game.
2. **Stuck-forever exclusion** — that false negative gets written to the `nonAvailableGames`
   localStorage list, which `filterEngine.isNonAvailableGame` excludes from BOTH the grid and the
   header's own "unfiltered" denominator (default state, no visible filter chip) — producing
   exactly `356 of 356` with nothing showing as filtered. Nothing ever re-checked a listed appName,
   because the only re-check call site is the excluded game's own `GameCard`, which the exclusion
   itself prevents from mounting again.

Fix: (1) `getGameInfo()` now falls back to the persisted `steamLibraryStore` cache and self-heals
the in-memory Map on hit. (2) Added `reconcileNonAvailableGames()`
(`src/frontend/hooks/constants.ts`), driven from `Library/index.tsx` (not the excluded card), so a
stale entry can leave the list once the underlying condition resolves. (3) Added the blind-spot
guard this todo's "How to apply" section asked for:
`findSilentlyExcludedGames`/`gameCount.ts` + a `Library/index.tsx` effect that `logError`s if any
Steam/non-DLC/non-delisted game is still silently excluded after reconciliation — scoped narrower
than a full renderer-vs-store length assertion (Steam-only, since that's the mechanism proven
broken) but targets the exact defect class this todo raised.

Self-verified: `npx tsc --noEmit -p .` clean; `src/backend/storeManagers/steam/` (39 suites, 1366
passed) and `src/frontend/screens/Library/` (21 suites, 579 passed) all green, including 4 new
regression tests for the `getGameInfo()` persisted-cache fallback.

**Still open:** a live full-app-restart confirmation from the operator that the fix holds in the
real environment (not just at first paint) — see
`.planning/debug/resolved/steam-library-22-games-missing.md` (or
`.planning/debug/steam-library-22-games-missing.md` if not yet archived) for the exact ask. This
todo is left OPEN (not closed) until that confirmation lands; the debug session tracks the
checkpoint.

## Operator confirmation (2026-08-22) — CLOSED

The outstanding live check landed. Operator, after a **full quit and relaunch** (not a reload, so
any stale `nonAvailableGames` localStorage entry would have survived and re-reproduced the defect):
the library header shows the full unfiltered count with **Wasteland 3** (719040) and **Len's
Island** (1335830) visible in the grid, and it **stays** correct while browsing — not just at first
paint, which was the specific way this could still have failed.

Corroborating state at close: persisted `steam_library.json` holds **378** Steam games with all
three probe appIds (719040, 1335830, 1771300) present and `is_installed: true`; the fix commits
`51b175d74` (hydration race) and `086e1ed4f` (not-installed heal branch) are on the branch with
`getGameInfo()`'s persisted-cache fallback, `reconcileNonAvailableGames` and
`findSilentlyExcludedGames` all live in source.

Debug session moved to `.planning/debug/resolved/steam-library-22-games-missing.md`.

**Note for future readers:** the sibling parked defect `.planning/debug/uninstall-game-vanishes.md`
is a DIFFERENT mechanism and stays parked — see the correction table in
`.planning/todos/completed/2026-08-22-nonavailablegames-permanently-traps-uninstalled-games.md`.
