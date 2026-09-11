---
created: 2026-09-06
title: "The 'disable smooth scrolling' Accessibility toggle is inert — its only consumer, the Electron command-line switch, was deleted"
area: frontend
status: RESOLVED
resolved: 2026-09-11
resolved_by: quick-260911-srh
severity: minor
platform: any
ready: code
source: "quick-260906-gej, sweep FINDINGS.md section D residue"
files:
  - src/frontend/screens/Accessibility/index.tsx:51,232 (the still-rendered toggle)
resolves_phase: null
---

# The 'disable smooth scrolling' Accessibility toggle is inert — its only consumer, the Electron command-line switch, was deleted

## The unported side effect

Old `main.ts` consumed the `disableSmoothScrolling` setting via
`app.commandLine.appendSwitch('disable-smooth-scrolling')` (`main.ts:465`). This is Electron-only
configuration with no Tauri analogue — correctly absent from the sidecar, not a porting gap.

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

The setting still renders a live toggle at `src/frontend/screens/Accessibility/index.tsx:51,232`.
Its only consumer was the deleted Electron `app.commandLine.appendSwitch('disable-smooth-scrolling')`
(`main.ts:465`). The control is now inert.

## Consequence

The Accessibility screen shows a toggle that no longer does anything. A user who enables it gets
no behavior change and no feedback that it is a no-op.

## Resolution — 2026-09-11, quick task 260911-srh, commit `14b4a3602`

**Deleted, not re-wired.** The premise was confirmed exactly as filed: three references repo-wide
(`src/common/types.ts:133`, plus the read and the toggle in the Accessibility screen), none a
consumer.

The operator chose deletion after the fork was put to them. The reasoning that settled it: the old
Electron switch disabled **Chromium's compositor-level** smooth scrolling for wheel and keyboard
input, and WKWebView exposes no equivalent — so the behaviour the toggle advertised cannot be
restored under Tauri at all. A control promising it is the defect.

**Why the tempting alternative was rejected.** Re-pointing the toggle at the app's own five
programmatic `behavior: 'smooth'` call sites (`Discounts`, `Library`, `GamesList` ×2,
`ConsoleMode`) looked cheap and is not:

1. Per CSSOM-View an explicit `behavior: 'smooth'` **beats** the CSS `scroll-behavior` property, so
   the obvious in-repo precedent — the `body:has(.disableAnimations)` override at `App.css:116` —
   does not transfer. Each call site would need editing.
2. The setting lived in backend `AppSettings`, which those call sites cannot read
   (`SettingsContext` is not mounted outside the Settings tree). It would have had to migrate to
   `configStore`/`GlobalState` first, touching `storePolicy`, `electron_store` types,
   `ContextProvider`, `frontend/types.ts` and `GlobalState`.

That is a medium change shipping a *different feature* under the old label, for a `minor` todo.

**Two things this todo did not record, found during execution:**

- The `AppSettings` field had **no backend default anywhere** — nothing in `src/backend` seeded it,
  so `useSetting('disableSmoothScrolling', false)` had always returned the literal fallback. The
  field was vestigial beyond merely being unconsumed.
- `useSetting` was imported for this one call site (line 50 was its only use; line 17's
  `useSettingsContext` is a different hook). With `SRC_CEILING` at 1124 against a measured 1123,
  leaving the dead import would have consumed the last warning slot.

**Locale sweep trap worth remembering:** `public/locales/` is in `.prettierignore`, so the
catalogues are not prettier-normalised and must be edited in place rather than round-tripped
through a serialiser. **`da`, `id` and `nl` held the key as the last entry in its object** — simply
deleting those lines strands a trailing comma on the preceding line and breaks the JSON. 47 is the
complete population, not 49: `br/` and `sl/` have no `translation.json`.

**Verification.** Baseline taken at `b531f1cd8` before any edit. `codecheck` 0, `lint` 0 (src
1123/1124, tests 638/638), 24 tests pass, zero residual references repo-wide, all 47 catalogues
re-parsed. `lint-translations` is red both before and after on unrelated `ca.gamelib.humbleKeys.*`
— shown unrelated by zero failure lines mentioning `smooth`, and by
`meta/i18nCatalogPresenceBaseline.json` being scoped to `"namespace": "gamelib"` with
`totalPairs: 0`, so it never tracked this `translation`-namespace key and no regeneration is owed.

**Not verified in a running app** — pure deletion, no reachable code path remains, but no live gate
was run.
