---
quick_id: 260908-iq8
slug: egs-sync-unsync-dialog-titles
date: 2026-09-08
description: Give the EGS sync and unsync success dialogs distinct, i18n'd titles
closes_todo: .planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md
autonomous: true
---

# Quick Task: distinct EGS sync / unsync dialog titles

## Problem

`src/frontend/screens/Settings/components/EgsSettings.tsx:44` renders BOTH the
sync-succeeded and unsync-succeeded dialogs under the literal, hardcoded title
`'EGS Sync'`. The only distinguishing signal is the body, which differs by one
word (`message.sync` -> "Sync Complete" vs `message.unsync` -> "Unsync Complete").

The parent finding (`2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md`)
recorded an operator reading "Unsync Complete" under an "EGS Sync" title as
confirmation that sync had been ENABLED. Guard G1 in `PathSelectionBox` closed the
accidental-unlink trigger; every intentional unlink still carries the misread risk.

## Measurements taken before planning

- `DialogType` is `'MESSAGE' | 'ERROR'` only (`src/common/types.ts:33`), and
  `MessageBoxModal` only branches on `'ERROR'`. There is no success-variant
  icon/colour affordance, so the todo's "distinct icon/colour treatment"
  alternative is not available without new component surface. **Title strings are
  the fix.**
- `EgsSettings.tsx` is in `meta/i18nForkTouchedFiles.json` (215 files) but NOT in
  `meta/i18nGateScope.json` (174 files) -- it is DECLARED_UNSCANNED_DEBT in
  `meta/__tests__/genI18nGateScope.test.ts`. Editing it changes NEITHER artifact,
  so the A-17 ratchet and the ANTI-ROT specs stay green with no regeneration.
- `public/locales/{en,de,fr}/gamelib.json` are at exact key parity (224 each).
  New keys must land in all three or `lint-translations` stays green at zero
  coverage (it only walks a translation's OWN keys).
- The `settings.eosOverlay*ConfirmTitle` keys are the in-repo precedent for
  dialog titles in the `gamelib` namespace.

## Decisions

- **D-1: "Enabled"/"Disabled", not "Sync"/"Unsync".** The todo suggested
  `'EGS Sync'` vs `'EGS Unsync'`. "Unsync" is not ordinary English and reads as a
  near-duplicate at a glance -- the exact failure being fixed. Titles state the
  resulting STATE: "EGS Sync Enabled" / "EGS Sync Disabled". Body copy
  ("Sync Complete" / "Unsync Complete") is upstream and stays untouched.
- **D-2: New keys go in `gamelib.json` under `settings.`**, called with the
  explicit `gamelib:` prefix through a `tGamelib` alias. Writing to
  `translation.json` fails the D-05 churn guard; the alias must be literally
  `tGamelib` to stay visible to `i18next-parser`.
- **D-3: Source-text gate, not a render test.** No jsdom in the Frontend jest
  project. Follow the `framelessWindowCopy.test.ts` idiom
  (`stripSourceComments` + catalog reads) so an explanatory comment cannot
  satisfy a gate.

## Tasks

1. Add `settings.egsSyncEnabledTitle` / `settings.egsSyncDisabledTitle` to
   `public/locales/{en,de,fr}/gamelib.json` via a round-trip-verified script.
2. Rewrite the `EgsSettings.tsx` success branch to select the title per outcome
   through `tGamelib`.
3. Add `src/frontend/screens/Settings/components/__tests__/egsSyncDialogTitles.test.ts`
   -- distinctness, no surviving hardcoded literal, catalog parity across all
   three locales, plus a non-vacuity spec.
4. Close the todo (move `pending/` -> `completed/`).

## Verification

- `npx jest --config src/frontend/jest.config.js -t "EGS sync"` green.
- `npx jest --config meta/jest.config.js` green (churn guard + scope ratchet).
- `pnpm lint-translations:gamelib` green AND a direct key-set diff across
  en/de/fr showing all three at equal counts.
- `npx tsc --noEmit -p tsconfig.json` clean for the touched file.
