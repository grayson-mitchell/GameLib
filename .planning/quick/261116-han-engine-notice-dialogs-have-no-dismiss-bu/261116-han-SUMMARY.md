---
quick_id: 261116-han
status: complete
commit: 6f5fd58e6
---

# Quick Task 261116-han: Engine-notice dialogs have no dismiss button — Summary

## Cause

`showDialogBoxModalAuto` callers that omit `buttons` produce a `showDialog` frame with no buttons;
`DialogHandler` rendered `buttons ?? []`, so `MessageBoxModal` drew an empty footer. Not
engine-specific: 24 of 28 backend call sites omit `buttons` (engineDialogs.ts, both Steam
gameLaunch.ts dialogs incl. `[bridge-notice]`, legendary/gog/nile/install-flow error dialogs).

## Fix

`DialogHandler`'s `showDialog` listener substitutes `[{ text: t('box.ok', 'OK') }]` when a frame
carries no buttons (undefined, null, or empty). Placed on the backend-frame path, not in
`MessageBoxModal`, because the Humble claim wizard passes `buttons: []` via `showDialogModal` on
purpose and must stay buttonless. No backend caller passes `buttons: []`.

## Verification

- `pnpm jest src/frontend/components/UI/DialogHandler`: 3 suites, 13 tests pass (2 new: undefined
  and null buttons each yield one OK button).
- `npx prettier --check` on both files: clean. eslint clean; `tsc --noEmit` reports nothing in DialogHandler.
- Not live-checked: the crossover-required-drm dialog was not re-triggered in the running app.
