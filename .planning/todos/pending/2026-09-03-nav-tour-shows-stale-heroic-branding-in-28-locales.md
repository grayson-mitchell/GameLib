---
created: 2026-09-03T00:00:00.000Z
title: 'Stale "Heroic" branding in translated catalogs — nav tour steps in 28 locales, and the version label in 38'
area: i18n
severity: minor
platform: any
ready: live-gate
needs: live-verification
status: OPEN
found_by: 'Phase 34.12-07 live UAT (measured across all 47 locale catalogs after the tooltip fix made tour text readable for the first time under Tauri)'
source: '.planning/phases/34.12-onboarding-tour-rework-re-anchor-the-disabled-sidebartour-ag/34.12-07-SUMMARY.md'
resolves_phase: ''
files:
  - src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx
  - src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx
  - public/locales/en/translation.json
  - public/locales/*/translation.json
---

## Problem

`NavShellTour` uses new `tour.nav.*` keys for only **2 of its 12 steps** — `welcome.intro` /
`welcome.title` (step 1) and `version` (step 12). The other **ten** steps still read the
inherited `tour.sidebar.*` keys.

Decision **D-07** (plan 34.12-04) correctly identified that editing a `t()` fallback is inert
wherever the key already has a translation, and minted new keys to escape stale copy. But it
minted them for the three strings whose *English* text changed, not for every step whose
*translated* text was stale. The remaining ten steps therefore render whatever the locale
catalogs already say — and those were written for Heroic's retired sidebar.

**Measured 2026-09-03 across all 47 locale catalogs:** 28 locales have `tour.sidebar.*` values
containing "Heroic".

| key | live in nav tour? | locales affected |
| --- | --- | --- |
| `tour.sidebar.settings` | **YES** (step 4) | 28 |
| `tour.sidebar.docs` | **YES** (step 9) | 27 |
| `tour.sidebar.community` | **YES** (step 10) | 28 |
| `tour.sidebar.version` | no — superseded by `tour.nav.version` | 28 (dead string) |

Roughly **83 user-visible stale strings across 28 languages**. Affected locales: be, bg, ca, cs,
da, de, el, es, et, fr, ga, gl, hu, id, it, ja, lt, nb_NO, nl, pl, pt, pt_BR, ru, sv, tr, uk, vi,
zh_Hans.

German specimens:

- `settings`: "Konfiguriere die Einstellungen von **Heroic**, setze Standardeinstellungen für
  Spiele, prüfe Logdaten und mehr."
- `docs`: "Lese die Dokumentation für Hilfe, bei der Verwendung von **Heroic**."
- `community`: "Betrete unserer Community auf Discord und unterstütze **Heroics**
  Weiterentwicklung."

The `community` string has a **second, independent defect**: it promises a Discord community,
while the English source string is just "Support GameLib's development." That is content drift,
not only branding — translated users are told about a channel the English copy never mentions.

## Update 2026-09-03: step 10's anchor row was renamed

Quick `260903-vwi` renamed the settings row this tour step points at from the bare literal
**"Ko-fi"** to a translated **"Donate"** (`gamelib:donate.navLabel`). The row keeps its
`data-tour="nav-community"` anchor, its handler and its ko-fi.com destination -- only the visible
word changed.

That gives `tour.sidebar.community` a **third** problem, on top of the Heroic branding and the
English/translation Discord drift already recorded above: the English source string
("Support GameLib's development.") and all 28 translations describe a row that no longer carries
the name they were written against. Whatever copy is chosen for step 10 should be decided against
the renamed row, not the old one.

Nothing detected this coupling -- the anchor is a `data-tour` attribute, and no gate relates a tour
step's copy to the label of the element it points at. It was noticed only because the rename
happened to touch the same file.

## Second surface, found the same way: the version LABEL itself

`HeroicVersion/index.tsx:102` renders `t('info.heroic.version', 'GameLib Version')`. The English
fallback is correct, but **38 locales** translate that key to a Heroic-branded string — German
renders literally **"Heroic-Version: 0.7.0"** in the Settings panel.

This is the element nav-tour step 12 anchors to, so in German the tour tooltip correctly reads
"Check your current **GameLib** version..." while pointing at a label that says
**"Heroic-Version"**. Both were on screen together during the 34.12-07 run.

Affected (38): be, bg, bs, ca, cs, de, el, es, et, eu, fa, fi, fr, ga, gl, he, hr, hu, id, it,
ja, ko, lt, ml, nb_NO, nl, pl, pt, pt_BR, ru, sk, sv, ta, tr, uk, vi, zh_Hans, zh_Hant.

Same root shape as the tour strings — a valid key with a valid translation about the wrong
product — but a different surface, and it is visible without ever opening the tour. Worth fixing
in the same pass; it is a one-key change per locale.

## Why this was invisible until now

The tour tooltip never rendered at all under Tauri (see
`.planning/debug/introjs-tooltip-not-rendering.md`, fixed in `2cc58c186`), so no tour text had
ever been read on this shell. The i18n lint gate cannot catch it either: these keys **exist** and
**have translations** in every affected locale — they are perfectly valid entries whose content
is simply about a different product and a retired UI. No automated check in this repo can see
that.

## Fix direction

Mint `tour.nav.*` keys for **all twelve** steps rather than three, so every step escapes the
inherited catalogs at once — the same reasoning D-07 already accepted, applied to the full set
instead of a subset. Then:

1. Point `NavShellTour` at the new keys.
2. Put the new English strings in **`gamelib.json`**, not `translation.json` — note the existing
   `tour.nav.*` keys were minted into `translation.json` by plans 04/05, which is itself contrary
   to the fork-string convention and should be corrected in the same pass.
3. Decide the `community` copy deliberately: either the English gains the Discord mention or the
   translations lose it. They currently disagree.
4. Consider deleting the four now-dead `tour.sidebar.*` entries per locale, or leave them — they
   are unreferenced once all twelve steps move.

## Verification

Cannot be proven by the suite. Requires switching the app language and reading the tour, which is
only possible at all since `2cc58c186`. Check steps 4, 9 and 10 in at least one affected locale
plus one unaffected locale.

## RESOLVED IN CODE 2026-09-09 (quick `260909-r4h`) -- live gate still outstanding

Both surfaces this todo reports are repaired. **121 strings across 39 catalogs**, measured
before and after:

- `tour.sidebar.settings` (28), `tour.sidebar.docs` (27), `tour.sidebar.community` (28)
- `info.heroic.version` (38)
- Non-English "Heroic" in `translation.json`: **1967 -> 1846**, exactly -121.
- Discord promises in `tour.sidebar.community`: **28 -> 0**.

**The prescribed fix was NOT the one applied.** Minting `tour.nav.*` for all twelve steps
into `gamelib.json` is blocked at HEAD: `meta/i18nCatalogPresenceBaseline.json` sits at
`totalPairs: 0`, so twelve new keys x 48 locales = 576 unrecorded pairs would turn R13 red,
and `pnpm machine-fill-gamelib` still 401s. Minting would also have downgraded 48 locales
from translated-but-stale to English-only. Instead the keys were rebranded **in place**
using todo 20's own partition rule (English value says "GameLib" => product self-reference).

**Superseded fix-direction items:**
- Item 3 (decide the `community` copy) is DECIDED: translations realigned to the English
  source, dropping the Discord clause, since the anchored row is now "Donate" -> Ko-fi.
  Each language's own existing verb phrase was reused; only the false clause was removed.
- Item 4: `tour.sidebar.version` is confirmed **dead** (no `src/` reference) and was
  deliberately left stale -- editing it is churn on an upstream-owned file with no
  user-visible effect. The other three `tour.sidebar.*` keys are live and were fixed.

**Cost accepted (D-2):** these upstream-owned catalogs are no longer byte-identical to
upstream, so the next catalog refresh needs a merge rather than a wholesale copy. This is
the cost todo 20 already anticipated.

**Measured, and worth knowing:** the D-05 churn guard's `live tree` test runs
`git diff --name-only -- public/locales`, which is **unstaged-only**. The edit was RED
unstaged and GREEN once staged -- both runs recorded. The test's own comment claims it bites
"staged or unstaged", which inverts what its command does.

**Why this stays in `pending/`:** the repair is structural and measured, but this todo's own
Verification section requires switching the app language and reading the tour on a live run.
That gate has NOT been run. Nothing in the suite can discharge it -- the tour suites mock
`t()` to echo defaults, so they are green either way. Close this only after a live read of
steps 4, 9 and 10 in one affected locale plus one unaffected locale.
