---
created: 2026-11-10T13:00:00.000Z
title: "Custom-category actions mutate customCategories in place"
area: frontend-state
files:
  - src/frontend/state/libraryState.ts (setCustomCategory, removeCustomCategory, renameCustomCategory)
severity: minor
platform: any
ready: code
---

## Problem

`setCustomCategory`, `removeCustomCategory` and `renameCustomCategory` mutate the
existing `customCategories` object before setting it. `setCustomCategory` then sets the
same reference, so a subscriber comparing by identity (a PureComponent or `useShallow`)
can skip the re-render. The other two spread a copy, which masks it for them.

Preserved unchanged when the collections moved into libraryState in Phase 69 (no
behaviour change). A side effect: the initial `{}` object is mutated across store resets,
so tests must seed `customCategories` themselves.

## Fix

Build a new object in each action (`{ ...customCategories, [name]: [] }`, and a
filtered copy for delete/rename) before `set` and `configStore.set`.
