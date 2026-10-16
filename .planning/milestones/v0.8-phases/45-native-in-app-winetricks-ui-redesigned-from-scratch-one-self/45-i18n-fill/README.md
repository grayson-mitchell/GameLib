# 45-i18n-fill: validator-first staged locale fill for the Winetricks tab

Phase-local tooling (not shipped). Used by plans 45-09 and 45-10 to land hand-translated
values for the 41 new `winetricksBrowse.*` keys (frozen in plan 45-03) across the 48
non-English locales.

## Invocation

```sh
JEST_WORKER_ID=1 node meta/runTs.cjs --bundle --platform=node --target=node21 \
  .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/applyFill.ts \
  --locales de,ja [--check] [--self-test]
```

Run from the repo root. `JEST_WORKER_ID` must be set: `applyFill.ts` imports
`meta/machineFillGamelib.ts`, and importing that module without `JEST_WORKER_ID` set fires
its own `main()` (a network call and filesystem writes) at import time.

- `--locales de,ja` — comma-separated locale codes to validate/write this run.
- `--check` — run every validation step but write nothing. Prints what *would* be written.
- `--self-test` — ignores `--locales`; builds an in-memory sabotaged translation (the `de`
  value for `selectedCount_other` with `{{count}}` stripped out) and asserts the validator
  rejects it. Exits 0 if the sabotage was rejected, 1 if it was not (a validator regression).

## Staging file shape

One flat JSON file per locale, at `45-i18n-fill/<locale>.json`, sitting alongside this
README:

```json
{
  "winetricksBrowse.family.vcrun": "…",
  "winetricksBrowse.selectedCount_one": "…",
  "winetricksBrowse.selectedCount_other": "…"
}
```

Keys are dotted paths into `winetricksBrowse`, matching the flattened shape
`meta/machineFillGamelib.ts` and `meta/__tests__/gamelibCatalogParity.test.ts` already use.
A missing staging file is treated as "nothing staged" — not an error by itself, but every
required key will then be reported as missing, which refuses the run.

## The plural rule

A plural base (e.g. `selectedCount`) must be staged for every suffix
`requiredPluralKeys(base, english, locale)` returns — the union of English's own suffixes
(`_one`/`_other`) and the target locale's CLDR plural categories (so `ru` needs
`_one`/`_few`/`_many`/`_other`, `ja` needs only `_one`/`_other`). A plural group must be
staged fully or not at all; staging only some of its required suffixes leaves the rest
reported as missing.

## "Validate before write, one locale failing blocks all"

`applyFill.ts` validates every requested locale before writing anything. If **any**
requested locale has a missing required key, an extra staged key it does not need, or a
value `validateTranslation` rejects (a dropped or introduced `{{placeholder}}`, or a
glossary term from `meta/i18nGlossary.json` that does not survive verbatim), the whole run
exits 1, prints every problem across every requested locale, and writes nothing — not even
for the locales that were individually clean. This mirrors the refuse-all-or-nothing shape
`meta/machineFillGamelib.ts`'s `BulkRunRefusedError` already uses for its own bulk-run guard.

## The round-trip rule

Before writing, the merged catalog (`JSON.stringify(x, null, 4) + '\n'`) and the updated
`gamelib.mt.json` manifest (`JSON.stringify(x, null, 2) + '\n'`) are each asserted to
round-trip byte-identically (serialize, parse, re-serialize, compare) using those exact
serializers. A round-trip failure refuses the write for every requested locale, the same as
any other validation problem.

## Provenance note

`mergeFill` (from `meta/machineFillGamelib.ts`) carries the prior manifest's `model` and
`filledAt` fields forward unchanged — this tool never stamps a new model name or timestamp,
because the values it writes come from a human-curated staging file, not a fresh MT run.
This is a known, stated inaccuracy: a locale's `gamelib.mt.json` keeps whatever `model`/
`filledAt` it already had (or blank, if it never had one) even after this tool adds keys to
its `keys` list. Only `keys` is kept current.

## What this tool never does

It makes no network call of any kind — no `fetch`, no `http`/`https` module, no `axios`,
and it never calls `createAnthropicTranslator` or `fillLocale` (both live in
`meta/machineFillGamelib.ts` and both reach the network). It is a pure filesystem
validator-and-writer over locally staged values. Project policy (phase 45's threat
register, T-45-11) is that catalog content must never leave the machine through this tool.
