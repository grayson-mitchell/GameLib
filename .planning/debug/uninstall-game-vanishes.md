---
slug: uninstall-game-vanishes
status: investigating
trigger: "bug, when you uninstall a game it now disappears from the library.  I have to resart app to see it again."
created: 2026-07-21
updated: 2026-08-19
parked: 2026-07-22
unparked: 2026-08-19
parked_reason: "User parked pending planned daemon-based rearchitecture — intends to re-test this symptom once the app no longer carries Electron's renderer/state complexity."
unpark_reason: "Parking condition MET (app is now Tauri) and the symptom RECURRED on the install side as G-23.2-01 during /gsd-verify-work 23.2."
also_tracked_as: G-23.2-01 (.planning/phases/23.2-.../23.2-HUMAN-UAT.md)
branch: fix/steam-native-install-stability
---

## UNPARKED 2026-08-19 — READ THIS SECOND (after the section below)

**Two things changed, and the second one invalidates part of this file.**

**1. The symptom is NOT uninstall-specific. It recurred on INSTALL.** During
`/gsd-verify-work 23.2`, a live GameLib install of KCD2 (appId 1771300) completed
successfully at 17:17:54 and the game then **vanished from the library, search included**.
Restarting the app brought it back. Filed as gap `G-23.2-01`. So the trigger is an
`is_installed` TRANSITION delivered by a single `pushGameToLibrary` upsert — in either
direction — not the uninstall path specifically. Any hypothesis scoped to uninstall-only
code (`pollUninstallOnce`, `SteamGame.uninstall()`, `ensurePlatformsCaptured`) now has to
explain the install case too, or it is wrong. **This is a significantly stronger repro:
installing is cheap and repeatable** (move the `.acf` aside, reinstall — the content is
already on disk, so it takes ~70s and downloads nothing; see the 23.2 UAT for the recipe).

**2. The parking condition was met, AND phase 34.11 deleted this file's surviving lead.**
The app is now Tauri. But `Library/index.tsx` was rewritten wholesale by phases 34.10/34.11
(13+ commits since the park). **`gamesForAlphabetFilter` NO LONGER EXISTS.** The "Current
Focus" below points at a memo chain at `index.tsx:724-730` that is gone. Today's file has
`libraryUnion`, `searchMatchedKeys`, `FilterEngineDeps`, `FilterEngineState`, `gridPipeline`,
facet counts and removable filter chips instead.

### ⚠ ELIMINATIONS THAT ARE NO LONGER SAFE

These were verified against pre-34.11 code **that has since been deleted**. Their premise is
dead, so their conclusions do not carry over. **Re-test each against the new filter engine
before trusting it:**

- platform filter (`filterByPlatform`, cited at `index.tsx:333-382`) — that function's rating
  branch was explicitly retired by `6452d4666` ("rewire grid onto filterLibrary; retire
  filterByPlatform rating branch")
- `isNonAvailable`/delisted filter (cited at `index.tsx:601-628`)
- installed/installing/notInstalled partition (cited at `index.tsx:711-723`)
- alphabet filter (the mechanism itself may no longer exist)
- the search-term-matching elimination — search is now `searchMatchedKeys` (`index.tsx:641`),
  a different implementation entirely

### ✅ EVIDENCE THAT STILL HOLDS (re-confirmed 2026-08-19 against current source)

- **The Steam library is push-only.** `refreshLibrary`'s state merge in `GlobalState.tsx`
  (~L1039) has branches for epic/gog/zoom/amazon/sideload and **no steam branch** —
  `includesSteam`, `next.steam`, `loadSteamLibrary`, `steamLibraryStore` all return zero hits
  in that file. `state.steam.library` is built solely by `handleGamePush`
  (`GlobalState.tsx:1494-1511`), with the backend re-pushing every cached game on refresh
  (`library.ts:752`).
- **`handleGamePush`'s steam branch cannot remove an entry.** It uses the functional
  `setState(prevState => ...)` form and only replaces-by-index or appends. So a vanish means
  `state.steam.library` was RESET and not re-populated, **or** a render-time filter excluded
  it. Those remain the only two families.
- **The stale-closure elimination holds** — steam still uses the functional updater (gog/zoom
  still do not).
- **Backend data is correct while the game is invisible** — re-confirmed for KCD2:
  `store_cache/steam_library.json` had `is_installed: true`, `is_windows_native: true`,
  `steamPlatformsCaptured: true`, `is_delisted: false` and a full `install` object,
  structurally identical to appId 2457220 (Avowed), which renders fine.

### The tension any root cause must still resolve

Unchanged from the park, and now sharper: **a stale memo yields a STALE entry, not a vanished
one.** The mechanism must explain BOTH the disappearance AND why a refresh with unchanged
filter state fixes it — and now also why it happens on install and uninstall alike.

### Census trap that cost time today

Grepping the frontend for the CHANNEL name `pushGameToLibrary` returns **zero hits**. The
frontend subscribes via the preload API-METHOD name `handleGamePush`
(`src/preload/api/library.ts:14`). A census keyed on the channel name concludes, wrongly, that
there is no subscriber at all.

### Diagnostic logging status

**Gone / reverted.** The temporary logging this file records as "now committed" is no longer in
`library.ts` or `GlobalState.tsx`. If re-added, note the `GlobalState` one emitted ~378 lines
per refresh, and it must be reverted before any merge.

---

## PARKED 2026-07-22 — READ THIS FIRST ON RESUME

Root cause NOT found. Parked by user decision, not because the trail went cold — five
hypotheses were eliminated with evidence and the search space is genuinely narrow now.
User intends to re-test after rearchitecting the app to be daemon-based (removing Electron's
renderer/state complexity), on the reasoning that the surviving suspect area — frontend
React memo/reference-identity behavior — may not survive that rearchitecture at all.

**Confirmed symptom (final, user-verified):** In the plain list view, NO filters, NO search,
browsing the full alphabetical list, the uninstalled game is genuinely absent (user explicitly
confirmed they meant "W", not "H", and that they checked the whole list). Pressing Refresh —
without changing view or filters — makes it reappear. An app restart also works, but is not
required.

**What the evidence proves:** the entry is present and correct in both app state and the
persisted store at the moment it is invisible. So this is NOT data loss and NOT a
field-content defect. It is something `refresh()` does to the frontend that a single
`pushGameToLibrary` upsert does not.

**Uncommitted-at-park → now committed:** the temporary diagnostic logging in
`src/backend/storeManagers/steam/library.ts` (uninstall-poll HIT/MISS + push confirmation)
and `src/frontend/state/GlobalState.tsx` (per-push receipt log) was committed so it would not
be lost or accidentally swept into an unrelated commit. **It must be reverted before any
merge** — the GlobalState one emits ~378 lines per library refresh. See the commit that
parked this session.

**Highest-value next step on resume:** determine what `refresh()` changes on the frontend that
an individual `pushGameToLibrary` upsert does not — array reference identity, memo dependency
invalidation, or re-render trigger. Note the tension any candidate must resolve: a stale memo
normally yields a STALE entry (game still shown as installed), not a vanished one. Any proposed
mechanism must explain BOTH the disappearance AND why a refresh with unchanged filter state
fixes it.

# Debug Session: Uninstalled game vanishes from library until app restart

## Symptoms

- **Expected behavior:** After uninstalling a game, it remains visible in the library with its badge flipped back to "Install".
- **Actual behavior:** The game disappears from the library list entirely.
- **Recovery:** Restarting the app makes it reappear (correctly, as not-installed).
- **Note the word "now":** user reports this as new behavior — treat as a regression, not longstanding.
- **Error messages:** not yet collected.
- **Reproduction:** Uninstall any game from the GameLib library view.

## PRIME SUSPECT — a change made earlier today in this same session

Commit `42321b71` (debug session `steam-relogin-no-autorefresh`, ~2h before this report) modified
`src/frontend/state/GlobalState.tsx` `refreshLibrary()`: its `catch` block now resets
`refreshing: false`, where previously a failed refresh left the flag stuck `true`.

Why this is the leading candidate: `refreshLibrary()` guards itself with `if (this.state.refreshing) return`.
Before `42321b71`, a first failure wedged the flag and every SUBSEQUENT refresh silently no-op'd —
which would have left the library list frozen at its last-good value. After `42321b71`, those
refreshes now genuinely execute. If a post-uninstall refresh completes with a partial, empty, or
filtered result, it will now actually overwrite the library list where previously it could not.

That makes the disappearance either (a) newly CAUSED by `42321b71`, or (b) a pre-existing defect in
the post-uninstall refresh path that `42321b71` UNMASKED. Distinguishing these two matters:
- If (a): the fix is wrong or incomplete and needs correcting.
- If (b): `42321b71` is correct and should stand; the real defect is upstream in what the
  post-uninstall refresh writes into library state.
Do NOT simply revert `42321b71` to make the symptom go away — that would restore the original
stuck-spinner bug it fixed. Establish which of (a)/(b) is true with evidence first.

## Other candidate surfaces (unverified)

- The uninstall handler's library-state update: does it remove the entry rather than flip an
  `is_installed` flag? Check the Steam store manager's uninstall path and any `library.set` /
  `steamLibraryStore.set` persistence (prior project lesson: any `library.set` needs a matching
  `steamLibraryStore.set` persist).
- Frontend filtering: an "installed" filter or a list rebuilt from an installed-map could drop the
  entry when the ACF disappears, with app restart repopulating from the full cached library.
- Recently touched adjacent code: `buildInstalledMap` / `buildBottleInstalledMap` /
  `buildBridgeInstalledMap` in the Steam library refresh path.

## Current Focus

- hypothesis: the vanish is a render-time exclusion by the POST-34.11 filter engine
  (`filterLibrary` / `FilterEngineState` / `gridPipeline` in Library/index.tsx), not a
  state loss — because `handleGamePush`'s steam branch structurally cannot remove an
  entry and the backend data is provably correct while the game is invisible. The
  distinguishing factor is that a single upsert changes ONE element's identity inside
  `state.steam.library` while a full refresh re-pushes all ~378, and something in the
  facet/filter pipeline (facet counts, `searchMatchedKeys`, the connected-store union,
  or a memoised filter result) is not recomputing for a single-element change. NOTE the
  prior eliminations of platform/delisted/partition/alphabet/search filters were made
  against DELETED pre-34.11 code and must be re-tested, not inherited.
- test: reproduce on the INSTALL side (cheap, ~70s, zero download — see recipe below),
  and instrument what `state.steam.library` contains versus what the grid pipeline emits
  at the moment the game is invisible. Compare the single-upsert path against the
  full-refresh path through the new filter engine.
- expecting: either (1) a memoised stage in the new filter/facet pipeline whose
  dependency array misses the library array itself (so a single-element upsert does not
  invalidate it, while a full refresh does — because the whole array's identity changes),
  or (2) a facet/chip state computed once over a snapshot union that a single upsert does
  not refresh, excluding the changed game until recomputed.
- next_action: read the CURRENT Library/index.tsx filter pipeline end-to-end —
  `libraryUnion` (L623), `searchMatchedKeys` (L641), `engineDeps` (L685),
  `FilterEngineState` (L710), `gridPipeline` (L753+) — recording every dependency array
  and its source. Then determine what differs, reference-identity-wise, between a
  one-element upsert and a full re-push.
- repro_recipe: |
    Cheap and repeatable, from the 23.2 UAT. Quit the bottle's steam.exe. Move
    `appmanifest_<appid>.acf` out of the CrossOver bottle's `steamapps/` (back it up
    first). GameLib then shows the title as not-installed. Click Install — because the
    content is already on disk, `reconcilePartialState` sha1-verifies and skips
    everything (`jobCount=0`), so it completes in ~70s having downloaded nothing, and the
    game vanishes. Verified with KCD2 (appId 1771300) on 2026-08-19.
- reasoning_checkpoint:
    hypothesis: "NOT CONFIRMED — this is a direction, not a finding. Root cause is open."
    confirming_evidence: []
    falsification_test: "N/A — no fix proposed yet."
    fix_rationale: "N/A"
    blind_spots: "The 34.11 filter engine has not been read yet at all. It is entirely
      possible the cause is a state reset rather than a filter, which this hypothesis
      under-weights — the two families named in the surviving evidence are both still
      open, and the reset family has NOT been ruled out."

## Superseded Current Focus — DEAD, targets code deleted by 34.11 (kept for continuity)

- hypothesis: since a plain refresh (not a restart) fixes it, and the persisted entry's
  DATA looks correct even before the refresh, the bug is NOT in what data
  pollUninstallOnce pushes — it is in something the refresh() call path triggers that a
  single pushGameToLibrary call does not (e.g. a re-render trigger, a memo dependency
  invalidation, a reference identity change, or a recomputation of some derived list that
  only refresh() forces). Investigating the memo chain feeding `gamesForAlphabetFilter`
  and the final memo at index.tsx:724-730 (deps: [gamesForAlphabetFilter,
  alphabetFilterLetter, sortDescending, sortInstalled, installing] — does NOT list the
  underlying library array itself) as the leading candidate for a stale-memo /
  missing-dependency bug. Also need to resolve the "H" vs "W" alphabet-filter tension
  from the user's own words, and reconcile whichever mechanism is found with the fact
  that refresh() (not restart) fixes it.
- test: read the full memo chain in Library/index.tsx from the source array through to
  render, using graphify to orient first; identify what changes reference-identity-wise
  on refresh() vs a single pushGameToLibrary upsert.
- expecting: either (1) a `useMemo`/`useCallback` with a dependency array missing the
  library array itself (or missing something that changes on upsert but not on
  refresh-triggered replacement), producing a stale filtered/derived list that omits
  newly-upserted entries until some OTHER dependency changes (which refresh() happens to
  bump), or (2) an alphabet filter state that was left active and only reset by
  something refresh() incidentally touches.
- next_action: run `graphify explain "gamesForAlphabetFilter"` and
  `graphify query "Library index.tsx memo chain"` to orient, then Read the full
  Library/index.tsx memo pipeline from top (source array) to the final render memo,
  noting every dependency array and its source.
- reasoning_checkpoint:
  hypothesis: "NOT YET CONFIRMED — see Evidence/Eliminated below. Root cause is open."
  confirming_evidence: []
  falsification_test: "N/A — no fix proposed yet, more evidence required first"
  fix_rationale: "N/A"
  blind_spots: "OLD (superseded) content below retained for continuity; see new
    hypothesis above for the actual next step."

## Superseded Current Focus (historical, kept for continuity)

- hypothesis: NEITHER (a) nor (b) as originally framed — log evidence from the actual
  reproduction (`gamelib.log.old`) shows the full `SteamLibraryManager.refresh()` call
  (the mechanism `42321b71` unblocks) never even ran after the uninstall in question, so
  `42321b71` is not implicated in this specific vanish at all. Root cause is still open;
  two adjacent, independently-confirmed bugs were found during investigation but neither
  is proven to be the trigger for THIS symptom. Diagnostic logging has been added
  (uncommitted) at the two most likely renderer/backend handoff points; next repro will
  confirm or eliminate them directly.
- test: reproduce the uninstall again (ideally on a freshly rebuilt app so `42321b71` is
  definitely active) with the new logging in place; also confirm which Library
  view/filter (All / Installed-only / a specific store tab) was showing when the game
  "disappeared."
- expecting: the new logs will show either (1) `library.get() MISS` in
  `pollUninstallOnce` (meaning the single-entry push never fires — points at a lookup/key
  bug), or (2) a `handleGamePush` receipt log with `is_delisted=true` (points at the
  is_delisted false-positive mechanism), or (3) neither log appears at all following the
  uninstall (points at some other, still-unidentified path).
- next_action: ask user to rebuild/restart the app, reproduce the uninstall once more,
  and share the resulting `gamelib.log` tail plus which library filter view they were on.
- reasoning_checkpoint:
  hypothesis: "NOT YET CONFIRMED — see Evidence/Eliminated below. Root cause is open."
  confirming_evidence: []
  falsification_test: "N/A — no fix proposed yet, more evidence required first"
  fix_rationale: "N/A"
  blind_spots: "Cannot observe the live Electron renderer directly from this shell;
    relying on log/file forensics from the LAST captured repro. That repro may predate
    42321b71 being loaded into the running process (unconfirmed), which would explain
    why the full refresh never fired — but does not explain the vanish itself."

## Evidence

- timestamp: 2026-07-21 (investigation)
  checked: `src/frontend/state/GlobalState.tsx` `refreshLibrary()`/`refresh()`, and the
  full push chain `SteamLibraryManager.refresh()` → `pushGameToLibrary` →
  `handleGamePush` → `state.steam.library`.
  found: `state.steam.library` starts as `[]` at every fresh page load
  (`state: StateProps = { ... steam: { library: [], ... } }`, GlobalState.tsx:236-239) —
  unlike epic/gog/amazon/zoom, which hydrate from their persisted electron-stores
  immediately. Steam's library is built ONLY by incremental `pushGameToLibrary` upserts
  (`handleGamePush`, upsert-by-`app_name`, never removes). `refresh()` (the frontend
  method called after every `refreshLibrary()`) never touches `state.steam` at all.
  implication: within a single session, nothing in the normal push/upsert path can make
  a Steam game disappear from `state.steam.library` — only (1) an explicit reset
  (steamLogin/steamLogout → `library: []` → `window.location.reload()`), or (2) a
  render-time FILTER excluding it, can produce "vanish."

- timestamp: 2026-07-21 (investigation)
  checked: `.planning/debug/uninstall-game-vanishes.md` PRIME SUSPECT chain — traced
  `handleGameStatus` → `refreshLibrary({library:'steam'})` → `window.api.refreshLibrary`
  → `main.ts addHandler('refreshLibrary', ...)` → `libraryManagerMap['steam'].refresh()`
  (`SteamLibraryManager.refresh()`, library.ts:588). This does `library.clear()` then
  rebuilds solely from a live `client.getUserOwnedApps()` call + ACF overlay, with only a
  throw/catch safety net (falls back to cache on hard failure) and NO protection against
  a non-throwing but incomplete `ownedApps` result.
  implication: architecturally this IS a real gap (no merge-with-existing-cache
  safeguard), and `SteamLibraryManager.refresh()` has NO internal concurrency guard —
  see next entry for direct proof this matters in practice. Flagged as a real defect
  worth hardening regardless of whether it is THIS bug's trigger.

- timestamp: 2026-07-21 (investigation)
  checked: live `gamelib.log` (current session, spans 22:12–22:38) for evidence of
  concurrent/overlapping `SteamLibraryManager.refresh()` calls.
  found: at startup (22:11:09–22:11:11 in the prior session, `gamelib.log.old`), TWO
  separate `SteamUser.ensureConnected()` timing lines, TWO `Steam: fetched 378 owned
  games` lines, and TWO `Steam library sync complete: 378 games` lines all fire within a
  ~2s window — i.e. `refresh()` genuinely ran twice, back-to-back/overlapping, in this
  real app, confirming the missing-concurrency-guard is not just theoretical.
  implication: `SteamLibraryManager.refresh()` needs either a de-dupe/in-flight guard or
  to tolerate concurrent invocation safely. Both instances reported the same count (378)
  this time, so no observed data loss from THIS specific occurrence — but the hazard is
  real and unguarded.

- timestamp: 2026-07-21 (investigation)
  checked: actual persisted `steamMetadataStore`/`steamLibraryStore` on this machine
  (`~/Library/Application Support/gamelib/store_cache/steam_metadata.json` and
  `steam_library.json`) for `is_delisted:true` entries, cross-referenced against
  `Library/index.tsx`'s `isNonAvailable()` filter (`game.runner==='steam' &&
  !!game.is_delisted`) which is APPLIED BY DEFAULT (`showNonAvailable` defaults to
  `'off'`, and `'off'` means the filter-out branch runs, `index.tsx:210-211,622-624`).
  found: 9 real, definitely-not-delisted Steam titles (Deus Ex: Human Revolution, Metro:
  Last Light Complete Edition, Dead Island, Hitman: Sniper Challenge, Fallen
  Enchantress, Dungeonland, Forge, Starbound - Unstable, Rust - Staging Branch) are
  currently marked `is_delisted:true` with empty `art_cover`/`art_square` (metadata
  fetch never successfully completed) — and are THEREFORE hidden from the Library view
  right now. "Dead Island" is simultaneously `is_installed:true` — a currently-installed,
  owned game invisible in the default library view.
  implication: `fetchMetadataIfNeeded()` (games.ts) treats the Steam Store
  `appdetails` API's `{success:false}` response as a "definitive verdict" (comment:
  "GAP-B: Definitive verdict") with NO safeguard, unlike the adjacent `!data` branch
  which explicitly guards against exactly this class of transient/ambiguous response
  ("MUST NOT set is_delisted here; a network blip must not hide owned games" — the same
  protection is NOT applied to the `success:false` branch). This is a real, independently
  confirmed active bug in this exact environment. `ensurePlatformsCaptured()`
  (games.ts:1347, mac-only) calls this same fetch path unconditionally at the top of
  every `SteamGame.uninstall()` call for any game whose metadata was never captured.
  BUT: once `is_delisted:true` is set, nothing in the codebase automatically retries
  the fetch for a game that's hidden from view (no batch/background re-check exists;
  only `getGameInfo()`'s on-demand lazy fetch, which requires the game to be rendered
  somewhere first) — the metadata file's mtime (Jul 20 23:34) is over a day stale, i.e.
  these 9 entries have survived MULTIPLE app restarts unfixed. This means a fresh
  false-positive from this mechanism would NOT reliably self-heal via mere app restart,
  which is in tension with the reported "restart brings it back" symptom.

- timestamp: 2026-07-21 (investigation)
  checked: `gamelib.log.old` — the actual log from the session where the reported
  uninstall repro happened (appId 264160 / "WazHack", `steamPlaytimeMinutes: 22619` per
  current metadata cache — a long-owned, heavily-played title, so its Steam-store
  metadata was almost certainly already captured well before this session,
  i.e. `ensurePlatformsCaptured()` would short-circuit as a no-op for it).
  found: sequence is `SteamGame: delegating uninstall for appId 264160 via
  steam://uninstall/264160` (22:11:28) → `Steam: starting uninstall polling...` →
  `Finished uninstalling` / `Removing 264160.log` / `Removing 264160-lastPlay.log` /
  `Removing 264160.json` (uninstaller.ts's own housekeeping, 22:11:28) → `Steam:
  uninstall polling complete for appId 264160 — badge flipped to not-installed` /
  `Steam: stopped uninstall polling for appId 264160` (22:11:34). CRITICALLY: there is
  NO `Refreshing steam Library` log line anywhere after this — that line is
  unconditionally logged by `GlobalState.tsx refreshLibrary()`
  (`window.api.logInfo('Refreshing ${library} Library')`) every time it actually
  executes past its `if (this.state.refreshing) return` guard, and it DOES appear after
  other events in both this log and the current session's log (e.g. right after an
  install-poll completion and right after a game launch).
  implication: in the ACTUAL captured reproduction, the frontend's
  `refreshLibrary({library:'steam'})` call triggered by `handleGameStatus`'s `'done'`
  branch was BLOCKED by the stuck-`refreshing`-flag guard — i.e. the SAME pre-42321b71
  behavior — meaning `SteamLibraryManager.refresh()` (the full CM resync)
  **never ran** after this uninstall. This directly REFUTES the PRIME SUSPECT's
  framing: 42321b71's fix could not have "unmasked" a bug in the full-refresh path here,
  because the full-refresh path never executed in this repro at all. Either 42321b71
  was not yet loaded into the running process at test time (needs confirming with the
  user — was the app rebuilt/restarted between the 42321b71 commit at 21:42 and this
  22:11 test the NEXT time it ran, or was this an already-running, pre-fix process?),
  or something else independently reproduces the stuck flag. Either way, the vanish
  must be explained by something OTHER than the full-refresh mechanism the debug file's
  PRIME SUSPECT section pointed at.

## Eliminated

- hypothesis: a plain manual library refresh requires an app RESTART to restore
  visibility (i.e. the fix must involve rehydration-on-boot).
  evidence: user directly confirmed "i confirmed that a refresh made wazhack 'reappear'
  in the frontend" — a manual refresh alone (no restart) restores visibility. This means
  the distinguishing factor is NOT persistence/rehydration-on-boot; it is a real
  difference between (A) the entry object `pollUninstallOnce` pushes via
  pushGameToLibrary after uninstall (game NOT rendered) vs (B) the entry object
  `SteamLibraryManager.refresh()` builds and pushes (game IS rendered), even though both
  land through the same `handleGamePush` upsert into `state.steam.library`.
  timestamp: 2026-07-22

- hypothesis: the pushed entry (A, from pollUninstallOnce) is field-deficient vs a
  fully-hydrated entry (B, from refresh()) — e.g. missing title/is_mac_native/etc. — and
  that deficiency is what excludes it from render.
  evidence: direct inspection of the live persisted store
  `~/Library/Application Support/gamelib/store_cache/steam_library.json` (378 entries)
  shows the WazHack entry (app_name '264160') reads: title='WazHack',
  is_installed=False, install={}, is_mac_native=True, is_linux_native=True,
  is_delisted=False, runner='steam'. All render-relevant fields are correct and present
  — notably is_mac_native=True, and title is present (so the sort at index.tsx:705
  `a.title.toUpperCase()` cannot throw for it). The game reappeared after a refresh
  while this persisted entry looked the same shape both before and after — so the
  difference is NOT a field-level deficiency in the persisted/pushed entry's data
  values.
  timestamp: 2026-07-22

- hypothesis: the platform filter (`filterByPlatform`, index.tsx:333-382) excludes
  WazHack for some platformsFilters setting.
  evidence: for a non-installed game it builds gamePlatforms = ['mac' if is_mac_native
  && darwin] + ALWAYS 'windows'. WazHack has is_mac_native=True on darwin, so it matches
  'mac'; and 'windows' is pushed unconditionally anyway regardless of filter state.
  Cannot exclude this game under any platformsFilters setting (and if all filters are
  off, line 354-356 falls back to showing all).
  timestamp: 2026-07-22

- hypothesis: isNonAvailable / delisted filter (index.tsx:601-628) excludes WazHack.
  evidence: entry has is_delisted=False and is not in whatever nonAvailableGames/
  localStorage list mechanism exists for steam beyond that flag.
  timestamp: 2026-07-22

- hypothesis: the installed/installing/notInstalled partition (index.tsx:711-723) drops
  the entry during reordering.
  evidence: this is a REORDERING, not a filter — `[...installed, ...installingGames,
  ...notInstalled]` covers all three buckets exhaustively, and when sortInstalled is
  false the array passes through untouched. No entry can be dropped here.
  timestamp: 2026-07-22

- hypothesis: 42321b71 CAUSED the regression by letting `SteamLibraryManager.refresh()`
  run to completion after every uninstall, and that full CM resync's rebuild
  (`library.clear()` + rebuild from `getUserOwnedApps()`) is what drops the game.
  evidence: `gamelib.log.old`'s actual captured repro shows NO `Refreshing steam
  Library` line after the uninstall — the full refresh never executed in this repro, so
  it cannot be the mechanism that made the game vanish here.
  timestamp: 2026-07-21

- hypothesis: 42321b71 UNMASKED a pre-existing `is_delisted` false-positive bug in
  `fetchMetadataIfNeeded()`/`ensurePlatformsCaptured()`, triggered by every Steam
  uninstall on macOS.
  evidence: this false-positive mechanism IS real and currently active (9 confirmed
  cases in persisted store data) but (1) it does not depend on `42321b71`/the
  `refreshing` flag at all — it fires unconditionally and independently inside
  `SteamGame.uninstall()` regardless of the frontend's refresh-flag state, so it cannot
  be "unmasked" by that specific fix — and (2) the specific game in the logged repro
  (WazHack, `steamPlaytimeMinutes:22619`) almost certainly already had its metadata
  captured (`ensurePlatformsCaptured()` would short-circuit as a no-op), and (3) the
  9 already-broken cases in the persisted store have survived multiple real app restarts
  unfixed, which is in tension with the reported "restart brings it back" symptom for a
  fresh occurrence. Kept as a separately-confirmed, real bug worth fixing on its own
  merits, but eliminated as the primary explanation for THIS reported symptom.
  timestamp: 2026-07-21

- hypothesis: the frontend's per-game `handleGamePush` upsert has a stale-closure/
  batching bug (reading `this.state` instead of a functional updater) that could cause
  concurrent pushes to clobber each other and lose entries, the way the GOG/Zoom
  branches' plain-object `setState({...})` calls could.
  evidence: the STEAM branch of `handleGamePush` already uses the safe functional-updater
  form (`this.setState((prevState) => ...)`), unlike GOG/Zoom — so this specific bug
  class does not apply to Steam pushes.
  timestamp: 2026-07-21

- hypothesis: the object pollUninstallOnce pushes via pushGameToLibrary loses/differs in some field
  (e.g. title, alt-names) that the Library view's SEARCH filter matches against, causing the entry to
  drop out of filtered search results only (not out of state).
  evidence: user cleared the search box entirely, viewed All Games / All Stores, browsed the list
  directly (including narrowing by "H"), and WazHack was still absent. This rules out a search-term-
  matching explanation entirely — the exclusion happens even with no active search text.
  timestamp: 2026-07-21

- hypothesis: an alphabet filter was set to a letter other than the game's own (the user's
  report said "games starting with h" while WazHack starts with W), which would make
  non-visibility correct behavior rather than a bug.
  evidence: user clarified they misspoke — they meant "w" — and confirmed they viewed the
  ENTIRE list alphabetically with no filter applied, in plain list view, and the game was
  simply not there. They then pressed Refresh with no change of view and no extra filtering,
  and it appeared. Alphabet filtering is fully excluded as an explanation.
  timestamp: 2026-07-22

## Resolution

- root_cause: NOT YET CONFIRMED. Two adjacent, independently-verified defects were
  found during investigation (SteamLibraryManager.refresh() has no concurrency guard,
  proven to double-fire in this app's own logs; fetchMetadataIfNeeded()'s is_delisted
  false-positive from Steam Store API `{success:false}`, proven active on 9 real
  library entries right now) but NEITHER is confirmed as the trigger for the exact
  reported symptom (uninstall → vanish → restart fixes it). Diagnostic logging has been
  added (uncommitted, see files_changed) to pin the mechanism on the next reproduction.
- fix: none applied yet — pending confirmation from a fresh, logged reproduction.
- verification:
- files_changed:
  - src/backend/storeManagers/steam/library.ts (temporary diagnostic logInfo in
    pollUninstallOnce's 'absent' branch — HIT/MISS on library.get(), confirms the
    pushGameToLibrary send)
  - src/frontend/state/GlobalState.tsx (temporary diagnostic window.api.logInfo in
    handleGamePush's steam branch — confirms renderer receipt + upsert vs. add + array
    length)
