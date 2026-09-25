---
created: 2026-09-26T00:00:00.000Z
title: "Three `translation` keys are each used at two call sites that want different text, so one surface silently shows the other's string"
area: i18n
severity: minor
platform: any
ready: human
source: "quick-260926-k4t follow-up, 2026-09-26 — the residue of the i18next-parser collision set after the four unambiguous ones were aligned"
files:
  - src/backend/shortcuts/ipc_handler.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - src/frontend/screens/WineManager/components/WineManagerSettingsModal.tsx
---

## Problem

`pnpm i18n` reported `Found same keys with different values` for eight keys. Five were cosmetic
(a typo, a case difference, an ellipsis, a reworded sentence) and are fixed. **These three are a
different class: the key is being used for two genuinely different pieces of copy.**

| key | call site A | call site B |
|---|---|---|
| `translation:box.shortcuts.title` | `'Shortcuts'` (`shortcuts/ipc_handler.ts`, `sidecar/shortcutsFlowRegistration.ts`) | **`'Shortcuts Removed'`** (same two files, second site each) |
| `translation:setting.eosOverlay.updating` | `'Updating...'` (`AdvancedSettings/index.tsx:472`) | **`'The EOS Overlay is being updated...'`** (`:163`) |
| `translation:wine.manager.settings` | `'Settings'` (`WineManager/index.tsx:189`, a tab title) | **`'Wine Manager Settings'`** (`WineManagerSettingsModal.tsx:31`, an `<h3>`) |

**What ships today, and it is NOT what the second author wrote.** The catalog value wins at both
sites, because a `t()` default is inert whenever the key resolves — and all three keys are present
in the English catalog (`'Shortcuts'`, `'Updating...'`, `'Settings'`). So the "shortcuts removed"
dialog is titled *Shortcuts*, the Wine Manager modal heading reads *Settings*, and the EOS overlay
message reads *Updating...*. Each author's more specific wording is dead text.

This is `minor` and not higher on purpose: the shipped strings are **less specific, not wrong**.
Nobody is shown an error or a raw key. The defect is that three deliberate pieces of copy were
silently discarded and the codebase looks like it says otherwise.

## Solution

**This needs a person because it is a copy decision, not a mechanical one**, and either answer is
cheap. Pick per key:

**Option A — keep the shared key, delete the divergent default.** Free, desk-only, ~3 edits. This
is already the de-facto shipped state, so it changes nothing a user sees; it just stops the source
claiming otherwise. Same treatment the four cosmetic ones got in `quick-260926-k4t`.

**Option B — mint a distinct key for the more specific wording.** Gives each surface the copy its
author intended. Cost is the real constraint, and it is not symmetric:
- A new key in `gamelib.json` is **gated**: `lint-translations:gamelib` holds a clean
  `totalPairs: 0` baseline and an English-only key has been measured at **48 hard failures**, with
  `machine-fill-gamelib` unavailable under a gateway-scoped key. So option B in `gamelib` means
  producing 47 real translations.
- A new key in the legacy `translation` namespace is **ungated** — see the sibling todo on
  `notify.uninstalled.error` for the measurement: `notify.uninstallNotConfirmed` is a
  GameLib-added `translation` key present in **1 of 47** locale files, i.e. English-only, shipped,
  and invisible to every gate. That is a precedent, not an endorsement.

**Do not take option B in `translation` just because it is ungated.** That is how the untranslated
debt this repo keeps measuring gets created. If the more specific copy is worth having, it is
worth translating.

## Verification

`pnpm i18n` should report `Found same keys with different values` for **zero** keys once these
three are resolved (the other five are already cleared). Keep the other reported keys as a
non-vacuity control — if the whole warning class vanishes at once, the check was muted rather than
satisfied.
