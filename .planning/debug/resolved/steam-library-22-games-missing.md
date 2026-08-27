---
status: resolved
trigger: "Operator, 2026-08-21, live `pnpm tauri:dev` during phase 34.13's UAT gate: library header reads `356 of 356` with NO filters active, while the backend logs `Steam library sync complete: 378 games` on every sync. 22 owned games never appear on screen. Wasteland 3 (719040) and Len's Island (1335830) confirmed missing by name; both are INSTALLED and neither is delisted."
created: 2026-08-21
updated: 2026-08-22
goal: find_and_fix
area: steam
source_todo: .planning/todos/completed/2026-08-21-steam-library-22-games-never-reach-the-rendered-library.md
---

## Symptoms

expected: all 378 games the backend syncs reach the rendered library; header reads `378 of 378`
with no filters active.

actual: header reads `356 of 356`. The numerator equals the unfiltered denominator, so the 22
missing entries are absent from the frontend's collection entirely — they are not being filtered
out of a complete set, they never arrive.

errors: **none.** No channel errors, no exceptions, nothing in the log. The silence is itself a
clue, not an exoneration (see the send-channel note under Traps).

started: observed 2026-08-21 under `pnpm tauri:dev`. Not known whether it predates that session.
NOT reproduced under Electron — never tested there.

reproduction: open the Games library with no filters and compare the header count against the
backend's `Steam library sync complete: N games` line. Standing count mismatch, not a race — this
is a steadier reproduction than the related parked vanish defect and can be measured at leisure.

## Ruled out, with evidence (carried from the source todo)

| candidate | evidence it is NOT the cause |
|---|---|
| active filters | header shows `356 of 356`; numerator == unfiltered denominator |
| DLC exclusion | `steam_library.json` has **0** entries with `install.is_dlc` |
| missing metadata | **0** entries lack a `steam_metadata.json` record |
| `nonAvailableGames` | **WITHDRAWN 2026-08-21 — do not trust this row.** The path checked (`~/Library/WebKit/com.gamelib.shell/WebsiteData/LocalStorage`) is a legacy flat directory WebKit does not write to. The REAL per-origin store (`WebsiteData/Default/<origin>/<origin>/LocalStorage/localstorage.sqlite3`) is NOT empty and currently holds a live `nonAvailableGames` key with real content. This elimination never happened; the hypothesis is back open — see Current Focus and this cycle's Evidence. |
| delisted | accounts for only **9** of 22 (sibling false-delisted todo); Wasteland 3 and Len's Island are `is_delisted: false` |
| "installed games are hidden" | over-predicts: 26 installed + 9 delisted − 1 overlap = **34**, not 22 |

**The persisted store is provably CORRECT while the entries are invisible:** `steam_library.json`
holds all 378 with right titles, paths and install state. The loss is strictly downstream of the
store.

## Leading hypothesis (NOT established — do not treat as diagnosed)

Steam has no synchronous cache hydration on mount; it rebuilds from `[]` via async per-game
`pushGameToLibrary` events. Under Tauri, sidecar `send` channels fail **silently by construction**
(no rejection, no timeout, no console output). Dropped pushes would produce exactly this signature,
and the complete absence of channel errors is *consistent with* that rather than evidence against it.

Confirming it requires reading the renderer's actual `state.steam.library` array length and
comparing against 378. Until that number is in hand, nothing is diagnosed.

## Investigation constraints agreed with the operator (2026-08-21)

1. **Live repro is available.** The operator can run `pnpm tauri:dev` and report observations on
   request. Prefer live evidence over inference.
2. **The Electron comparison is IN SCOPE and is the single highest-value discriminator.** If
   Electron renders 378, the fault is in Tauri's IPC/send path. If Electron also shows 356, the
   send-drop hypothesis dies and the fault is shared frontend logic. Run this early — it halves the
   search space in one measurement.
3. **Do NOT plan to read state via the DevTools console.** The Tauri DevTools console cannot be
   pasted into (known, recorded limitation). Add **temporary instrumentation** in the renderer that
   prints the array length to a channel the operator can actually read, then remove it before the
   fix lands. Note that under the sidecar, `console.*` and the file logger are invisible because
   stdout IS the RPC pipe — pick a sink that is genuinely observable and verify the sink works on a
   known-good value before trusting its silence.

## Traps specific to this area — read before forming a hypothesis

- **Sidecar `send` channels fail silently.** Absence of errors proves nothing here.
- **`initStoreManagers()` is dead under Tauri**, and takes `SteamLibraryManager.init()` with it. A
  comment in `library.ts` claims first-frame hydration; that comment is FALSE. Verify what actually
  runs on mount rather than trusting in-code narration.
- **`refresh()` rebuilds from DISK and wipes state that has no on-disk counterpart** (`library.clear()`
  + ACF-only rebuild). Any state that exists only in memory dies on the same launch that created it.
- **A count delta is a weak signal.** 378 − 356 = 22 is arithmetic, not a mechanism. Key any probe on
  the *specific* missing entities (719040, 1335830), never on a count difference — a probe that keys
  on counts will also fire on normal use and cannot distinguish signal from noise.
- **Verify any assertion in BOTH directions.** A check that can never fail proves nothing, and a gate
  that can never pass will bend the code around it. Prove the probe stays silent on a game that IS
  rendering before believing it when it fires on one that is not.

## Relationship to the parked vanish defect

Same family as `.planning/debug/uninstall-game-vanishes.md` (parked 2026-07-22, last touched
2026-08-19): entry present and correct in the store while invisible on screen. That session
eliminated search matching, the platform filter, delisted state, and the installed/installing
partition, and concluded the fault is *something `SteamLibraryManager.refresh()` does to the
frontend that a single `pushGameToLibrary` upsert does not*. **Read that file before starting** —
its eliminations are reusable and its conclusion is the best existing lead. This report is the
steadier reproduction the parked session lacked.

## Why this matters more than it looks

Nothing in the app or the test suite compares the RENDERED count against the STORE count, so a
launcher silently omitting owned games from the library is invisible to every existing gate. Any
fix should land alongside a check that closes that blind spot.

## Current Focus

status: fix implemented and self-verified (tsc clean, 1945 backend+frontend tests green, DIAG
  instrumentation removed, source todo updated). AWAITING operator's live clean-restart
  confirmation (see Resolution.verification "Still outstanding") before this session can be
  archived to `resolved/`.
next_action: ask operator to fully quit and relaunch the app (not just reload) and report whether
  `gridGames`/header count now includes all previously-missing games, staying correct across time
  (not just at first paint), specifically re-checking 719040 (Wasteland 3), 1335830 (Len's Island),
  and the 1771300 (KCD2) control.

## Superseded investigation history (kept for continuity, no longer the live focus)

hypothesis: **PIVOTED AGAIN 2026-08-21 (new cycle) — mechanism CONFIRMED via direct source
  reading + live store inspection: exclusion happens inside `filterLibrary` via
  `isNonAvailableGame`/`nonAvailableAppNames`, exactly the branch the prior cycle's `expecting`
  table called for when `union:*=true` but `grid:*=false`. The specific WRITE event that puts
  719040/1335830 into that list has NOT yet been observed live — that is this cycle's open
  question, now instrumented and pending a checkpoint reply.** See Evidence entries below for the
  full chain. Key correction to a load-bearing PRIOR elimination: the "`nonAvailableGames` |
  ruled out, LocalStorage is EMPTY" row in this file's own Ruled-out table was checked against the
  WRONG path (`~/Library/WebKit/com.gamelib.shell/WebsiteData/LocalStorage`, a legacy flat
  directory WebKit does not actually write to) — the real per-origin store
  (`WebsiteData/Default/<origin>/<origin>/LocalStorage/localstorage.sqlite3`) is NOT empty and
  currently holds a live `nonAvailableGames` key. This elimination is WITHDRAWN, not merely
  re-tested; see the withdrawal entry in Eliminated.
  A candidate specific mechanism (mid-loop race inside `refresh()`'s `library.clear()` →
  loop-refill window) was proposed, checked, and REFUTED by direct code reading: no `await`
  appears anywhere between `library.clear()` (library.ts:1049) and the loop's final
  `library.set()`/`sendFrontendMessage()` pair (library.ts:1174-1175) for any of the 378
  iterations, so under Node's single-threaded run-to-completion model no concurrent IPC handler
  call (including `isGameAvailable`) can observe the Map in a cleared-but-not-yet-refilled state.
  This candidate mechanism is ELIMINATED (see Eliminated). The remaining open question is HOW an
  entry gets into `nonAvailableGames` for a genuinely-installed, path-valid game AT ALL, given
  `isGameAvailable`'s own logic (steam/games.ts:2685-2699) is correct in isolation. A SEPARATE,
  independently-provable defect was found while investigating this: once ANY appName lands in
  `nonAvailableGames`, it can never leave, because leaving requires `handleNonAvailableGames` to
  run again with a positive result, which requires the game's GameCard to mount, which requires
  the game to already be visible in the grid — but `isNonAvailableGame` is exactly what's hiding
  it. This is a real, self-reinforcing "stuck-forever" bug, confirmed by the CURRENT live store: it
  holds `["1829678475","718850"]`, and 718850 (Age of Wonders: Planetfall) is right now
  `is_installed: true` with an install path that EXISTS on disk (`existsSync` would resolve true)
  — yet remains stuck excluded. This stuck-forever defect is CONFIRMED as a real bug regardless of
  how the original 719040/1335830 report resolves, and should be fixed either way.
  ~~PIVOTED 2026-08-21 (prior cycle) — the prior checkpoint's "send-drop refuted,
  state.steam.library holds all 378" reading is UNSAFE to trust as-is.~~ (superseded, kept below
  for continuity) A live process census
  found a full Electron `GameLib.app` instance (PID 95052, launched 21:59:26) running
  CONCURRENTLY with the `pnpm tauri:dev` instance (PID 51943, running since 20:26:35), and both
  share the exact same `gamelib.log` because APFS is case-insensitive: `~/Library/Application
  Support/GameLib` and `.../gamelib` resolved to the SAME inode (29111765, verified via `ls -di`).
  Both DIAG-22missing lines (21:59:28 and 22:05:14) sit inside a boot/sync sequence containing an
  Electron-specific `ipcRenderer.invoke` error shape ("Error invoking remote method
  'getCrossoverIndex'" — not how Tauri's `invoke` fails) and several backend lines duplicated 3x
  (`refreshLibrary complete runner=all managers=6` ×3, `Game list updated, got 15 games & DLCs`
  ×3), consistent with more than one frontend/backend stack writing into the one shared log. The
  "378, both target appIds present" reading therefore cannot be safely attributed to the Tauri
  window the operator is actually looking at (which shows `356 of 356`) — it may well be the
  Electron instance's OWN state, which could be fully correct while Tauri's is not. **The
  send-drop hypothesis is NOT eliminated.** It is neither confirmed nor refuted; the measurement
  that was going to settle it was contaminated. Nothing is moved to Eliminated this cycle.
test: `[DIAG-22missing-navail]` probe added to `handleNonAvailableGames`
  (`src/frontend/hooks/constants.ts`) this cycle — logs `process=`, `appName=`, `runner=`,
  `gameAvailable=`, `action=ADD|REMOVE|already-listed|already-clear`, `listBefore=` on every call,
  via the same `window.api.logInfo` sink the prior cycle's render probe already proved live.
  `npx tsc --noEmit -p .` exits 0. Needs a live reload + fresh sync from the operator to produce
  output — no result observed yet this cycle.
expecting: an `action=ADD` line with `appName=719040` or `appName=1335830` under `process=tauri`
  would confirm the mechanism for the named games specifically; its absence across a full sync
  would refute nonAvailableGames as the cause for THESE TWO games specifically (even though the
  mechanism is independently proven real for 718850) and redirect to `isHiddenGame`/
  `deps.hiddenAppNames` as the untested sibling branch in the same `passesMore` gate.
next_action: CHECKPOINT — the `process=tauri` DIAG-22missing-render pair from the prior cycle
  (22:15:01 → 22:15:02) is now confirmed CLEAN evidence (verified directly against
  `~/Library/Logs/GameLib/gamelib.log`, not relayed) and establishes `union:*=true, grid:*=false`
  under `process=tauri` — loss is inside `filterLibrary`, confirmed not hypothesized. A NEW probe
  (`[DIAG-22missing-navail]`, `src/frontend/hooks/constants.ts`, inside `handleNonAvailableGames`)
  is now in place to catch the actual ADD event live: logs `process=`, `appName=`, `runner=`,
  `gameAvailable=`, `action=ADD|REMOVE|already-listed|already-clear`, and the list contents
  BEFORE the write, on every call. `npx tsc --noEmit -p .` exits 0.
  Ask operator to: (a) reload/refocus the Tauri window (`pnpm tauri:dev`, PID 51943 tree) so the
  new instrumentation mounts, (b) trigger a fresh Steam library sync (click the Games tab, or
  whatever action previously produced a sync), (c) share the `gamelib.log` tail filtered to
  `grep -E 'DIAG-22missing-navail|DIAG-22missing-render'`, restricted to `process=tauri` lines.
  Specifically check: does an `action=ADD` line ever appear for `appName=719040` or
  `appName=1335830`? If yes: mechanism is confirmed for the exact named games, and the fix is
  (1) find why `isGameAvailable` resolves false for a game whose `steam_library.json` entry is
  correct (needs the resolved value's own inputs logged next, or backend-side instrumentation, if
  this fires) and (2) fix the self-reinforcing stuck-forever defect (a game once added never gets
  re-checked because its GameCard stops mounting) so the list can self-correct even without root-
  causing the original false-negative. If NO add event for these two specific IDs appears despite
  a fresh sync: the mechanism is NOT nonAvailableGames for these two specific games (rule it out
  for them specifically, even though it demonstrably explains the general "356 of 356, no active
  filters" shape and evidently strands OTHER games like 718850) — pivot to checking `isHiddenGame`
  (`deps.hiddenAppNames`) as the alternate branch inside the same `passesMore` gate, since that
  was NOT yet directly probed this cycle. Also worth asking the operator directly whether
  Wasteland 3/Len's Island are STILL missing right now, since state may have moved since the
  original report — a stale symptom cannot be verified against fresh instrumentation. If both apps
  must stay running (Electron + Tauri concurrently), that is fine — the tag makes the tail
  unambiguous either way.

## Evidence

- timestamp: 2026-08-21
  checked: `src/backend/storeManagers/steam/library.ts` `refresh()` (lines 869-1204) in full —
  the Step 3 hydration loop (line 1050 `for (const app of ownedApps)`) unconditionally calls
  `sendFrontendMessage('pushGameToLibrary', gameInfo)` for every app, no filtering, no
  early-continue that could skip an entry. Confirmed the `Steam library sync complete: N games`
  log line (1197-1200) is `refresh()`'s own completion log (fires only after the full hydration
  loop finishes without throwing), NOT `init()`'s separate `Steam: loaded N games from cache`
  line — so the operator's "378 on every sync" observation is about `refresh()` specifically, and
  confirms the backend-side loop ran to completion for all 378 apps every time it fired.
  implication: rules out a backend-side early-exit/throw mid-loop; every one of the 378 apps gets
  a `sendFrontendMessage` call. The loss (if any) is either in transport (Electron IPC / Tauri
  sidecar-RPC-to-Rust-emit-to-webview chain) or in the frontend's handling of the received
  pushes — not in the backend's construction/dispatch loop itself.

- timestamp: 2026-08-21
  checked: `src/backend/storeManagers/steam/library.ts` init()'s cache push (lines 676-687),
  vs the `steamLibraryStore.get('games', [])` persisted array order and the Step 3 loop's
  `ownedApps` iteration order (same array both times — `library.clear()` then insert-in-order,
  `Array.from(library.values())` preserves Map insertion order).
  found: `steam_library.json`'s `games` array (378 entries) is **strictly ascending by numeric
  appId** (verified programmatically: `appids == sorted(appids)` is True). Wasteland 3 (719040)
  sits at array index 242/378; Len's Island (1335830) sits at index 302/378 — both well into the
  middle/tail, not clustered together, not near either boundary.
  implication: REFUTES a simple "listener-not-yet-registered-at-boot, so a contiguous PREFIX of
  early pushes gets lost" race — a hard cutoff-by-arrival-order race would drop a contiguous
  block starting at index 0, not two isolated entries 60 apart in the middle of the array. The
  general send-drop hypothesis (something IN the transport chain drops SOME pushes) is not
  eliminated, but the specific "startup listener registration race" mechanism, as a simple
  ordinal cutoff, does not fit this shape. If a transport-level drop is still the mechanism, it
  would have to be triggered by something per-entry (field content, payload shape) rather than
  pure arrival timing/ordinal position.

- timestamp: 2026-08-21
  checked: full `steam_library.json` entries for 719040 and 1335830 directly (not summarized) —
  both are complete, well-formed `GameInfo` objects: `is_delisted: false`, `is_installed: true`,
  `is_mac_native: true`, populated `art_cover`/`art_square`/`extra.about`/`extra.genres`, no
  null/undefined/empty required fields, no unusual characters. Compared against the 26-entry
  installed-games census (all `is_installed: true` entries in the store): 17 have
  `install.platform: "Mac"` (native install) including both target appIds; the other 9 have
  `install.platform: "Windows"` (bottle install, e.g. Avowed/2457220, KCD2/1771300 — both
  confirmed RENDERING FINE per the parked vanish session).
  implication: no field-level defect visible in the two known-missing entries' own data — this
  matches the todo's existing "0 entries lack metadata" elimination. The Mac-native-install vs
  bottle-install split is a candidate axis (both known-missing entries are native-Mac-installed;
  known-good comparables like Avowed/KCD2 are bottle-installed) but UNTESTED — 15 other
  native-Mac-installed entries exist in the store and their visibility is currently unknown; this
  axis would need those checked before treating it as a lead, and does not by itself reach 22
  (only 17 native-Mac-installed entries total, so at most 17 of the 22 could be explained this
  way even in the best case). Flagged as a candidate to check next if the transport-level
  instrumentation comes back showing the entries ARE present in `state.steam.library` (i.e. loss
  is in render, not in delivery).

- timestamp: 2026-08-21
  checked: `src/backend/storeManagers/steam/library.ts` line 1080, the `GameInfo` construction in
  the Step 3 hydration loop, to confirm which field the diagnostic probe should key on before
  trusting it (per the "prove correct on a known-good field before trusting silence" directive).
  found: `app_name: appIdStr` — for Steam entries, `app_name` holds the numeric Steam appId as a
  string (NOT the display title; `title: app.name` is the separate display-name field). So a
  probe checking `lib.some((g) => g.app_name === '719040')` is keyed on the correct field.
  implication: the temporary instrumentation just added to `GlobalState.tsx` (which checks
  `g.app_name === '719040'` / `'1335830'`) is validated against the actual data shape before
  being trusted — avoids the "gate that can never fire" trap. Added
  `this.setState({ steamSyncStatus: status }, callback)` diagnostic that logs
  `state.steam.library.length` and presence of both target appIds via `window.api.logInfo` on
  every `steamSyncStatus === 'idle'` transition. `npx tsc --noEmit -p .` exits 0 with this change
  in place — no type errors. This is the CHECKPOINT measurement: needs a live
  `pnpm tauri:dev` run and a `gamelib.log` tail from the operator to read the actual number.

- timestamp: 2026-08-21 (this cycle)
  checked: `pgrep -fl gamelib` / `pgrep -fl tauri` / `ps -o pid,lstart,command` for all matching
  processes, at the operator's request to continue from the "state.steam.library=378, both
  target appIds present" checkpoint reading.
  found: a full Electron `GameLib.app` main process (PID 95052, `Electron.app/Contents/MacOS/
  Electron .`) plus 3 Electron Helper processes (95065 gpu-process, 95068 network utility, 95121
  renderer) all started at 21:59:26-27 — running CONCURRENTLY with the `pnpm tauri:dev` tree
  (51943/52049/62895/62964, running continuously since 20:26:35-40). Electron's helper processes'
  command lines show `--user-data-dir=/Users/graysonmitchell/Library/Application Support/gamelib`
  — the SAME directory the Tauri build's sidecar uses (confirmed earlier this session via direct
  file inspection). `ls -di` on `.../Application Support/gamelib` and `.../Application
  Support/GameLib` returns the SAME inode (29111765) — APFS is case-insensitive, so these are
  literally one directory regardless of which casing either app's code hardcodes.
  implication: any file BOTH apps read/write (steam_library.json, hiddenGames/config.json store,
  and — critically — `~/Library/Logs/GameLib/gamelib.log`) is shared state between two
  independently-running full app instances. A log line cannot be attributed to either process
  without an explicit tag.

- timestamp: 2026-08-21 (this cycle)
  checked: full `gamelib.log` context (not just the two DIAG lines) around both 21:59:28 and
  22:05:14 occurrences, specifically for anything that would identify which process/instance
  produced that section of the log.
  found: line 55 in the 21:59:xx sequence reads `[ERROR]: [Frontend]: CrossOver index pull
  failed: Error: Error invoking remote method 'getCrossoverIndex': Error: No handler registered
  for 'getCrossoverIndex'` — the phrase "Error invoking remote method" is Electron's
  `ipcRenderer.invoke()` rejection format specifically, not a shape Tauri's `invoke()` produces.
  Also in that same boot sequence: `refreshLibrary complete runner=all managers=6` and `Game list
  updated, got 15 games & DLCs` each appear 3 TIMES in immediate succession (lines 73-75, 70-72),
  which is not explained by a single frontend mount.
  implication: the entire 21:59:26-29 boot sequence containing the FIRST DIAG-22missing line is
  most plausibly the Electron instance's own startup (it started at 21:59:26-27, matching this
  sequence's timestamps almost exactly), not the long-running Tauri instance the operator was
  told to observe. The triple-duplicated lines suggest at least one more concurrent
  frontend/backend pairing than just "one Tauri + one Electron", though that is not pinned down.
  Neither DIAG line's `state.steam.library.length=378` reading can be safely credited to the
  Tauri renderer showing `356 of 356` on screen. **This invalidates the basis for the send-drop
  elimination the prior checkpoint directed** — see revised Current Focus above. Fix applied
  this cycle: tagged BOTH the existing GlobalState.tsx probe and a new Library/index.tsx
  derivation-path probe with `process=electron|tauri` (via `navigator.userAgent.includes
  ('Electron')`) so this ambiguity cannot recur; see Current Focus `test` for the new probe's
  exact shape and reasoning, including the KCD2 (1771300) positive control the operator's
  Traps/directives required.

## Evidence (this cycle, 2026-08-21, continuation)

- timestamp: 2026-08-21
  checked: session manager independently grepped `~/Library/Logs/GameLib/gamelib.log` directly
  (not relayed) for the `process=tauri` `[DIAG-22missing-render]` lines the prior cycle's
  instrumentation produced.
  found: two lines, 22:15:01 and 22:15:02, both `process=tauri`. First:
  `libraryUnion.length=400 union:719040=true union:1335830=true union:KCD2ctrl=true |
  gridGames.length=381 grid:719040=true grid:1335830=true grid:KCD2ctrl=true |
  libraryToShow.length=381 shown:...=true | unfilteredGameCount=381`. Second, one second later:
  same `union:*` all still `true`, `libraryUnion.length=400` unchanged, but
  `gridGames.length=356 grid:719040=false grid:1335830=false grid:KCD2ctrl=false |
  libraryToShow.length=356 shown:*=false | unfilteredGameCount=356`.
  implication: this is the CONFIRMED discriminator the prior cycle's `expecting` table specified:
  `union:*=true` + `grid:*=false` under `process=tauri` → loss is inside `filterLibrary` itself,
  not upstream (not a sidecar/IPC send-drop). The KCD2 control going `false` in the SAME window is
  notable — it means whatever fired between these two log lines is not specific to 719040/1335830,
  it hit the known-good control too, consistent with a filter-STATE-level cause (something
  affecting the DEPS filterLibrary reads) rather than a per-game data defect. This closes the
  Current Focus checkpoint the prior cycle left open — moved from "expecting" to confirmed.

- timestamp: 2026-08-21
  checked: `src/frontend/screens/Library/filterEngine.ts` `isNonAvailableGame` (lines 241-246),
  `passesMore` (251-292), and `DEFAULT_FILTER_ENGINE_STATE` (line 396); cross-referenced against
  `src/frontend/screens/Library/components/LibraryHeader/gameCount.ts` `countUnfilteredGames`
  (lines 74-81).
  found: `isNonAvailableGame` returns true when
  `deps.nonAvailableAppNames.includes(game.app_name) || (game.runner === 'steam' &&
  game.is_delisted)` — exact match to the unverified claim's description. `passesMore` line
  283-285: `if (showNonAvailable === 'off' && isNonAvailableGame(game, deps)) return false`.
  `DEFAULT_FILTER_ENGINE_STATE.showNonAvailable` is `'off'` (line 396) — the DEFAULT, not an
  opt-in filter. `countUnfilteredGames` runs `filterLibrary(libraryUnion,
  DEFAULT_FILTER_ENGINE_STATE, deps)` — i.e. the header's "unfiltered" DENOMINATOR uses this exact
  same default state, so it ALSO excludes any game in `nonAvailableAppNames`. Separately,
  `filterLibrary`'s `passesMore` gate only counts `showNonAvailable !== 'off'` as an
  "active filter chip" (engineWiring/filterEngine active-filter-descriptor logic, line ~452) — so
  a game hidden by the DEFAULT `'off'` state produces NO visible filter chip.
  implication: this is the exact mechanism that produces "356 of 356, no filters active" — a
  `nonAvailableAppNames` entry vanishes a game from BOTH the numerator (grid) and the denominator
  (header's own unfiltered count) simultaneously, with zero visible filter indicator, because the
  exclusion is baked into the DEFAULT state itself, not an opt-in toggle. This is a MECHANISM
  confirmation (how a game can become invisible with no active filters), not yet a root-cause
  confirmation for 719040/1335830 specifically (that requires proving they are actually IN
  `nonAvailableAppNames` at the moment they vanish, not just that the mechanism exists).

- timestamp: 2026-08-21
  checked: actual byte content of the WKWebView localStorage key `nonAvailableGames`, read
  directly via `sqlite3` against
  `~/Library/WebKit/com.gamelib.shell/WebsiteData/Default/<origin>/<origin>/LocalStorage/
  localstorage.sqlite3` (WebKit's real per-origin store; only one origin directory exists, so no
  ambiguity about which app it belongs to — and `com.gamelib.shell` is confirmed to be the Tauri
  build's own bundle identifier per `src-tauri/tauri.conf.json`, not Electron's, since Electron
  uses Chromium's storage layer, not WebKit at all).
  found: `ItemTable` has 10 keys including `nonAvailableGames`. Its value (stored as UTF-16LE
  BLOB, decoded) is exactly `["1829678475","718850"]`. Neither ID matches 719040 or 1335830 (the
  named-missing games) as of this read (22:29 local). Cross-referenced against
  `steam_library.json`/`gog_library.json`: `718850` = Age of Wonders: Planetfall, `runner: steam`,
  `is_installed: true`, install path
  `/Users/graysonmitchell/Library/Application Support/Steam/steamapps/common/Age of Wonders
  Planetfall` — confirmed to EXIST on disk (`ls` succeeded, non-empty listing). `1829678475` =
  Endless Sky, `runner: gog`, `is_installed: false` in the CURRENT store snapshot.
  implication: (1) directly falsifies/withdraws the prior "LocalStorage is EMPTY" elimination —
  it was checking the wrong directory the whole time; the real store has live, meaningful content.
  (2) Age of Wonders: Planetfall is CURRENTLY installed with a path that exists, yet is currently
  excluded from the library by this exact mechanism — proves the "stuck-forever" defect
  (Current Focus) is real and currently active for at least one title, independent of whether it
  also explains 719040/1335830. (3) Does NOT by itself prove 719040/1335830 went through this
  exact list — their absence from the CURRENT snapshot is consistent with either "never went
  through this list" or "went through it and was later removed" (the removal branch exists in
  `handleNonAvailableGames`, constants.ts:94-102) or "this session's state has moved since the
  original report and the list's membership has changed". Not conclusive alone; the live probe
  added this cycle is designed to close this specific gap.

- timestamp: 2026-08-21
  checked: full text of `src/backend/storeManagers/steam/games.ts` `isGameAvailable()` (2685-2700)
  and `src/backend/storeManagers/gog/games.ts` `isGameAvailable()` (1296-1311) — the unverified
  claim's assertion that both have "the same net semantics".
  found: Steam's version: early `resolve(false)` if `is_delisted`, else
  `resolve(Boolean(is_installed && install_path && existsSync(install_path)))` — clean, single
  resolve call. GOG's version has a latent bug (`resolve(true)`/`resolve(false)` inside the `if`
  block are NOT followed by `return`, and an unconditional `resolve(false)` sits after the `if`
  block unconditionally) — but since `Promise`'s `resolve` is a no-op after the first call, this
  produces the SAME net boolean result as if it had returned early; the redundant call has no
  observable effect. Net semantics ARE equivalent, confirming that part of the claim, though the
  GOG code itself is sloppier than described (dead-code style issue, not a behavioural
  discrepancy) — flagging this as a separate, minor, non-blocking finding, not part of this bug's
  root cause (GOG is not implicated in the 719040/1335830 report).
  implication: rules out "GOG-specific asymmetry" as a distinguishing factor; both runners'
  `isGameAvailable` reduce to the same `is_installed && path && existsSync` shape.

- timestamp: 2026-08-21
  checked: whether the unverified claim's proposed specific mechanism ("availability check races
  library hydration" via `refresh()`'s `library.clear()` at library.ts:1049 through the per-app
  loop ending at `library.set()`/`sendFrontendMessage()`, library.ts:1174-1175) is actually
  exploitable. Grepped every `await` occurrence in `refresh()` (library.ts:869-1204).
  found: every `await` in the function (lines 901, 926, 974, 1002, 1004, 1012, 1021) occurs
  BEFORE `library.clear()` at line 1049. Between 1049 and the loop's final statement at 1176,
  there is no `await`, no `setTimeout`/`setImmediate`/`process.nextTick`, no yield point of any
  kind — the entire 378-iteration loop runs as one synchronous block.
  implication: REFUTES the specific "mid-loop clear-to-refill race" mechanism as literally
  impossible under Node's single-threaded run-to-completion model — no concurrently-arriving IPC
  handler call (including a frontend's `isGameAvailable` request) can be scheduled or executed
  while this loop is running; by the time control returns to the event loop, `library` is either
  still fully populated from the PREVIOUS cycle (loop hasn't started) or fully repopulated (loop
  has finished) — never observably empty-then-partial from an external caller's perspective. This
  candidate mechanism is ELIMINATED (see Eliminated section). The unverified claim's proposed
  arithmetic (26 installed − 1 = 25 ≈ 22) was therefore never tested against a valid mechanism and
  should not be treated as explaining the count; it was a coincidence check against an eliminated
  cause.

- timestamp: 2026-08-21
  checked: whether a currently-excluded game (via `nonAvailableAppNames`) can ever self-heal —
  traced the full call chain: `filterLibrary` → `passesMore` → `isNonAvailableGame` excludes the
  game from `libraryUnion`'s filtered output → the game's `GameCard` (and therefore its `hasStatus`
  hook instance) does not mount for an excluded game → `hasStatus`'s `checkGameStatus` effect,
  the ONLY call site of `handleNonAvailableGames` (hasStatus.ts:152-153), never re-runs for that
  appId → `handleNonAvailableGames`'s removal branch (constants.ts:94-102, `gameAvailable === true`
  → splice out + `storage.setItem`) never fires for it again.
  found: no other call site anywhere in the codebase calls `handleNonAvailableGames` or otherwise
  removes an entry from the `nonAvailableGames` localStorage list. No periodic re-validation, no
  "recheck previously-unavailable games" pass exists.
  implication: CONFIRMED as a real, independent defect: once any appName is added to
  `nonAvailableGames` for ANY reason (even a genuinely-transient one), it is excluded from the
  library PERMANENTLY for the rest of that browser storage's lifetime, regardless of whether the
  underlying condition that caused the add is later fixed. This is provably true by code
  structure alone (no reasoning about timing/races required) and is independently demonstrated by
  Age of Wonders: Planetfall's current stuck state (see above). This is the fix target regardless
  of how the original-add mechanism for 719040/1335830 resolves.

- timestamp: 2026-08-21
  checked: added temporary instrumentation to `handleNonAvailableGames`
  (`src/frontend/hooks/constants.ts`), logging via `window.api.logInfo` (the same proven-live sink
  used by the existing DIAG-22missing-render/GlobalState probes) on every call: `process=`
  (electron|tauri, same `navigator.userAgent` derivation as the existing probes), `appName=`,
  `runner=`, `gameAvailable=`, `action=ADD|REMOVE|already-listed|already-clear`, and
  `listBefore=` (JSON of the array before this call's mutation). Prefixed
  `[DIAG-22missing-navail]` to match the existing `[DIAG-22missing...]` grep convention.
  `npx tsc --noEmit -p .` exits 0 with this change in place — no type errors.
  implication: this is the live test designed to directly answer "does 719040 or 1335830 ever get
  an `action=ADD` line, and if so what precedes/follows it" — the one open question left after
  eliminating the mid-loop-race mechanism. Needs a live reload + fresh sync + log tail from the
  operator (see Current Focus `next_action`) to produce a result; not yet observed.

## Eliminated

- hypothesis: mid-loop `library.clear()`-to-`library.set()` race inside `refresh()` racing a
  concurrent `isGameAvailable` IPC call — evidence: every `await` in `refresh()` occurs strictly
  before `library.clear()` (library.ts:1049); the entire 378-iteration hydration loop
  (1050-1176) is synchronous with no yield point, so under Node's single-threaded run-to-
  completion model no external call can observe the Map in a cleared-but-partially-refilled
  state. This mechanism, and the arithmetic coincidence built on it (26 installed − 1 ≈ 22), is
  refuted; do not resurrect without first finding an actual yield point inside the loop.

- hypothesis: active filters — evidence: header numerator equals unfiltered denominator (`356 of 356`)
- hypothesis: DLC exclusion — evidence: 0 entries with `install.is_dlc` in `steam_library.json`
- hypothesis: missing metadata — evidence: 0 entries lack a `steam_metadata.json` record
- hypothesis: `nonAvailableGames` hiding — evidence: Tauri WKWebView LocalStorage is empty; Electron's copy is a different store the Tauri app never reads
- hypothesis: delisted flag — evidence: covers only 9 of 22; both named missing games are `is_delisted: false`
- hypothesis: installed games hidden — evidence: over-predicts at 34, not 22

## Resolution

root_cause: Two compounding defects, both confirmed by direct source reading and live
  instrumentation (not inference):

  (1) Backend hydration race, `SteamGame.getGameInfo()` (`src/backend/storeManagers/steam/games.ts`):
  before the fix, `getGameInfo()` read ONLY the in-memory `library` Map and returned `{} as GameInfo`
  if the appId was absent. On renderer boot (or any moment before `SteamLibraryManager.refresh()`'s
  async per-game CM sync has populated that Map for a given appId), a call to
  `isGameAvailable()` — which calls `getGameInfo()` internally — resolves `false` for an owned,
  correctly-installed game purely because the in-memory cache had not been warmed yet, not because
  the game is actually unavailable.

  (2) Stuck-forever exclusion, `handleNonAvailableGames`/`nonAvailableGames` localStorage list
  (`src/frontend/hooks/constants.ts`): that single false-negative gets written to the
  `nonAvailableGames` localStorage list (confirmed live: `["1829678475","718850"]`, where 718850 =
  Age of Wonders: Planetfall, `is_installed: true`, install path confirmed to exist on disk — proof
  this was a currently-active, not merely theoretical, defect). `filterEngine.isNonAvailableGame`
  then excludes any listed appName from BOTH `gridGames` and `countUnfilteredGames`'s "unfiltered"
  denominator simultaneously (`DEFAULT_FILTER_ENGINE_STATE.showNonAvailable` is `'off'`, the
  DEFAULT, not an opt-in filter), with zero filter chip rendered — this is what produces
  `356 of 356` with no visible active filter. Worse, `handleNonAvailableGames`'s only call site is
  inside the excluded game's OWN `GameCard`'s status effect (`hasStatus.ts`) — but that GameCard
  never mounts again once excluded, so nothing ever re-checks the entry. Once added, an appName is
  excluded permanently regardless of whether the underlying condition later resolves.

  Live confirmation chain (see Evidence): `process=tauri` instrumentation proved
  `libraryUnion.length=400, union:719040/1335830=true` while `gridGames.length` dropped from 381 to
  356 with `grid:719040/1335830=false` in the same window — i.e. loss occurs strictly inside
  `filterLibrary`, not upstream in IPC/transport (the send-drop hypothesis was live-refuted, not
  merely superseded). A candidate "mid-loop `library.clear()`-to-refill race inside `refresh()`"
  mechanism was independently eliminated by grepping every `await` in `refresh()`: none occur
  between `library.clear()` and the loop's final `library.set()`, so the 378-iteration hydration
  loop is one synchronous block under Node's run-to-completion model — no concurrent IPC call can
  observe a cleared-but-partial Map. The actual race is specifically the WINDOW BEFORE the first
  `refresh()` call completes (cold boot / early `isGameAvailable()` calls), not a mid-refresh race.

fix: (1) `SteamGame.getGameInfo()` now falls back to the persisted `steamLibraryStore` cache
  (`steamLibraryStore.get('games', []).find(g => g.app_name === appId)`) when the in-memory Map
  misses, self-healing the Map on hit so subsequent calls don't repeat the disk read — mirrors the
  identical fallback `SteamLibraryManager.getGameInfo()` (library.ts) already had for the same
  reason. (2) Added `reconcileNonAvailableGames(libraryUnion)` (`src/frontend/hooks/constants.ts`),
  a reconciliation pass that re-runs `handleNonAvailableGames`'s check for every appName currently
  on the `nonAvailableGames` list that is also present in the union, driven from `Library/index.tsx`
  (a component that renders regardless of any single game's exclusion state) instead of the excluded
  card itself — this is what makes a healed entry actually able to leave the list. A
  `reconcileTick` state bump forces the one extra render needed to pick up the localStorage
  correction, since `engineDeps` only re-reads localStorage on a `libraryUnion` change, not on a
  timer, and this render's `engineDeps` was already built from the pre-heal snapshot. (3) Blind-spot
  guard: `findSilentlyExcludedGames` (`gameCount.ts`) + a `Library/index.tsx` effect that
  `logError`s if any Steam, non-DLC, non-delisted game is STILL silently excluded after
  reconciliation — closes the "invisible to every existing gate" blind spot the todo called out,
  scoped to Steam/non-DLC/non-delisted specifically so it doesn't false-positive on legitimately
  hidden games from other runners or real delisted titles.

verification: `npx tsc --noEmit -p .` exits 0. Full targeted test sweep, all green: backend
  `src/backend/storeManagers/steam/` (39 suites, 1366 passed, 2 skipped, 0 failed) and frontend
  `src/frontend/screens/Library/` (21 suites, 579 passed, 0 failed), including the four new
  `getGameInfo()`/`isGameAvailable()` persisted-cache-fallback tests
  (`src/backend/storeManagers/steam/__tests__/games.test.ts`) and the existing
  `filterEngine`/`libraryPipeline`/`libraryHeaderVisibility`/`engineWiring` suites unaffected by
  exporting `isNonAvailableGame`. All temporary `DIAG-22missing*` instrumentation removed from
  `GlobalState.tsx`, `Library/index.tsx`, and `constants.ts`; confirmed via repo-wide grep (0
  matches). One self-inflicted test-isolation bug found and fixed during verification: the four new
  `games.test.ts` tests assumed an empty in-memory `library` Map, but the describe block's own
  shared `beforeEach` unconditionally seeds `library.set(APP_ID, makeEntry())` for the OTHER tests
  in that block (needed by them) — this silently defeated the new tests' "Map is empty" premise
  under a full-suite run (all passed in isolation via `-t`, 3 of 4 failed under the full suite).
  Fixed by an explicit `library.delete(APP_ID)` at the start of each of the four new tests, and
  removed leftover `console.log('DEBUG ...')` lines that were added while diagnosing that
  isolation bug. This was NOT a race/leak from a fire-and-forget promise (an earlier line of
  investigation suspected `fetchMetadataIfNeeded`'s fire-and-forget write) — it was the mundane
  shared-`beforeEach` seed being read after the debug `console.log` line but before the test body,
  confirmed by reading the full `beforeEach` body (its LAST statement is
  `library.set(APP_ID, makeEntry())`, several lines after the point instrumentation had stopped
  looking).
  **Still outstanding — requires the operator:** a full clean app restart (not a reload, since
  reload can preserve pre-existing localStorage state) confirming `gridGames` stays at the correct
  total with all three probed appIds (719040, 1335830, 1771300) `true` throughout, not just at
  first paint. This is a live-environment check this session cannot perform itself.

files_changed:
  - src/backend/storeManagers/steam/games.ts (getGameInfo persisted-cache fallback)
  - src/frontend/hooks/constants.ts (reconcileNonAvailableGames)
  - src/frontend/screens/Library/filterEngine.ts (exported isNonAvailableGame)
  - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts (findSilentlyExcludedGames blind-spot guard)
  - src/frontend/screens/Library/index.tsx (reconciliation effect + blind-spot guard wiring)
  - src/backend/storeManagers/steam/__tests__/games.test.ts (4 new tests + test-isolation fix + DIAG cleanup)

## Operator verification — 2026-08-22 — RESOLVED

The `awaiting_human_verify` checkpoint is discharged. Operator ran a **full quit and relaunch**
(the distinction that mattered: a reload preserves the pre-existing `nonAvailableGames`
localStorage entry, so only a cold start proves the reconciliation heal actually persists).
Result: full unfiltered header count with 719040 (Wasteland 3) and 1335830 (Len's Island) present
in the grid, and stable while browsing — not merely correct at first paint, which was the residual
failure mode this check existed to rule out.

Corroborated at close: persisted `steam_library.json` = 378 Steam games, all three probe appIds
(719040, 1335830, 1771300) present with `is_installed: true`; fixes on branch as `51b175d74`
(hydration race) + `086e1ed4f` (not-installed heal branch), with `getGameInfo()`'s persisted-cache
fallback, `reconcileNonAvailableGames` and `findSilentlyExcludedGames` all confirmed present in
source at close (re-grepped, not assumed from this ledger).

Source todo closed: `.planning/todos/completed/2026-08-21-steam-library-22-games-never-reach-the-rendered-library.md`.
`.planning/debug/uninstall-game-vanishes.md` remains PARKED — different mechanism, do not close it.
