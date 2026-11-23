---
created: 2026-11-24T00:00:00.000Z
title: "Bottle port: quirks copied from the TS for parity, and the hardening deltas, each its own change"
area: engine
files:
  - src-tauri/crates/gamelib-engine/src/bottles/ (marker.rs, switch.rs, lifecycle.rs, fallback_bottle.rs, paths.rs)
  - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/deltas.json
  - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/cases.json
  - src-tauri/crates/gamelib-engine/tests/fixtures/golden/switch/cases.json
  - src/backend/enginewine/twin.ts (the sync read twins of the same rules)
severity: minor
platform: any
ready: code
---

## Problem

Phase 87 ported the bottles, ledger and engine switch (87-38 to 87-41) and deleted the TS (87-43). D-16 says a port
copies behaviour for parity and never mixes a fix into the same change, so every quirk the port copied is listed here
with the golden case that pins it. Each one is a candidate for its own change, with its own golden delta; none of them
was changed by the port. The hardening deltas the port did make (D-19) are listed after, with the case that shows
them, so the two kinds stay apart.

## Quirks copied for parity (the Rust goldens pin each)

1. **An unreadable engine marker is overwritten, not kept.** `reconcile` and `record_pinned` rewrite a
   `.gamelib-engine.json` whose bytes are not a JSON object; only a marker a newer build wrote (version above 1) is
   never touched. The 87-38 plan's own wording ("kept, never reset") contradicted the goldens it also required, and
   the goldens won (`deltas.json` `unreadable-marker-is-rewritten-as-the-ts-did`; cases `reconcile-marker-unreadable`,
   `record-pinned-over-unreadable-overwritten`, `unreadable-marker-rewritten-to-pin`,
   `unreadable-marker-rewritten-to-crossover`). Flagged for review in 87-38.
2. **A `crossover` marker contradicted by a DXVK-macOS file reads as the current pin** (76 CR-01): the views, the
   reconcile and the switch all treat the bottle as pinned and rewrite the marker (`views-crossover-contradicted`,
   `reconcile-crossover-contradicted`, `crossover-contradicted-to-pin-rewrites-marker`,
   `crossover-contradicted-to-crossover`).
3. **A game that is running refuses even a same-engine request**, while a busy bottle lets a same-engine request
   through, so the two refusals answer the same input differently (`game-running-refused-even-for-same-engine`,
   `game-running-starting-refused`, `bottle-busy-same-engine-proceeds`, `bottle-busy-ignores-the-callers-own-key`).
4. **A newer marker lets a same-engine request through but refuses any change** (`newer-marker-same-engine-proceeds`,
   `newer-marker-refused-to-crossover`, `newer-marker-refused-to-wine-manager`, `newer-marker-forced-gate-refuses-change`).
5. **`isBottleProvisioned` does not sanitise its name** (a parent-traversal name answers from the path it builds); the
   op that renderer-derived names reach does (T-87-36), the library function does not, as the TS did
   (`provisioned-parent-traversal-name`).
6. **`sanitizeBottleName` returns the trimmed name**, and the callers differ on whether they compare it with the name
   they were given: the CrossOver create refuses a padded name, the path builders accept the trimmed one
   (`create-crossover-padded-name`, `views-unsafe-and-absent-names`).
7. **A bottle with no marker is classified from files on disk** (a `current_dxvk-macOS` file, a `Timestamp` in the
   `cxbottle.conf`), and an old (pre-61) bottle with no conf is treated as a plain prefix that the switch leaves alone
   (`views-nomarker-*`, `reconcile-nomarker-*`, `nomarker-crossover-timestamp-to-pin`,
   `legacy-pre61-bottle-crossover-untouched`, `legacy-pre61-bottle-pin-untouched`, `legacy-pre61-conf-less-prefix-pin`).
8. **A restore to CrossOver whose DXVK source is the pin refuses with `no DXVK source to restore` when the pin is not
   installed**, and the caller downloads the pin and asks again: Rust downloads no engine yet (87-41, 87-42,
   `prepareBottle.ts`). This is a copied shape of the TS switch, which asked its `ensurePinEngine` callback in the same
   place (`pin-to-crossover-restore-source-unavailable`, `pin-to-crossover-healthy-restore-from-marker-copy-pin-absent`).
9. **The switch never registers a selection by itself**: the callers did (the TS) and still do, through
   `register_selection` (`PrepareArgs`), so a refusal on a built-in engine keeps launching on the selection that was
   set before the switch (87-40 and 87-42 decisions; the goldens' logs carry no registry line).
10. **A failed DXVK install is recorded as `dxvk: 'failed'` in the marker and retried on the next launch**, and a
    retry that fails again leaves the marker as it was (`dxvk-failed-retry-same-engine`, `dxvk-failed-retry-fails-again`,
    `dxvk-failed-to-crossover-restores`).
11. **The running-games ledger keeps each bottle's keys in marking order** because `gamesRunningIn`'s golden order is
    the TS `Set`'s insertion order (87-38 decision; `ledger-mark-and-query`).

## Hardening deltas the port made (D-19, each recorded and each replayed)

- The guarded removal goes through the safety guard with the Bottles directory as the trust root, so a bottle that is
  a symlink to a sibling is unlinked and its referent untouched (`deltas.json` `removal-goes-through-the-safety-guard`;
  `remove-created-symlinked-bottle`, `remove-created-inside-root-sibling-untouched`, `remove-created-refused-names`).
- The conf and removal-refusal log lines name the bottle, not its profile path, T-86-15 (`deltas.json`
  `conf-log-lines-name-the-bottle-not-its-path`, `removal-refusal-names-the-bottle-not-its-path`).
- The version gate is answered in process and cannot fail, so the "Rust could not be asked" warning has no
  equivalent (`deltas.json` `gate-is-in-process-and-cannot-fail`; the three `*-gate-rejected` cases replay through an
  injected gate).
- A failed spawn reports the runner's stderr, not Node's `String(error)`; an installer that fails answers a bool and
  only a panic is caught with the TS wording (`deltas.json` `spawn-failure-text-is-the-runners-not-nodes`,
  `installer-answers-a-bool-and-a-throw-is-a-panic`; `kill-spawn-throws-false`, `create-fallback-installer-throws`).
- `create_fallback_bottle` refuses an unclean name outright; the TS had no check of its own, so `a/b` would have run
  wineboot at a path outside the Bottles root (a Rust unit test, no golden case: the TS had no behaviour to record).
- An engine named by the sidecar must have its Wine and wineserver inside the pinned-engine root or `<tools>/wine`, and
  its DXVK inside the pinned-engine root (T-87-82; Rust unit tests).
- `engine_bottle_is_provisioned` answers false for a name the sanitiser rejects (T-87-36; Rust unit test).

## Differences the port introduced (not copied, found in 87-42)

- A fallback creation's cancel that lands before Rust has registered the cancel id is lost and the creation runs to its
  end (documented in `fallbackBottleCall.ts`; the TS aborted the spawn at once).
- The monitor phase is read once before the switch call instead of at the busy check; Rust's own ledger check still
  refuses a game that starts in between.
- `getBridgeBottleSettings`' CrossOver settings are computed before the call for a switch to CrossOver, where the TS
  computed them lazily during the restore (the registered selection they read is unchanged by the switch).

## Why it is parked

None of these is a live defect: each is what released builds already did, and the goldens keep Rust honest to it. A fix
changes a recorded behaviour, so it needs its own change with its own golden delta (D-16), after a decision on which
way the behaviour should go (items 1, 3 and 4 are the ones that read as bugs).

## If it ever matters

Pick one item, change the Rust, regenerate that case's golden with a `deltas.json` entry that says why, and keep the
change to that one item. Do not fold a fix into a port or a rename.

## Resolution

Closed 2026-11-24 by quick task 261124-8f3 (commits 79c2a372e and 476235530).

1. Kept, closed as intended: a marker whose bytes are not a JSON object carries no information, so rewriting it from
   the on-disk classification is a repair; the 87-38 plan's wording ("kept, never reset") was the wrong part, and
   `deltas.json` `unreadable-marker-is-rewritten-as-the-ts-did` already records it. A marker a newer build wrote is
   still never touched.
2. Kept, closed as intended: 76 CR-01 and its review fix WR-01 made this deliberate. A DXVK-macOS file in the bottle
   is stronger evidence of what the bottle runs than a crossover marker (CR-01: a Staging bottle gains a CrossOver
   Timestamp when CrossOver probes it), so the switch distrusts the marker and the views read the bottle the way the
   switch does (WR-01).
3. Kept, closed as intended: the running check reads the caller's own title's phase (`getMonitorPhase(key)`), so
   refusing means refusing to re-prepare a title that is already starting or running; the bottle-busy check is about a
   different title in the same bottle, which a same-engine request does not disturb. The asymmetry is principled.
4. Kept, closed as intended: deliberate design (quick 261109-w52): never overwrite a newer build's marker, but do not
   block same-engine launches.
5. Fixed in 79c2a372e: `engines::is_bottle_provisioned` and the twin `isBottleProvisioned` answer false for a name the
   sanitiser does not leave unchanged; `provisioned-parent-traversal-name` edited, the shared vector
   `provisioned-parent-with-conf-in-crossover-dir` flipped and three vectors added; `deltas.json`
   `provisioned-answers-false-for-an-unclean-name`. Not changed: `.` is clean to the sanitiser (87-11 finding 3), so it
   still builds the Bottles root and reads false only because no conf sits there.
6. Fixed in 476235530: in gamelib-engine the only caller that used the trimmed answer was the prefix resolver's
   CrossOver branch, whose name the launch step, `tool_settings` and `is_bottle_provisioned` build paths from; it and
   its TS twin `gamePrefix.ts` now keep a stored name only when it is clean and otherwise fall back to `GameLib`, as an
   unsafe name already did (new case `resolve-prefix-crossover-padded-bottle-refused`, `deltas.json`
   `prefix-refuses-a-padded-bottle-name`; `create-crossover-padded-name` and `views-unsafe-and-absent-names` were
   already the refusing side and are unchanged). The sanitiser still returns the trimmed name (31 shared vectors).
   Still taking the trimmed answer, outside this todo because they are the Steam bridge's own code that Phase 96 moves
   (`engineWineShimSchedule` twin rows, `deletedBy: 96`): `steam/provisionBottle.ts:207`,
   `steam/bridgeBottleLifecycle.ts:630`, `steam/bridge/bridgeConfig.ts:174`, `steam/bridge/shimPlacement.ts:245`,
   `steam/bridge/shimGenerate.ts:168`, `steam/bridge/drm/stageDrmBottle.ts:116` (all under
   `src/backend/storeManagers/`).
7. Kept, closed as intended: design. Classifying a marker-less bottle from its files is how pre-marker bottles are read
   at all, and a pre-61 conf-less prefix is not a GameLib bottle for the switch to change.
8. Kept, closed as intended: not a quirk fix. It waits on Rust gaining engine download (future work); until then the
   caller downloads the pin and asks again.
9. Kept, closed as intended: design. Registering a selection belongs to the caller (`register_selection`,
   `PrepareArgs`), which is what keeps a refusal from changing the selection a launch runs on.
10. Kept, closed as intended: design. A failed DXVK install is recorded and retried at the next launch; a retry that
    fails again changes nothing.
11. Kept, closed as intended: design. Marking order is the order `gamesRunningIn` answers in, and nothing depends on
    another order.

The hardening deltas and the differences the port introduced were not quirks and are unchanged.
