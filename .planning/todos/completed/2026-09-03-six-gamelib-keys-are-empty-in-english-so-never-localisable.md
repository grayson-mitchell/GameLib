---
created: 2026-09-03
title: "Six `redeemKey.*` strings are empty in ENGLISH, so they render English in all 48 locales and can never be translated"
area: i18n
status: completed
severity: low
resolves_phase: "41-01, 41-05"
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

## RESOLVED 2026-09-06 (phase 41-01 authored the strings; phase 41-05 settled the policy question)

Plan 41-01 authored all six `redeemKey.*` strings into `public/locales/en/gamelib.json` from
`copy.ts`'s existing hardcoded English defaults (the "obvious source text" this record already
pointed at). Measured directly: `en/gamelib.json` now has **224 keys, 0 empty values** (was 215
keys / 6 empty). The "AUTHORING gap in `en`" this record diagnosed is closed.

**The open question this record raised — bug or deliberate trade-off — is settled: it was stale
prose, not a deliberate policy.** The `meta/lintTranslations.ts:161-167` comment claiming "48
legitimately empty keys by design" has been replaced (plan 41-03) with a measured statement, and
this record's own "one discrepancy worth a look" (48 claimed vs. 6 actually empty) is the reason
why: the comment was inherited prose that never got re-verified against the catalog as strings
were added and translated over time. There is no design that intends any `gamelib` key to stay
empty in English — the six that reached that state did so by omission when `copy.ts`'s call sites
were written, not by a documented policy. Plan 41-05 made the presence check key off `en` being
non-empty rather than exempting these six by name, so this class of gap degrades correctly (gets
reported) instead of needing a name-by-name carve-out register if it recurs.

**What remains open, and is now impossible to lose track of:** propagating the six strings to the
other 48 locales still needs a live `pnpm machine-fill-gamelib` run (an API key, previously
401'd) — out of phase 41's unattended scope. It is no longer an unowned diagnosis: the 288
`redeemKey.*` pairs (6 keys × 48 locales) are recorded by name inside
`meta/i18nCatalogPresenceBaseline.json`, phase 41-05's committed baseline, and reported by
`pnpm lint-translations:gamelib` on every run until they are filled. Tracked as a fresh pending
todo, `.planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md`.
