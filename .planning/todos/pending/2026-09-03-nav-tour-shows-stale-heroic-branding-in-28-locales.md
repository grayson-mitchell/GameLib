---
created: 2026-09-03T00:00:00.000Z
title: 'Nav tour renders stale "Heroic" branding in 28 locales — D-07 minted 3 new keys but 10 of 12 steps still read tour.sidebar.*'
area: i18n
severity: minor
needs: code-fix
status: OPEN
found_by: 'Phase 34.12-07 live UAT (measured across all 47 locale catalogs after the tooltip fix made tour text readable for the first time under Tauri)'
source: '.planning/phases/34.12-onboarding-tour-rework-re-anchor-the-disabled-sidebartour-ag/34.12-07-SUMMARY.md'
resolves_phase: ''
files:
  - src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx
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
