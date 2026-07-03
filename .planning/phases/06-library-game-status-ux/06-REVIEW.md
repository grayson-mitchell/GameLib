---
phase: 06-library-game-status-ux
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/main.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
findings:
  critical: 0
  critical_resolved: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-03
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 6 wires Steam library/game status into the shared UX: lazy metadata fetch,
ACF-based install/uninstall polling, a running-game poller, DM queue size
estimation, and Steam-specific badge/notification suppression. Security posture
is solid — every `steam://` URL and store-API call is gated behind a `/^\d+$/`
appId guard, subprocess calls use argv form (no shell), and the store HTML is
regex-scraped rather than parsed/rendered.

The main defect is an asymmetry in the status lifecycle: the install-polling
grace/cancel path never emits a `done`, while `removeFromQueue` suppresses the
DM `done` for Steam. When a user cancels Steam's install dialog, the game can be
left with a stuck `queued`/`installing` badge that no path clears until restart.
Three additional robustness/UX issues and two minor items follow.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Steam install cancel leaves a permanently stuck status badge

**RESOLVED** (commit `fix(06): emit gameStatusUpdate done on Steam install cancel`) — the install grace/cancel branch now emits a terminal `done` (symmetric to the uninstall grace path) and a regression test was added.

**File:** `src/backend/storeManagers/steam/library.ts:551-559` (and `src/backend/downloadmanager/downloadqueue.ts:225-231`)
**Issue:**
The Steam status pipeline relies on the ACF poller as the *sole* source of the
`done` status for Steam:
- `addToQueue` emits `status: 'queued'` when the game is enqueued.
- `removeFromQueue` deliberately suppresses `sendGameStatusUpdate({ status: 'done' })`
  for `runner === 'steam'` (downloadqueue.ts:226) — "ACF poller emits the real done."
- But the install-polling **grace/cancel path** (`startInstallPolling`, lines
  551-559) stops the poll **without emitting any `gameStatusUpdate`** when the
  user cancels Steam's install dialog before a manifest appears
  (`!seenDownloading && ticks >= GRACE_TICKS`).

Compare the symmetric uninstall grace path (lines 699-710), which *does* emit
`status: 'done'` before stopping. The install path omits this. Result: after a
cancelled Steam install, the `queued`/`installing` badge is never cleared. The
D-01 focus backstop (`refreshInstallState`) only pushes `pushGameToLibrary` when
`is_installed` *changes* and never emits a `gameStatusUpdate`, so it does not
clear the transient status either. The badge stays stuck until app restart.

**Fix:** Emit a `done` on the install grace/cancel path, mirroring the uninstall
path:
```ts
if (!entry.seenDownloading && entry.ticks >= GRACE_TICKS) {
  logWarning(/* ... */)
  sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'done'
  })
  stopInstallPolling(appId)
}
```
Apply the same `done` emission on the `MAX_TICKS` safety-cap branch (lines
537-543) so a timed-out poll also clears the transient status.

## Warnings

### WR-01: `migrateStaleArtUrls` can throw an uncaught TypeError during init()

**File:** `src/backend/storeManagers/steam/library.ts:130`
**Issue:**
The migration guards every access with optional chaining except the summary log
line:
```ts
`...migrated ${migrated.filter((g) => g.art_square.includes(NEW_ART)).length}...`
```
`g.art_square.includes(...)` has no `?.`. If any persisted game entry has an
absent `art_square` (partial/legacy store data — the map above it explicitly
guards with `game.art_square?.includes`, showing the author expects this), this
throws `TypeError: Cannot read properties of undefined`. This line only runs when
`changed === true`, and `migrateStaleArtUrls()` is called from `init()` (line 40)
**without** a try/catch (unlike the `scanDownloadingAppIds` call, which is
wrapped). An uncaught throw here aborts Steam library initialization.

**Fix:** Use the same guard as the map:
```ts
`...migrated ${migrated.filter((g) => g.art_square?.includes(NEW_ART)).length}...`
```
Optionally wrap `this.migrateStaleArtUrls()` in try/catch like the resume-poll block.

### WR-02: Delisted / no-data games trigger an unbounded metadata refetch

**File:** `src/backend/storeManagers/steam/games.ts:152-189`
**Issue:**
`getGameInfo` fires `fetchMetadataIfNeeded` whenever `!existing.art_cover`.
When the store API returns no `data` (delisted game, temporary API failure —
line 186-189), the function returns early and `art_cover` is never populated.
There is no negative cache and no failure marker, so **every subsequent
`getGameInfo` call re-fires a network request** for that appId. `pendingFetches`
only dedups concurrent calls, not sequential ones across renders/IPC calls. For a
library with several delisted apps this repeatedly hammers
`store.steampowered.com` and risks rate-limiting.

**Fix:** Record a negative result (e.g. add the appId to a `failedFetches`/
timestamped set, or set a sentinel `art_cover`) so a no-data response is not
retried on every access; optionally back off with a TTL before re-attempting.

### WR-03: Steam "playing" play button invokes `sendKill`, not launch

**File:** `src/frontend/screens/Library/components/GameCard/index.tsx:232-242, 596-597`
**Issue:**
D-08 hides the Stop button for Steam while playing (`isPlaying && !isSteam`), so
`renderIcon()` falls through to the installed-game **play** icon (lines 263-276),
which is enabled (status `playing` is not in the disabled list). Its `onClick`
calls `handlePlay`, but `handlePlay` short-circuits on `if (isPlaying || isUpdating)
return sendKill(appName, runner)` (line 596). For Steam, `stop()` is a documented
no-op, so clicking the visible "play/start" icon does nothing useful and cannot
relaunch the game — the affordance contradicts its behavior.

**Fix:** In `handlePlay`, gate the kill branch on non-Steam
(`if ((isPlaying || isUpdating) && !isSteam) return sendKill(...)`), or make the
Steam-while-playing icon disabled/observe-only so the click has no misleading action.

## Info

### IN-01: `getGameInfo` returns `{} as GameInfo` (type lie)

**File:** `src/backend/storeManagers/steam/games.ts:154`
**Issue:** Returning `{} as GameInfo` fabricates a value missing every required
field. Callers such as `downloadqueue.ts` `cancelCurrentDownload`/`processNotification`
survive only because they destructure with optional access, but any caller
assuming the declared shape (e.g. `art_cover`, `install`) will read `undefined`.
**Fix:** Prefer returning a minimally-valid default object (matching `getExtraInfo`'s
safe-default pattern) or narrow the signature to `GameInfo | undefined` and handle it.

### IN-02: Install paths built from unsanitized ACF `installdir`

**File:** `src/backend/storeManagers/steam/library.ts:378, 438`
**Issue:** `join(steamappsDir, 'common', state.installdir ?? '')` trusts the ACF
`installdir` string verbatim. It is safe today (appIds reaching `readAcfState`/
`buildInstalledMap` are numeric-guarded and the ACF is local, Steam-owned data,
and the path is only used for `existsSync`/display), but there is no
defense-in-depth against a crafted `installdir` containing `..`.
**Fix:** Note as acceptable given the trust boundary; if hardened later, reject
`installdir` values containing path separators / `..` before joining.

---

_Reviewed: 2026-07-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
