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

## Resolution

Resolved 2026-11-21 by 84-06 (commit 90ba1d3ab, "re-pin gameDetailsImportGate after getLogContent left
settingsFlowRegistration"); closed 2026-11-22.

- The 84-05 change was intended: `getLogContent` is served by the Rust native router (`nativeChannels.json`), so
  its sidecar registration and the `graceful-fs` / `getLogFilePath` imports were deleted. No other channel, guard
  or `steamSession.libraryState.library.has(` gate moved.
- 90ba1d3ab updated the channel pin and the sha256 digest together, citing 84-05. The registered set went from
  12 to 11, so the "twelve channels" test named in the Problem above is now "exactly these eleven channels".
- Quick 261121-pwt (06a741eb1) re-pinned the file again later for a comment-only docstring edit. The current pin
  is `d05b557e5d0a9c05611b9447b98803e1b9f2d55652d0f2053db8cfacb6175769`, which matches
  `shasum -a 256 src/backend/sidecar/settingsFlowRegistration.ts`.
- Verified 2026-11-22 on main (fa6c791de): `npx jest --runTestsByPath
  src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts` passes 10/10, including both Gate 7 semantic pins.
