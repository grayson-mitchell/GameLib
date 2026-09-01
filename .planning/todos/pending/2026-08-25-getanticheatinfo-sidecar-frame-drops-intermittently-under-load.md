---
created: 2026-08-25
title: "`getAnticheatInfo`'s sidecar response frame goes missing intermittently under full-project load"
source: /gsd-execute-phase 34.6 regression gate (wave 8, after plan 34.6-14)
severity: unknown
status: pending
---

# `getAnticheatInfo`'s sidecar response frame goes missing intermittently under full-project load

## What was observed

During Phase 34.6's closing regression gate, `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`
failed once and passed once across two runs of the **identical** command
(`npx jest --selectProjects Backend`):

```
● sidecar enrichment flows (Phase 34.2 Plan 06)
  › REQ-34.2-14/SEAM Invariant B
  › REQ-34.2-14 channel "getAnticheatInfo" does not return UNPORTED_CHANNEL_MARKER
    and is present in the handler registry

  expect(received).toBeDefined()
  Received: undefined
  at enrichmentFlows.test.ts:1227  --  const response = findResponse(frames, `all8-${channel}`)
```

Run A: `Test Suites: 2 failed, 179 passed` / `Tests: 4 failed, 4234 passed`
Run B: `Test Suites: 1 failed, 180 passed` / `Tests: 3 failed, 4235 passed` (only `decompressPool`)

Targeted re-runs (`-t "getAnticheatInfo"`, 5 tests executing, 4235 skipped) passed **3/3**.

## What is already ruled out

- **NOT a missing registration.** `getAnticheatInfo` IS registered —
  `src/backend/sidecar/enrichmentFlowRegistration.ts:203`. The assertion that fails is the
  frame-arrival one (`findResponse(...)` is `undefined`), not the `UNPORTED_CHANNEL_MARKER` one
  on the next line.
- **NOT caused by plan 34.6-14**, which was documentation-only and touched no source file.
- **NOT the `decompressPool` failure**, which is separate and environmental (expects
  `lzmaDecoderKind() === 'native'`, gets `'pure-js'` — the native LZMA addon is absent from this
  machine). That one is already documented as pre-existing.

## Why this is NOT filed as "just a flake"

This project's own record is explicit that flake baselines can be undiagnosed bugs, and that a
full-suite run manufactures a different failure set under load. Both apply here, and they point
in opposite directions — one says "ignore it", the other says "load is exactly when the real
defect shows". It is recorded rather than dismissed because nobody has measured which it is.

The suite is one Phase 34.6 modified (34.6-07 substituted its unported exemplar to `authZoom`;
34.6-09 registered the SteamGridDB 5 + `getGogDiscounts` into the same registration module), so
"pre-existing" is an assumption here, not a measurement — it was never confirmed against a
pre-34.6 baseline.

## Suggested next step

Re-run `npx jest --selectProjects Backend` several times to get a failure rate, then determine
whether the dropped frame is a test-harness race (a `findResponse` poll that gives up early
under load) or a real ordering dependency in `bootstrap.ts`'s Block A / Block B sequencing —
the D-07 rider at `bootstrap.ts:576` and `enrichmentFlowRegistration.ts:46` both describe
`getAnticheatInfo` as structurally unable to return data until the `releasesInfoReady` listener
has fired, which is a plausible ordering surface.
