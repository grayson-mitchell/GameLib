---
status: complete
quick: 260927-q9t
completed: 2026-09-27
---

# 260927-q9t — Mint a distinct gamelib key for the EOS overlay's main status line

## What shipped

Took **Option B** for `setting.eosOverlay.updating`: minted a new fork-owned key,
`gamelib:setting.eosOverlay.updatingStatus`, carrying the fuller sentence
`'The EOS Overlay is being updated...'` for `getMainEosText()`'s main status line, in place of the
terse `'Updating...'` it was sharing with the update-button label. Shipped **real, verbatim
translations in all 48 non-`en` locales**. `translation:setting.eosOverlay.updating` and the
update-button call site (`t('setting.eosOverlay.updating', 'Updating...')`) are untouched, and so
are all 47 `translation.json` files.

Two commits, nothing pushed:
- `15705a0e0` — source edit + all 49 `gamelib.json` catalogs + the writer script.
- `7ed5c7b2b` — todo close (with Resolution) + the new call-style todo.

## Honesty disclosure — translation quality is unreviewed and ungated

**All 48 translations are model-produced and unreviewed.** They were authored by an opus planning
agent from a four-way parallel corpus, then reviewed once by the orchestrator, with one correction
(`lt`, see below) made after a 48-locale agreement audit. **No gate in this repo can see translation
quality.** `lint-translations` checks key PRESENCE only — a green run means 48 non-empty strings
exist at the right key, nothing more. Nothing in CI detects English-side or translation-side string
drift either. This was applied mechanically by the executor, per the plan's absolute constraint:
`locales.<code>.value` was copied verbatim via a JSON-in/JSON-out writer script, never hand-typed or
adjusted.

## Confidence spread — 16 high / 26 medium / 6 low

**Review first (low confidence):** `br`, `et`, `ka`, `ml`, `sl`, `th` — each is missing an in-repo
pattern parallel (no `translation.json` at all, or an empty/English-passthrough `installing`
sibling), so the aspect or surface form had to be authored rather than derived. `et` is low for a
different reason: the impersonal-passive pattern forces an apostrophe partitive (`EOS Overlay'd`)
onto an indeclinable noun-phrase — a native reviewer may prefer a nominal form instead.

**Review next, if there's appetite:** `ar`, `fa`, `he`, `hr`, `sk`, `ta`, `cs`, `fi`, `hu`, `lt`,
`eu`, `ga`.

**High (16):** `be`, `da`, `de`, `es`, `fr`, `id`, `it`, `ko`, `nb_NO`, `pl`, `pt`, `pt_BR`, `ro`,
`ru`, `sv`, `uz`. (Medium confidence covers the remaining 26; per-locale `basis` for every entry is
in `260927-q9t-translations.json`.)

## Method: NP-gender agreement rule, and the `lt` defect it was written to prevent

Where a predicate carries gender/number inflection, it must agree with the noun-phrase **actually
shipped** (the `gamelib` one), not the noun-phrase of the `translation.json` sibling the sentence
pattern was lifted from — those are different nouns in roughly 28 of the 46 locales that have both
files. An inflection copied across unchanged from the pattern source is a live agreement bug.

**Found on review:** `lt` had carried over the feminine `atnaujinama`, correct for
`translation.json`'s `perdanga` (fem) but wrong for gamelib's `EOS Overlay`, which that namespace
inflects as masculine — `EOS Overlay nepasiekiamas` and, decisively, `unavailableDetail`'s
`įdiegtas, atnaujintas ar pašalintas` uses this exact participle stem for this exact noun. Corrected
to `atnaujinamas`. All 20 locales with gendered predicate agreement (`ar`, `be`, `bs`, `ca`, `cs`,
`es`, `gl`, `he`, `hr`, `it`, `lt`, `pl`, `pt`, `pt_BR`, `ro`, `ru`, `sk`, `sl`, `sr`, `uk`) were
re-audited against their own gamelib catalogs, plus the remaining 28 swept for exposure. `lt` was
the only change; `pt` was the same class and was already correct. `setting.eosOverlay.unavailableDetail`
is the strongest witness for a locale's shipped-NP gender because it inflects three participles
against this exact noun.

## The ellipsis tension

The glyph comes from each locale's own `translation:setting.eosOverlay.installing` sibling where it
exists and is non-empty/non-passthrough (41 of 46 use `...`; `bg`/`ca`/`de`/`hu`/`ja` use `…`, `de`
with a preceding space); otherwise it falls back to the dominant convention of the gamelib catalog
the string actually lives in (`…` dominates all 49 gamelib catalogs, 14-19 occurrences vs 0-2 of
`...`).

**`en` keeps `...`** to match its own `installing` widget sibling, per the task brief — but
`en/gamelib.json` is itself **15 `…` to 1 `...`**, so the new English value is the minority
convention in its own file while being the matching convention in its own widget. The widget won;
this tension is recorded, not resolved.

## The fifth corpus source

`260927-q9t-corpus.json` (built by the orchestrator) carried `gamelib_unavailable`, `tr_installing`,
`tr_installed`, `tr_updating`, `tr_updateNow`, `has_translation_json` — but not
`gamelib:settings.eosOverlayUpdateConfirmBody` ("Update EOS Overlay to the latest version?"),
present in all 49 gamelib catalogs, surveyed live at planning time. It supplied the update verb the
fork itself had already chosen, in the same namespace as the new key, and **changed four values**
away from what the corpus alone would have produced: `fa` (gamelib spells the verb with a ZWNJ,
`translation.json` spells it spaced), `ja` (gamelib 更新 vs translation.json アップデート), `ml`
(gamelib spells the verb with NO zero-width non-joiner), `nl` (gamelib's native `bijwerken` vs
translation.json's loanword `updaten`). It also turned `br`, `hr`, `sk`, `sl`, `ta`, `th`, `fi` from
authored guesses into in-namespace derivations.

## Both red gate readings, verbatim

**Pre-fill (English-only intermediate) state** — the primary non-vacuity control, taken for free
from the natural intermediate state of the work, no destructive edit:

```
lint-translations[gamelib]: 48 findings, 48 hard failures
```

Naming exactly the 48 non-`en` locale directories (verified by diffing the failure list against
`ls -d public/locales/*/ | grep -v '/en/'`). Three verbatim examples:

```
ar.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline
az.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline
be.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline
```

**Post-commit single-locale control** — `sl` deliberately broken (chosen because it is one of the
six low-confidence locales), then restored via the writer script's `--force`, never `git checkout --`:

```
lint-translations[gamelib]: 1 findings, 1 hard failures
sl.gamelib.setting.eosOverlay.updatingStatus: a new key is not localised and was not recorded — fill it or regenerate the baseline
```

Restored, re-verified: `lint-translations[gamelib]: 0 findings, 0 hard failures`, and
`git status --porcelain public/locales` empty (the writer script reproduced the committed bytes
exactly).

## Todo attribution corrections

- **`totalPairs` attribution corrected.** The original todo said the key "is gated against a clean
  `totalPairs: 0` baseline." `comparePresenceBaseline()` asserts over `missing` and **never reads
  `totalPairs`** — `.planning/todos/completed/2026-09-07-presence-baseline-totalpairs-is-unenforced-prose.md`
  predicted exactly this misreading. The real mechanism is `missing`-drift in
  `meta/i18nCatalogPresenceBaseline.json`. The baseline file was **not** modified: byte-identical to
  HEAD throughout, `totalPairs: 0`, `missing: {}` before and after.
- **Count corrected.** The original todo said "47 real translations." Correct figure: **48**
  (49 locale dirs under `public/locales/`, minus `en`).

## Measured before/after — every `<verify>` item

| check | before | after | result |
|---|---|---|---|
| `pnpm lint-translations:gamelib` (baseline) | — | `0 findings, 0 hard failures` | recorded, matched plan |
| `pnpm lint-translations:gamelib` (English-only, non-vacuity control) | — | **`48 findings, 48 hard failures`**, naming all 48 non-`en` locales | **observed** — the required free intermediate red state was actually hit, not skipped |
| `pnpm i18n` `[en] gamelib` (1st run, after call-site edit) | Unique 317 / Added 0 | Unique **318** / Added **1** (key verified landed at `setting.eosOverlay.updatingStatus` via direct Python read) | matched |
| `pnpm i18n-churn-guard` | — | `clean -- no upstream public/locales/ catalog changed` (run twice: at intermediate state and again before staging) | passed both times |
| writer script run | — | `total written: 48`, pre- and post-write round-trip verified for all 48 | passed |
| `git diff --numstat public/locales` | — | **49 files, each `2\t1`** | matched the plan's corrected (not `1\t0`) baseline |
| shape-check script (comma-only delta) | — | `files changed: 49`, `BAD: none` | passed |
| `setting.eosOverlay` key order across 49 catalogs | — | 1 distinct order: `('unavailable', 'unavailableDetail', 'updatingStatus')` | matched |
| English-passthrough sweep | — | `english passthrough in: []` | none shipped |
| `pnpm lint-translations:gamelib` (post-fill) | 48/48 (above) | `0 findings, 0 hard failures` | green, falsifiability shown |
| `git status --porcelain meta/i18nCatalogPresenceBaseline.json` | — | empty | untouched |
| `pnpm i18n` `[en] gamelib` (2nd run, against completed 49-file state) | Unique 318 / Added 1 (1st run) | Unique **318** / Added **0**; numstat byte-identical before/after | idempotent, non-`en` files untouched |
| `pnpm codecheck` | — | clean, no output (both `tsc --noEmit` passes) | passed |
| `pnpm lint` | production 1107 / tests 638 | **production 1107 / tests 638**, `production: PASS \| tests: PASS`, exit 0 | unmoved, matched baseline exactly |
| `npx prettier --check .../AdvancedSettings/index.tsx` | — | `All matched files use Prettier code style!` | passed (the one real, non-ignored path) |
| `npx jest --selectProjects Frontend` | — | `179 suites / 3066 tests passed, 0 failed`, including both `EosActionConfirmationGuard.test.ts` and `EosDeclineCallSiteGuard.test.ts`, plus `removeEosOverlayConfirmation.test.tsx` | all green |
| Lock: `translation.json` × 47 | — | `git status --porcelain public/locales/*/translation.json` empty | untouched |
| Lock: update-button call count | — | `1` (exact match for `t('setting.eosOverlay.updating', 'Updating...')`) | survives, unchanged |
| Lock: `// Shared key: catalog` comment count | — | `0` | removed as required |
| Single-locale control (`sl` break) | — | `1 findings, 1 hard failures`, naming `sl.gamelib.setting.eosOverlay.updatingStatus` verbatim | red as expected |
| Single-locale control (restore) | — | `0 findings, 0 hard failures`; `git status --porcelain public/locales` empty | byte-stable restore, no `git checkout --` used |
| `python3 .planning/todos/todo-frontmatter-gate.py` | 16 pending | `OK: 16 pending todo(s)` (1 moved to completed, 1 filed) | matched |
| `pnpm planning-gates` | 12/12 | `12/12 planning gates passed` (rename staged) | matched |
| Staged/HEAD blob `## Resolution` count | — | `1` in both the index and `HEAD` | matched (see deviation note below) |
| `git status --porcelain` (final) | — | clean apart from this quick task's own docs artifacts (never committed) | matched |

## Deviations from the plan, and why

1. **`pnpm i18n` was run twice before translations were applied**, not once as Step 2 literally
   describes (once during exploration to confirm the nested path, once again while capturing a
   clean summary block). Both runs happened on the English-only intermediate state, before any of
   the 48 translations were applied, so the state Step 3's non-vacuity control depends on (48 hard
   failures on the pre-fill tree) was unaffected — the second early run only re-confirmed
   `Added keys: 0` against a state where the key already existed in `en`. Step 8's mandated second
   run (against the *completed* 49-file state) was still performed exactly as the plan specifies,
   with its own numstat-identical check. No file outside `en/gamelib.json` was touched by either
   early run.
2. **The `git mv` for the todo close initially staged a stale blob.** After editing the pending
   todo's body to add `## Resolution` and then running `git mv` to move it to `completed/`, the
   staged (index) blob unexpectedly matched the pre-edit content (`## Resolution` count 0 in the
   index) even though the working-tree file at the new path had the edit (count 1). This was
   caught by the plan's own staged-blob assertion (`git show :<path> | grep -c '## Resolution'`)
   before committing, fixed by re-running `git add` on the moved path to sync the index with the
   working tree, and re-verified (`0` → `1` in the index) before the gates and commit ran. Both the
   staged and final `HEAD` blob now carry the Resolution, as the plan requires. This is exactly the
   class of failure the plan's own threat model warns about ("this repo has shipped an unstaged
   todo body under green checks before") — the assertion caught it before it shipped.

No other deviations. All must-haves, all `<verify>` items in both tasks, and the top-level
`<verification>` block were satisfied as measured above.

## Files touched

- `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx` — call-site edit
- `public/locales/*/gamelib.json` (49 files) — new key, translations
- `.planning/quick/260927-q9t-mint-a-distinct-gamelib-key-for-the-eos/apply-translations.py` — writer script (committed as task content)
- `.planning/todos/completed/2026-09-27-eos-overlay-updating-is-terser-than-its-three-sibling-status-lines.md` — closed, with Resolution
- `.planning/todos/pending/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md` — new todo filed
