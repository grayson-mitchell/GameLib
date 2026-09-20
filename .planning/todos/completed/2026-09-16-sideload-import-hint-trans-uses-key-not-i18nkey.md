---
created: 2026-09-16T00:00:00.000Z
completed: 2026-09-19T00:00:00.000Z
title: "SideloadDialog's import hint <Trans> passes key= instead of i18nKey=, so it never localises and its 46 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260916-cdb"
resolved_by: "quick-260919-u23"
files:
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
---

## Observed

`SideloadDialog/index.tsx:376`'s `<Trans>` element was written as:

```tsx
<Trans i18n={i18n} key="sideload.import-hint.content">
```

`react-i18next`'s `<Trans>` resolves its translation via `i18nKey`, not `key` (`key` is React's own
reserved reconciliation prop and is invisible to the component's own props — `Trans` never sees
it). With no `i18nKey`, `Trans` had nothing to look up and always fell through to rendering its
inline English `children` verbatim, in every locale.

Found live during `quick-260916-cdb`, which deliberately changed only the quoted button-name text
inside this block per its own `<latent_bug_do_not_fix>` instruction, and filed this instead.

## Why this was not a one-line fix

Renaming the prop in isolation was a trap. The translated copies lived in
`public/locales/<lang>/gamepage.json` (the `gamepage` namespace, per `useTranslation('gamepage')`
at `index.tsx:64`) and still quoted the **OLD** "Import Game" label. Flipping the prop alone would
have resolved those stale entries and started telling users to click a button that no longer
exists — strictly worse than the dead-but-accurate English state.

## What was actually wrong with this todo's own prescription

**The Solution section originally prescribed a sweep of all 46 translated values inside
`gamepage.json`. That is forbidden and would have been reverted on sight.** `i18n-churn-guard`
fails on any working-tree change under `public/locales/` that is not `gamelib.json` /
`gamelib.mt.json`, and `REQ-34.8-04`'s response is `git checkout -- public/locales/`, **never a
hand-edit**. Following this todo's own instructions would have produced a red gate and a discarded
afternoon. Corrected here rather than left to mislead the next reader.

**The count in the title is also an overcount.** It claimed 46 dead translated copies. Measured by
parsing the catalogs: 47 locales carried the key, of which one is `en`, leaving 46 non-English —
but **14 of those were empty strings**, which render English anyway. Only **32** were non-empty,
and one of those (`ta`) was truncated mid-sentence. So the live translated population was 31, not
46. The title is left unedited as the historical record of what was believed; this paragraph is the
correction.

## Resolution (`quick-260919-u23`, commit `98a1586e6`)

1. `sideload.import-hint.content` was **migrated into the fork-owned `gamelib` namespace** rather
   than swept in place, which is what makes the fix legal under the churn guard.
2. The `<Trans>` now passes `i18nKey` **and an explicit `ns="gamelib"`**. Both are required: no
   `defaultNS` is configured, so i18next defaults to `translation`, and either attribute alone
   still renders the English children.
3. The button name is interpolated as `{{doorLabel}}` from `installFlows.importDoorLabel` instead
   of being copied into every catalog — the original defect existed *because* that label was
   duplicated across catalogs and then renamed, so this removes the recurrence, not just the
   symptom.
4. All 48 non-English locales were filled, and migration + fill shipped as **one commit**: `en`
   gaining a key while the others stay unfilled is exactly the presence-baseline drift that fails
   CI hard.

**Provenance caveat, recorded because the manifests cannot express it:** `machine-fill-gamelib`
could not run — it hard-codes `api.anthropic.com` and ignores `ANTHROPIC_BASE_URL`, and this
environment's key is gateway-scoped (measured HTTP 401 from both the script and an independent
`curl`). The 48 values were authored in-session by Claude Opus 5, reusing the legacy `gamepage.json`
translations as translation memory (D-11) for the 31 locales that had one. Each locale's
`gamelib.mt.json` now lists the key in `keys[]` so a Weblate import cannot mislabel model output as
human, but the manifests carry a single global `model` field still reading `claude-sonnet-5`.

Gates at resolution: `i18n-churn-guard` clean, `lint-translations[gamelib]` 0 findings, Meta parity
98 passed, Frontend 2660 passed, `tsc` exit 0, `lint` 0 errors, planning-gates 11/11.

## Not fixed here, filed instead

Two more `<Trans key=` sites with the same defect, both referencing real catalog keys:
`.planning/todos/pending/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md` and
`.planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md`.
Unlike this one, both are likely genuine one-line fixes — their translations are not stale, so no
catalog migration is needed.
