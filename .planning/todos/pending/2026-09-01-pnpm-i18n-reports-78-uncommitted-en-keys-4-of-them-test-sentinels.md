---
created: 2026-09-01T00:00:00.000Z
title: "`pnpm i18n` is RED with 78 uncommitted `en/` keys — 4 are test sentinels, and the fix collides with the D-05 churn guard"
area: i18n
status: pending
severity: medium
resolves_phase: ""
found_by: "Quick task 260901-n60 (triage that unblocked pull-upstream-i18n-catalog-refreshes)"
files:
  - i18next-parser.config.js
  - public/locales/en/translation.json
  - public/locales/en/gamepage.json
  - public/locales/en/gamelib.json
  - public/locales/en/login.json
  - meta/i18nCatalogChurnGuard.ts
---

## Symptom

`pnpm i18n --fail-on-update` — **leg 4 of `.husky/pre-push`** — exits 1. Measured
2026-09-01 at HEAD `d730934ad` on a clean tree.

The drift is **purely additive and confined to `public/locales/en/`**: 78 keys added, **0
removed, 0 English values changed**. Full classified inventory in
`.planning/quick/260901-n60-record-the-i18n-drift-triage-that-unbloc/260901-n60-TRIAGE.md`.

| namespace | committed | generated | added |
|---|---|---|---|
| `en/translation.json` | 978 | 1049 | 71 |
| `en/gamepage.json` | 290 | 294 | 4 |
| `en/gamelib.json` | 141 | 143 | 2 |
| `en/login.json` | 15 | 16 | 1 |

The raw `git diff` is 141 lines; roughly half is key-ordering churn only — the parser emits
a case-insensitive sort, the committed catalogs are case-sensitively sorted or hand-ordered.

## The 78 keys in four buckets

**T — 4 test-only sentinels leaking into shipped catalogs.** `i18next-parser.config.js`'s
`input: ['src/**/*.{ts,tsx}']` matches 343 `__tests__` files, so test-local keys get
extracted:

| key | source |
|---|---|
| `translation:bottle.setup.done` = `"INLINE-DEFAULT-SENTINEL"` | `screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts:118` |
| `translation:no.such.key.anywhere` = `"fallback"` | same file, `:123` |
| `gamelib:__wr16spec.plural` | `screens/Library/components/FilterChipRow/__tests__/chipLabels.realI18next.test.ts` |
| `gamelib:__wr16spec.typo` | same file |

Note `bottle.setup.done` has a **real** production call site at
`SteamBottleSetup.tsx:499` with the correct default `'Done'` — the test's sentinel wins only
because the test file sorts later. Excluding tests fixes this key correctly, it does not
delete it.

**P — 6 plural-suffix expansions of keys that already exist.**
`humble.notification.expiringBodyPlural_{one,other}`, `humbleKeys.tabSpares_{one,other}`,
`humbleKeys.tabWaiting_{one,other}`. The parser generates these because the values contain
`{{count}}`. This is very likely a **live bug being surfaced, not noise**: `{{count}}` is a
reserved interpolation name, so i18next resolves the suffixed key at runtime and the base
key alone does not satisfy it. Check these three render correctly before dismissing them.

**E — 1 key with a lexer-unresolvable default.** `translation:box.repair.error` is a real
call site (`screens/Game/GameSubMenu/repairFailure.ts:138`) invoked as
`t('box.repair.error', message)` where `message` is a runtime variable, so the parser emits
`""`.

**R — 67 real fork-authored UI strings that never got a catalog entry.** Live surfaces:
`webview.login.*` (29 keys), `webview.unavailable.*` (4),
`redeemSteamKey.*` + `sidebar.redeemSteamKey` (6),
`steam.download.error.*` + `steam.resumeAvailable.notify` (5),
`box.steam.mac32Detected.*` (3), `box.error.install.*` (3), `setting.eosOverlay.unavailable*`
(2), `winetricks.unavailable*` (2), `settings.steamgriddb.*.unavailable*` (2),
`login.steam_logout_failed_*` (2), `queue.label.{failed,retry}` (2), `box.cancel`,
`button.close`, `login.humble_dialog_title`, `info.refresh-rating`,
`edit-game.sgdb.unavailable`, `steamgriddb.error.unavailable`, `login:button.paste`.

They render today via their inline English default, so English is not visibly broken — but
they are invisible to `meta/lintTranslations.ts`, which compares a translation's *own* keys
against English and is structurally blind to a key absent from English too. Same blindness
already recorded in
[[2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s]].

## Why you cannot just commit the parser's output

The two gates guarding `public/locales/` contradict each other on this drift:

- **`pnpm i18n --fail-on-update`** (pre-push) demands zero pending updates — i.e. that 71 of
  these keys be written into the upstream-owned `en/translation.json`, `en/gamepage.json`
  and `en/login.json`.
- **`meta/i18nCatalogChurnGuard.ts`** (D-05, asserted by `pnpm test:ci`) forbids `pnpm i18n`
  from changing *any* catalog except `gamelib.json` / `gamelib.mt.json`, on the grounds that
  such a change proves a `t()` call is missing its `gamelib:` namespace prefix.

The churn guard is **right about the cause**. Committing the parser output as-is would go
green on pre-push and violate D-05.

## What "done" looks like

1. **Exclude test files from the parser input** — `i18next-parser.config.js`'s `input` glob
   should drop `**/__tests__/**` and `*.test.{ts,tsx}`. Kills bucket T at the root.
2. **Re-namespace bucket R** — move the 67 fork-authored strings into
   `public/locales/en/gamelib.json` and give each `t()` call site its `gamelib:` prefix (or
   the `tGamelib` aliased hook the config's lexer already recognises), per
   [[new-strings-must-go-in-gamelib-json-not-translation-json]].
3. **Decide bucket P on the merits** — verify whether the three `{{count}}` keys currently
   render correctly; if not, this todo also fixes a live plural bug.
4. **Give `box.repair.error` a literal default** so the lexer can resolve it.
5. Then `pnpm i18n` should write **only** `gamelib.json`, which is exactly what the churn
   guard permits, and `pnpm i18n --fail-on-update` goes green.

Consider also teaching `meta/lintTranslations.ts` a presence check against `en/` — it would
have caught bucket R the day each key landed. Same fix the de/fr todo asks for.

## Measurement notes

- **`pnpm i18n --fail-on-update` writes nothing.** Verified twice: exits 1, leaves
  `public/locales/` byte-clean. Only **bare** `pnpm i18n` writes. The "back up first"
  precaution applies to the bare form only.
- To reproduce the inventory: `cp -R public/locales <backup>` → `pnpm i18n` → diff → restore
  with `rm -rf public/locales && cp -R <backup> public/locales`. Never `git checkout` — it
  fires `.husky/post-checkout`, which fails deterministically in this repo.

## Not coupled to the upstream pull

[[pull-upstream-i18n-catalog-refreshes]] was held BLOCKED on this drift until 2026-09-01.
That coupling was wrong: the drift is 100% under `en/` and the two upstream refreshes touch
73 files across 45 locales with **zero** under `en/`. The file sets are disjoint. Do not
re-block either on the other.
