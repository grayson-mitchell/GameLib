---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 13
subsystem: frontend/settings
tags: [itad, settings, api-key, i18n]
requires: [47-10, 47-12]
provides:
  - Settings > Advanced "IsThereAnyDeal API Key" password field (ItadApiKey) after the SteamGridDB key
  - D-06 rejected-key role=status line in --status-danger
  - settings.itad.* strings in the en catalog
affects: []
tech-stack:
  added: []
  patterns: [icon-only (i) InfoBox on the label line, booleans-only status read, node-env component test with a minimal mocked useState/useEffect]
key-files:
  created:
    - src/frontend/screens/Settings/components/ItadApiKey.tsx
    - src/frontend/screens/Settings/components/__tests__/ItadApiKey.test.tsx
  modified:
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
    - public/locales/en/translation.json
    - meta/backendDiCeilings/frontend-screens-settings-components.json
key-decisions:
  - 'D-06 wording: the illustrative "Your IsThereAnyDeal key was rejected" is realised as the approved UI-SPEC string for settings.itad.apikey.rejected ("ITAD rejected this key, so Store Search is using the built-in key.")'
  - 'settings.itad.apikey.unavailable lives in translation.json (default namespace), not gamelib.json: only the gamelib namespace is presence-gated by meta/i18nCatalogPresenceBaseline.json, and a new gamelib key would add 40+ known-missing locale pairs'
  - 'The field calls window.api.itad.* directly (no callOrDeclare / SteamGridDB deferral constants): the ITAD key is live on Tauri, so an IPC failure is a real fault and disables the field'
requirements-completed: [PRICE-01]
duration: 25min
completed: 2026-11-17
status: complete
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
plan_head_before: f5298bfa251d2af0c86ad32285965e0612c181a1
plan_head_after: 0a253d84af6799e2dda6dee18c23ec73fa9f5329
---

# Phase 47 Plan 13: ITAD API key settings field Summary

A user can add, replace or clear their own IsThereAnyDeal key in Settings > Advanced; the stored value is never shown back, and a `role="status"` line in `--status-danger` says when ITAD rejected the key and Store Search fell back to the built-in one.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | 443fc2d15 | `ItadApiKey.tsx` + 6-case test + backendDiCeilings entry (jest.mock count 3) |
| 2 | 0a253d84a | barrel export, mount in AdvancedSettings after SteamGridDB, `settings.itad` en block |

`commits: 2` counts this plan's commits; a raw `rev-list` from `plan_head_before` reads 3 because another session committed `4c1106594` (docs) to main concurrently.

## What was built

- `ItadApiKey`: `getKeyStatus` on mount sets `hasKey` / `rejected`; typing calls `setApiKey(value)`, clears `rejected` and updates `hasKey = !!value`; the input value is local state only and is never filled from storage. Placeholder: optional text / "Key saved - type to replace, clear to remove" / "Unavailable on this build". Any IPC failure (status read or save) sets `unavailable`, which disables the field (T-47-48). `type="password"` (T-47-47). Icon-only (i) help on the label line, no Help link, no helper text under the input. Help and warning copy claim no quota or rate-limit benefit.
- AdvancedSettings: sibling `<div className="advancedSetting"><ItadApiKey /><hr /></div>` directly after the SteamGridDB block.
- Catalog: `settings.itad.apikey.{placeholder,placeholder_saved,rejected,title,unavailable}` and `settings.itad.help.description`, alphabetically between `gamescope` and `launchOptions`.

## Verification

| Check | Result |
| ----- | ------ |
| `jest --selectProjects Frontend --runTestsByPath ...ItadApiKey.test.tsx` | exit 0, 6 passed |
| `jest --selectProjects Meta --runTestsByPath meta/__tests__/backendDiCeilings.test.ts` | exit 0, 132 passed |
| `npx prettier --check` (ItadApiKey.tsx, its test, the ceilings json) | exit 0 |
| `npx prettier --check` (components/index.ts, AdvancedSettings/index.tsx) | exit 0 |
| `jest --selectProjects Frontend src/frontend/screens/Settings` (the pattern ran the whole Frontend project) | 5749 passed, 1 failed: NavShell `themeTokens` render-site census, the known failure from before this phase |
| `pnpm lint:src` | exit 0 |
| `jest --selectProjects Meta --runTestsByPath meta/__tests__/hardcodedStringGate.test.ts` | exit 0, 176 passed |
| `pnpm i18n-churn-guard` (after committing the translation edit) | exit 0 |
| `pnpm codecheck` | exit 0 |
| Acceptance greps | callOrDeclare/STEAMGRIDDB/DEFERRAL 0; `role="status"` 1; quota/rate limit 0; `<ItadApiKey />` 1 (after SteamGridDbApiKey); en `rejected` string 1 |

translation.json is prettier-ignored; it parses as valid JSON.

## Deviations from Plan

None - plan executed as written. Notes: the settings test uses the repo's node-env pattern (mocked `react` useState/useEffect, element-tree inspection) because no DOM is installed; the field reads `getKeyStatus` on mount only (Settings is a separate screen, so it remounts after any search that could have flipped `rejected`).

## Known Stubs

None.

## Threat Flags

None. T-47-46 (no echo), T-47-47 (password type) and T-47-48 (disabled on IPC failure) are mitigated and covered by tests.

## Backend / sidecar

No backend, sidecar or Rust files changed; `pnpm build:sidecar` was not needed and not run.

## Live-check items

- Settings > Advanced: the IsThereAnyDeal field appears under SteamGridDB, with an (i) on the label line; entering a key then reopening Settings shows the "Key saved" placeholder with an empty input; clearing it restores the optional placeholder.
- With a deliberately bad user key, run a Store Search, reopen Settings > Advanced: the danger-colored "ITAD rejected this key..." line shows; typing or clearing hides it.

## Self-Check: PASSED

- FOUND: ItadApiKey.tsx, ItadApiKey.test.tsx
- FOUND: commits 443fc2d15, 0a253d84a (ancestors of HEAD)
