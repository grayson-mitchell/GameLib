---
slug: uninstall-game-vanishes
status: parked
reparked: 2026-08-19
repark_reason: "UNREPRODUCED across 2 instrumented attempts. Not abandoned and not fixed — parked by user decision after the symptom declined to appear with logging in place. Root cause still OPEN."
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

## RE-PARKED 2026-08-19 (same day) — UNREPRODUCED, READ THIS FIRST

**The bug did not appear in two instrumented attempts.** Root cause remains OPEN. Nothing
was fixed. Do not read this park as a resolution.

### What was run

| # | Setup | Result |
|---|---|---|
| 1 | `pnpm tauri:dev` with instrumentation; bottle `steam.exe` quit; ACF moved aside; install KCD2; **stayed on the Library screen throughout** | **No vanish** |
| 2 | Same, but navigated **away to Downloads and back** after completion — the condition present during the original 17:16 vanish | **No vanish** |

A third, free check was also run: navigating away from Library and back **without** any
install. No vanish — as the user expected, having done that many times without incident.
That rules out remount-alone as a sufficient trigger.

### The two findings that DO survive

Both attempts produced clean negative evidence for one of the two open families:

- **`libraryUnion` never shrank** — held at 385 across every logged render in both runs.
- **`[DIAG-vanish] handleGamePush steam SHRANK library` never fired once**, which was the
  unconditional probe on the only code path that could remove an entry at its source.

So **family (a) — state reset / loss — has zero supporting evidence** after two live runs.
That is a real narrowing even though the bug stayed away. Family (b), render-time exclusion,
is neither confirmed nor eliminated.

### ⚠ THE INSTRUMENTATION WAS DEFECTIVE — fix before reusing it

Both probes were commented "anomaly-only". **They were not.** Both fire on ordinary search
narrowing:

- count-based: `if (gridDelta < 0 && gridDelta !== unionDelta)`
- identity-based: any `app_name` in the union but newly absent from the grid

Typing in the search box produced exactly that shape and flooded the log —
`gridPipeline.games shrank (375 -> 65)`, then `65 -> 43 -> 20 -> 12 -> 6 -> 3`, each with a
long list of "newly excluded" app_names, all while `libraryUnion` sat at 385. Every one of
those lines is a **false positive**. They are "any narrowing" detectors, not anomaly
detectors, and a real vanish would have been indistinguishable from search noise in that log.

**A correct probe must key on the ONE appId whose install state just changed**, not on
aggregate counts or whole-set diffs: at the moment `handleGamePush` lands an
`is_installed` transition for appId X, log whether X is present in `libraryUnion` and
whether X is present in `gridPipeline.games`. Silent otherwise. That is precise, survives a
remount, and cannot be triggered by the user filtering.

### Housekeeping

**All diagnostic code is REVERTED** — `git grep DIAG-vanish` over `src/` returns nothing.
Unlike the 2026-07-22 park, this leaves **no merge landmine**. Reapply a corrected probe
(see above) rather than restoring the old one.

### Conditions worth capturing on the next real sighting

The original vanish (17:16–17:17) and the two clean runs differed in ways not yet isolated.
On any future occurrence, record: whether the bottle's `steam.exe` was running; how long the
app had been up; whether the game was mid-`Steam bulk platform capture: scoped=1 captured=0
skipped=1` (this fired in the original AND in both clean runs, so it is **not** sufficient on
its own); and the exact navigation sequence including time away from the app.

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

## Current Focus (updated 2026-08-19, resumed session)

- hypothesis: NEITHER family is confirmed. A full, line-by-line re-read of the CURRENT
  (post-34.11) filter/render pipeline found it structurally sound end-to-end — every
  memo dependency array is complete for the fields that change on a push, and the
  `handleGamePush` steam branch, `refreshLibrary()`, and `this.refresh()` were all
  re-verified against current code and still cannot explain a removal. Static reading has
  been exhausted; the remaining candidates require OBSERVING a live repro. Minimal,
  anomaly-only diagnostic logging has been added (see files_changed) that will pin family
  (a) vs (b) directly from one repro's log tail, or refute both if it stays silent.
- test: user performs the install-side repro (cheap, ~70s, zero download — see
  repro_recipe below) with the new diagnostic logging in place, then shares the
  `gamelib.log` tail spanning the install-completion event.
- expecting: exactly one of three outcomes —
  (1) `[DIAG-vanish] handleGamePush steam SHRANK library` fires → family (a), a removal
      path exists inside `handleGamePush` itself that this reading missed (would be
      surprising given the code's structure, but the log is unconditional so it would
      catch it regardless of mechanism);
  (2) `[DIAG-vanish] libraryUnion SHRANK` fires with no push-shrink line → family (a) via
      a different route (a state reset elsewhere, or `steam?.username` flipping falsy so
      `makeLibrary()` excludes the whole array momentarily);
  (3) `[DIAG-vanish] gridPipeline.games shrank ... family b candidate` fires → family (b),
      a genuine render-time exclusion, and the accompanying `libraryUnion`/`gridPipeline`
      counts in that line will show which stage did it (compare against `engineState` at
      that moment — would need a follow-up log if this fires, since state/deps aren't
      printed by this instrumentation);
  (4) ADDED BY ORCHESTRATOR 2026-08-19, after the three above were written — a FOURTH
      probe now exists, and it closes a real blind spot in (1)-(3). All three fire only on
      a COUNT change, so all three stay SILENT in the count-neutral case: the engine drops
      one game and admits another on the same render, net delta 0. That is exactly the
      shape a facet/filter recompute can produce, so it is not a remote edge case. The new
      probe is IDENTITY-based rather than count-based — it diffs the set of steam
      `app_name`s present in `libraryUnion` but absent from `gridPipeline.games` between
      renders, and logs:
      `[DIAG-vanish] steam app_name(s) NEWLY excluded by the grid pipeline while still
      present in libraryUnion: <ids> (family b -- render-time exclusion, count-neutral)`.
      If this fires and (3) does not, the cause is a count-neutral render-time exclusion
      and the logged app_name names the victim directly. Tracker var: `__diagPrevDropped`
      (module scope, alongside the two length counters). `tsc --noEmit` clean.
  If NONE fire, the vanish is not reproducible via this recipe as currently understood,
  or happens through a path this instrumentation doesn't observe (e.g. a full component
  unmount/remount of `Library`, which would reset the module-scope tracker vars silently
  rather than log a delta — note this blind spot to the user if outcome is "nothing
  logged, still vanished").
- next_action: CHECKPOINT — ask user to run the repro with the new logging active and
  report the `gamelib.log` tail (or the console, if running via `pnpm tauri:dev`) from
  around the install/uninstall completion timestamp.
- repro_recipe: |
    Cheap and repeatable, from the 23.2 UAT. Quit the bottle's steam.exe. Move
    `appmanifest_<appid>.acf` out of the CrossOver bottle's `steamapps/` (back it up
    first). GameLib then shows the title as not-installed. Click Install — because the
    content is already on disk, `reconcilePartialState` sha1-verifies and skips
    everything (`jobCount=0`), so it completes in ~70s having downloaded nothing, and the
    game vanishes. Verified with KCD2 (appId 1771300) on 2026-08-19. (The original
    uninstall-side repro — uninstall any game, watch it vanish from the plain list view —
    is equally valid and exercises the same push/refresh machinery.)
- reasoning_checkpoint:
    hypothesis: "NOT CONFIRMED — static analysis of the current filter/push/refresh
      pipeline is exhausted without finding a mechanism. Root cause remains open;
      escalating to observation via targeted, anomaly-only diagnostic logging."
    confirming_evidence:
      - "libraryUnion/searchMatchedKeys/engineDeps/engineState/gridPipeline memo chain
        (index.tsx:623-756) has complete, correct dependency arrays for every field a
        push or refresh changes — re-read in full, no missing-dep bug found."
      - "handleGamePush's steam branch (GlobalState.tsx:1494-1513) uses the functional
        setState form, creates a NEW array and a NEW `steam` object every call, and can
        only hold length steady or grow by 1 — re-verified line by line."
      - "this.refresh() (GlobalState.tsx:922-1096) has no steam branch at all — confirmed
        again against current code, not just inherited from the 2026-07-21 note."
      - "SteamLibraryManager.refresh() (library.ts:588-955) does an unconditional,
        per-game rebuild+push for every entry in `ownedApps` on every call — a missed or
        delayed push would explain a STALE entry, not a REMOVED one, so this alone cannot
        be the mechanism either, matching the file's own standing tension."
    falsification_test: "The diagnostic log staying completely silent across a
      successfully-reproduced vanish would falsify BOTH remaining hypothesis families as
      currently scoped, and point at something outside this instrumented surface (e.g. a
      Library component remount, an error swallowed before either memo runs, or a repro
      that isn't actually exercising this code path)."
    fix_rationale: "N/A — no fix proposed; this is an observation step, not a confirmed
      root cause."
    blind_spots: "The instrumentation cannot see a full unmount/remount of the Library
      component (would silently reset the module-scope trackers, producing a false
      negative). It also does not capture facet/view/search state at the moment of a
      family-(b) hit — a second, more targeted log may be needed if outcome (3) fires.
      Still have not obtained a single live, instrumented repro since the file was
      unparked."

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

- hypothesis (RE-TESTED 2026-08-19 against current post-34.11 code): the new filter
  engine's memo chain (`libraryUnion` → `searchMatchedKeys` → `engineDeps` →
  `engineState` → `gridPipeline`, index.tsx:623-756) has a dependency array that misses
  the library array itself, so a single-element upsert fails to invalidate a downstream
  memo the way a full replace does.
  evidence: read every dependency array in the chain directly against current source.
  `libraryUnion`'s deps include `steam?.library` (623-633); `searchMatchedKeys`'s deps
  include `libraryUnion` (676); `engineDeps`'s deps include `libraryUnion` (698-707);
  `engineState`'s deps list every facet field (726-737); `gridPipeline`'s deps are
  exactly `[libraryUnion, engineState, engineDeps]` (755). Every stage's deps are
  complete for what it consumes — no missing-dependency bug found in this chain.
  timestamp: 2026-08-19

- hypothesis (RE-TESTED 2026-08-19): `filterLibrary`'s unconditional DLC guard
  (`if (game.install.is_dlc) return false`, filterEngine.ts:299-302, and the
  redundant copy in GamesList/index.tsx:177-184) throws or wrongly excludes a
  steam-pushed entry because the backend never sets `install.is_dlc`.
  evidence: `is_dlc` is typed `boolean` (required) on `InstallInfo`
  (common/types.ts:364) but grep of every steam backend push site
  (library.ts:870-951, 1123-1134, 2063-2075, 2439, 2468) confirms none of them ever set
  `is_dlc` — so at runtime it is always `undefined` on a steam `GameInfo`, which is
  falsy. `game.install` itself is never undefined/null at any push site (always `{}` or
  a populated object), so `game.install.is_dlc` cannot throw either. This can only ever
  under-exclude (never wrongly filters), so it is not the vanish mechanism — though it
  is a latent type-contract violation worth a follow-up ticket on its own merits.
  timestamp: 2026-08-19

- hypothesis (RE-TESTED 2026-08-19): the `is_delisted` false-positive mechanism
  (`fetchMetadataIfNeeded`'s `{success:false}` gap, already known-active from the
  2026-07-21 investigation) is the trigger for the CURRENT (KCD2/G-23.2-01) vanish.
  evidence: this session's own "EVIDENCE THAT STILL HOLDS" note (top of this file)
  already re-confirmed `store_cache/steam_library.json` showed `is_delisted: false` for
  KCD2 at the moment it was invisible. `isNonAvailableGame` (filterEngine.ts:232-237)
  only excludes on `is_delisted === true`, so this cannot be the mechanism for THIS
  occurrence, matching the 2026-07-21 elimination for the WazHack occurrence. Still a
  real, independently-confirmed bug worth fixing on its own merits.
  timestamp: 2026-08-19

- hypothesis (RE-TESTED 2026-08-19): backend `library.ts` uninstall/install
  push-object construction (library.ts:2063-2081 install-completion tick;
  2439-2474 uninstall-completion tick; 1123-1143 focus-reconciliation) replaces the
  ENTIRE `install` sub-object wholesale (`install: {...}`, not
  `install: {...existing.install, ...}`), which could drop a field some OTHER stage
  depends on.
  evidence: cross-referenced every field `filterLibrary`/`passesMore`/
  `deriveRunnabilityTier`/`GamesList` read off `game.install` — only `is_dlc`
  (never set by steam, see above) and `install_path`/`install_size`/`platform`/
  `steamResumePending` (all display-only, none gate visibility) are read from
  `game.install` anywhere in the current pipeline. No visibility-gating field is lost by
  this wholesale replacement.
  timestamp: 2026-08-19

- hypothesis: `Map<number,...>` vs `Map<string,...>` key-type mismatch in one of the
  install/uninstall poll tick functions causes a `library.get(appId)` miss, silently
  skipping the push for that specific game.
  evidence: every `library.get`/`library.set` call site in library.ts (grep across the
  whole file) is typed `appId: string`/keys via `String(app.appid)` consistently — no
  call site passes a raw number. Ruled out on inspection.
  timestamp: 2026-08-19

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

## Evidence (2026-08-19, resumed session)

- timestamp: 2026-08-19
  checked: full re-read of `Library/index.tsx`'s current (post-34.11) memo chain
  (`libraryUnion`, `searchMatchedKeys`, `engineDeps`, `engineState`, `gridPipeline`,
  `libraryToShow`), `engineWiring.ts`'s `buildGridPipeline`/`buildEngineDeps`/
  `buildFavouriteKeys`, and `filterEngine.ts`'s `filterLibrary`/`passesView`/
  `passesCollection`/`passesStore`/`passesRunnability`/`passesMore`/
  `isNonAvailableGame`/`isHiddenGame`, using graphify to orient first.
  found: every stage's dependency array is complete; `filterLibrary` is a plain AND
  chain over explicit, inspectable predicates with no hidden state; default filter
  state (`DEFAULT_FILTER_ENGINE_STATE`) passes every game through unless
  hidden/non-available/DLC/facet-restricted. No render-time exclusion mechanism found
  by static reading that would explain a single game disappearing from an otherwise
  correctly-rendering, default-filtered list.
  implication: family (b) (render-time exclusion) is NOT eliminated, but static
  reading of the CURRENT engine did not surface a candidate the way the pre-34.11 code
  might have. The search for family (b) needs either a live repro or a mechanism this
  reading hasn't considered yet (e.g. something outside `Library/index.tsx` entirely).

- timestamp: 2026-08-19
  checked: `GlobalState.tsx`'s `handleGamePush` steam branch (1494-1513), `refreshLibrary`
  (1098-1173), and `refresh` (922-1096) against current source, line by line, not
  inherited from the 2026-07-21 note.
  found: `handleGamePush`'s steam branch structurally cannot shrink the array (functional
  setState, findIndex-replace-or-push, new array/object references every call).
  `refreshLibrary` calls the backend full resync then `this.refresh()`; `this.refresh()`
  has NO steam branch anywhere in its body — confirmed still true against current code.
  implication: family (a) (state reset without repopulation) also was NOT found by
  static reading of the currently-reachable code paths in these two functions. Combined
  with the previous entry, static analysis of the obvious surfaces is exhausted.

- timestamp: 2026-08-19
  checked: `SteamLibraryManager.refresh()` (library.ts:588-955) in full — the exact
  function `refreshLibrary({library:'steam'})` invokes on the backend after every
  install/uninstall 'done'/'error' status (via `handleGameStatus`, GlobalState.tsx:1252).
  found: it does `library.clear()` (backend in-memory Map only, line 841) then, for
  EVERY app in a freshly-fetched `ownedApps` list, unconditionally builds a fresh
  `GameInfo` and calls `sendFrontendMessage('pushGameToLibrary', gameInfo)` — one IPC
  message per owned game (line 949-950), ~378 individual pushes for this library. No
  "remove games no longer present" step exists; a game simply absent from one resync's
  `ownedApps` (if that ever happens) would leave its frontend entry untouched, not
  remove it.
  implication: this path, even if flawed (e.g. a partial/incomplete `ownedApps` result,
  or the previously-confirmed concurrency hazard of two overlapping resyncs), can only
  explain a STALE entry (a missed push leaves the old data in place), never a REMOVED
  one — which is exactly the file's own standing tension, now re-confirmed against the
  CURRENT backend code rather than assumed to still hold from the 2026-07-21 read.

- timestamp: 2026-08-19
  checked: whether static code reading (frontend memo chain, filter predicates, push
  handlers, refresh orchestration, backend resync) can identify the vanish mechanism
  without a live, observed reproduction.
  found: it cannot — every surface examined is either structurally incapable of
  removing an entry (confirmed by code inspection) or provably unrelated (is_delisted,
  is_dlc, Map key types, wholesale install-object replacement). No further un-inspected
  surface is apparent in this file's tracked candidate list.
  implication: escalated to observation. Added minimal, anomaly-only diagnostic logging
  (see files_changed) that fires ONLY on the exact anomaly shapes each remaining family
  would produce, and requested a live, instrumented repro via CHECKPOINT.

## Resolution

- root_cause: NOT YET CONFIRMED. Two adjacent, independently-verified but SEPARATE
  defects remain known-active (SteamLibraryManager.refresh() has no concurrency guard;
  fetchMetadataIfNeeded()'s is_delisted false-positive from Steam Store API
  `{success:false}`) but both are re-confirmed (2026-07-21 and 2026-08-19) as NOT the
  trigger for the exact reported symptom. A full re-read of the current post-34.11
  filter/push/refresh pipeline (2026-08-19) found no static candidate for either
  remaining hypothesis family (state reset without repopulation / render-time
  exclusion). Escalated to observation: minimal, anomaly-only diagnostic logging added
  (uncommitted, see files_changed) that pins the mechanism directly from one live,
  logged reproduction. AWAITING that reproduction — see CHECKPOINT.
- fix: none applied yet — pending a live, instrumented reproduction.
- verification:
- files_changed:
  - src/frontend/screens/Library/index.tsx (2026-08-19, uncommitted, TEMP DIAGNOSTIC:
    module-scope `__diagPrevUnionLen`/`__diagPrevGridLen` trackers + an anomaly-only
    `window.api.logInfo` in the `gridPipeline` memo — fires only if `libraryUnion`
    shrinks (family a candidate) or `gridPipeline.games` shrinks while `libraryUnion`
    did not shrink correspondingly (family b candidate). Silent on every ordinary
    render. MUST be reverted before merge.)
  - src/frontend/state/GlobalState.tsx (2026-08-19, uncommitted, TEMP DIAGNOSTIC:
    anomaly-only `window.api.logInfo` inside `handleGamePush`'s steam branch — fires
    only if a single push shrinks `state.steam.library`, which current logic should
    never do. Silent on every ordinary push. MUST be reverted before merge. Distinct
    from the OLDER, already-reverted per-push receipt log this file's PARKED section
    describes — this one is anomaly-gated, not unconditional, so it will NOT emit ~378
    lines per refresh.)
