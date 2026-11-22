---
created: 2026-11-22T05:00:00.000Z
title: "Refresh buttons give no visual feedback when the refresh finishes instantly (seen on Humble Keys)"
area: library-ui
files:
  - src/frontend/screens/Humble/Keys/index.tsx (humbleKeysRefreshButton, spins only while humble.syncing)
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeysRefreshButton.spinning)
  - src/frontend/components/UI/Header/index.tsx (action-icons-refresh-button, refreshButtonSpinning)
  - src/frontend/screens/WineManager/index.tsx (fa-spin on refreshingWineVersions)
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx (onClickRefresh)
severity: minor
platform: any
ready: code
resolved: 2026-11-23
resolution: quick 261123-bbi
---

## Problem

Clicking Refresh on the **Humble Keys** page can show nothing, so it looks as if the click did nothing.
The button spins only while `humble.syncing` is true, and a Humble sync can finish almost instantly, so
the spin never shows or is too brief to see.

The operator has noticed this before, and it came up again in the Phase 85 live gate (85-20, launches 1
and 6, 2026-11-22). Operator's words: "refresh button does not respond. I have noticed this issue before,
should rotate for 1 sec just to show is responding to the click."

**Correction (operator, 2026-11-23):** this was the Humble Keys page, not the Library header. The
original write-up attributed it to the Library header's `action-icons-refresh-button`. That attribution
was wrong: a Library refresh always takes more than a second, so its existing spin is already visible.
Humble's can be near-instant.

## Fix

Rule for **every** refresh button: on each click, spin the icon for at least ~1 s, and keep it spinning
for as long as the refresh is still running. Spin = `max(1 s from click, end of refresh)`.

Apply it to all refresh clicks (Humble Keys, the Library header, Wine Manager, Apple wiki info, and any
others found), ideally through one shared hook or helper so the minimum lives in one place.

**Acceptance test: Humble Keys.** Clicking Refresh there when the sync returns almost immediately must
still spin visibly for about 1 s.

## Resolution

Quick 261123-bbi. One shared hook, `useMinimumSpin(active, minMs = MIN_SPIN_MS)` in
`src/frontend/hooks/useMinimumSpin.ts` (`MIN_SPIN_MS = 1000`), holds the rule: spin =
max(1 s from the click, end of the refresh). The window starts on a click only, so a busy period nobody
clicked for (background or per-runner refresh, store-exit refresh) spins exactly as long as it runs. Each
click restarts the window and unmount clears the timer.

Six sites wired: Humble Keys, the Library header (`refreshButtonSpinning` is now the hook value, so the
hidden duplicate spinner stays hidden in the window too), Wine Manager toolbar, the Apple wiki rating
refresh, the wiki-info Retry, and the error screen's Refresh Library.

Out of scope, with reasons:

- SteamSyncNotice failed-mode "Try again": a text-only button with no refresh glyph to spin.
- EOS overlay "Check for updates": an update check, not a refresh, and its label already changes to
  "Checking for updates..." while it runs.
- Winetricks row "Retry": retries a component install, not a refresh.
- GameCard, EAC/BattlEye runtime, StoreSearch, SearchBar, EligibilityLoadingRow spinners: status
  spinners with no click.
- ConsoleMode, DownloadManager, LogSettings, WineVersionSelector `refreshing` flags: load states with no
  refresh button.

Disabled states still follow the real busy flag; the spin window is visual feedback only and blocks no
click.

Code commits: 6dc952fb3 (hook + Humble Keys), 8ba2c64c8 (Library header, Wine Manager, error screen),
bec84fb6f (Apple wiki refresh, wiki-info Retry).

The Humble Keys acceptance case is proven by the `261123-bbi` component test (syncing never true, the
`spinning` class and `fa-spin` last 1000 ms). A live look on the running app is optional (the todo is
`ready: code`).
