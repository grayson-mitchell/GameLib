---
quick_id: 261116-han
mode: quick
todo: .planning/todos/pending/2026-11-16-engine-notice-dialogs-have-no-dismiss-button.md
files_modified:
  - src/frontend/components/UI/DialogHandler/index.tsx
  - src/frontend/components/UI/DialogHandler/__tests__/buttonActions.test.tsx
---

# Quick Task 261116-han: Engine-notice dialogs have no dismiss button

## Finding

The engine-notice dialog (`[engine-notice] tag=crossover-required-drm` and siblings) is sent by
`showDialogBoxModalAuto` with no `buttons`. `DialogHandler` renders `buttons ?? []`, so
`MessageBoxModal` draws an empty footer. This is not engine-specific: 24 of 28 backend
`showDialogBoxModalAuto` call sites omit `buttons` (engineDialogs.ts, both Steam
`gameLaunch.ts` dialogs, the legendary/gog/nile/install-flow error dialogs, ...). Every one of
them renders with only the window close control.

The fix belongs on the backend-frame path, not in `MessageBoxModal`: the Humble claim wizard
passes `buttons: []` on purpose (it renders its own controls) through `showDialogModal`, and
that must stay buttonless. No backend caller passes `buttons: []`, and a backend frame cannot
carry a custom React control, so a backend dialog with no buttons always wants a plain dismiss.

## Task 1: default OK button for buttonless backend dialogs

<files>src/frontend/components/UI/DialogHandler/index.tsx</files>
<action>In DialogHandler's `onMessage` (the `showDialog` frame listener), when `buttons` is
missing or empty, substitute `[{ text: t('box.ok', 'OK') }]`. Leave `showDialogModal` callers
in the renderer untouched.</action>
<verify>
- `pnpm jest src/frontend/components/UI/DialogHandler`
- `npx prettier --check src/frontend/components/UI/DialogHandler/index.tsx src/frontend/components/UI/DialogHandler/__tests__/buttonActions.test.tsx`
</verify>
<done>A backend frame with no buttons renders one OK button. A frame with buttons is unchanged.</done>

## Task 2: regression tests

<files>src/frontend/components/UI/DialogHandler/__tests__/buttonActions.test.tsx</files>
<action>Add cases: a frame with `buttons` undefined, and one with null (what JSON delivers
over the sidecar hop), each yield exactly one OK button with no `onClick`. Rely on the
existing cases for "frame with buttons passes through unchanged".</action>
