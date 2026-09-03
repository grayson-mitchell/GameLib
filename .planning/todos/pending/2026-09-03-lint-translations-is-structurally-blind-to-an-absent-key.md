---
created: 2026-09-03
title: "`lintTranslations.ts` iterates the TRANSLATION's keys, so a key absent from a locale is unreportable — the gate stays green at zero coverage"
area: i18n/tooling
status: pending
severity: medium
resolves_phase: ""
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
