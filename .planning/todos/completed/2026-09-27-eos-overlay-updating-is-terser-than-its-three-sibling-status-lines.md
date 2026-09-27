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

## Resolution

**Option B taken**, for `setting.eosOverlay.updating` only, by `quick-260927-q9t` on 2026-09-27. The
new key is `gamelib:setting.eosOverlay.updatingStatus` — not the suggested `mainUpdating` — because
`Status` names the SURFACE (the main status line) rather than restating the action, which is exactly
what distinguishes it from `translation:setting.eosOverlay.updating` (the update-button label), and
because it sorts adjacent to its `unavailable`/`unavailableDetail` siblings in the same subtree.

**Shipped English copy:** `'The EOS Overlay is being updated...'`, matching the register of its
three siblings (`installed`, `installing`, `notInstalled`). `getMainEosText()`'s updating branch now
calls `tGamelib('setting.eosOverlay.updatingStatus', ...)`, unprefixed, and the false
`// Shared key:` comment that this todo's own predecessor left behind is removed.

**`translation:setting.eosOverlay.updating` and the update-button call site are untouched** — both
byte-identical to their pre-task state. All 47 `translation.json` files are also untouched.

**Correction to this todo's own cost attribution.** This todo's Proposed Solution section said the
new key "is gated by `lint-translations:gamelib` against a clean `totalPairs: 0` baseline." That
attribution is wrong: `comparePresenceBaseline()` asserts over `missing` and never reads
`totalPairs` — see
`.planning/todos/completed/2026-09-07-presence-baseline-totalpairs-is-unenforced-prose.md`, which
predicted exactly this misreading, and it is what happened here. The real mechanism is `missing`
drift in `meta/i18nCatalogPresenceBaseline.json`: `lintTranslations.ts` pushes one hard failure per
added-but-unrecorded pair. The baseline file was **not** modified by this task — still
byte-identical to HEAD, `totalPairs: 0`, `missing: {}`.

**Count correction:** this todo's Proposed Solution section said "47 real translations." The correct
figure is **48** (49 locale dirs under `public/locales/`, minus `en`).

**All 48 translations are model-produced and unreviewed.** They were authored by an opus planning
agent from a four-way parallel corpus and are recorded, with per-locale `confidence` and `basis`, in
`.planning/quick/260927-q9t-mint-a-distinct-gamelib-key-for-the-eos/260927-q9t-translations.json`.
The six low-confidence locales, flagged for native review first, are: `br`, `et`, `ka`, `ml`, `sl`,
`th`.

**Both gate controls were run, both red readings quoted:**
- Pre-fill (English-only) state: `lint-translations[gamelib]: 48 findings, 48 hard failures`, naming
  all 48 non-`en` locales, e.g.
  `` `br.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline` ``.
- Post-commit single-locale control (`sl` broken, then restored): `lint-translations[gamelib]: 1
  findings, 1 hard failures`, naming
  `` `sl.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline` ``.
  Restored by re-running the idempotent writer script with `--force` — no `git checkout --` was
  used anywhere in this task.

**Accepted, recorded cost:** in roughly 28 of the 46 locales that have both catalogs, the new status
line uses the `gamelib`-namespace term for "EOS Overlay" while its three sibling status lines
(`installed`, `installing`, `notInstalled`) use the `translation`-namespace term for the same
concept, because the terminology rule this task used is namespace-internal (the new key's subject
noun-phrase is taken from `gamelib:setting.eosOverlay.unavailable`, its only in-namespace sibling).
That cross-namespace divergence ships today and is not this task's to fix.
