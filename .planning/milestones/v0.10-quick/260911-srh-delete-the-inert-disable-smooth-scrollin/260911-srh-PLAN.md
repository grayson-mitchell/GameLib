---
quick_id: 260911-srh
title: Delete the inert 'disable smooth scrolling' Accessibility toggle
date: 2026-09-11
status: in-progress
resolves_todo: .planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md
---

# Delete the inert 'disable smooth scrolling' Accessibility toggle

## Why delete rather than re-wire

The old Electron consumer was `app.commandLine.appendSwitch('disable-smooth-scrolling')`
(`main.ts:465`), which disabled **Chromium's compositor-level smooth scrolling** for wheel and
keyboard input. WKWebView exposes no equivalent, so the advertised behaviour cannot be restored
under Tauri. A toggle that claims to offer it is the defect.

Re-pointing the toggle at the app's own five programmatic `behavior: 'smooth'` call sites was
rejected: per CSSOM-View an explicit `behavior: 'smooth'` **beats** any CSS `scroll-behavior`
override, so the cheap `body:has(.disableAnimations)` mechanism at `App.css:116` does not apply
here — each call site would need touching. The setting also lives in backend `AppSettings`, which
those call sites cannot reach (`SettingsContext` is not mounted outside the Settings tree), so it
would first have to migrate to `configStore`/`GlobalState` (touching `storePolicy`,
`electron_store` types, `ContextProvider`, `frontend/types.ts`, `GlobalState`). That is a medium
change shipping **a different feature under the old label**, for a `minor` todo.

## Evidence the setting is vestigial

Three references repo-wide, none a consumer:

| Location | Role |
|---|---|
| `src/common/types.ts:133` | `AppSettings` field declaration |
| `src/frontend/screens/Accessibility/index.tsx:50-53` | `useSetting` read |
| `src/frontend/screens/Accessibility/index.tsx:229-243` | the toggle that writes it |

Beyond having no consumer, the field has **no backend default anywhere** — nothing in `src/backend`
seeds it, so `useSetting('disableSmoothScrolling', false)` has always returned the literal
fallback.

## Tasks

1. `src/frontend/screens/Accessibility/index.tsx` — remove the toggle block, the `useSetting`
   call, and the now-unused `useSetting` import (line 50 is its only use in the file; line 17's
   `useSettingsContext` is a different hook, so leaving the import would trip the lint gate).
2. `src/common/types.ts` — remove the `disableSmoothScrolling: boolean` field.
3. Remove `accessibility.disable_smooth_scrolling` from the 47 locale files carrying it.
   `public/locales/` is in `.prettierignore`, so preserve existing formatting byte-for-byte.
   **3 files (`da`, `id`, `nl`) hold the key as the last entry in its object** — removing the line
   there strands a trailing comma on the preceding line and must be repaired, or the JSON breaks.

## Verification

- Every touched locale file still parses as JSON (all 49 re-parsed, not sampled).
- Zero `disableSmoothScrolling` / `disable_smooth_scrolling` references remain repo-wide.
- `pnpm codecheck`, `pnpm lint`, `pnpm lint-translations` measured against the pre-edit baseline
  at the same sha — a gate already red at HEAD is not counted as a regression.
