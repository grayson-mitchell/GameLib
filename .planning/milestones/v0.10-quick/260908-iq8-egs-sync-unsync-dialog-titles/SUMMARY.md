---
quick_id: 260908-iq8
slug: egs-sync-unsync-dialog-titles
date: 2026-09-08
status: complete
closes_todo: 2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md
---

# Summary: distinct EGS sync / unsync dialog titles

## What changed

`EgsSettings.tsx`'s success branch now selects its dialog title per outcome:

| outcome | title (en) | body (upstream, unchanged) |
| --- | --- | --- |
| sync enabled | **EGS Sync Enabled** | Sync Complete |
| sync disabled | **EGS Sync Disabled** | Unsync Complete |

Both titles were previously the single hardcoded literal `'EGS Sync'`.

- `src/frontend/screens/Settings/components/EgsSettings.tsx` — `tGamelib` alias
  added, the `newPath === 'unlink'` test hoisted to a named `unlinked` const
  (it was evaluated twice), title chosen from it.
- `public/locales/*/gamelib.json` — `settings.egsSyncEnabledTitle` and
  `settings.egsSyncDisabledTitle` added to **all 49 locales**.
- `src/frontend/screens/Settings/components/__tests__/egsSyncDialogTitles.test.ts`
  — new, 13 specs.

## Decisions taken during execution

- **"Enabled"/"Disabled", not the todo's suggested "Sync"/"Unsync".** The todo
  proposed `'EGS Sync'` vs `'EGS Unsync'`. "Unsync" is not ordinary English and
  still reads as a near-duplicate at a glance — the exact failure being fixed.
  The titles now name the resulting STATE, which the body copy then reinforces.
- **No icon/colour treatment.** The todo offered this as an alternative;
  it is not reachable. `DialogType` is `'MESSAGE' | 'ERROR'` (`src/common/types.ts:33`)
  and `MessageBoxModal` only branches on `'ERROR'`. There is no success variant
  to style without new component surface, which is out of scope for this todo.
- **All 49 locales were filled, not just en/de/fr.** See the deviation below.

## Deviation: hand-authored translations for 46 locales

The plan assumed en/de/fr. That was wrong, and the gate caught it:
`meta/__tests__/lintTranslations.test.ts` R13 went RED with **92 unrecorded
missing (locale, key) pairs**.

`meta/i18nCatalogPresenceBaseline.json` was at `totalPairs: 0` — quick task
`260908-gx3` regenerated it to full 49-locale parity earlier the same day.
Shipping two en-only keys would have dropped that from 0 to 92, and the
baseline's own `reason` text states it is "a RECORD of a known gap, **not a
permission to grow it**". Regenerating was therefore rejected.

The sanctioned fill is `pnpm machine-fill-gamelib`. **It is still blocked.**
`~/.gamelib.env` exports a well-formed 108-char `sk-ant-` key; sourcing it and
running a single-locale fill returns `HTTP 401`. The key is expired or revoked,
not misconfigured — this is the same blocker recorded on 2026-08-28, still live.

So the 46 remaining locales were **hand-authored**, grounded per-locale in each
catalog's own existing `message.sync` / `message.unsync` / `setting.egs-sync`
vocabulary rather than translated cold. Verified safe against the gates first:

- `validateTranslation()` enforces placeholder parity (these strings have none)
  and verbatim survival of glossary terms — the English sources contain no
  glossary term (`EGS` is not glossed; it does not contain the glossed `GE`).
- `gamelib.mt.json` manifests were deliberately **not** touched. The parity
  suite checks manifest ⊆ catalog ("lists only keys that still exist"), never
  catalog ⊆ manifest, so extra catalog keys are structurally fine — and not
  claiming MT provenance for hand-authored strings is the honest record.

**These 46 strings have had no native-speaker or pipeline review.** If the API
key is restored, re-running `pnpm machine-fill-gamelib` will NOT revisit them —
D-09 never overwrites an existing value. Replacing them is a deliberate act.

## Verification (all run, all green)

| gate | result |
| --- | --- |
| `npx jest --config meta/jest.config.js` | 38 suites, 1040 passed, 1 skipped |
| `npx jest --config src/frontend/jest.config.js` | 156 suites, 2353 passed |
| new suite `egsSyncDialogTitles.test.ts` | 13 passed |
| `pnpm lint-translations:gamelib` | 0 findings, 0 hard failures |
| direct key-set diff en vs all locales | **49/49 at exact parity, 226 keys** |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx eslint` (both touched source files) | 0 errors, 0 new warnings |
| `npx prettier --check` (all changed paths) | clean |

The key-set diff was run **directly** rather than trusting `lint-translations`:
that gate walks each translation's OWN keys, so an absent key is structurally
invisible to it.

## Non-vacuity

Two specs prove the gates can fail, both against live data rather than fixtures:

- The distinctness predicate is fed one real shipped title on **both** sides —
  exactly the pre-fix condition — and must return `false`, per locale.
- The hardcoded-title regex is run against the **live component source mutated
  back to the defect** (`title: 'EGS Sync' || unlinked`), proving it fires on
  this file's actual shape and not merely that it compiles.

Assertions match key strings, not whole `tGamelib(...)` call expressions:
prettier wraps those across four lines, and a regex written against the
unwrapped call would have matched nothing.

## Artifacts NOT regenerated (verified unnecessary, not assumed)

`EgsSettings.tsx` is already in `meta/i18nForkTouchedFiles.json` and already
absent from `meta/i18nGateScope.json` — it is DECLARED_UNSCANNED_DEBT in
`genI18nGateScope.test.ts`. Editing it changes neither artifact, so the A-17
ratchet and ANTI-ROT specs stay green with no regeneration. Confirmed by the
meta suite passing untouched.
