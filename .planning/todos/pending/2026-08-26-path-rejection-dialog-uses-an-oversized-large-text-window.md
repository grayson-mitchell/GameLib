---
created: 2026-08-26T18:47:00.000Z
title: "The path-rejection dialog (\"Can't use that location\") renders in the oversized large-text window model — make it a properly-sized error presentation"
area: ui
status: OPEN
severity: minor
files:
  - src/backend/sidecar/installFlowRegistration.ts:317
  - src/backend/sidecar/installFlowRegistration.ts:444
  - public/locales/en/gamelib.json
---

## Observed

Found by the operator on 2026-08-26 driving **item G2-3 of `34.6-LIVE-GATE.md`'s GAP CYCLE 2
section** (the REJECT-direction item), on branch `fix/steam-native-install-stability`.

The rejection itself worked — **G2-3 PASSED**. A relative path typed into `ImportDialog`'s
`PathSelectionBox` was refused, the dialog appeared, and the rejected path stayed out of
`gamelib.log`. This todo is purely about how that dialog *looks*.

Operator's words: the error message should be "sexier"; it currently uses the **large text
window** dialog model.

The dialog is raised by `showDialogBoxModalAuto({ title, message, type: 'ERROR' })` from plan
34.6-19, at `installFlowRegistration.ts:317` (move) and `:444` (import). The body strings are
`gamelib:installFlows.pathRejectedBodyMove` / `pathRejectedBodyImport`, both a full sentence-pair
of explanatory prose, which is what drives the window to the large-text size.

## Problem

34.6-19's goal was to stop the rejection being *silent* — before it, a rejected path produced only
a `logError` and a terminal `done` status, which read as the app doing nothing. It succeeded at
that. But the presentation it reached for is the generic large-text modal, which is oversized and
visually plain for what is a short, one-line correction ("that isn't a full folder path").

## Solution

TBD. Options, none yet chosen:

- Keep `showDialogBoxModalAuto` but shorten the body strings so the dialog sizes down, and lean on
  the title to carry the meaning.
- Move to a smaller/inline error affordance attached to `PathSelectionBox` itself, so the
  correction appears next to the field the user must fix rather than in a modal that covers it.
  This is the better UX but a larger change, and it must not reintroduce silence — the whole point
  of 34.6-19 was that a rejection must be user-visible.
- Whatever is chosen, the three `gamelib.json` strings stay in `gamelib.json` (never
  `translation.json` — the churn guard fails CI on that), and `de`/`fr` need matching updates.

## Notes

No `resolves_phase:` — this is a UI-polish follow-up, not a Phase 34.6 port defect, and must not be
auto-closed when 34.6 closes. G2-3 itself passed on its own contract and is not blocked by this.

Adjacent but distinct: `2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
covers a dialog rendering as a *native system* dialog instead of app-styled; this one is an
app-styled dialog that is simply the wrong size and tone.
