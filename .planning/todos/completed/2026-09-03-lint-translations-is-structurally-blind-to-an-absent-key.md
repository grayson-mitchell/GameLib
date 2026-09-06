---
created: 2026-09-03
title: "`lintTranslations.ts` iterates the TRANSLATION's keys, so a key absent from a locale is unreportable — the gate stays green at zero coverage"
area: i18n/tooling
status: completed
severity: medium
resolves_phase: "41-05"
found_by: "Carried by the 2026-08-28 de/fr todo, re-verified in current code and re-filed on 2026-09-03 when that todo closed (commit ef7d7b8e6) leaving this diagnosis unowned"
files:
  - meta/lintTranslations.ts
  - public/locales/en/gamelib.json
  - package.json
---

# `lintTranslations.ts` iterates the TRANSLATION's keys, so a key absent from a locale is unreportable

## Verified in current code, 2026-09-03 — not inherited prose

`meta/lintTranslations.ts:140-148`:

```ts
function checkFileAgainstEnglish(translations: object) {
  for (const key in translations) {
    checkValueAgainstEnglish(translations[key], enFiles[processingFile][key], key)
  }
}
```

The loop enumerates **the translation's own keys** and looks English up *by* that key. A key
present in `en` but **absent** from the translation is therefore never visited, so it can never be
reported. **The gate stays green at zero coverage for that key.**

**A second blindness at the same seam:** `checkLanguage` at `:168` does `if (!content) continue`,
so a translation file that is missing **entirely** is skipped in silence. A whole absent namespace
is exactly as invisible as a single absent key.

## The consequence is measured, not hypothetical

This is why the `de`/`fr` fork-string gap grew from **5 missing keys to 80**, completely
unobserved, between 2026-08-28 and 2026-09-02 while `pnpm lint-translations:gamelib` stayed
**green** — and why the plan's own "run machine-fill if the gate complains" trigger never fired.

**Closing the coverage gap on 2026-09-03 did not fix this.** Coverage is currently 100%, which
means the blindness is *currently harmless* — and will silently stop being harmless the moment
anyone adds a fork string to `en/gamelib.json`. The next key added will be exactly as invisible as
those 80 were.

## Proposed fix — for the record, not prescriptive

A presence check in the **opposite direction**: enumerate `en`'s keys and assert each exists and is
non-empty in every scoped locale catalog.

One carve-out is needed. Six `redeemKey.*` keys are legitimately empty in `en` itself (see
`.planning/todos/pending/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md`).
Either exempt them, or author them, or — cleaner — **key the check off `en` being non-empty**,
which needs no exemption list at all and degrades correctly if more empty-in-English keys appear.

## Separate observation, needs triage — a fail-open shape

`pnpm lint-translations:gamelib` currently prints Node **ENOENT stack traces** for
`public/locales/sl/translation.json` and `public/locales/uz/login.json` and **still exits 0**.

Both files are absent at `HEAD` too, so this is pre-existing and unrelated to `gamelib.json` — I
confirmed it is not caused by any 2026-09-03 work. But a gate that dumps error objects and reports
success is a fail-open shape.

**Flagged as an observation, not a diagnosed bug:** I have not established whether that exit 0 is
deliberate (those namespaces may simply not exist for every locale upstream) or accidental. Settle
that before changing it.

## Provenance

The diagnosis originated in
`.planning/todos/completed/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`,
closed 2026-09-03 alongside
`.planning/todos/completed/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`.
Both closure records state in writing that this diagnosis survives their closure **unfixed and
unowned** — it was the more valuable half of the 2026-08-28 record, and it is re-filed here so it
does not retire with the coverage gap it predicted.

## RESOLVED 2026-09-06 (phase 41-05)

`meta/lintTranslations.ts` now exports `checkEnglishKeysPresent` (and `missingPairs`, the single
shared derivation), which enumerates `en/gamelib.json`'s own flattened keys and asserts each is
present and non-empty in every scoped locale catalog — the exact inversion this record proposed.
It is wired into `checkLanguage`, gated to `FORK_OWNED_NAMESPACES` (currently `['gamelib']` only,
per D-15's unactionable-noise rationale for the three upstream namespaces). Keyed off `en` being
non-empty, exactly as this record's "cleaner" option suggested — **no exemption register for the
six `redeemKey.*` keys was created**; plan 41-01 authoring them to non-empty in `en` is what makes
that carve-out list unnecessary.

A committed baseline SET, `meta/i18nCatalogPresenceBaseline.json`, records the known-missing
(locale, key) pairs and is compared against a fresh live derivation on every
`pnpm lint-translations:gamelib` run — drift in EITHER direction (a new blind spot, or a fill that
was never re-recorded) is now a hard failure with every pair named. RED-proven in
`meta/__tests__/lintTranslations.test.ts` R8 (the new direction reports a wholly-absent key that
the old `checkFileAgainstEnglish` loop, exercised on the identical fixture via an upstream
namespace, cannot see at all) and R14 (the baseline comparison fails in both directions against a
copied, deliberately-sabotaged baseline).

**Two of this record's own claims are corrected here with the actual measurements, not left
standing:**

1. **"Coverage is currently 100%... the blindness is currently harmless" — this was wrong.**
   Derived directly from the committed catalogs at the time this check was built: **794** missing
   (locale, key) pairs across **17** distinct keys, invisible to the gate the entire time.
   Breakdown: the 6 `redeemKey.*` keys plan 41-01 authored (missing in all 48 non-English
   locales, 288 pairs) plus 11 other keys missing in 46 locales each (`de`/`fr` already had them;
   506 pairs). The blindness was not harmless — it was 794 real gaps reported as zero.
2. **The ENOENT observation named 2 absent catalogs; there are 5.** Plan 41-03 (a predecessor in
   this same phase) closed the fail-open ENOENT-dump shape and, in doing so, surfaced the true
   count: `br/gamepage.json`, `br/translation.json`, `sl/gamepage.json`, `sl/translation.json`,
   `uz/login.json` — all upstream-owned (Weblate), all now reported as one clean finding line
   each with zero exit-code contribution, per that plan's ownership classification.

**What remains open:** filling the 794 pairs requires `pnpm machine-fill-gamelib`, which needs a
working API key and has 401'd before — explicitly out of this phase's unattended scope. That work
is filed as a fresh pending todo,
`.planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md`,
pointing at the baseline file as its register of exactly what needs filling.
