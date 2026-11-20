---
task: 260822-dkf
title: "Stop the install poller's grace window killing the UI on slow native installs"
type: quick
branch: fix/steam-native-install-stability
area: backend/steam
severity: major
resolves_todo: .planning/todos/pending/2026-08-22-install-poller-grace-window-kills-ui-on-slow-native-installs.md
resolves_phase: 37
planned_as: 37-11
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts

must_haves:
  truths:
    - "A native depot install still streaming chunks past 60s never receives a terminal gameStatusUpdate 'done'"
    - "A native depot install still streaming chunks past 60s keeps polling (the loop is not torn down)"
    - "The steam://install handoff path still stops with 'done' after the grace window when the user cancels Steam's dialog"
    - "The finalize-time handoff poll start still applies isNativeHandoff/skippedDepots even when a download poll is already registered"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "in-flight-gated grace window + handoff flag upgrade in startInstallPolling"
    - path: "src/backend/storeManagers/steam/__tests__/library.test.ts"
      provides: "RED-proven regression pair + upgrade test"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts (grace branch)"
      to: "isNativeInstallInFlight (games.ts)"
      via: "per-tick call inside the setInterval callback"
---

<objective>
`library.ts`'s install poller stops itself and emits a TERMINAL `gameStatusUpdate { status: 'done' }`
after `GRACE_TICKS` (20 ticks ≈ 60s) whenever no manifest has appeared. That inference — "the user
dismissed Steam's install dialog" — is correct only when STEAM owns the download. On the native
depot path GameLib owns the download and deliberately writes the ACF only at finalize (D-08), so
`seenDownloading` cannot become true mid-download and EVERY native install slower than 60s is
reported to the UI as finished while chunks are still streaming.

Fix the grace window's provenance test, and fix the second-order collision that fixing it creates
(see D-02 below). No new status value, no change to `GRACE_TICKS`, no change to the uninstall poller.

Output: one gated conditional, one upgrade branch in `startInstallPolling`, and four tests.
</objective>

<context>
The defect is ALREADY FULLY ROOT-CAUSED and was observed live on real hardware on 2026-08-22.
DO NOT re-investigate, do not re-run the install to confirm it.

@.planning/todos/pending/2026-08-22-install-poller-grace-window-kills-ui-on-slow-native-installs.md

Everything below was verified by direct source reading on 2026-08-22 and is current at HEAD.
Re-read only what you edit.

## Verified source facts

- `src/backend/storeManagers/steam/library.ts:1834` — `const GRACE_TICKS = 20`. **Shared with the
  uninstall poller at `library.ts:2998`.** Do not change this constant.
- `src/backend/storeManagers/steam/library.ts:2679-2696` — the grace branch. Order inside the
  `setInterval` callback is: `entry.ticks++` → `MAX_TICKS` cap → `await pollInstallOnce` →
  `if (!activePolls.has(appId)) return` → grace branch. So the grace test runs per-tick and can
  read live state.
- `src/backend/storeManagers/steam/library.ts:2600` — `startInstallPolling` opens with
  `if (activePolls.has(appId)) return // idempotent`.
- `src/backend/storeManagers/steam/library.ts:38` — `isNativeInstallInFlight` is ALREADY imported
  into `library.ts` from `./games`, and already used at `library.ts:733`. No new import is needed.
- `src/backend/storeManagers/steam/games.ts:181` — `isNativeInstallInFlight(appId)` reads
  `nativeInstallsInFlight`, which is `.set()` at `games.ts:1551` (synchronously, as the native
  depot run is launched) and `.delete()`d in `runNativeDepotDownload`'s `finally` at
  `games.ts:1737`. It is therefore TRUE for the whole native download and still true at
  `games.ts:1720/1726` where the handoff poll is started.

## The four callers of startInstallPolling, and which one is defective

| Call site | flags | who downloads | grace window correct today? |
|---|---|---|---|
| `games.ts:1127` — `steam://install` OFF path | `isNativeHandoff` **false** | Steam client | YES — real cancel detection |
| `games.ts:1097` — bottled Steam client | `isNativeHandoff` **false**, `source:'bottle'` | bottled Steam client | YES — real cancel detection |
| `library.ts:477` — `resumeInterruptedSteamInstall` | `isNativeHandoff` **false** | **GameLib (native depot run starts right after)** | **NO — this is the defect** |
| `games.ts:1720/1726` — after the native download finished | `isNativeHandoff` **true** | GameLib, already done | YES |

`install()` calls `resumeInterruptedSteamInstall` at `games.ts:952`, which starts a bare
`startInstallPolling(appId)`; `install()` then continues into `installNative`. That is the poll the
log shows at 09:26:54 as `source native, isNativeHandoff false`, and it is the one that dies at 60s.

## D-01: the discriminator is `isNativeInstallInFlight`, NOT `isNativeHandoff`

The defect report's preferred fix direction ("gate the grace window on `isNativeHandoff`") is
**WRONG AS LITERALLY WRITTEN** and must not be implemented. Three of the four call sites leave
`isNativeHandoff` false, and two of those three are exactly the paths whose cancel detection the
grace window exists to provide. Gating on that flag would silently disable cancel detection for the
`steam://install` and bottle paths — the precise "contract broken through the INTERACTION of two
requirements" trap this repo has ledgered.

Use `isNativeInstallInFlight(appId)` instead. It means "GameLib's own depot download is running for
this appId right now", which makes "the user cancelled Steam's dialog" definitionally false. It is
the report's fix direction 2 (downloader liveness) reached through a registry that already exists.

**It must be evaluated per-tick inside the callback, never captured at poll-start time.** On the
resume path the flag is still FALSE when the poll is created (the resume runs before
`installNative` registers), and becomes true within the same tick. Capturing it at start would
reintroduce the defect.

## D-02: fixing the grace window creates an idempotency collision that MUST be fixed in the same change

Today the finalize-time `startInstallPolling(appId, { isNativeHandoff: true, skippedDepots })` at
`games.ts:1720/1726` succeeds **only because the grace window already killed the download poll** —
`activePolls` is empty by then. That is why the log shows two `starting install polling` lines for
appId 8930 (09:26:54 `isNativeHandoff false`, 09:38:17 `isNativeHandoff true`).

Once the download poll survives, that second call hits the idempotent early return and becomes a
silent no-op. The consequences, all verified at their readers:

- `library.ts:2351` — `poll?.isNativeHandoff === true` gates the StateFlags-1026 "waiting for Steam
  restart" interpretation. It would never be true, so a genuine handoff manifest is misread as an
  ordinary active download.
- `library.ts:2547` — the "Restart Steam to finish installing" `notify()` would never fire.
- `library.ts:2513-2529` — the `skippedDepots` completion notice would never fire, because
  `skippedDepots` never reaches the entry.

So `startInstallPolling` must UPGRADE an existing entry rather than no-op when called with
`isNativeHandoff: true`.

## D-03: the uninstall poller is NOT affected — do not touch it

`startUninstallPolling` has exactly one call site: `games.ts:2259`, inside the `root === 'native'`
branch, immediately after `await shell.openExternal(steam://uninstall/...)`. Steam owns that
uninstall, which is precisely the handoff shape the grace window was built for. The bottle path
uses `uninstallBottleGameDirectly()` and starts no poller at all. There is no GameLib-owned
uninstall path, so there is no equivalent defect. Leave `library.ts:2993-3025` and `GRACE_TICKS`
untouched, and say so explicitly in the SUMMARY.

## D-04: what `status: 'done'` actually does (confirmed at the reader, not assumed)

`src/frontend/state/GlobalState.tsx:1182` `handleGameStatus`: `'done'` is in the
`['error','done']` arm, which pushes a `newLibraryStatus` that has the appName **filtered out**
entirely, then calls `refreshLibrary`. The game therefore drops out of `libraryStatus` — the
DownloadManager item and the progress badge disappear, and the library refreshes from disk mid
download. That is the reported "died at about 4%".

(`src/backend/downloadmanager/downloadqueue.ts:418`'s `status === 'done'` arm is the DM queue's own
element-completion handler and is NOT driven by this poller — the poller calls `sendFrontendMessage`
directly. Do not change it.)

## Test-harness facts

- `src/backend/storeManagers/steam/__tests__/library.test.ts` does **NOT** `jest.mock('../games')`.
  It imports `* as gamesModule from '../games'` (line 81) and spies on named exports —
  `jest.spyOn(gamesModule, 'isNativeInstallInFlight')` is already used at line 2403 and works
  against `library.ts`'s own named-import call site. Use that exact pattern; do not add a
  `jest.mock` factory for `../games`.
- The existing grace test is at line 4785 (`emits gameStatusUpdate { status:"done" } after the grace
  window when no manifest ever appears (CR-01)`), in the
  `startInstallPolling() idempotency and stopInstallPolling()` describe block starting at line 4740.
  Its `beforeEach` sets `jest.useFakeTimers()` and seeds `library` with appId `'730'`.
  It calls `startInstallPolling('730', interval)` and advances `interval * 21`. It uses the REAL
  `isNativeInstallInFlight` (false — nothing registered), so it must keep passing unchanged.
- `existsSync` from `graceful-fs` is mocked file-wide (`jest.mock('graceful-fs')`, line 106);
  `sendFrontendMessage` and `notify` are mocked at lines 112 and 117.
- Jest here is **ts-jest transpile-only** — type errors do not fail tests. Types are checked
  separately with `npx tsc --noEmit -p .`.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the four tests and PROVE RED before touching library.ts</name>
  <files>src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    Add to the `startInstallPolling() idempotency and stopInstallPolling()` describe block
    (starts line 4740), immediately after the existing CR-01 test at 4785.

    Declare a `jest.SpyInstance` for `isNativeInstallInFlight` in the block and `mockRestore()` it
    in `afterEach`, so no test leaks a mocked registry into the CR-01 test or the bottle tests
    below it.

    **Test A (MUST BE RED AT HEAD) — a live native download survives the grace window.**
    - `(existsSync as jest.Mock).mockReturnValue(false)` — GameLib has not written the ACF yet,
      which is D-08's deliberate behaviour, not an absent install.
    - `jest.spyOn(gamesModule, 'isNativeInstallInFlight').mockReturnValue(true)` — the depot run is
      streaming chunks right now.
    - `startInstallPolling('730', 10)`; advance `10 * 21` (past GRACE_TICKS).
    - Assert `sendFrontendMessage` was NOT called with a `gameStatusUpdate` whose `status` is
      `'done'` for `'730'`.
    - Assert the loop is STILL RUNNING, behaviourally: capture the `existsSync` call count, advance
      another `10 * 5`, and assert the count strictly increased. Do not assert on `activePolls` or
      on `clearInterval` — assert that ticks keep happening.

    **Test B (GREEN at HEAD, must STAY GREEN) — the interaction pin.** The `steam://install` /
    bottle path keeps its cancel detection. Same fixture as Test A except
    `isNativeInstallInFlight` is spied to return **false** (spy explicitly rather than relying on
    ambient state, so the pin cannot pass by accident). Assert `sendFrontendMessage` WAS called with
    `gameStatusUpdate` / `status: 'done'` after `10 * 21`. Comment it as the pair-partner of Test A
    and name what it protects: the grace window's original purpose.

    **Test C (MUST BE RED AT HEAD) — the handoff upgrade (D-02).** Deliberately does not depend on
    the Test A fix:
    - `isNativeInstallInFlight` → true; `startInstallPolling('730', 10)` (bare, download poll).
    - BEFORE advancing past the grace window, call
      `startInstallPolling('730', { intervalMs: 10, isNativeHandoff: true, skippedDepots: [] })`.
    - Drive `readAcfState` to the `installed` shape the way the neighbouring tests in this file
      already do (`existsSync` true + the mocked VDF parse returning an installed manifest — copy
      the exact fixture shape from the nearest existing `installed` test rather than inventing one).
    - Advance one tick and assert `notify` fired with the `steam.waitingForSteam.notify` /
      "Restart Steam to finish installing" body — the observable proxy for
      `entry.isNativeHandoff === true` at `library.ts:2547`.

    **Test D (GREEN at HEAD, must STAY GREEN) — no downgrade, no second interval.** After the
    upgrade call in Test C's setup shape, a subsequent bare `startInstallPolling('730', 10)` must
    NOT clear the handoff flag, and `setInterval` must still have been called exactly once across
    all three calls. (The existing test at line 4764 already pins single-interval for two bare
    calls; this one pins it across an upgrade.)
  </behavior>
  <action>
    FIXTURE INTEGRITY — this is the load-bearing part of the task. Four fixtures in this codebase
    have gone green against a live defect TODAY by encoding the same wrong assumption as the code
    under test. A fixture that only drives `entry.ticks` past the threshold reproduces nothing: it
    tests the arithmetic, not the provenance. Test A's fixture must represent a REAL native install
    in flight — BOTH halves, no manifest on disk AND the download registered as live — because the
    defect is precisely that the code cannot tell those two states apart. If you find yourself able
    to make Test A pass without changing the grace condition, the fixture is wrong.

    Run Tests A and C against unmodified `library.ts` FIRST and capture the failure output verbatim.
    Do not begin Task 2 until you have observed A and C fail and B and D pass. Paste that RED output
    into the SUMMARY. A test authored after the fix, or a fix authored before the RED run, does not
    satisfy this task.

    Do not modify the existing CR-01 test at line 4785 and do not modify the idempotency test at
    line 4764 — if either goes red, the fix is wrong, not the test.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "startInstallPolling" 2>&1 | tail -40</automated>
  </verify>
  <done>Tests A and C fail at HEAD with output captured; tests B and D pass at HEAD; no pre-existing test in the file changed.</done>
</task>

<task type="auto">
  <name>Task 2: Gate the grace window on native-download liveness and make the handoff start upgrade a live poll</name>
  <files>src/backend/storeManagers/steam/library.ts</files>
  <action>
    Two edits in `src/backend/storeManagers/steam/library.ts`. No new imports —
    `isNativeInstallInFlight` is already imported at line 38.

    **Edit 1 — the grace branch (~line 2685).** Add `!isNativeInstallInFlight(appId)` to the
    condition, called inside the callback so it is re-evaluated every tick (see D-01: the flag is
    false when the resume path creates the poll and becomes true a moment later). Replace the
    existing "user probably cancelled Steam's install dialog" comment block with one that states
    the provenance rule: the cancel inference is valid only when STEAM owns the download; on the
    native depot path GameLib owns it and writes the ACF only at finalize (D-08), so an absent
    manifest carries no cancellation signal at all. Name this quick task id in the comment.

    Add a single suppression log at the exact tick where the window would otherwise have fired
    (`entry.ticks === GRACE_TICKS` and the install is in flight) so this is diagnosable from a log
    without spamming every subsequent tick. `logInfo`, LogPrefix.Steam, naming the appId.

    Do NOT introduce a new status value, do NOT emit any terminal status from this branch for a live
    install, and do NOT change `GRACE_TICKS` (D-03: it is shared with the uninstall poller, which is
    not defective).

    Note in the comment, or verify and leave alone, that no `entry.ticks` reset is needed when the
    download completes: `pollInstallOnce` runs before the grace branch on every tick and will either
    set `seenDownloading` or stop the poll once GameLib's finalize has written the manifest, so the
    only way the grace branch fires after a completed native run is a run that produced no manifest
    at all — which is a correct stop.

    **Edit 2 — `startInstallPolling`'s idempotent early return (~line 2600).** Before returning,
    handle the upgrade case: if an entry already exists AND the incoming options carry
    `isNativeHandoff: true`, set the existing entry's `isNativeHandoff = true` and adopt the
    incoming `skippedDepots` (only when the existing list is empty — never discard a non-empty one),
    log the upgrade, then return WITHOUT creating a second interval. Every other repeat call stays a
    pure no-op, including a bare call arriving after an upgrade, which must never downgrade the flag
    back to false. Document why this exists: before this change the finalize-time call at
    `games.ts:1720/1726` only ever ran against an EMPTY registry because the grace window had
    already killed the download poll, and Edit 1 removes that accident (D-02) — without this,
    `library.ts:2351`'s 1026 handoff interpretation, `library.ts:2547`'s restart notify, and the
    `skippedDepots` notice all silently stop firing.

    Update `startInstallPolling`'s JSDoc "Stops automatically when:" list so the grace bullet states
    the in-flight exception, and note the upgrade behaviour in the idempotency sentence.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/library.test.ts 2>&1 | tail -30 && npx tsc --noEmit -p . 2>&1 | tail -20</automated>
  </verify>
  <done>Tests A-D all pass; the whole `library.test.ts` suite is green with no pre-existing test modified; `npx tsc --noEmit -p .` reports no new errors.</done>
</task>

</tasks>

<verification>
1. `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` — green, and the count of
   passing tests is the previous count plus exactly the four added.
2. `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` — green. `games.ts` is not
   edited, but its `startInstallPolling` call-shape assertions (lines 2009-2044, 2662, 3321, 3414)
   are the contract Edit 2 touches.
3. `npx tsc --noEmit -p .` — no new errors. Jest is transpile-only and will not catch type breakage
   in the upgrade branch.
4. Confirm by reading the diff that `GRACE_TICKS` (line 1834) and `startUninstallPolling`
   (lines 2936-3030) are byte-identical to HEAD.
5. Do NOT run `prettier --check` as a gate — it is RED repo-wide here. Never sweep formatting into
   this commit.

## OUT OF SCOPE — operator live gate

A green suite does not close this defect. The live gate is deliberately NOT part of this plan and is
handed to the operator:

> Start a native install of a title that takes longer than 60 seconds and confirm the UI keeps
> reporting progress past the 60s mark, continuously, through to completion.
> Proven >60s installs on this machine: appId **8930** (Civilization V) and **49520**
> (Borderlands 2). Watch for the `install polling ... stopped after grace window` warning — it must
> NOT appear for a live native install — and confirm the DownloadManager item does not vanish at
> ~60s.

Record it in the SUMMARY as an open operator gate. Do not attempt it autonomously, and do not mark
the todo resolved on the strength of the unit suite alone.
</verification>

<success_criteria>
- Tests A and C were observed RED at HEAD before any `library.ts` edit, with the output captured in
  the SUMMARY.
- A poll for an appId with a live native depot download never emits `status: 'done'` at
  `GRACE_TICKS` and keeps ticking.
- A poll with no live native download still stops with `status: 'done'` at `GRACE_TICKS` — the
  cancel detection the window exists for is intact (Test B).
- The finalize-time handoff start upgrades a live poll instead of no-opping, and never creates a
  second interval (Tests C, D).
- `GRACE_TICKS`, `startUninstallPolling`, `games.ts`, and the frontend are unmodified.
- The operator live gate is recorded as OPEN in the SUMMARY.
</success_criteria>

<commit_discipline>
- Stay on `fix/steam-native-install-stability`. No branching, no worktrees (the repo's
  `.husky/post-checkout` hook hard-blocks them).
- **NEVER `git stash`** — it has stranded concurrent sessions' work in this repo twice.
- Run `git status --short` before every commit and inspect it. Another session may be working in
  this tree.
- Commit ONLY by explicit path:
  `git commit src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts -m "..."`
- Do NOT use `gsd-sdk query commit` (it stages the entire tree) and do NOT use `git add -A`.
- Two commits, matching the RED/GREEN split:
  `test(37-11): pin that a live native install survives the poller grace window`
  `fix(37-11): gate the install poller grace window on native download liveness`
</commit_discipline>

<output>
Create `.planning/quick/260822-dkf-stop-the-install-poller-grace-window-kil/SUMMARY.md` when done.
It must contain: the captured RED output for Tests A and C; an explicit statement that the
uninstall poller and `GRACE_TICKS` were left untouched and why (D-03); and the operator live gate
recorded as OPEN.
</output>
