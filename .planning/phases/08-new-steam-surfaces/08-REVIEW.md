---
phase: 08-new-steam-surfaces
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/common/types.ts
  - src/frontend/components/UI/EditGameDialog/index.tsx
  - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/screens/Discounts/components/DiscountCard/index.tsx
  - src/frontend/screens/Discounts/components/DiscountFilters/index.tsx
  - src/frontend/screens/Discounts/index.tsx
  - src/frontend/screens/Game/GamePicture/index.tsx
  - src/frontend/screens/Library/components/GameCard/constants.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed 15 source files covering five UAT gap-closure changes: branded art fallback (gaps A+C), delisted-game filtering (gap B), Console launch-overlay blur-dismiss (gap D), and Deals "Hide Owned" cross-store (gap F).

The Steam backend logic (electronStores, games, library) is largely sound. The delisted-verdict flow in `games.ts` correctly distinguishes `success === false` (definitive) from missing/empty data (transient), and `pendingFetches` deduplication is wired correctly with the add-before-await ordering. The ConsoleMode blur-dismiss cleanup, the `ownedTitles` Set construction, and the cross-store Hide Owned filter are all correct.

Three issues require attention before ship: one BLOCKER (the fallback wiring in `GamePicture` uses a literal string `'fallback'` instead of the imported SVG — CachedImage passes this directly to `<img src>`, producing a broken image on any CDN failure rather than the branded fallback); and a cluster of warnings around misleading log counts, a startup-resume false-positive for mid-uninstall games, and a non-Steam LaunchOverlay missing cleanup.

---

## Critical Issues

### CR-01: `GamePicture` passes literal `'fallback'` string as CachedImage fallback for non-legendary stores

**File:** `src/frontend/screens/Game/GamePicture/index.tsx:33`

**Issue:** `getImageFormatting()` returns `{ src: art_square, fallback: 'fallback' }` for all non-legendary stores (Steam, GOG, Amazon, Zoom) when `art_square` is a valid URL. `CachedImage` uses the `fallback` prop as the literal `src` of the `<img>` element when the primary URL fails (confirmed by reading `CachedImage/index.tsx:34-36`). The string `'fallback'` is not a valid URL; in Electron's file context it resolves to a relative path that does not exist. The result is a broken-image icon in the game-detail page whenever the CDN URL fails to load — no branded fallback SVG appears.

This directly contradicts the gap-A+C closure intent. The no-art case (`!art_square`) is correctly handled (both `src` and `fallback` are set to `fallbackImage`), but the CDN-failure case on the game-detail page is not.

**Fix:**
```typescript
// GamePicture/index.tsx — getImageFormatting()
} else {
  // Was: return { src: art_square, fallback: 'fallback' }
  return { src: art_square, fallback: fallbackImage }
}
```

`fallbackImage` is already imported at line 5. CachedImage will then attempt `imagecache://` for the primary URL (http), fall through to the direct URL, and finally render the local SVG — which never fails.

---

## Warnings

### WR-01: `success === false` verdict is permanent even when Steam returns it for region-restricted owned games

**File:** `src/backend/storeManagers/steam/games.ts:186`

**Issue:** The Steam appdetails API returns `{success: false}` for two distinct conditions: (1) a genuinely delisted/non-existent app, and (2) an app not purchasable in the requesting region. Scenario (2) can affect games a user legitimately owns — purchased as a gift, through a family share, or when regional availability changed post-purchase. When the API returns `success === false` for such a game, the code sets `is_delisted: true` in both `steamMetadataStore` and the in-memory library, then pushes it to the frontend.

Because `fetchMetadataIfNeeded` is only triggered when `art_cover` is empty (`games.ts:157`), and `art_cover` is preserved in the metadata cache even after marking the game delisted (`games.ts:191-196`), the delisted flag is never automatically re-evaluated on subsequent sessions. A region-locked but playable game can be permanently hidden from ConsoleMode with no user-accessible recovery path short of clearing the full Steam metadata cache.

**Fix:** Append the user's country code to the API request so regional visibility matches the user's locale, and introduce a periodic re-evaluation pass (or tie re-evaluation to the next `refresh()`) that re-fetches metadata for any `is_delisted: true` game that is present in `getUserOwnedApps`:

```typescript
// Append user locale to reduce false positives from regional restrictions
const resp = await axios.get(
  `${STEAM_STORE_API}?appids=${this.appId}&cc=${userCountryCode}`
)
```

A lighter-weight mitigation is to add `is_delisted: true` games to a retry queue that is flushed on the next successful `refresh()`, clearing the `art_cover` cache entry so `fetchMetadataIfNeeded` triggers again.

---

### WR-02: `migrateStaleArtUrls` log count includes pre-existing entries, and filter lacks optional chaining that exists one call-site earlier

**File:** `src/backend/storeManagers/steam/library.ts:128-133`

**Issue (a) — Wrong count:** The log statement counts all `GameInfo` objects in `migrated` that contain `NEW_ART` in their `art_square` field:

```typescript
migrated.filter((g) => g.art_square.includes(NEW_ART)).length
```

This includes games that already had `library_600x900.jpg` in their URL before migration. The correct count is the number of entries that were actually replaced, which corresponds to how many times `changed = true` was set inside the `.map()` callback — but a simple count of that is not readily available with the current structure. The log will consistently over-report the migration size after the first run (all migrated entries pass the filter on every subsequent launch).

**Issue (b) — Missing optional chaining:** The `.map()` body uses `game.art_square?.includes(OLD_ART)` (optional chaining, line 106), acknowledging that `art_square` might be absent in old cache data. The filter in the log statement uses `g.art_square.includes(NEW_ART)` without optional chaining. If any cached `GameInfo` object has `art_square` as `undefined` or `null` (possible from pre-Steam-integration cache data), this throws `TypeError`, which propagates out of `migrateStaleArtUrls()` and potentially out of `init()`, aborting Steam library initialization.

**Fix:**
```typescript
// Use optional chaining for safety, and count only entries that changed
const changedCount = migrated.filter(
  (g, i) => g.art_square !== games[i]?.art_square
).length
if (changed) {
  steamLibraryStore.set('games', migrated)
  logInfo(
    `Steam: migrated ${changedCount} cached cover URLs to portrait art`,
    LogPrefix.Steam
  )
}
```

Or, simpler: count `changed` ticks during the `.map()`:
```typescript
let migratedCount = 0
const migrated = games.map((game) => {
  if (game.art_square?.includes(OLD_ART)) {
    changed = true
    migratedCount++
    return { ...game, art_square: game.art_square.replace(OLD_ART, NEW_ART) }
  }
  return game
})
```

---

### WR-03: `scanDownloadingAppIds` starts install polling for games that are mid-uninstall on restart

**File:** `src/backend/storeManagers/steam/library.ts:787-793`

**Issue:** `scanDownloadingAppIds` identifies apps with StateFlags bit 4 unset (`stateFlags & 4 === 0`) and resumes install polling for them. However, bit 4 being unset is also true during an active uninstall (StateFlags typically includes `0x800` — `EAppState::Uninstalling` — alongside other flags). If the app is restarted while Steam is removing a game, the ACF manifest still exists with bit 4 unset, `scanDownloadingAppIds` returns that appId, and `startInstallPolling` is called.

The install poller's grace logic (`!entry.seenDownloading && entry.ticks >= GRACE_TICKS`) never fires because the first poll tick sees the manifest and sets `seenDownloading = true`. After Steam finishes removing the manifest (`readAcfState` returns `'absent'`), `pollInstallOnce` takes no action for the absent case — no status is sent. The game's badge remains stuck at `'installing'` until the `MAX_TICKS` cap (≈6 h) or the next app-focus ACF re-read.

**Fix:** Exclude actively-uninstalling apps by checking bit 0x800:

```typescript
const STATE_UNINSTALLING = 2048 // EAppState::Uninstalling
if (
  !isNaN(stateFlags) &&
  (stateFlags & 4) === 0 &&
  (stateFlags & STATE_UNINSTALLING) === 0 && // not mid-uninstall
  library.has(appIdStr)
) {
  downloadingIds.push(appIdStr)
}
```

---

### WR-04: Non-Steam LaunchOverlay effect returns `undefined` cleanup; `onDismiss` fires after unmount on navigation

**File:** `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:99-108`

**Issue:** For non-Steam runners, the launch effect sets `cleanup` only inside the `if (game.runner === 'steam')` branch. The `else` branch does not set `cleanup`, so the effect returns `undefined`:

```typescript
} else {
  void launch({...}).finally(() => {
    onDismiss()  // fires after the Promise settles, regardless of mount state
  })
}
return cleanup  // undefined for non-Steam
```

If the component unmounts via an external trigger before the launch Promise resolves (e.g., the parent resets `launchingGame` to `null` via some other path, or the user navigates away in a multi-window scenario), `onDismiss()` is called on the stale closure. In React 18 this is a benign no-op, but there is no cancellation signal for the in-flight `launch()` call. More concretely, calling `onDismiss()` after unmount will attempt `setLaunchingGame(null)` on the parent that may have already been unmounted, depending on app-level routing.

**Fix:** Use a mounted guard:

```typescript
} else {
  let active = true
  void launch({...}).finally(() => {
    if (active) onDismiss()
  })
  cleanup = () => { active = false }
}
```

---

### WR-05: `cardRefs.current = []` mutation inside `useMemo` in ConsoleMode

**File:** `src/frontend/screens/ConsoleMode/index.tsx:143`

**Issue:** `visibleGames` is computed inside `useMemo`, but the callback mutates `cardRefs.current` as a side effect:

```typescript
const visibleGames = useMemo(() => {
  cardRefs.current = []   // ← mutation
  // ...
}, [allGames, filteringByInstalled, activeStore, ascending])
```

React may invoke memo callbacks more than once (Strict Mode double-invocation, concurrent mode re-renders). Two back-to-back invocations would clear and re-clear `cardRefs.current` without a render occurring between them, which is benign but accidental. More importantly, any concurrent read of `cardRefs.current` from an event handler or effect during the same render phase would see a prematurely-cleared array.

**Fix:** Move the ref reset to the render body (outside `useMemo`) or, idiomatically, perform it inside the `useEffect` that syncs focus:

```typescript
// In the render path, before the grid maps:
cardRefs.current = []  // safe — runs once per render cycle
```

Or gate the clearing on the return of the `useMemo` by counting refs during render (the current pattern used by Heroic's GameList is to clear in the effect that fires when the list length changes).

---

## Info

### IN-01: `console.log` debug artifact in `SideloadDialog`

**File:** `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:118`

**Issue:** `console.log(launchFullScreen)` is live in production code. Will appear in user devtools and log files.

**Fix:** Remove the line.

---

### IN-02: `isGameAvailable` wraps synchronous code in an unnecessary `Promise` constructor

**File:** `src/backend/storeManagers/steam/games.ts:490-499`

**Issue:**

```typescript
async isGameAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const info = this.getGameInfo()
    resolve(Boolean(...existsSync(...)))
  })
}
```

The body contains no awaited expressions. The `new Promise()` wrapper is pointless — all computation is synchronous. This is a known anti-pattern (the explicit Promise constructor anti-pattern) and makes the control flow unnecessarily opaque.

**Fix:**
```typescript
async isGameAvailable(): Promise<boolean> {
  const info = this.getGameInfo()
  return Boolean(
    info?.is_installed &&
    info.install?.install_path &&
    existsSync(info.install.install_path)
  )
}
```

---

### IN-03: Install-complete notification fires with empty title if game is not in library map

**File:** `src/backend/storeManagers/steam/library.ts:499-503`

**Issue:**

```typescript
const existing = library.get(appId)
if (existing) {
  // ... update library and send pushGameToLibrary
}
sendFrontendMessage('gameStatusUpdate', { ..., status: 'done' })
notify({
  title: existing?.title ?? '',   // ← empty title if existing is undefined
  body: i18next.t('notify.install.finished', 'Installation Finished')
})
```

`notify` is called unconditionally after the `if (existing)` guard. If `existing` is `undefined` (game installed but not in the in-memory map — theoretically possible if polling was resumed before `init()` populated the map), the toast shows "Installation Finished" with an empty game title.

**Fix:** Move `notify` inside the `if (existing)` block so it only fires when a game title is available:

```typescript
if (existing) {
  // ... library and frontend updates
  notify({
    title: existing.title,
    body: i18next.t('notify.install.finished', 'Installation Finished')
  })
}
stopInstallPolling(appId)
```

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
