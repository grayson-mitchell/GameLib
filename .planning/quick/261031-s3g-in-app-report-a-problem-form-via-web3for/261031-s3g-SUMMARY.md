---
phase: quick-261031-s3g
plan: 01
subsystem: feedback
tags: [web3forms, redaction, settings, csp]
requires: []
provides:
  - In-app Report a problem form (Settings -> Report a problem)
  - On-device redaction module (src/common/reportProblem.ts)
affects: [src-tauri/tauri.conf.json, Settings panel nav]
key-files:
  created:
    - src/common/reportProblem.ts
    - src/common/__tests__/reportProblem.test.ts
    - src/frontend/helpers/reportProblem.ts
    - src/frontend/helpers/__tests__/reportProblem.test.ts
    - src/frontend/screens/Settings/sections/ReportProblem/index.tsx
    - src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx
    - .planning/todos/pending/2026-10-31-report-a-problem-live-send-gate.md
  modified:
    - src-tauri/tauri.conf.json
    - src/backend/__tests__/tauriConf.test.ts
    - src/frontend/screens/Settings/index.tsx
    - src/frontend/screens/Settings/sections/index.tsx
    - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
    - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
    - public/locales/en/gamelib.json
decisions:
  - Renderer POSTs to Web3Forms (free plan rejects server-side submissions)
  - WEB3FORMS_ACCESS_KEY is a plain exported constant, committed as ''
  - Log tail is cut by whole lines before redaction, byte-capped after
metrics:
  completed: 2026-10-31
---

# Quick 261031-s3g: In-app Report a problem via Web3Forms Summary

Settings -> "Report a problem" form that attaches on-device-redacted diagnostics and POSTs from the renderer to Web3Forms; disabled with a visible notice until an access key is pasted in.

## Commits

- 4ba5650a5 test: failing redaction tests (RED)
- d9119caed feat: pure redaction/payload module (GREEN)
- cca872128 test: failing collector/sender tests (RED)
- 25e3d18b6 feat: renderer collector, Web3Forms sender, CSP origin
- 294318710 feat: getReportEnv
- 51b7d6a8b test: failing form tests (RED)
- bcfc0d4ac feat: form, Settings route, nav entry, en strings, live-gate todo

## Results

- Jest: 59 suites touched, 1124 passed, 1 failed. The one failure is `appShellLayout.test.ts` ("GamesList no longer uses document.body as a scroll container", expected `/main\.content/`). It reads `src/frontend/screens/Library/components/GamesList/index.tsx`, which this task did not touch; pre-existing, out of scope.
- `npx tsc --noEmit`: clean. `pnpm planning-gates`: 12/12 passed. Prettier `--check`: clean on all code paths (all probed not-ignored; gamelib.json and the todo are ignored, so JSON.parse check + planning-gates stand in).
- ESLint: 0 errors, 13 warnings (3 pre-existing in Settings/index.tsx; test-file `any` warnings; one `react-hooks/exhaustive-deps` on the preview effect in ReportProblem, which is intentional so the preview does not refetch on every render).
- `graphify update .` run.

## Deviations from Plan

1. [Rule 3] `sections/index.ts` is actually `sections/index.tsx`; edited that file.
2. [Rule 2] Added `getReportEnv()` to the helper (app version + OS label for the subject line, never throws), with a test, because the form needs them at send time and the plan did not name a source.
3. Component tests use a slot-based React hook harness (no jsdom installed, per `src/frontend/jest.config.js`), calling the component as a function and inspecting host elements.
4. Redaction extras within the approved scope: `/userdata/<id>` Steam paths and `Basic` auth values are also redacted; common non-identifying folder names (shared, public, steamuser, default, all, user, users, steam, root, home) are never treated as usernames.
5. `NavShell` `SettingsPanel.test.tsx` and `destinationCoverage.test.tsx` pinned the row list; updated both to include "Report a problem".

## Known Stubs

None. `WEB3FORMS_ACCESS_KEY = ''` is intentional (not invented); the live send is an open gate tracked in `.planning/todos/pending/2026-10-31-report-a-problem-live-send-gate.md` (`ready: human`). The live send, and Web3Forms acceptance of the `tauri://localhost` origin, are NOT verified.

## Threat Flags

None beyond the plan's threat model. Payload, diagnostics and reply email are never passed to logError/console.

## Self-Check: PASSED
