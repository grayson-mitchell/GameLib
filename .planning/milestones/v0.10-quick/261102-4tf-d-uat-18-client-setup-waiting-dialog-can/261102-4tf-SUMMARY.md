---
phase: quick-261102-4tf
plan: 01
subsystem: frontend/steam-client-setup
tags: [steam, dialog, i18n, d-uat-18, c-17]
requires: []
provides:
  - "One shared Dialog for Steam client-setup consent, waiting and error"
  - "Single 'Cancel install' action (X, Escape, backdrop also cancel)"
  - "Waiting copy driven by the live recheck status"
affects: [SNI-06]
tech-stack:
  added: []
  patterns: ["cancelled-flag guard on in-flight poll results"]
key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamClientSetup.waitingDialog.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
    - public/locales/en/gamepage.json
    - .planning/todos/pending/2026-11-02-d-uat-18-client-setup-banner-done-cancels-auto-continue.md
  deleted:
    - src/frontend/screens/Game/GamePage/components/SteamClientSetup.scss
decisions:
  - "One Dialog root kept across consent/waiting/error so React reuses the instance: no second slide-up, no second gamepad tab-focus mount effect"
  - "Error header reuses clientSetup.consent.title (same session/window), no new key"
status: complete
commits: 5
plan_head_before: 731e0b01f997c7822cebf684940f9090672c73da
plan_head_after: 9c95b18cb7e4c5d575e1827da096d842bcf55c7a
actuals:
  tokens: 60000
  tasks: 3
  commits: 5
metrics:
  duration: ~40min
  completed: 2026-11-02
---

# Phase quick-261102-4tf Plan 01: D-UAT-18 client-setup waiting dialog Summary

After consent (and straight away in the launch-once case) the Steam client-setup prompt stays in the same shared Dialog, titled "Waiting for Steam" with a single "Cancel install" button, and its body follows the live recheck verdict.

## Commits

| Commit | Message |
| ------ | ------- |
| 68dd1d0e8 | test: pin the client-setup waiting dialog and Cancel install (RED) |
| db8c45b88 | fix: waiting and error states use the consent dialog, single Cancel install |
| 0a425cecb | test: pin the waiting copy to the live recheck status (RED) |
| a690d1602 | fix: waiting copy follows the live recheck status |
| 9c95b18cb | docs: record the D-UAT-18 fix and re-triage to live-gate (todo) |

The orchestrator owns the SUMMARY/STATE docs commit.

## Cases

W0-W6 (9 tests): W0 consent, W1 launch-once waiting, W2 consent to waiting, W3a Cancel install routes to close, W3b Dialog onClose routes to close (waiting phase), W4 C-17 (no install after cancel), W5 auto-continue, W6 error dialog (Try again / Cancel install), W6b rejected start lands in the error dialog.
L1-L5: L1 needs-install to needs-launch switch, L2 poll result beats opening reason, L3 rejected recheck keeps last copy, L4 new session never inherits status, L5 reason flip mid-wait.

RED observed: after the first test commit W1, W2, W3a, W3b, W4, W6 and W6b failed; W0 and W5 passed (regression pins). After the second test commit L1, L2, L3 and L4 failed (L4 failed at its intermediate LD-3 assertion, so it exercised the later stale-status path only in GREEN); L5 passed (pin).

## Verification (exact counts)

- Targeted jest (waitingDialog + permanentlyMountedPolls + store): 3 suites, 55 tests pass (41 baseline + 14 new).
- `npx tsc --noEmit` exit 0; eslint `--max-warnings 0` clean on both files; `node meta/findDeadcode.cjs` exit 0; prettier clean on both source paths.
- `pnpm i18n --fail-on-update` exit 0; only `public/locales/en/gamepage.json` changed under public/locales; catalog values equal in-code defaults (node parity check exit 0).
- `python .planning/todos/todo-frontmatter-gate.py` OK; `python meta/runPlanningGates.py`: 11 PASS, 1 FAIL (the baseline `state-sdk-field-anchor-gate.py` only).
- Hardcoded-string meta gate (`meta/__tests__/hardcodedStringGate.test.ts`): 176/176 pass.

## Final copy (en/gamepage.json, clientSetup)

- `waiting.title`: "Waiting for Steam"
- `cancelInstall`: "Cancel install"
- `installing.message`: "Finish the Steam installer that opened. GameLib will continue the download automatically."
- `launchOnce.message`: "Steam is installed but hasn't been opened yet. Open Steam once — GameLib will continue the download automatically."
- The old acknowledgement label leaf (`done`) was removed from en. No other locale changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Ignore in-flight recheck results after the poll effect is torn down**
- **Found during:** Task 2 (L4 reasoning)
- **Issue:** A recheck already in flight when the user cancels, or when a new session reopens, resolves after teardown. It could set a stale `liveStatus` on the new session, and a late `ready` could dispatch the install the user just cancelled (C-17 hole, T-4tf-01).
- **Fix:** `let cancelled = false` in the poll effect, set true in its cleanup, checked first in the recheck `.then`. Census shapes (guard, deps array, `void window.api` count) unchanged; census suite still green. Verified load-bearing: removing the check fails L4.
- **Files modified:** SteamClientSetup.tsx
- **Commit:** a690d1602

**2. [Test shape] W3 split into W3a/W3b and W6b added**
- The plan's W3 and W6 behaviors were each split into separately named tests; W3b runs in the waiting phase so it fails against the old toast. Total 9 W tests rather than 7.

## Out of scope (recorded)

On Linux the start opens the Steam download page rather than an installer (`link-opened`); the installer wording is still used there, as the old copy was.

## Live gate still owed

The Windows UAT 4a/4c re-run is NOT yet run. The D-UAT-18 todo stays in pending/ at `ready: live-gate` and names the checks.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Created/modified files exist; the scss is deleted; commits 68dd1d0e8, db8c45b88, 0a425cecb, a690d1602, 9c95b18cb are in `git log`.
