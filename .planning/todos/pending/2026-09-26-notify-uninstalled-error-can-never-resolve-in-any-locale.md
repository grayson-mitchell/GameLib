---
created: 2026-09-26T00:00:00.000Z
title: "`notify.uninstalled.error` can never resolve — the parent is a string in all 47 catalogs, so the uninstall-failure notification is English-only everywhere"
area: i18n
severity: minor
platform: any
ready: code
source: "quick-260926-k4t follow-up, 2026-09-26 — the second warning class in the i18next-parser output, distinct from the value collisions"
files:
  - src/backend/utils/uninstaller.ts
---

## Problem

`pnpm i18n` reports, separately from the value-collision warnings:

```
Found translation key already mapped to a map or parent of new key already mapped to a string:
  translation:notify.uninstalled
  translation:notify.uninstalled.error
```

This is a **structural** conflict, not a wording one. `src/backend/utils/uninstaller.ts:123` calls
`i18next.t('notify.uninstalled.error', 'Error uninstalling')`, which requires `notify.uninstalled`
to be an object with an `error` child. It is not:

- **47 of 47** locale `translation.json` files have `notify.uninstalled` as a **string**
  (`'Uninstalled'` in English). Census: 47 string, 0 object, 0 absent.
- **0 of 47** carry `notify.uninstalled.error` in any form.

So the key can never resolve in any language. i18next falls through to the hardcoded second
argument, and every user in all 46 non-English locales sees the English string `Error uninstalling`
when an uninstall fails. The sibling call at `uninstaller.ts:141` — `t('notify.uninstalled')` —
works fine, which is why this has gone unnoticed.

`minor`, deliberately: users see sensible English, not a raw key or an error. The defect is that
the string is **structurally untranslatable**, and no gate can see it.

**Why no gate caught it.** `lint-translations:gamelib` is scoped to the `gamelib` namespace; this
key is in the legacy `translation` namespace and is invisible to it. The same blindness has
already shipped at least one other English-only key: `notify.uninstallNotConfirmed` is a
GameLib-added `translation` key present in **1 of 47** locale files. Measured, not inferred.

## Solution

**Rename the key so it is a sibling rather than a child — e.g. `notify.uninstallError`.** Do this
regardless of what is decided about translating it, because it is correct under every branch of
that question:

- It removes the structural string-vs-parent conflict, which is a live hazard for any catalog
  regenerated from source.
- It changes nothing a user sees today. Neither the old nor the new key exists in any catalog, so
  both fall through to the same hardcoded English default before and after.

That makes this `ready: code`: the unknown (should we translate it, and in which namespace?) does
not have to be dissolved to make the fix safe — it just has to be made not worth knowing first.

**Then, separately and with a person:** decide whether to add the string to a catalog at all.
- In `gamelib.json` it is **gated** — an English-only key has been measured at 48 hard failures
  against the `totalPairs: 0` baseline, and `machine-fill-gamelib` is unavailable under a
  gateway-scoped key. Adding it there means producing 47 real translations.
- In `translation.json` it is **ungated** and would ship untranslated, exactly like
  `notify.uninstallNotConfirmed`. That is a precedent, not a licence.

Do not fold that decision into the rename. See the sibling todo on the three reused `translation`
keys — it carries the same namespace question.

## Verification

After the rename, `pnpm i18n` reports neither `notify.uninstalled` nor `notify.uninstalled.error`
in the `already mapped to a map or parent` warning, while the value-collision warnings for the
three reused keys remain — that residue is the non-vacuity control proving the parser still runs.
Confirm `git status --porcelain public/locales` is empty afterwards: the parser writes catalogs,
and this change must not cause it to write one.
