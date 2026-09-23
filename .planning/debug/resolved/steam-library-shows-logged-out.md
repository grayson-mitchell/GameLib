---
status: resolved
trigger: "Steam library games (installed AND not-installed) are visible on the Library screen while logged OUT of Steam. Banner correctly says Steam is not logged in and that other libraries are available, but the full Steam library still renders. Previously no Steam games showed when logged out — this is a regression. Desired end state: when logged out, installed Steam games should still show and be playable; the non-installed \"online collection\" should NOT show."
created: 2026-09-23
updated: 2026-09-24
slug: steam-library-shows-logged-out
goal: find_and_fix
---

# Debug Session: steam-library-shows-logged-out

## Symptoms

**Expected behavior (desired end state):**
While logged out of Steam, the Library screen should show *installed* Steam games only, and
those should remain launchable/playable. The non-installed "online collection" (owned-but-not-
installed titles, which require an authenticated Steam session to be meaningful) should NOT
appear.

**Expected behavior (historical):**
Previously, logging out of Steam hid *all* Steam games from the Library. That is the behavior
the user remembers and the baseline the regression is measured against.

**Actual behavior:**
The entire Steam library renders — both installed and not-installed games — despite the app
being in a logged-out Steam state. The logged-out banner itself renders correctly and correctly
states that the other libraries (Epic/GOG/Amazon) are available.

**Error messages:**
None reported. No visible error; the failure is a silent over-render. Console/log output has
not been captured yet.

**Timeline:**
Regression. User is confident the logged-out state used to hide Steam games but cannot pin when
it stopped. Not attributable to a specific recent change from the user's side. Note the v0.8
Tauri rearchitecture is a candidate window but is NOT confirmed.

**Reproduction:**
1. Launch GameLib in a Steam-logged-out state.
2. Navigate to the Library screen.
3. Observe: logged-out banner present AND full Steam library (installed + not-installed) listed.

**Characterization (from user):**
- Not-installed Steam games render as normal, fully-actionable cards with an Install button —
  they are not greyed out or disabled. So this is not merely a stale-cache display artifact;
  the cards are being treated as live, available library entries.
- How the profile reached the logged-out state is unknown (not confirmed whether this is an
  explicit logout, a never-logged-in profile, or an expired session). **Establishing which of
  these it is matters**: an explicit logout that leaves cached library data on disk is a
  different defect from a never-authenticated profile that still populates a library.

## Current Focus

hypothesis: CONFIRMED — see Resolution.root_cause
test: read makeLibrary()/showSteam gate in Library/index.tsx, resolveSteamSyncIndicator, GlobalState steam.username seeding, and SteamUser.ensureConnected()'s deliberate "leave session untouched" branches
expecting: n/a — implementing fix
next_action: awaiting human verification of the live repro (expired Steam session) before archiving
reasoning_checkpoint:
  hypothesis: "The Library screen's steam gate (`showSteam = !!steam?.username` in makeLibrary(), Library/index.tsx:640) conflates 'has a persisted Steam identity on disk' with 'is currently authenticated'. `steam.username` is seeded at boot from `steamConfigStore.get_nodefault('userData')?.username` (a cached config value) and is deliberately LEFT UNTOUCHED by SteamUser.ensureConnected() when the live session fails (user.ts:186-198, 'unreadable' outcome) or the stored token reads back empty (user.ts:199-213, 'absent' outcome — only sets credentialsMissing, never clears userData/isLoggedIn). So after a session expires, `steam.username` stays truthy, `showSteam` stays true, and the ENTIRE cached `steam.library` (installed AND not-installed, sourced unfiltered from steamLibraryStore) renders as live. Meanwhile the SAME `steam.username` value also feeds `steamLoggedIn` in resolveSteamSyncIndicator (Library/index.tsx:1026), and the backend's real steamSyncStatus:'failed' (from ensureConnected() returning false) correctly drives the signed-out/failed banner. Hence: banner correctly says logged out (driven by live steamSyncStatus), while the game grid still renders everything (driven by stale persisted username) — exactly the reported symptom."
  confirming_evidence:
    - "Library/index.tsx:640 `const showSteam = !!steam?.username` gates the ENTIRE steamLibrary array (installed + not-installed) with no is_installed split."
    - "GlobalState.tsx:455 seeds `steam.username` from `steamConfigStore.get_nodefault('userData')?.username` (a persisted disk value), not a live check."
    - "user.ts:186-198 (unreadable outcome) and :199-213 (absent outcome): both branches explicitly comment that isLoggedIn/userData are left untouched on a failed/expired credential read — by design, to avoid flip-flopping the login badge on a transient keyring hiccup — but this same field is reused by the frontend as the library-visibility gate."
    - "Library/index.tsx:1026 `steamLoggedIn: Boolean(steam?.username)` feeds resolveSteamSyncIndicator, which only shows the signedOut/failed banner once steamSyncStatus:'failed' is ALSO true (branch 1b/2, librarySyncIndicator.ts:96-108) — so the banner's presence proves steamSyncStatus really did go to 'failed' at least once, confirming an expired/dead session (not a never-logged-in profile, which would never reach 'failed' with credentialsMissing/failed from ensureConnected since refresh() only runs after `isSteamAuthUnlocked()`/a deliberate trigger)."
    - "Explicit logout (GlobalState.tsx steamLogout onSignedOut, ~line 1000) DOES clear both `steam.username` and `steam.library` to null/[] in the same session — so the currently-reported over-render is NOT the explicit-logout flavor; it is the expired/still-configured-but-unauthenticated session flavor."
  falsification_test: "If steamSyncStatus never reached 'failed' in a real repro (i.e. the signed-out banner rendered without a failed sync), this hypothesis would be wrong — but resolveSteamSyncIndicator structurally cannot reach signedOut/failed without steamSyncStatus==='failed', so the banner's mere presence is itself the falsification test already passed."
  fix_rationale: "Decouple not-installed-game visibility from the stale `steam.username` signal by additionally requiring steamSyncStatus !== 'failed' before treating the session as actively authenticated; always keep is_installed:true games regardless. This fixes the root cause (conflated signals) rather than the symptom (just hiding the banner or just clearing the cache), and matches the documented desired end state: installed games always show/playable, not-installed 'online collection' hidden once the session is known to be invalid."
  blind_spots: "Have not live-run the app to watch steamSyncStatus transition in real time (no interactive Steam session available in this environment) — relying on static code trace. Have not exhaustively checked every other frontend surface that reads `steam?.username` for an equivalent conflation (e.g. StoresPanel tile, facet counts) — those are out of scope for this fix since they weren't reported as symptomatic. The in-session (no-restart) immediate aftermath of clicking 'Sign out' is a separate minor inconsistency (library wiped to [] rather than filtered to installed) — addressed as a small companion fix since it's explicitly named in the desired end state, but not exercised by a live repro."

## Evidence

- timestamp: 2026-09-23T00:00:00Z
  checked: src/frontend/screens/Library/index.tsx makeLibrary() (~line 635-670)
  found: "`const showSteam = !!steam?.username; const steamLibrary = showSteam ? steam.library : []` — single boolean gates the WHOLE steam library (installed + not-installed) with no is_installed split."
  implication: "This is the render-time gate that must change to satisfy 'installed always shows, not-installed hidden when logged out'."

- timestamp: 2026-09-23T00:00:01Z
  checked: src/frontend/screens/Library/librarySyncIndicator.ts (resolveSteamSyncIndicator)
  found: "Banner logic reads the SAME `steam?.username` value as `steamLoggedIn`, but ALSO independently requires `steamSyncStatus === 'failed'` (via branches 1b/2) before showing the signedOut/failed banner text ('Your Steam sign-in expired' / other libraries still available)."
  implication: "The banner's correctness (it DOES show 'logged out') proves steamSyncStatus really reached 'failed' — i.e. this is a live/expired-session defect, not a never-logged-in or explicit-logout scenario (both of which clear steam.username synchronously and would make the banner ALSO hidden per branch 1)."

- timestamp: 2026-09-23T00:00:02Z
  checked: src/frontend/state/GlobalState.tsx (state initializer ~line 455, steamLogin ~964, steamLogout/onSignedOut ~995-1010, mount ~1728-1764)
  found: "`steam.username` is seeded at boot from `steamConfigStore.get_nodefault('userData')?.username` — a persisted disk value, never re-verified against a live connection check during mount (unlike legendary/amazon/zoom which call their own getUserInfo IPC on mount). Only explicit steamLogin/steamLogout mutate it in-session."
  implication: "Nothing in the normal boot/refresh path ever demotes `steam.username` back to null when a session goes stale — it can only become false via an explicit user-initiated logout. This is the structural cause of the conflation."

- timestamp: 2026-09-23T00:00:03Z
  checked: src/backend/storeManagers/steam/user.ts SteamUser.ensureConnected() (~line 173-213) and logout() (~285-319)
  found: "On a keyring read failure ('unreadable', line 186-198) or an empty-but-successful read ('absent', line 199-213), ensureConnected() returns false WITHOUT clearing configStore's isLoggedIn/userData — deliberately, per in-code comment, to avoid mislabeling a transient failure as signed-out. Only explicit logout() (line 285-319) clears isLoggedIn/userData/credentialsMissing. steamLibraryStore (the games cache) is NEVER cleared by logout() either."
  implication: "Confirms an expired/invalid session is architecturally indistinguishable from a healthy one at the `steam.username`/`isLoggedIn` level — by design, for the login badge's sake — but the frontend library-visibility gate borrows that same value, which is the actual defect."

- timestamp: 2026-09-23T00:00:04Z
  checked: src/backend/storeManagers/steam/library.ts refresh() Step 3 hydration loop (~line 1087-1215)
  found: "GameInfo entries (installed AND not-installed) are only ever synthesized from `ownedApps` returned by an authenticated `client.getUserOwnedApps()` call — there is no local-only/no-auth path that surfaces a Steam game from ACF scan alone. A 'never logged in' profile therefore has an empty steamLibraryStore cache and an empty steam.library in the frontend; this flavor is a non-issue by construction."
  implication: "Confirms the three 'logged-out flavors' resolve as: never-logged-in = trivially correct already (nothing cached to show); explicit logout = already hides everything (arguably too conservative vs desired end state, but not the reported symptom); expired session = the actual, reproducible defect matching the report."

- timestamp: 2026-09-23T00:00:07Z
  checked: "src/frontend/state/__tests__/GlobalStateScopedRefresh.test.ts (source-text gate guarding the debug/login-logout-wipes-library regression fix)"
  found: "Implemented a companion fix in GlobalState.tsx's steamLogout onSignedOut (filtering `steam.library` to installed-only instead of wiping to `[]`) to also cover the in-session explicit-logout flavor named in the desired end state. This broke the parametrized `it.each` test's regex match for the `steam` runner, which hard-requires the literal `library: []` shape via \\`${runnerKey}:\\s*{\\s*library:\\s*\\[\\` for ALL five logout wrappers (epic/gog/amazon/zoom/steam) — the test cannot distinguish 'still correctly clears' from 'no longer literally empty'."
  implication: "Reverted the GlobalState.tsx change entirely (confirmed via `git diff --stat` showing zero diff on that file). The explicit-logout flavor was already eliminated as NOT matching the reported symptom (see Eliminated below) -- it currently over-hides (all Steam games disappear on logout) rather than under-hides, which is not what was reported. Fixing it properly would mean restructuring a 5-runner shared regression gate, which is disproportionate scope for a defect that was not reported and was only being addressed opportunistically. Kept the fix minimal and scoped strictly to the confirmed, reported defect (expired-session flavor), entirely within Library/index.tsx. The explicit-logout gap vs. the full desired end state is a known, consciously deferred residual -- worth a follow-up todo, not a blocker for this fix."

## Eliminated

- hypothesis: "Bug is caused by a never-authenticated profile incorrectly populating a library (e.g. local ACF scan running without auth)."
  evidence: "library.ts refresh() only ever builds GameInfo entries from the authenticated ownedApps list (Step 3); there is no code path that surfaces a Steam game to the cache/library without having gone through at least one successful authenticated sync. A never-logged-in profile has empty steamLibraryStore and empty steam.library — nothing to over-render."
  timestamp: 2026-09-23T00:00:05Z

- hypothesis: "Bug is caused by explicit logout leaving stale cached library data rendered in the SAME session."
  evidence: "GlobalState.tsx steamLogout's onSignedOut handler synchronously sets both `steam.username: null` and `steam.library: []` in the same session — makeLibrary()'s showSteam gate would already evaluate false immediately after an explicit logout, hiding the whole Steam section (too conservative relative to desired end state, but not an over-render, so does not match the reported symptom of games STILL showing)."
  timestamp: 2026-09-23T00:00:06Z

## Resolution

root_cause: |
  The Library screen's Steam-library visibility gate (`showSteam = !!steam?.username` in
  `makeLibrary()`, src/frontend/screens/Library/index.tsx) conflates "has a persisted Steam
  identity cached on disk" with "is currently authenticated." `steam.username` is seeded at
  boot from a persisted config value (`steamConfigStore.get_nodefault('userData')?.username`)
  and is deliberately left untouched by `SteamUser.ensureConnected()` (src/backend/storeManagers/
  steam/user.ts) when a live reconnect fails due to an expired/invalid session — by design, so a
  transient keyring hiccup doesn't flip the login badge. The SAME stale value gates the entire
  cached Steam library (installed AND not-installed titles, unfiltered) for rendering, while the
  logged-out/failed banner correctly reads the live `steamSyncStatus` signal. Result: banner
  correctly reports the session is dead, but the full library (including the non-installed
  "online collection") keeps rendering as live, actionable cards.
fix: |
  src/frontend/screens/Library/index.tsx (makeLibrary): treat the Steam session as actively
  authenticated only when BOTH `steam?.username` is set AND `steamSyncStatus !== 'failed'`
  (new local `steamAuthActive`). When not actively authenticated, still include installed Steam
  games (`is_installed: true`) but filter out not-installed ("online collection") games, instead
  of the previous all-or-nothing `showSteam` gate. `steamSyncStatus` added to the `useCallback`
  dependency array.

  A companion fix to src/frontend/state/GlobalState.tsx (steamLogout onSignedOut, filtering
  `steam.library` to installed-only on explicit logout instead of wiping to `[]`) was implemented
  and then REVERTED -- see Evidence entry 2026-09-23T00:00:07Z. That file has zero net diff.
  Scope was deliberately narrowed to the single confirmed, reported defect (expired-session
  flavor); the explicit-logout flavor still wipes to `[]` (unchanged pre-existing behavior, not a
  regression from this fix) and is a known, consciously deferred gap relative to the full desired
  end state.
verification: |
  Self-verified (no live Steam session available in this environment; a live expired-session
  repro is the remaining human-verify step):
  - npx prettier --check src/frontend/screens/Library/index.tsx -> "All matched files use
    Prettier code style!"
  - npx tsc --noEmit -p . -> exit 0, clean
  - npx eslint on the changed file -> 0 errors; 40 pre-existing warnings, none on edited lines
    (confirmed via JSON-filtered line-number check)
  - npx jest --selectProjects Frontend --testPathPattern "Library|GlobalState" ->
    38 test suites passed, 38 total; 780 tests passed, 780 total (includes
    libraryHookStaleness.test.ts's useCallback dependency-exhaustiveness gate, which the added
    `steamSyncStatus` dependency does not break, and GlobalStateScopedRefresh.test.ts, which
    confirmed the GlobalState.tsx revert restored full parity)
  - git diff --stat src/frontend/state/GlobalState.tsx -> no output (zero net diff, confirming
    clean revert)
files_changed:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/steamLibraryVisibility.ts
  - src/frontend/screens/Library/__tests__/steamLibraryVisibility.test.ts

## Follow-up — 2026-09-24 (orchestrator, at operator request)

Operator asked for a regression test before live-gating, and for the commit to be held until
after. Both done; nothing is committed.

**Refactor.** The decision moved out of `index.tsx` into a new pure module,
`steamLibraryVisibility.ts` (`selectVisibleSteamLibrary`). Extraction was FORCED, not stylistic:
the Frontend jest project is `testEnvironment: 'node'` with no jsdom, and `index.tsx` opens with
`import './index.css'`, so any test importing anything from it dies at that import before the
first assertion. Same constraint and same remedy as `librarySyncIndicator.ts`.

`showSteam = !!steam?.username` was RETAINED in `makeLibrary` as the outer gate, redundantly with
the resolver's own branch 1 — see the T-34.11-12 note below for why deleting it is not an option.

**A real bug in the original fix, caught by the extraction.** `steam?.username` is
`string | null | undefined` — logout writes `null`, a never-connected profile leaves `undefined`.
The inline `!!` coerced this silently; the extracted signature made `tsc` reject it (TS2322) until
the union was stated. Now covered by an explicit null test row.

**Regression test** (`__tests__/steamLibraryVisibility.test.ts`, 20 tests): full 6-row
username x syncStatus matrix; the symptom stated directly; entry-identity and array-identity
assertions (the grid memoizes on these references); a saboteur block that runs the PRE-FIX logic
through the same expectations, so the suite cannot silently stop discriminating fixed from broken;
and a source gate proving `makeLibrary` actually calls the resolver — without which rewiring
`index.tsx` back to the inline form would leave every module-level assertion green.

**Sabotage-proved in both directions, not just asserted green:**
- delete the resolver's `'failed'` branch -> 5 tests red
- rewire the call site back to `showSteam ? steam.library : []` -> 3 tests red

**Measured, whole-repo:** `tsc --noEmit` exit 0 · `npx prettier --check` clean on all three source
paths · `pnpm lint` both ceilings PASS with tests at exactly 638 (the ceiling is 638 with zero
headroom; the new test file contributes no warnings) · `jest --selectProjects Frontend
--testPathPattern "Library|GlobalState"` 39/39 suites, 800/800 tests · `pnpm planning-gates` 12/12.

NOTE on the prettier claim above: it covers the three `src/` paths only. `.prettierignore:29`
lists a bare `.planning`, so running `prettier --check` over any path in this directory — including
this file and the todo below — is VACUOUS and exits 0 without reading anything. Do not record such
a run as evidence.

**T-34.11-12 (Spoofing) — narrowly reopened, and the existing gate cannot see it.** The first
version of this refactor deleted `showSteam`, which turned `connectedStoresParity.test.ts` red
(4 failures): that test proves the Store facet panel and the grid gate every store with the SAME
expression, and it reads `makeLibrary`'s `show*` locals to do so. Restoring `showSteam` turns it
green — but the green is TEXTUAL. `connectedStores` still pushes `'steam'` on `steam?.username`
alone (`index.tsx:266`), while the grid's real decision is now `showSteam &&
selectVisibleSteamLibrary(...)`, and the second term is invisible to a string comparison of gate
expressions.

Consequence: an expired session with ZERO installed Steam games gets a Steam facet row over a grid
with no Steam games — the permanently-0 row T-34.11-12 exists to prevent, and which already
shipped once for Amazon. Not reachable before this fix (an expired session rendered everything, so
the row was never empty).

Operator was given the three options and chose to accept and file. Filed as
`.planning/todos/pending/2026-09-24-steam-facet-row-can-outlive-its-grid-games-reopening-t-34-11-12.md`
(`severity: medium`, `platform: any`, `ready: code`) — `medium` for the gate-weakening, not for the
one cosmetic row.

## Live gate — PASSED, 2026-09-24

Operator reopened GameLib on their Mac with the profile in the expired-Steam-session state and
reported: installed Steam games visible, not-installed titles absent. That is the desired end
state, observed on the real app rather than inferred from the static trace — which closes the
`blind_spots` entry above ("have not live-run the app to watch steamSyncStatus transition").

Worth recording WHY this observation is trustworthy at a glance, because it is what made the
original bug report reliable too: this operator's Steam library is large (hundreds of titles) while
their Epic/GOG libraries hold a handful. "The full owned collection rendered" versus "only my
installed games rendered" is therefore a difference of hundreds of cards, not a subtle one. No card
count was taken, so this is a strong qualitative confirmation, not a measurement.

Session closed. Fix, regression test and T-34.11-12 todo committed together; see the two commits
referencing this slug.

**Deliberately NOT closed by this session:**
- Explicit in-session Steam logout still wipes `steam.library` to `[]` rather than retaining
  installed games. Pre-existing, unchanged by this fix, blocked by
  `GlobalStateScopedRefresh.test.ts`'s regex requiring the literal `library: []` shape across all
  five logout wrappers. Not filed as a todo — it is recorded here and in `fix:` above.
- The structural form of "installed games always show". `steam/library.ts`'s `refresh()` enumerates
  only from an authenticated `ownedApps()` call, so this fix filters a CACHE of a previous
  successful sync. A profile that never completed one still shows zero Steam games however many are
  installed on disk. Delivering the unconditional promise means ACF-driven enumeration in the
  backend. Recorded in `steamLibraryVisibility.ts`'s header as a KNOWN LIMITATION so it is not
  mistaken for a guarantee.
- `.planning/todos/pending/2026-09-24-steam-facet-row-can-outlive-its-grid-games-reopening-t-34-11-12.md`
