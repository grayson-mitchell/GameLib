---
created: 2026-09-27
title: 'setting.eosOverlay.updating reads a terse "Updating..." where its three siblings are full sentences — consider a distinct key for the fuller wording'
found_during: quick 260927-p4a (aligned the shared key's t() default to the catalog value)
severity: minor
platform: any
ready: human
area: i18n
files:
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
---

## Problem

`translation:setting.eosOverlay.updating` is shared by two call sites in
`AdvancedSettings/index.tsx` that want different copy: the update-button label at `:472` (wants
the terse `'Updating...'`) and the main status line at `:163` (previously carried the divergent
default `'The EOS Overlay is being updated...'`, now aligned to the shared catalog value by
`quick-260927-p4a`).

The status line's three siblings are full sentences: `setting.eosOverlay.installed` -> `'The EOS
Overlay is installed'`, `setting.eosOverlay.installing` -> `'The EOS Overlay is being
installed...'`, `setting.eosOverlay.notInstalled` -> (its own full-sentence form). Sitting next to
those, `'Updating...'` reads noticeably terser and less specific — not wrong, just thinner than its
neighbours.

The parent todo,
`.planning/todos/completed/2026-09-26-three-translation-keys-are-reused-for-two-different-meanings.md`,
took Option A (align to the shared catalog value) on this key and two others as the free, desk-only
fix, and explicitly carried this one copy cost forward as a todo rather than absorbing it silently.

## Proposed solution

**Option B for this key only:** mint a distinct `gamelib.json` key for the main status line (e.g.
`gamelib:setting.eosOverlay.mainUpdating` or similar) carrying a fuller sentence in line with its
three siblings, such as `'The EOS Overlay is being updated...'`. Leave `translation:setting.
eosOverlay.updating` exactly as it is for the update-button label at `:472`, which genuinely wants
the terse `'Updating...'` — do not touch that call site.

**Real cost, not free:** a new `gamelib` key is gated by `lint-translations:gamelib` against a
clean `totalPairs: 0` baseline; an English-only key in that namespace has been measured at **48
hard failures**; and `machine-fill-gamelib` cannot run under a gateway-scoped key. So shipping this
means producing **47 real translations**, not a desk-only edit — hence `ready: human`, not `code`.
The one-line code change itself (swap the key used at `:163`; `tGamelib` is already wired in this
file alongside `t`) is trivial, but the translation production is the actual work.

`severity: minor` because the shipped string today is less specific, not wrong — same reasoning the
parent todo used.
