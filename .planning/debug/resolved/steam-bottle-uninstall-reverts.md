---
slug: steam-bottle-uninstall-reverts
status: resolved
trigger: "cant uninstall 'all will fall', when i try and uninstall it says uninstalling for a time, but then reverts back... tried to delete file on disk, still cant remove it."
created: 2026-08-15
updated: 2026-08-15T23:59:00Z
resolved_by: [539bc979c, 60e89349a, cc320f258, fa9051a9e]
goal: find_and_fix
live_access: yes — operator is at the keyboard and can drive `pnpm tauri:dev`, paste logs, and answer questions
---

# Debug Session: Steam bottle game uninstall reverts to installed

## Symptoms

**Expected behavior:** Uninstalling the Steam game "All Will Fall" removes it from disk and
the library entry flips to not-installed (Install button returns), permanently.

**Actual behavior:** The UI shows an "uninstalling" state for a period of time, then reverts
back to the installed state. The game remains listed as installed. Manually deleting the
game's files on disk does NOT make the entry go away either — it still shows as installed.

**Error messages:** None. No visible error banner, notification, or toast. Operator has not
yet checked DevTools console or the log file.

**Timeline:** Operator believes uninstall worked at some earlier point, but has not worked
"for a while" — self-assessed as possibly a Tauri-rearchitecture-introduced regression.
Not confirmed whether other games uninstall correctly.

**Reproduction:** Run `pnpm tauri:dev`, open "All Will Fall" (Steam, installed into a
CrossOver/Wine bottle as a Windows-only title), trigger Uninstall from the game page.

NOTE: the "All Will Fall" repro case was DELETED live by the operator earlier this session.
HOARD's BOTTLE copy (appId 63000, ~276M) was also LIVE-DELETED (correctly, by the working
direct-deletion mechanism) during verification of the prior fix. **HOARD's NATIVE macOS
install (`~/Library/Application Support/Steam/steamapps/common/Hoard`, 574M) is intact and is
now a CLEAN, NATIVE-ONLY case** — the dual-install condition that exposed the routing bug no
longer exists for Hoard specifically. Live repro material is now limited; prefer tests over
further live runs for this final layer, and be explicit with the operator about what any live
run will destroy before requesting one.

STATUS: the direct-deletion mechanism itself (commit `539bc979c`) is CONFIRMED CORRECT AND
WORKING on real data — do not re-open. Live verification surfaced a fifth, pre-existing, and
now CRITICAL layer: `uninstall()`'s routing predicate chose bottle-vs-native based on TITLE
ATTRIBUTES rather than on WHERE THE TITLE IS ACTUALLY INSTALLED, and for Hoard's
then-dual-installed state this caused GameLib to delete the copy the user was NOT looking at
(the bottle copy) while leaving the represented copy (native) — and the "uninstalled" toast —
untouched. **This routing bug pre-dates today's other fixes; while delegation was a silent
no-op it was harmless, but the direct-deletion fix makes it real, silent data loss risk on the
wrong install.**

**OPERATOR PRODUCT DECISION — LOCKED, do not re-open or offer alternatives:** uninstall must
remove whatever the library entry's own `install.install_path` points at. This is the sole
routing source of truth for the UNINSTALL decision (not for install destination or launch
path, which may still legitimately use other attributes). If `install_path` doesn't resolve
inside any known root (bottle or any native Steam library folder from `libraryfolders.vdf`),
**refuse and report an error — delete nothing.** A dual-installed title losing only the
pointed-at copy is CORRECT, expected behavior, not a bug — the badge should legitimately stay
"installed" if another copy remains, and `install_path` must re-resolve to the surviving copy
on the next refresh so a second Uninstall click removes that one too. The success/toast
message must reflect what actually happened — never claim "uninstalled" while a represented
install remains.

## Environment

- Build: **Tauri dev** (`pnpm tauri:dev`) — Rust/Tauri shell + Node sidecar
- Store: **Steam**
- Install kind: **CrossOver/Wine bottle** (Windows-only Steam title) — AND, newly relevant,
  **native macOS install** (a title can have both simultaneously; Hoard did)
- Platform: macOS (darwin 25.5.0)
- Branch: `fix/steam-native-install-stability`

## Current Focus

hypothesis: "CONFIRMED and IMPLEMENTED per the operator's locked decision:
  uninstall()'s routing is now driven by the library entry's own recorded
  install.install_path, resolved and containment-checked against every
  known root (the CrossOver bottle's steamapps/common/, and every native
  Steam library folder from libraryfolders.vdf via getSteamLibraries()),
  never by title attributes (windows-only / bottle-eligible /
  forcedWindowsViaBottle / nativeBottleInstall). Those attributes still
  drive OTHER decisions (install destination, launch path, bridge routing,
  bottle-provisioned guided-setup) unchanged — only the bottle-vs-native
  UNINSTALL routing decision changed."
test: "Implemented and self-verified. 1) Confirmed via code read: uninstall()
  previously branched on isBottleEligible()/isBridgeEligible()/isBottleReady()
  only — no install_path check existed anywhere in the routing path. 2)
  Added resolveInstallRoot(installPath) (library.ts, exported) — resolves
  which known root (if any) an install_path sits inside, via the
  resolve()+relative() containment idiom (Phase 18), checking the bottle's
  steamapps/common/ (isMac-gated, pure string comparison — no
  isBottleProvisioned() dependency needed) then every getSteamLibraries()
  root's steamapps/common/. 3) uninstall() now reads
  library.get(appId)?.install?.install_path directly (NOT
  this.getGameInfo(), which has a fire-and-forget metadata-fetch side
  effect that a routing read must never trigger — caught by an existing
  D-01/D-02 no-sendFrontendMessage test going red) and routes: 'bottle' ->
  uninstallBottleGameDirectly(); 'native' -> the existing steam://uninstall
  delegation; null -> refuse, log a warning, return a
  'Refused to uninstall: install_path does not resolve inside any known
  root' stderr, delete nothing. isBridgeEligible() and the
  bottle-eligible-but-unprovisioned guided-setup check are kept as
  unconditional EARLY checks ahead of the install_path decision (bridge is
  a third, separately-modeled root out of this fix's scope; the
  unprovisioned-bottle case is orthogonal to WHERE install_path resolves)
  — both pre-existing behaviors regression-verified unchanged. 4)
  uninstallBottleGameDirectly() now re-verifies (via the same
  resolveInstallRoot(), reading library.get() directly) that the entry's
  install_path resolves inside the bottle root BEFORE consulting the ACF at
  all, aborting if not — kept alongside the pre-existing ACF-installdir
  containment check (different question, both kept). 5) Fixed the
  re-resolution gap for real: pollUninstallOnce() (library.ts) now checks
  the OTHER known root (bottle<->native; bridge intentionally excluded —
  separate root/mechanism) whenever the polled root goes 'absent', BEFORE
  declaring the title uninstalled. If a copy survives, install_path/
  install_size/platform are re-resolved to it immediately, is_installed
  stays true, and the badge is never forced to flip — this closes the exact
  gap found during investigation (refreshInstallState()'s own is_installed-
  diff-gated update would otherwise never notice the pointer needed to
  move). Verified directly with two new pollUninstallOnce() unit tests
  (library.test.ts) proving re-resolution actually happens in BOTH
  directions (bottle absent+native survives, and the inverse), plus a
  no-survivor regression test proving the original full-uninstall path is
  unchanged when genuinely gone everywhere. 6) Fixed the toast/status
  semantics: pollUninstallOnce()'s survivor branch sends
  gameStatusUpdate{status:'done'} (correct — the frontend's
  deriveInstallStatusKind derives the badge from is_installed once a
  non-active status arrives, so 'done' is right for both outcomes) but
  SKIPS the 'Game Uninstalled' notify() toast entirely when a copy
  survives — verified by an explicit notify-not-called assertion in both
  new survivor tests."
expecting: "MET. native-only titles route native (verified); bottle-only
  titles route bottle (regression-verified against the just-shipped direct-
  deletion mechanism, commit 539bc979c); attribute-vs-install_path conflict
  cases prove install_path wins in BOTH directions (two dedicated
  'ROUTING PROOF' tests); a dual-installed title has ONLY the install_path-
  pointed-at copy removed at the routing level (native root never even
  consulted when install_path points at bottle, and vice-versa) and, at the
  reconciliation level, badge correctly STAYS installed with install_path
  re-resolved to the survivor (verified both directions); a stale/absent/
  unresolvable install_path refuses and deletes nothing, RED-provably
  (assertions are on POSITIVE absence of readAcfState/shell.openExternal
  calls, which the pre-fix attribute-only routing would not have
  satisfied); the toast never overstates what happened (no notify() call
  when a copy survives)."
next_action: "IMPLEMENTED, self-verified: tsc --noEmit clean, eslint 0
  errors (pre-existing warning baseline unchanged), full steam suite
  1002/1002 (995 pre-existing + 7 new in games.test.ts describe
  'install_path-driven routing', 3 new pollUninstallOnce tests + 8 new
  resolveInstallRoot tests in library.test.ts), full repo suite 5561/5562
  (1 pre-existing unrelated skip), 0 regressions. Files changed: games.ts
  (uninstall()/uninstallBottleGameDirectly() routing), library.ts
  (resolveInstallRoot() new export, pollUninstallOnce() survivor-check),
  games.test.ts, library.test.ts. NOT committed — awaiting explicit
  instruction (see Resolution). Remaining: human verification of the fix in
  a real environment. Live repro material is scarce (Hoard is now
  native-only, single-copy) — a live dual-install re-test would require the
  operator to reinstall Hoard's bottle copy specifically (their
  time/bandwidth); DO NOT request that live run without asking first and
  being explicit about what it does. Self-verification (types/lint/full
  automated suite, including new RED-provable + dual-install re-resolution
  coverage) is complete and strong; a live end-to-end re-test is optional
  confirmation, not a blocking requirement, given how thoroughly the new
  routing/reconciliation logic is unit-tested."

## Prior art / adjacent known state

- `.planning/debug/uninstall-game-vanishes.md` — **different symptom** (uninstalled game
  vanishes from the list until refresh), parked 2026-07-22 pending the daemon
  rearchitecture. Its `refresh()` no-concurrency-guard finding is a separate, still-open
  question from the routing bug in this session — do not conflate.
- Temporary diagnostic logging (`cc4cfd89`, `library.ts`/`GlobalState.tsx`) still present,
  out of scope, do not revert this session.
- Known Tauri-shell traps (unported IPC, invisible sidecar console, hollow Electron stubs)
  — see Eliminated for the ones ruled out this session. `raiseFrontmostBottledProcess`'s
  `app.hide()` TypeError remains latent/unfixed, do not touch without asking.
- Bottle installs have a separate install-state source of truth from native Steam installs
  (ACF/appmanifest per root) — CONFIRMED, and now directly implicated: a title can have TWO
  valid, simultaneously-true ACF manifests (one per root), and prior to this session's fix
  the codebase never reconciled which one the library entry/UI was actually representing
  before acting on an uninstall.
- `FALLBACK_INSTALLDIR_PREFIX = 'app_'` — GameLib-authored bottle installs use this; not the
  discriminator for either the original symptom or the routing bug — orthogonal.
- `uninstallBridgeGame()` — direct deletion for the non-bottle "bridge" uninstall path.
- `uninstallBottleGameDirectly()` (formerly `uninstallBottleNativeGame()`) — direct deletion
  for bottle-eligible titles, generalized to cover ALL bottle titles this session.
  LIVE-CONFIRMED WORKING MECHANISM on real data (Hoard's bottle copy: clean removal,
  SharedDepots siblings intact, badge/poll/push chain correct). The deletion mechanics are
  proven sound; this round's fix is about WHICH root gets chosen, promoting install_path
  containment inside this function from optional to a required primary guard.
- `nativeBottleInstall` flag: provenance-only metadata, not used for uninstall routing
  (unaffected by this round — a different axis than bottle-vs-native routing).
- `dispatchToBottledSteam('uninstall', ...)` / `tellBottledSteamToUninstall()` — kept as a
  documented, deliberately unused-by-games.ts code path. Not implicated in the routing bug.
- ADJACENT DEFECT (not part of this fix): `appmanifest_2825840.acf` ("All Will Fall - Demo")
  orphan manifest, no files on disk. Out of scope, do not fix without asking.
- CONVERGENT INDEPENDENT EVIDENCE: concurrent session (34.13) landed `C-03` — write-side
  counterpart to this session's wine-engine fix. Unrelated to the routing bug.
- ADJACENT SIDE EFFECT: delegated verb dispatch can silently trigger a bottled-client
  self-update AND background updates of unrelated titles. Out of scope, flagged for
  install/launch follow-up.
- EXPLICIT NON-GOAL: cleaning up now-orphaned SharedDepots content after every referencing
  title is uninstalled — scoped to strict under-deletion safety only. Unaffected here.
- Two-install-paths hazard (native vs. bottle ACF location) is a KNOWN, PROJECT-LEVEL,
  PRE-EXISTING issue; this session's finding is a concrete, live-reproduced instance with
  real data-loss consequences now that direct deletion is real.
- **IMPLEMENTATION COMMITTED**: `539bc979c` ("fix(steam): own bottle uninstall directly
  instead of delegating to Steam") — committed by the operator directly, verified
  (302/302 on their machine at commit time). Correct and working for its scope; NOT a revert
  candidate. This round's routing fix lands on top of it.
- **PRODUCT DECISION LOCKED (this update)**: routing source of truth = `install.install_path`
  containment against known roots; refuse-and-report on no match; dual-install partial
  removal is correct/expected, not a bug; toast must not overstate. See Symptoms/Current
  Focus. Options "uninstall both" and "prompt the user" were explicitly considered and
  REJECTED by the operator — do not re-propose them.

## Evidence

(All evidence from the wine-engine, CW_USEDEFAULT, and direct-deletion-mechanism
investigation phases — preserved below unchanged — plus the routing-bug discovery entries at
the end. New evidence for the routing FIX itself should be appended below these, not
interspersed.)

- timestamp: 2026-08-15
  checked: src/backend/storeManagers/steam/games.ts uninstall()/uninstallBridgeGame()
  found: "All Will Fall" (appId 2706020) originally routed through
    tellBottledSteamToUninstall() -> dispatchToBottledSteam('uninstall', ...).
  implication: Confirmed the exact code path exercised originally.

- timestamp: 2026-08-15
  checked: src/backend/storeManagers/steam/library.ts pollUninstallOnce /
    startUninstallPolling / GRACE_TICKS
  found: GRACE_TICKS=20 at 3000ms = 60s grace window before reverting the
    badge if 'uninstalling' state is never observed.
  implication: Explains the original "shows uninstalling, then reverts"
    symptom shape when a delegated dispatch never actually acts.

- timestamp: 2026-08-15
  checked: "Operator's on-disk config + launcher.ts wine-engine routing"
  found: steamBottleConfigStore.wineVersion.type === "toolkit", not
    "crossover"; setupWineEnvVars routes 'toolkit' through WINEPREFIX
    (nonexistent on disk) instead of CX_BOTTLE.
  implication: Root cause of layer 1 — FIXED and LIVE-CONFIRMED; do not
    re-open.

- timestamp: 2026-08-15
  checked: "LIVE VERIFICATION #2 (post wine-engine-fix): Hoard uninstall
    attempt, gamelib.log + ps aux"
  found: Correct CrossOver engine now used; resident process tree exists;
    window-raise succeeds.
  implication: Layer 1 fix confirmed working. Uninstall still didn't
    complete — further layers existed.

- timestamp: 2026-08-15
  checked: "Bottled Steam's own bootstrap_log.txt"
  found: Cold/stale client burned the first post-fix dispatch on a
    ~177MB self-update-and-relaunch cycle instead of acting on the URI.
  implication: Layer 2 — cold-client URI loss, made moot for uninstall by
    the direct-deletion fix.

- timestamp: 2026-08-15T20:47Z-20:55Z
  checked: "TWO warm-retry discriminators against a fully warm, updated,
    CM-connected, logged-in bottled Steam client"
  found: URI received/executed promptly, but the confirm dialog is
    created at an off-screen CW_USEDEFAULT garbage position and produces
    zero downstream app-state effect — reproduces identically for Hoard
    (Steam-authored) as for 'All Will Fall' (GameLib-authored).
  implication: Layers 3/4 — CrossOver/Wine CW_USEDEFAULT rendering defect
    makes Steam's own confirm dialog permanently unreachable in this
    bottle, for any title. Fix direction: bypass entirely via direct
    deletion.

- timestamp: 2026-08-15T21:40:00Z
  checked: "Implementation + self-verification of the generalized
    direct-deletion fix"
  found: tsc clean, eslint 0 errors, steam suite 995/995, full repo suite
    5543/5544 (1 pre-existing unrelated skip), 0 regressions.
  implication: Fix code-complete and self-verified; live verification
    was the remaining open item.

- timestamp: 2026-08-15T21:50Z
  checked: "LIVE VERIFICATION #3 (operator, real Hoard bottle install,
    commit 539bc979c): gamelib.log backend trace + direct on-disk checks"
  found: "Backend trace clean end to end. On disk: appmanifest_63000.acf
    GONE from the bottle; common/Hoard GONE from the bottle. All seven
    sibling bottle titles + SharedDepots-adjacent content confirmed
    INTACT."
  implication: "CONFIRMS the direct-deletion mechanism itself is fully
    correct on real data. Do not re-diagnose the deletion mechanics."

- timestamp: 2026-08-15T21:51Z
  checked: "One second later: gamelib.log refreshLibrary trace"
  found: "Badge flips BACK to installed."
  implication: "NOT a refresh-race regression — the refresh is telling
    the truth (see next entry)."

- timestamp: 2026-08-15T21:52Z
  checked: "Direct on-disk + persisted-cache check for a SECOND,
    independent Hoard install location (native macOS Steam)"
  found: "Native install fully intact (574M, appmanifest present,
    StateFlags=4). Persisted library cache entry's install.install_path
    pointed at the NATIVE root all along — the copy the UI represented."
  implication: "ROOT CAUSE OF THE NEW LAYER: Hoard was dual-installed.
    uninstall() deleted the BOTTLE copy (title-attribute routing) while
    the library entry represented the NATIVE copy (install_path). Wrong
    root deleted; represented install and toast both misleading. Concrete
    instance of the project's known two-install-paths hazard, now with
    real data-loss consequences. IN SCOPE for this session."

## Eliminated

- hypothesis: "Unported/silently-failing Tauri sidecar IPC channel for
    'uninstall'." — IPC layer confirmed not the defect. 2026-08-15
- hypothesis: "Missing window-raise alone is sufficient to explain the
    revert symptom." — falsified live. 2026-08-15
- hypothesis: "Ownership/authorship is the discriminator for delegated
    uninstall failing." — falsified via the Hoard control case. 2026-08-15
- hypothesis: "A readiness-gate is sufficient, on its own, to fix
    delegated bottle uninstall." — falsified via two independent
    warm-retry discriminators. 2026-08-15T20:55Z
- hypothesis: "Delegating uninstall to the bottled Steam client is
    workable for AT LEAST genuinely Steam-authored titles." — falsified.
    2026-08-15T20:55Z
- hypothesis: "The badge flipping back to installed one second after a
    confirmed-clean bottle deletion is a refresh-race regression of the
    ORIGINAL symptom."
  evidence: "Direct on-disk + cache inspection proved the refresh was
    telling the truth: a separate, fully intact NATIVE install of Hoard
    exists. The real defect is upstream — uninstall() deleted the wrong
    root for a dual-installed title, not a refresh timing/race bug."
  timestamp: 2026-08-15T21:52Z
- hypothesis: "Correct dual-install semantics is to delete BOTH copies,
    or to prompt the user to choose."
  evidence: "OPERATOR PRODUCT DECISION, explicit and locked: uninstall
    removes only whatever install.install_path points at. Both
    alternatives (delete-both, prompt-user) were considered and
    explicitly REJECTED by the operator. Not open for re-litigation."
  timestamp: 2026-08-15T22:05:00Z

## Resolution

root_cause: "FIVE layers identified across this session:
  (1) FIXED, LIVE-CONFIRMED: wine-engine misrouting.
  (2) Cold-client URI loss — real, made moot for uninstall by (3)/(4)'s fix.
  (3)/(4) FIXED (bypassed): CrossOver/Wine CW_USEDEFAULT rendering defect
  makes Steam's own confirm dialog permanently unreachable in this bottle;
  direct filesystem deletion bypasses it. LIVE-CONFIRMED correct and
  working on real data (commit 539bc979c).
  (5) FIXED: uninstall()'s routing predicate selected bottle-vs-
  native/bridge by TITLE ATTRIBUTES, never by checking which root the
  library entry's own recorded install.install_path actually resolves
  into. For a dual-installed title (Hoard: native + leftover bottle
  copy), this deleted the WRONG copy while leaving the represented
  install and a misleading success toast in place. Concrete, live-
  reproduced instance of this project's known two-install-paths hazard,
  converted from harmless (pre-fix, delegation was a no-op) to real data
  loss by this session's own otherwise-correct direct-deletion fix. A
  SECOND, related gap was found and fixed during implementation:
  pollUninstallOnce()'s confirmed-absent branch unconditionally flipped
  is_installed:false and fired the 'Game Uninstalled' toast for ANY
  dual-installed title, even when a copy legitimately survived on the
  other root — this is the exact re-resolution risk the operator's
  decision flagged as a real risk to verify, not assume."
fix: "Layers (1) and (3)/(4)/mechanism: IMPLEMENTED, self-verified, LIVE-
  CONFIRMED (commit 539bc979c). Layer (5): IMPLEMENTED per the locked
  operator decision. New export resolveInstallRoot(installPath) (library.ts)
  is the sole source of truth for uninstall() routing — checks the
  CrossOver bottle's steamapps/common/ (isMac-gated, pure path-string
  containment, no filesystem access needed) then every getSteamLibraries()
  native library root's steamapps/common/, via the resolve()+relative()
  containment idiom (Phase 18); returns null when neither matches.
  uninstall() (games.ts) reads library.get(appId)?.install?.install_path
  directly (never this.getGameInfo(), to avoid its lazy metadata-fetch side
  effect) and routes 'bottle'/'native'/null accordingly, refusing and
  deleting nothing on null. isBridgeEligible() and the bottle-eligible-but-
  unprovisioned guided-setup checks remain unconditional EARLY checks ahead
  of this decision (out of scope — bridge is a third, separate root; the
  unprovisioned check is orthogonal to install_path). uninstallBottleGameDirectly()
  gained a PRIMARY guard re-verifying the entry's install_path resolves
  inside the bottle root before consulting the ACF at all (kept alongside
  the pre-existing, differently-scoped ACF-installdir containment check).
  pollUninstallOnce() (library.ts) now checks the OTHER known root
  (bottle<->native) whenever its polled source goes 'absent', re-resolving
  install_path/install_size/platform to a surviving copy and keeping
  is_installed:true (never forcing the badge to flip) instead of declaring
  the title fully uninstalled; the 'Game Uninstalled' toast is skipped in
  that case so the success signal never overstates what happened.

  LAYER (6), found BY the live verification of layer (5) and fixed in
  fa9051a9e: the survivor check above was PAIRWISE (bottle<->native) and
  excluded the bridge bottle on the reasoning that it owns its own
  uninstallBridgeGame()/markBridgeGameUninstalled() completion path. That
  holds for a bridge-INITIATED uninstall but does NOT make a surviving
  bridge copy invisible to a native- or bottle-scoped one. Live: HOARD was
  installed on ALL THREE roots simultaneously, so removing the native copy
  declared a complete uninstall and fired the toast while 277M survived in
  GameLibSteamBridge. pollUninstallOnce() now probes EVERY root except the
  one just uninstalled from, in a fixed order (native, bottle, bridge) so
  the re-resolved install_path is deterministic when more than one
  survives. Each probe is INDIVIDUALLY GUARDED: resolving the bridge root
  calls getBridgeBottleSettings(), which returns nothing when the bridge
  bottle was never provisioned — unguarded that threw straight out of the
  poller and broke uninstall completion entirely, including for users with
  no bridge bottle at all (it failed 5 pre-existing tests on the first
  attempt). An unreadable root cannot confirm a survivor either way, so it
  is logged and treated as absent."
verification: "Layers (1) and (3)/(4) mechanism: self-verified AND
  live-verified against real data — confirmed correct, do not re-open.
  Layer (5): self-verified — tsc --noEmit clean, eslint 0 errors (pre-
  existing warning baseline unchanged), full steam suite 1002/1002 (995
  pre-existing + new coverage: 7 new games.test.ts tests proving
  install_path-driven routing in both directions plus both required refuse
  scenarios RED-provably, 3 new pollUninstallOnce() tests in library.test.ts
  proving dual-install badge-stays-installed + install_path re-resolution
  in both directions plus a no-survivor regression guard, 8 new
  resolveInstallRoot() unit tests covering containment/traversal/multi-
  library/non-mac cases), full repo suite 5561/5562 (1 pre-existing
  unrelated skip, 0 regressions).

  LAYER (5) LIVE-VERIFIED 2026-08-15 22:36-22:39 on HOARD (63000), in two
  passes against a confirmed-fresh build (sidecar rebuilt 22:28:55,
  resolveInstallRoot present, reverted diagnostics absent — the first
  attempt was caught running a STALE build that predated the fix, so this
  was checked before trusting anything):
    Pass 1 (cancel, non-destructive): 'delegating uninstall for appId 63000
    via steam://uninstall/63000' + 'starting uninstall polling ... source
    native'. `source native` IS the discriminator — under the old
    attribute-based routing this exact title (bottle-eligible, mac_arch
    '32', forcedWindowsViaBottle) went to the BOTTLE. Native macOS Steam's
    dialog rendered normally (confirming the CW_USEDEFAULT defect is
    CrossOver-specific and delegation remains right on the native path).
    Cancelling left everything intact; the grace window timed out correctly.
    Pass 2 (confirm, destructive): native 574M copy and its manifest removed
    by Steam, poller completed in 3s, install_path RE-RESOLVED to a
    surviving copy. All seven other bottle titles and Steamworks Shared
    untouched throughout; the SharedDepots containment guard held on real
    data.
  The operator reported 'did not flip' — investigation proved the badge was
  CORRECT (a third copy survived) and surfaced layer (6) instead.

  LAYER (6): self-verified only — steam suite 1014/1014, tsc clean, eslint
  0 errors, new bridge-survivor test RED-proven against the pairwise check
  TWICE (before and after its mocks were finalised, since the test itself
  changed in between). The full-suite worker-teardown warning is pre-
  existing: neither library.test.ts nor games.test.ts emits it alone. NOT
  live-verified — its behaviour only triggers for a title on multiple
  roots, and HOARD is now bridge-only, so a live re-test would require
  reinstalling. Given the RED proof and that the guard fixed 5 real
  pre-existing failures, a live re-test is optional confirmation, not a
  blocking gate."
files_changed:
  - src/backend/storeManagers/steam/games.ts (prior rounds: wine-engine-
    adjacent work + the generalized direct-deletion uninstall routing —
    COMMITTED as 539bc979c; THIS ROUND, NOT YET COMMITTED: uninstall()
    routing rewritten to be install_path-driven via resolveInstallRoot();
    uninstallBottleGameDirectly() gained the primary install_path-vs-
    bottle-root guard)
  - src/backend/storeManagers/steam/bottle.ts (prior rounds — COMMITTED,
    unchanged this round)
  - src/backend/storeManagers/steam/electronStores.ts (prior round — COMMITTED, unchanged)
  - src/backend/storeManagers/steam/library.ts (prior round — COMMITTED;
    THIS ROUND, NOT YET COMMITTED: new export resolveInstallRoot() +
    isPathContainedIn() helper; pollUninstallOnce() gained the dual-install
    survivor check/re-resolution/toast-suppression logic)
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts (prior rounds — COMMITTED, unchanged)
  - src/backend/storeManagers/steam/__tests__/games.test.ts (prior rounds —
    COMMITTED; THIS ROUND, NOT YET COMMITTED: updated fixtures across 4
    existing describe blocks to give install_path values compatible with
    the new routing, plus a new describe 'install_path-driven routing'
    with 7 new tests — native-only, two ROUTING PROOF attribute-vs-
    install_path conflict tests both directions, bottle-only regression,
    dual-installed routing-only-touches-pointed-at-copy, stale/absent
    refuse RED-provable, outside-all-roots refuse RED-provable)
  - src/backend/storeManagers/steam/__tests__/library.test.ts (THIS ROUND,
    NOT YET COMMITTED: new describe 'resolveInstallRoot()' with 8 unit
    tests; new nested describe 'dual-install partial removal' under the
    existing pollUninstallOnce() suite with 3 tests proving re-resolution
    in both directions plus a no-survivor regression guard)

NOT COMMITTED: per the implementation task's instructions, no commit was
made — awaiting explicit instruction from the operator/orchestrator.
