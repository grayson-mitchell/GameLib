---
created: 2026-08-21
title: "22 owned Steam games are in the store but never reach the rendered library"
area: steam
status: OPEN
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
