---
created: 2026-11-14T00:00:00.000Z
title: 'Editing an environment variable fills the input row below the table instead of editing the selected row'
area: ui
severity: minor
platform: any
ready: code
source: 'operator report, 2026-11-14, while setting the Core Keeper CX_ENV for debug session core-keeper-overlay-no-attach'
files:
  - src/frontend/components/UI/TwoColTableInput/index.tsx:127
  - src/frontend/screens/Settings/components/EnvVariablesTable.tsx
---

## Problem

In the per-game Environment Variables table, clicking a row's Edit (pencil) button does not edit
that row. `editRow()` (`TwoColTableInput/index.tsx:127`) copies the row's key and value into the
footer's add-row inputs below the table, and the change is saved with the + button. It works, but
it reads as if a different cell is being edited. The operator's words: "the editing of the
variable edits in the cell below rather than the row selected (it works but odd)".

`TwoColTableInput` is shared, so other two-column tables that use it behave the same way.

## Fix direction

Edit in place: clicking Edit turns that row's two cells into inputs, with save (or Enter) and
cancel (or Escape). Leave the footer row only for adding a new variable. Keep the existing
validation and the `onChange` contract unchanged.

## Done when

Clicking Edit on a row edits that row in place, the footer row is used only to add a variable,
and the other tables that use `TwoColTableInput` still save correctly.

## Resolution

Fixed in quick task 261114-v4q. Edit now turns the selected row's own cells into inputs (Enter or Save commits through one onChange call, Escape or Cancel discards); the footer row is add-only. Validation and fullFills guards apply to edits, and renaming onto an existing key upserts. Tests: src/frontend/components/UI/TwoColTableInput/__tests__/index.test.tsx.
