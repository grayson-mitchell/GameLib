---
created: 2026-10-09T22:50:00.000Z
title: 'steam/authTrigger.ts ORIGIN_TO_TRIGGER[origin] is a plain-object bracket lookup on renderer-supplied input with no own-property guard (49-REVIEW WR-04)'
area: auth
severity: minor
platform: any
ready: code
found_by: "Phase 49 code review, 49-REVIEW.md WR-04"
files:
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
---

# `ORIGIN_TO_TRIGGER[origin]` has no own-property guard

49-REVIEW.md WR-04 (`src/backend/storeManagers/steam/authTrigger.ts:69-76,138-143`). The origin
string arrives from the renderer and is used as a bare bracket key on a plain object, unlike the
`__proto__`/`constructor`-safe lookups this phase added elsewhere for the same class of input
(`parseSignInStore`, `sanitizeSignInProbeOutcomeMap`). It fails closed today (the `Set.has()`
check still blocks escalation) but corrupts `currentTriggerLabel()`'s string contract and can put
`[object Object]`-style noise into the keyring log lines. Fix: a null-prototype map or an
`Object.hasOwn` guard plus a test feeding `__proto__` and `constructor`.
