---
quick_id: 260911-srh
title: Delete the inert 'disable smooth scrolling' Accessibility toggle
date: 2026-09-11
status: complete
commit: 14b4a3602
resolves_todo: .planning/todos/completed/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md
---

# Delete the inert 'disable smooth scrolling' Accessibility toggle

## Outcome

The toggle, its `AppSettings` field, and its string in all 47 locale catalogues are gone.
One commit: `14b4a3602`, 49 files, +3 / -72.

## The decision, and why re-wiring was rejected

The old consumer was Electron's `app.commandLine.appendSwitch('disable-smooth-scrolling')`
(`main.ts:465`) — **Chromium compositor-level** smooth scrolling for wheel and keyboard input.
WKWebView exposes no equivalent, so the advertised behaviour cannot be restored under Tauri. A
toggle that claims to offer it is itself the defect, which is what made deletion the honest remedy
rather than a capitulation.

Re-pointing it at the app's own five programmatic `behavior: 'smooth'` call sites (`Discounts`,
`Library`, `GamesList` ×2, `ConsoleMode`) was considered and rejected on two independent grounds:

1. Per CSSOM-View, an explicit `behavior: 'smooth'` **beats** the CSS `scroll-behavior` property,
   so the cheap `body:has(.disableAnimations)` mechanism at `App.css:116` — the obvious in-repo
   precedent — does not transfer. Every call site would need editing.
2. The setting lived in backend `AppSettings`, which those call sites cannot read
   (`SettingsContext` is not mounted outside the Settings tree). It would have had to migrate to
   `configStore`/`GlobalState` first, touching `storePolicy`, `electron_store` types,
   `ContextProvider`, `frontend/types.ts` and `GlobalState`.

That is a medium change shipping **a different feature under the old label**, for a `minor` todo.

## Two facts found during execution that the todo did not record

- **The field had no backend default anywhere.** Nothing in `src/backend` ever seeded
  `disableSmoothScrolling`, so `useSetting('disableSmoothScrolling', false)` had always returned
  the literal fallback. The field was vestigial beyond merely being unconsumed.
- **`useSetting` was imported for this one call site.** Line 50 was its only use in the file
  (line 17's `useSettingsContext` is a different hook), so the import had to go with it — and with
  `SRC_CEILING` at 1124 against a measured 1123, leaving a dead import would have consumed the
  single remaining warning slot.

## Locale sweep

`public/locales/` is listed in `.prettierignore`, so the catalogues are not prettier-normalised and
formatting was preserved byte-for-byte rather than round-tripped through a JSON serialiser.

**`da`, `id` and `nl` held the key as the last entry in its object.** Deleting those lines strands a
trailing comma on the preceding line and breaks the JSON; the sweep detected this structurally
(next non-empty line starts with `}`) and repaired the preceding line. All 47 catalogues were
re-parsed afterwards — the full population, not a sample.

`br/` and `sl/` have no `translation.json` at all, which is why 47, not 49, is the complete
population. The key appears in no other namespace (`gamelib`, `gamepage`, `login`).

## Verification

Baseline measured at `b531f1cd8` **before** any edit, so "pre-existing" names a sha:

| Gate | Baseline @ `b531f1cd8` | After | Verdict |
|---|---|---|---|
| `codecheck` (tsc) | exit 0 | exit 0 | green |
| `lint` | exit 0, src 1123/1124, tests 638/638 | exit 0, src 1123, tests 638 | green, unchanged |
| `lint-translations` | **exit 1** (`ca.gamelib.humbleKeys.*`) | exit 1, same categories | **red before and after** |
| `prettier` (touched source) | clean | clean | green |
| `SettingsPanel` + `destinationCoverage` | — | 24 passed | green |

`lint-translations` was already red at baseline and is unrelated to this change. Rather than stash
or `git checkout --` the tree to re-measure (both carry known hazards in this repo — the
post-checkout hook, and stash stranding concurrent sessions), the claim was proved directly:
**zero failure lines mention `smooth`**, and the committed presence baseline
`meta/i18nCatalogPresenceBaseline.json` is scoped to `"namespace": "gamelib"` with
`totalPairs: 0` — it never tracked a `translation`-namespace key, so no regeneration is owed.

A key deleted uniformly from English *and* every locale cannot produce a "not localised" or
"Empty translation" failure, which is the structural reason the counts are untouched.

## Limitation

Not verified in a running app. The change is a pure deletion with `codecheck` and `lint` green and
no residual references repo-wide, so there is no reachable code path left to exercise — but no live
gate was run.
