---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 02
subsystem: settings
tags: [settings, privacy, opt-in, macos]
requires: []
provides:
  - "AppSettings.shareDetectedFixes (factory default false)"
  - "ShareDetectedFixes macOS-only General settings toggle with (i) help"
  - "PRIVACY.md relay section"
affects: [57-04]
key-files:
  created:
    - src/frontend/screens/Settings/components/ShareDetectedFixes.tsx
    - src/frontend/screens/Settings/components/__tests__/ShareDetectedFixes.test.tsx
  modified:
    - src/common/types.ts
    - src/backend/config.ts
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
    - public/locales/en/translation.json
    - PRIVACY.md
decisions:
  - "Toggle is the only consent; no dialog (D-09). Readers use === true"
metrics:
  completed: 2026-11-02
---

# Phase 57 Plan 02: Share detected game fixes setting Summary

Opt-in `shareDetectedFixes` setting (off by default), a macOS-only General settings toggle with icon-only (i) help listing exactly what is and is not sent, and a PRIVACY.md that now documents the relay and its IP handling.

## Commits
- 4cd7b4d52 feat: setting type and factory default
- f08a83040 feat: ShareDetectedFixes toggle, tests, catalogue keys
- PRIVACY.md docs commit (see git log, `docs(57-02)`)

## Deviations from Plan

**[Rule 3 - Blocking] i18n extractor emitted an empty help string.** `pnpm i18n` read the fallback from a constant and wrote `""`; I inlined the literal, and since the extractor keeps existing values the help value was filled in by hand in translation.json.

**translation.json isolation:** the pre-existing uncommitted `clean_tiles`/`hide_titles` reorder was left unstaged. Only the two new keys were committed, via a filtered patch with `git apply --cached`. The reorder remains in the working tree (it was re-applied by `pnpm i18n` and is not mine).

PRIVACY.md commit sha line uses the HEAD sha at edit time. The relay URL is a placeholder noted as "exact URL added after deploy" (plan 12).

## Verification
5 jest tests pass, `tsc --noEmit` clean, prettier clean over the TS/TSX/PRIVACY paths, eslint clean on the new files. `pnpm lint` full run not executed. `graphify update .` run.

## Known Stubs
None.

## Self-Check: PASSED
