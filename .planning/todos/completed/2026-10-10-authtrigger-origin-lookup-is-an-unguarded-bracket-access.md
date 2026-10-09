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

## Fix (2026-10-10, quick 261010-ho8, commit `a2f162db0`)

Took the `hasOwnProperty` guard, not a null-prototype map: it is the repo's existing pattern for
this exact input class (`steamFlowRegistration.ts` lines 176 and 324, `appShellFlowRegistration.ts`
line 599, `sanitizeSignInProbeOutcomeMap` in `src/common/signInState.ts` line 133 — all spelled
`Object.prototype.hasOwnProperty.call(...)`, never `Object.hasOwn` and never `in`), and it is the
smallest diff: `ORIGIN_TO_TRIGGER`'s declared type and `mapRefreshOriginToTrigger`'s return type
both stay unchanged.

Also added a `typeof origin !== 'string'` rejection inside the same function. The only production
caller, `steamFlowRegistration.ts:164-165`, passes `args[1] as string | undefined | null` — an
unchecked cast from the renderer IPC payload. A bracket index or `hasOwnProperty` call coerces its
key to a string, so an array like `['login-success']` would otherwise reach the `'login'` entry.
That gave the renderer no capability it lacked (it could already send the string itself), but it
is the same key-coercion class as WR-04, so it was closed in the same pass rather than left open.

Pinned by 8 regression cases in `authTrigger.test.ts`: an `it.each` over the five inherited
`Object.prototype` names (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`)
asserting `mapRefreshOriginToTrigger` returns the string `'startup'`; one case for the
array-coercion input; and an `it.each` over `'__proto__'`/`'constructor'` through
`noteRefreshTrigger('steam', origin)` asserting `currentTriggerLabel()` stays `'startup'` and the
gate stays locked. All 8 were red against the unguarded lookup and green after the fix (43/43 in
the file).

The Steam keyring gate itself was never escalatable by this defect: `DELIBERATE_TRIGGERS.has()`
already rejected any non-member value before and after this fix, which is why the original review
classified it as a warning, not a security defect. What this fix closes is
`currentTriggerLabel()`'s documented "never undefined, a log label" string contract and the
`[object Object]`-style noise the broken contract could put into `keyring_get` log lines.
