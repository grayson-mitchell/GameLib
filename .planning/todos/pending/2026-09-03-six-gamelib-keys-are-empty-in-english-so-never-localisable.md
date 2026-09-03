---
created: 2026-09-03
title: "Six `redeemKey.*` strings are empty in ENGLISH, so they render English in all 48 locales and can never be translated"
area: i18n
status: pending
severity: low
resolves_phase: ""
found_by: "Closing the two i18n fork-string coverage todos on 2026-09-03 (commit ef7d7b8e6) — both closure records name this residue as surviving unowned"
files:
  - public/locales/en/gamelib.json
  - src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts
  - src/frontend/index.tsx
  - meta/lintTranslations.ts
  - i18next-parser.config.js
---

# Six `redeemKey.*` strings are empty in ENGLISH, so they render English in all 48 locales and can never be translated

## The measurement

`public/locales/en/gamelib.json` holds **215 keys, of which only 209 are translatable**. Six are
empty strings in the **source** language:

```
redeemKey.alreadyOwned      redeemKey.rateLimited
redeemKey.error             redeemKey.successNoPackage
redeemKey.invalid           redeemKey.successWithPackage
```

All six have **live call sites** in `src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts` at
lines **43, 54, 64, 74, 83 and 94**, each of the shape `t('gamelib:redeemKey.X', message)` where
`message` is a pre-assigned hardcoded English string that is *also* passed as the i18next default
argument, wrapped in a `try`/`catch` that keeps the fallback if `t` throws.

## What this is NOT — no blank dialog, and that is why severity is low

**Verified against real i18next, not inferred.** `src/frontend/index.tsx:154` sets
`returnEmptyString: false` alongside `fallbackLng: 'en'` at `:156`, so an empty catalog value is
treated as *missing* and lookup falls through to the hardcoded English default.

Measured directly on the real catalogs:

| call | returns |
|---|---|
| `de` — `t('gamelib:redeemKey.error', <fallback>)` | the English fallback string, **not** `''` |
| `en` — same call | the English fallback string |
| `de` — a normal key in the same catalog | correct **German** |

So the dialog always renders readable text. Nothing is broken on screen. Anyone triaging this
should not spend time hunting a blank-message bug.

## The actual defect

These six strings render in **English in all 48 non-English locales and can never be translated**.
The machine-fill correctly skips any key whose English source is empty — and the empty English
value is precisely what makes them un-fillable. **The gap is an AUTHORING gap in `en`, not a
translation gap.**

The fix is to author the six English strings into `en/gamelib.json`, at which point a
`pnpm machine-fill-gamelib` run picks them up for all 48 locales automatically. The hardcoded
English defaults already sitting in `copy.ts` are the obvious source text.

## Decide whether this is a bug or a deliberate trade-off BEFORE fixing it

A comment at `meta/lintTranslations.ts:161-167` documents keys of exactly this shape as
**"legitimately empty"** by design — `defaultValue: ''` plus `returnEmptyString: false` plus the
inline `t(key, 'Default')` fallback — citing `i18next-parser.config.js` and `34.8-09-PLAN.md`.
This may therefore be an accepted trade-off rather than an oversight. Whoever picks this up should
settle that question first.

**One discrepancy worth a look:** that comment says **48** such keys were introduced by plans
34.8-07/08a/08b/08c. Only **6** are empty today. The difference is unexplained.

## Provenance

Filed from the residue carve-outs in
`.planning/todos/completed/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
and
`.planning/todos/completed/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`,
both closed 2026-09-03. Both state in writing that this residue survives their closure with **no
owner**, which is why it is being filed rather than left in a closed record.
