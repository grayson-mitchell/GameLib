---
phase: quick-260926-k4t
plan: 01
status: complete
subsystem: i18n
tags: [i18n, i18next-parser, steam-depot, plurals]
dependency-graph:
  requires: ["depot-stall-bound-did-not-fire"]
  provides: ["stalled-key-no-longer-collides-in-parser"]
affects:
  - "src/backend/storeManagers/steam/depotErrors.ts"
tech-stack:
  added: []
  patterns: ["defaultValue_one alongside a bare-string default", "non-vacuity control on a warning-count delta"]
---

# [QUICK-260926-k4t] Summary

## What changed

One options object, at `src/backend/storeManagers/steam/depotErrors.ts:294`: added
`defaultValue_one` matching the EN catalog's `stalled_one` byte-for-byte, plus an in-situ comment
recording the mechanism and — deliberately — what the change does **not** do.

The three-arg call shape was left alone. Its bare-string second argument is a documented defense
(`:286-292`): a stubbed/uninitialised i18next returns its second argument, so a string degrades to
a readable sentence where an options object would leak the object into `message`, typed `string`.

## Measured, not asserted

**RED → GREEN on `pnpm i18n`, with a non-vacuity control.**

Before — eight keys in the collision set, ours among them:

```
1 gamelib:box.error.install.stalled          <-- ours
1 gamepage:game.getting-install-size
2 translation:box.ok
1 translation:box.select.exe
3 translation:box.shortcuts.title
1 translation:setting.eosOverlay.updating
1 translation:settings.saves.not_supported
1 translation:wine.manager.settings
```

After — ours is gone and **the other seven are reported at identical counts**. That second half is
the control: a change that silenced the check entirely would also have removed our key, and would
have looked like a pass. The seven surviving lines prove the parser still detects collisions.

The parser WRITES catalogs, so this was checked rather than assumed:
`git status --porcelain public/locales` was empty after every run. No catalog file was touched.

Other gates: `lint-translations:gamelib` 0 findings / 0 hard failures (the `totalPairs: 0` baseline
held); `i18n-churn-guard` clean; `depot.test.ts` + `downloadmanager/utils.test.ts` 221/221 green,
including `depot.test.ts`'s "W-2: the stall branch mints NO new locale key" and `utils.test.ts:491`;
`pnpm codecheck` clean; `npx prettier --check` over the exact path written.

## Two corrections that were the real work

**1. The originating report said "drifted values across locales". That was FALSE and is recorded
here so it is not inherited.** Census over all 49 `public/locales/*/gamelib.json`: every one
carries `box.error.install.stalled_one` AND `_other`; zero absent. The 22 that additionally carry
`few`/`many`/`two`/`zero` are correct CLDR plural categories, not damage. The EN catalog matches
the DownloadManager call site's defaults byte-for-byte. An intermediate reading of the catalog as
`'... — install stopped'` (no "the") was a rendering artefact of compressed tool output, not the
file; re-extracting from the JSON directly gave `'... — the install was stopped'`. **The file was
never wrong; the reading of it was.**

**2. The warning class is ENDEMIC, not new.** Seven other keys already collided before this work.
So "silence the parser warning" was never achievable by this change, and the summary does not
claim it. What this closes is narrower and honest: we added a ninth collision earlier today in
`bed19006c`, and this removes it.

## What this deliberately does NOT do

- **No runtime behaviour change.** The key exists in all 49 catalogs, so under an initialised
  i18next both defaults are inert — the catalog wins before and after.
- **The uninitialised-i18next path is unchanged.** It returns the SECOND argument regardless of the
  options object, so that path still renders the plural sentence with an uninterpolated
  `{{count}}` even at count 1. Adding `defaultValue_one` does not reach it.
- The single real consequence is catalog regeneration: previously a catalog regenerated from
  source would have had the PLURAL sentence written into `stalled_one`.

## Residual

The seven pre-existing collisions and the two `already mapped to a map or parent` warnings
(`translation:notify.uninstalled`, `translation:notify.uninstalled.error`) are untouched and
unexamined. They are not in scope here and no todo was filed for them — whether the parser's
warning output is worth driving to zero is a separate call nobody has made.
