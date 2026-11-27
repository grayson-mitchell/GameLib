---
created: 2026-11-24T10:00:00.000Z
title: "The CrossOver trial notice has no dismiss control and its Buy CrossOver button is not logged"
area: engine
files:
  - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx (:29-38, the in-page trial notice and its Buy button)
  - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md (item 2, the contract text that implied a dismiss)
severity: minor
platform: any
ready: human
---

## Problem

In the 87-59 live gate (2026-11-24), item 2's trial notice read "CrossOver trial: 5 days remaining. When the trial ends,
GameLib will switch this game to its built-in engine (best-effort)." It is an in-page notice (not a toast) with a Buy
CrossOver button and no dismiss control. The 87-HUMAN-UAT contract text implied a dismiss. Pressing Buy CrossOver writes no
log line, so a click on it cannot be confirmed from `gamelib.log`.

The two dismissable engine notices were already dismissed in the notices store, so the owed 56c-3 check (dismissal handled by
Rust alone) was not run.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Decide whether the trial notice should be dismissable (a product call: a countdown the user cannot hide for 7 days, against a
notice that hides the one warning before the engine switches). Then either add the control or correct the contract wording,
and log the Buy click if the control stays.

## Resolution

Fixed 2026-11-28 in quick task 261128-1gz (Dismiss `22cfe62cb`, Buy log `0aa7c8102`).

- Decision: Dismiss per trial (user, 2026-11-28). The trial notice keeps its Buy CrossOver button and gains a Dismiss
  button; Dismiss hides the notice for the rest of that trial and a later trial shows it again.
- Where the dismissal lands: Rust alone, no sidecar TS. The native `engine` channel `dismissEngineNotice`, then
  `parse_dismissal_args` (now three strict arms), then the crate op `engine_notice_dismiss`, then
  `state::notices::dismiss`, which writes through the StoreHost into `store_cache/steam_engine_notices.json`.
- The trial key: the estimated end day (UTC epoch day of the dismissal plus the notice's `daysRemaining`), one integer
  under `crossoverTrialNoticeDismissedEndDay`, the larger of stored and new kept. `compute()` (the one place a state is
  built, for both the page read and the launch publish) reports `showTrialNotice: false` while the computed end day is
  at most the stored one plus 3 days of slack (CrossOver's day rounding and the cached Healthy pre-flight drift; a new
  trial ends at least 8 days after a dismissed one). Not the build (it does not change on a reset) and not
  `InstallTime` (GameLib reads no profile content, T-87-45). A count above 7 is refused as `{ok: false}`.
- Log lines: Rust writes `Engine: CrossOver trial notice dismissed daysRemaining=<n> trialEndDay=<day> ok=<bool>`
  through `ctx.log` (the `no-crossover` and `untested-crossover` dismissals still log nothing, so the goldens' zero-log
  assertion holds). The renderer writes `[engine-notice] Buy CrossOver clicked runner=<runner> appName=<appName>
  daysRemaining=<n>` through `window.api.logInfo`.
- 87-HUMAN-UAT item 2's `expected:` line now describes Dismiss, its per-trial persistence and both log lines (no
  `result:` line touched), and the 87-59 observation bullet points to this fix.
- Tests added: `gamelib-engine` lib `state::` 10 before, 14 after (three `notices` unit tests on an in-memory store and
  an end-to-end dismiss, hide, same-trial, new-trial, refusal and log-line test through the real StoreHost);
  `gamelib-shell` `dismiss_engine_notice` decode test (three arms, five new rejections) and the `native_manifest`
  vector replay with the new valid and invalid vectors; jest `EngineState.test.ts` and `EngineNotices.test.tsx` (4
  suites, 47 before, 49 after incl. the Buy log, the Get CrossOver no-log and the Dismiss no-renderer-log cases). The
  `cfg(unix)` shell write test and `golden_state.rs` are unix-only and run in CI, not on the Windows machine.
- Still owed, not run live: the 56c-3 check (dismiss a notice in the live app and see it handled by Rust alone) and a
  live click of the new Dismiss and Buy CrossOver. The code path was traced, not run live.
