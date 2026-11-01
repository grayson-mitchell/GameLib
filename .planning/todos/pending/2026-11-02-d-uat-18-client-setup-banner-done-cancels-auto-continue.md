---
created: 2026-11-02
title: "D-UAT-18: Steam client-setup banner's \"Done\" silently cancels the auto-continue; banner styling inconsistent with the consent dialog"
source: Phase 21 UAT 4c, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamClientSetup.waitingDialog.test.tsx
  - public/locales/en/gamepage.json
severity: minor
platform: any
ready: live-gate
---

The non-modal bottom-right `steamClientSetupToast` has one button, "Done", which calls `close()` and
(by the 34.13 C-17 fix) stops the readiness poll and abandons the install. The operator clicked it as
an acknowledgement and the first 4c attempt never continued. Operator also: "inconsistant ui,
shouldn't it be a standard window like the previous one."

## Decision (operator, 2026-11-02)

- LD-1: the waiting surface becomes the standard shared Dialog, the same one the consent prompt
  uses, for both the post-consent install state and the launch-once state. Title "Waiting for
  Steam" with the header X, body "Finish the Steam installer that opened. GameLib will continue the
  download automatically.", and one button.
- LD-2: that one button is "Cancel install" and keeps today's `close()` semantics, so C-17's
  guarantee holds: a dismissed prompt never starts a download later. The header X, Escape and a
  backdrop click also cancel. There is no Hide or minimise option and no "Done" label.
- LD-3: the body follows the live recheck status. needs-launch shows the launch-once wording
  ("Steam is installed but hasn't been opened yet. Open Steam once — GameLib will continue the
  download automatically.") and needs-install shows the installer wording, even when the session
  opened with reason `install`.
- Planner's call: the error state ("Steam setup could not start: ...") moves into the same Dialog,
  keeping Try again (back to consent) and adding Cancel install (closes).

## Also seen 2026-11-02 (4a re-run): banner copy goes stale

After the installer finished, the banner still read "Installing the Steam client" while GameLib was
actually waiting on D-11 (Steam installed, never launched; `gamelib.log` polled "installed but never
launched" every 3s from 03:08:58). Nothing told the operator to start Steam. The banner should switch
to the launch-once wording when the recheck moves from needs-install to needs-launch.

## Code landed (quick 261102-4tf)

Commits: db8c45b88 (one Dialog root, single Cancel install, error in the dialog, toast stylesheet
deleted, catalog) and a690d1602 (the live-status copy), after the `test(...)` commits 68dd1d0e8 and
0a425cecb that pinned the behavior first.

- Consent, waiting and error are one Dialog root with the `steamClientSetupDialog` className, so
  React keeps one Dialog instance from consent to waiting (no second slide-up, no second gamepad
  tab-focus mount).
- The waiting dialog has a single "Cancel install" button. The header X, Escape and a backdrop click
  all call `close()`. The C-17 guarantee is kept and pinned by W4: after cancelling, a later `ready`
  recheck never dispatches `installSteamGame`. Left open, a `ready` recheck still auto-continues
  (W5).
- The waiting copy follows the live recheck status (L1-L5). A rejected recheck keeps the last known
  copy, and a new session starts clean. An in-flight recheck that resolves after the poll was torn
  down (cancel, or a reopened session) is now ignored, so it can neither leak a stale status nor
  dispatch a cancelled install.
- The error state renders in the same Dialog with Try again and Cancel install.
- The toast stylesheet is deleted. Final copy: title "Waiting for Steam", button "Cancel install",
  installer body "Finish the Steam installer that opened. GameLib will continue the download
  automatically.", launch-once body "Steam is installed but hasn't been opened yet. Open Steam once
  — GameLib will continue the download automatically." The old acknowledgement label key was removed
  from the en catalog.
- Out of scope, recorded rather than fixed: on Linux the start opens the Steam download page, not
  an installer (`link-opened`). The installer wording is still used there, as the old copy was.

Operator live gate (NOT yet run; this todo stays pending until it passes). Use a GameLib build that
contains the fix commits and the Test recipe in
`.planning/todos/completed/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md` (an empty
Default Steam path) to re-run UAT 4a and 4c on the Windows box. Check:

- 4a: after consent, the same dialog shows "Waiting for Steam" with only Cancel install. While
  Valve's installer is open, it shows the installer wording. After the installer finishes and
  before Steam is opened, it switches to the launch-once wording. Opening Steam then starts the
  download with no click.
- 4c: Cancel install, then open Steam. No download starts (C-17). A second attempt left open
  auto-continues.
- Record the results on items 4a/4c and the D-UAT-18 finding in
  `.planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md`, then move this todo to
  completed.
