---
created: 2026-10-31
title: Report a problem - live send gate (Web3Forms key + packaged-build send)
area: feedback
files:
  - src/frontend/helpers/reportProblem.ts
  - src/frontend/screens/Settings/sections/ReportProblem/index.tsx
  - src-tauri/tauri.conf.json
severity: medium
platform: any
ready: human
---

## Problem

The in-app "Report a problem" form (quick task 261031-s3g) is built and unit-tested, but
`WEB3FORMS_ACCESS_KEY` in `src/frontend/helpers/reportProblem.ts` is deliberately `''`, so Send is
disabled in every build and the live send has never been exercised. This is NOT verified.

## Steps

1. Sign up at https://web3forms.com with the operator email and paste the Access Key (UUID) into
   `WEB3FORMS_ACCESS_KEY`. Leave any "restrict to domain" option OFF (the webview origin is
   `tauri://localhost` / `http://tauri.localhost`, not a web domain).
2. Build with `pnpm tauri:dev:packaged`. A bundled build is required because the CSP
   (`connect-src https://api.web3forms.com`) does not apply under `tauri dev`.
3. Send one report with diagnostics on and one with them off (Settings -> Report a problem).
4. Confirm both emails arrive and that the diagnostics contain no home username, Steam ID or
   account name.
5. Confirm the webview origin (`tauri://localhost`) is accepted by Web3Forms CORS. This is
   unverified at plan time; if it is rejected the renderer POST needs a different route.
