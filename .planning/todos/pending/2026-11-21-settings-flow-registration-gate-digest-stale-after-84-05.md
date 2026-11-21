---
created: 2026-11-21T00:00:00.000Z
title: 'gameDetailsImportGate Gate 7 red: settingsFlowRegistration.ts changed by 84-05 without updating its digest and channel pin'
area: tests
severity: major
platform: any
ready: code
---

## Problem

Test run 44872994910 (main 5bd0c0b72): `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts`
fails two tests: "Gate 7: settingsFlowRegistration.ts matches its committed sha256 digest" and
"Gate 7 semantic pin: settingsFlowRegistration.ts registers exactly these twelve channels".
`src/backend/sidecar/settingsFlowRegistration.ts` was edited by 92ad8ec5b (84-05,
showLogFileInFolder / getLogContent served natively) and the gate was not updated.

Found during Phase 82 UAT item 2 re-test; owned by Phase 84.

## Solution

Confirm the 84-05 channel change is intended, then update the gate's channel list and committed
digest together, citing 84-05. If channels moved to Rust, the pin should name what remains.
