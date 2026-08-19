# Deferred Items — Phase 23

## `pnpm test:ci` exits 1 after all tests pass (pre-existing, out of scope for 23-02)

**Found during:** 23-02 Task verification (`pnpm test:ci` full-suite gate).

**Symptom:** Jest reports `Test Suites: 78 passed, 78 total` / `Tests: 1421 passed, 1421 total`
(every assertion passes), then the process fails to exit cleanly and crashes ~1s later with:

```
Jest did not exit one second after the test run has completed.
TypeError: Cannot read properties of undefined (reading 'map')
    at readAcfState (src/backend/storeManagers/steam/library.ts:721:52)
    at pollInstallOnce (src/backend/storeManagers/steam/library.ts:820:20)
    at Timeout._onTimeout (src/backend/storeManagers/steam/library.ts:951:9)
```

This is a stray `setTimeout`/polling timer left running by some test in
`library.test.ts` (Phase 21's `pollInstallOnce`/`readAcfState`/`startInstallPolling`
poller) that fires after the Jest process believes the run is complete, at which
point a mocked module dependency (`getSteamLibraries`) has already been torn down —
hence the `undefined.map` crash. It causes `pnpm test:ci` to exit with code 1 even
though every test passed.

**Why out of scope for 23-02:** `library.ts`'s poller functions and `library.test.ts`
are not in this plan's `files_modified` list, were not touched by any of the three
tasks (`canWriteFullOwnership`, `finalizeToSteam` de-gating, `manifest.ts` buildid
guard), and the scope-boundary rule ("only auto-fix issues DIRECTLY caused by the
current task's changes") applies. This class of "poller keeps running past test
teardown" behavior is a known Phase 21 area (`pollInstallOnce`/`readAcfState`) —
see `.planning/phases/21-steam-native-install/21-08-PLAN.md` for the poller's
history — not something 23-02 introduced.

**Verification that it's pre-existing, not a regression:** the crash trace involves
only `library.ts` internals never edited by 23-02 (`depot.ts`, `depot/manifest.ts`,
`nativeInstallSetting.ts`, and their respective test files were the only files
touched). All 1421 individual test assertions pass before the crash — it is a
teardown/process-exit issue, not a functional test failure.

**Recommendation:** Track as a separate fast-task or fold into a future
`library.test.ts` cleanup pass — likely needs a `jest.useFakeTimers()` +
`jest.clearAllTimers()` (or an explicit `stopInstallPolling`/interval-clear call
in `afterEach`) around whichever test starts `pollInstallOnce`'s interval without
stopping it.

## Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01) — UNGATED 2026-08-19 (branch 2 confirmed)

**Found during:** 23-04 Gate 2 Attempt 1 (KCD2, appId 1771300), diagnosed by
23-09's observability-only fix.

**Symptom:** KCD2's install aborted entirely because Steam returned `EResult 40
(Blocked)` for depot 1771304's decryption key. GameLib had selected 1771304 via
the package-ownership gate (`select.ts:174`), but owning a depot does not
guarantee Steam will issue its key — for region/DRM-gated depots, Steam
re-checks at key-request time and can return `Blocked` even for an owned
depot. `classifyDepotError` treats EResult 40 as non-retryable and fails the
WHOLE install (`depotErrors.ts`), rather than skipping a non-essential blocked
depot and continuing.

**Why out of scope this cycle:** User-locked decision (23-09-PLAN.md
objective): diagnostic + observability ONLY this cycle. Required-vs-optional
depot classification at selection time is an explicit non-goal — 23-09
shipped only a dedicated Blocked classification (`steam.download.error.depotBlocked`)
and a failure-site log naming the depot, so whatever the diagnostic finds, the
next occurrence is legible. No change to `select.ts`, to
`NON_RETRYABLE_ERESULTS`, or to any retry/abort behavior.

**The two branches the diagnostic decides** (23-10 Task 3 runs it — install
KCD2 in the OFFICIAL Steam client on this same account/region and observe
whether depot 1771304 downloads):

1. **Official Steam client ALSO cannot fetch depot 1771304** ⇒ genuine
   region/account block. Close `G-23-01` as not-a-bug — GameLib's
   fail-the-whole-install behavior is correct; there is no depot to skip
   because the official client can't get it either.
2. **Official client installs KCD2 fully** (silently skipping or substituting
   for 1771304, or the depot isn't actually required) ⇒ GameLib
   over-selection / hard-fail defect confirmed. Follow-up work: introduce a
   required-vs-optional depot distinction at selection time in
   `depot/select.ts`, plus a skip-and-warn path (continue the install, warn
   the user which depot was skipped) instead of a whole-install abort on a
   Blocked key for a non-essential depot.

**GATE RELEASED 2026-08-19 (23-10 Task 3b) — branch 2 confirmed. This work is now
UNGATED and should be planned as its own gap cycle.** The verdict was read from the
official client's own artifacts rather than a fresh install (operator-sanctioned; a
re-run would regenerate the identical manifest and log lines). Evidence, all from the
`GameLibSteam` CrossOver bottle's real Valve Windows client — the only official client
that can install this Windows-only title — on the **same account** (`LastOwner` byte-identical
to the macOS `appmanifest_1124300.acf`; value withheld per T-23-37):

- `steamapps/appmanifest_1771300.acf` (mtime 2026-08-15 20:47): `StateFlags "4"`,
  `SizeOnDisk "96422090071"` (~90G, matches `du` on `common/KingdomComeDeliverance2`),
  `buildid "23914554"`, `InstalledDepots` = **1771302, 1771303, 1771306**. Depot
  **1771304 is ABSENT** — the official client installed KCD2 **completely without it**.
- `logs/content_log.txt`, spanning 2026-07-11 → 2026-08-15 (i.e. covering the whole
  install): **zero** occurrences of `1771304`, against 1771302 ×3, 1771303 ×5966,
  1771306 ×3. The official client never even *requested* 1771304's decryption key.

So depot 1771304 is **not required** for this account/region/platform, and GameLib's
whole-install abort on its Blocked key is a genuine over-selection + hard-fail defect,
not a region block. `G-23-01`: `severity: major`, `status: open`.

**Honesty limit:** this proves 1771304 is not *needed*; it does NOT prove Steam would
have issued its key to the official client, which never asked. That distinction does not
change the disposition — the decision rule turned on whether the official client completes
without the depot, and it does.

**A suspected second divergence was raised, then DISPROVEN 2026-08-19 — this follow-up is
NARROWER than it briefly appeared.** Because the official client installs depot **1771306**
(13,650,395,848 bytes) and 23-UAT.md's Gate 2 Attempt 1 narrative doesn't mention it, it looked
as though GameLib's selection might differ from Steam's in *both* directions. A live plan-build
selection census settled it:

```
Steam depot selection: os=windows arch=64 language=english branch=public -> depots
  [1771302(size=199419496), 1771303(size=82572274727),
   1771304(size=735856088), 1771306(size=13650395848)]
Steam depot selection: selectAllDepots union across base + DLC apps -> 4 depot(s)
```

**GameLib DOES select 1771306**, at a size byte-identical to the official client's
`InstalledDepots` entry — it was merely never reached before the 1771304 abort. The false
inference read Attempt 1's list of depots whose *keys were resolved* as the *selected* set.

**Consequences for this work — all of them narrowing:**
- **No depot-enumeration gap, no silently-incomplete-install risk.** Scope stays "don't hard-fail
  on a Blocked key"; it does NOT expand to "select depots we currently miss".
- **GameLib's selected set minus 1771304 equals Steam's installed set EXACTLY**, so skip-and-warn
  is provably sufficient for this title rather than merely plausible.
- **Classification machinery already exists and works.** `selectDepots` already filters on
  `oslist`/`osarch`/`language` and logs every skip with its reason (verified in the same census:
  1771305 czech, 1771307 french, 1771308 german, 1771309 japanese, 3118101 spanish all correctly
  skipped). This work extends an existing filter with a required-vs-optional axis rather than
  building classification from nothing.

**Scope when planned:** introduce a required-vs-optional depot distinction at selection time
in `depot/select.ts`, plus a skip-and-warn path (continue the install, warn the user which
depot was skipped) instead of a whole-install abort on a Blocked key for a non-essential
depot — and reconcile GameLib's selected depot set against the official client's for this
title in both directions.
