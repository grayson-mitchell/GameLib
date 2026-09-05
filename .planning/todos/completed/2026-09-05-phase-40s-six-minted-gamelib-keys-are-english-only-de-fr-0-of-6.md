---
created: 2026-09-05T13:40:00.000Z
title: "Phase 40's six minted `gamelib.json` keys are English-only — de/fr are 0/6"
area: i18n/locales
needs: machine-fill-run-with-a-live-api-key
status: RESOLVED
resolved_by: 260905-c40
resolved_date: 2026-09-05
resolution: "de and fr both at 218 keys / 0 missing, 6/6 of the Phase 40 keys. The run filled 11 keys per locale, not 6 — five older gaps (about.* x4, donate.navLabel) had accumulated. ONE string (fr webview.unavailable.epic.body) was omitted by the model batch and was hand-authored by the assistant, not the script; see the commit for the provenance caveat."
severity: minor
blocks: nothing
origin: Phase 40 verification (40-VERIFICATION.md, GAP-E) — closed out by quick 260905-c40
files:
  - public/locales/de/gamelib.json
  - public/locales/fr/gamelib.json
  - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-I18N-CENSUS.md
---

## Problem

Phase 40 minted six user-facing keys. Measured 2026-09-05 by flattening all 49
`public/locales/*/gamelib.json` catalogs: **exactly one locale (`en`) carries them.**
The other 48 carry none. `de` and `fr` — the two locales the project's own **D-08
per-phase machine-fill convention targets** — are at **0/6**.

The six keys:

- `webview.embedPlaceholder.message`
- `webview.storeEmbedControls.hostLabel`
- `webview.unavailable.epic.body`
- `webview.unavailable.epic.heading`
- `webview.unavailable.platform.body`
- `webview.unavailable.platform.heading`

## Why it is not already done

`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` was attempted in-phase and failed
**HTTP 401**: `ANTHROPIC_API_KEY` in the execution environment was the literal placeholder
`sk-ant-...`. That is an honest environment limitation, not a skipped step — it was
recorded in `40-I18N-CENSUS.md` and `40-10-SUMMARY.md:143-161`.

## Why this file exists

The fill being undone is not the finding. **The finding is that it was recorded in three
prose locations and zero queues** — no todo, no backlog row, no ledger entry — which is
the exact shape Phase 40's own ROADMAP preamble was written to prevent.

It is also structurally invisible: `audit-uat` only parses VERIFICATION files whose status
is `human_needed` or `gaps_found` (`~/.claude/get-shit-done/bin/lib/uat.cjs:58`), and
`40-VERIFICATION.md` is `gaps_closed_partially`. So this item could **never** have surfaced
in a cross-phase audit no matter how many times one was run. This todo is the only thing
that keeps it reachable.

## User impact

Low, and bounded. English fallback works, so de/fr users see English strings rather than
missing text or a crash. The affected surfaces are the store-embed placeholder, the embed
chrome's host label, and the two "not available" panels.

## Definition of done

- `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` run with a **live** `ANTHROPIC_API_KEY`
- `de` and `fr` each report 6/6 on the census above
- The `gamelib.mt.json` provenance sidecars are updated in the same commit

## Related, deliberately NOT folded in

The other 46 locales being at 0/6 is the standing wider gap, not this item — see
`2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md` (completed) and
`2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`.
Scope this to de/fr, per D-08.


---

## Resolution (2026-09-05, quick `260905-c40`)

**CLOSED.** `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` run with a live key.
de and fr are both **218 keys / 0 missing**, 6/6 on the Phase 40 keys.

**This todo undercounted the work.** It described six keys; the run filled **11 per locale** —
the six plus `about.license`, `about.title`, `about.version`, `about.versionUnknown` and
`donate.navLabel`, older gaps nobody had censused. `GAMELIB_MT_LOCALES` scopes locales, not keys,
so they came along. Recorded because the DoD was written from Phase 40's own six and was
therefore narrower than the command it prescribed.

**One string did not come from the script.** `fr/webview.unavailable.epic.body` was skipped with
`translator returned no result for this key` — a transient batch omission by the model, not a
glossary or placeholder rejection. Two retries never reached the working tree (proven: no
`gamelib.mt.json` anywhere on the machine written after the first run; directory writable), so
the operator chose to have the assistant author it. It was validated with the script's own
exported `validateTranslation` against the real glossary — zero problems — and hand-merged with a
byte-fidelity-checked serializer. `gamelib.mt.json` has no per-key model field, so it is listed
under `claude-sonnet-5` though it came from Claude Opus 5. Named here, not passed over.

**Still open, deliberately separate:** the six `redeemKey.*` keys empty in English were correctly
excluded by `collectMissingKeys` (nothing to translate from) and remain under
`2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md`. The other 46 locales
remain at 0/6 under their own standing todos.
