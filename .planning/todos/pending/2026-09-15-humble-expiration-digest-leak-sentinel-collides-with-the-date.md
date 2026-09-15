---
created: 2026-09-15T00:00:00.000Z
title: "Humble expiration digest leak-sentinel is the bare string \"7\", which the EXPIRY DATE supplies — the test self-heals to green in August without being fixed"
area: test
severity: minor
platform: any
ready: code
status: OPEN
found_by: 'quick-260914-vbw, 2026-09-14 — appeared as a backend suite red while verifying an unrelated macOS entitlements change; measured pre-existing at baseline sha 7346ac7e6 in a clean worktree'
files:
  - src/backend/humble/__tests__/expirationAlerts.test.ts
---

## Problem

`expirationAlerts.test.ts`, test **"Pitfall 5: digest copy reads only title/expiration — never
revealedKeyValue/keyindex"**, asserts that the generated digest copy does not contain the
substring `"7"`, using it as a sentinel for a leaked `revealedKeyValue`/`keyindex`.

The digest copy legitimately contains the expiry date:

```
Expected substring: not "7"
Received string:    "Safe Title's Humble key now expires on 7/31/2026"
```

**The date supplies the `7`.** `7/31/2026` is July, so the sentinel matches the very string the
test is asserting about, and the assertion fails for a reason that has nothing to do with a leak.

## Why it matters — the failure mode is the GREEN, not the red

A red test is annoying. This one is worse than annoying, because **it will pass again on its own**
as soon as the fixture's expiry date stops rendering a `7` — any month outside July, or a
day-of-month without a 7. Nothing will have been fixed. The next person to look sees green and
concludes the sentinel is protecting against `revealedKeyValue` leakage, when in fact:

- while the date contains a `7`, the test fails for the wrong reason, and
- while the date does NOT contain a `7`, the test passes **whether or not a real leak exists** —
  because `"7"` is a one-character substring that a leaked key value would only coincidentally
  contain.

So in both states the assertion is uninformative about the thing it names. This is the
`flake-baselines-can-be-undiagnosed-bugs` shape: a calendar-dependent test that looks like
intermittency but is a defective assertion.

## Direction

Replace the bare `"7"` sentinel with something that cannot collide with rendered copy:

1. Give the fixture a `revealedKeyValue`/`keyindex` containing a **distinctive, improbable**
   token (e.g. `ZZ-LEAK-SENTINEL-ZZ`) and assert the digest does not contain **that**.
2. Alternatively assert structurally — that the digest is built only from the permitted fields —
   rather than by substring absence, which is inherently a weak negative.
3. Whichever is chosen, **freeze the date** in the fixture so the test is not calendar-dependent
   at all. A test whose result depends on today's date cannot be trusted either way.

Do not simply change the fixture's expiry month. That turns it green while leaving the assertion
just as uninformative, and re-arms the same trap for whichever month collides next.

## Verification

- `npx jest --selectProjects Backend --testPathPattern expirationAlerts` — note the project name
  is **`Backend`** (capital B; `backend` matches nothing and exits 0), and this repo is on
  jest 29.7.0 where the flag is `--testPathPattern` singular, not `--testPathPatterns`.
- Prove the sentinel actually detects a leak: inject a fixture whose `revealedKeyValue` IS in the
  digest and confirm the test goes RED. A negative assertion that has never been observed failing
  for the right reason is not yet a test.
- Confirm the result does not change when the system date is moved across a month boundary.

## Related

- Pre-existing, not introduced by quick-260914-vbw. Measured at baseline sha `7346ac7e6` in a
  clean worktree: fails there identically, with the same test name and message.
- `2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md` —
  neighbouring Humble-keys work.
