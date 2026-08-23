---
created: 2026-08-23
source: 34.4.1 gap cycle 3 (REQ-34.4.1-GAP-11); un-checked 2026-08-23 by plan 30
status: pending
severity: medium
resolves_phase: null
parked: 2026-08-23
parked_by: operator
blocked_by: "nothing external — this needs a live login that exercises keyring_get, which any live gate provides. It is not blocked, it is UNSCHEDULED."
revisit_trigger: "the next live login gate anyone runs — Phase 34.6 runs one"
related_requirement: REQ-34.4.1-GAP-11
---

# `keyring_get`'s bounded, classified timeout is UNVERIFIED live

## The claim that may NOT be made

The bounded-timeout path exists in code and the unit suite is green. **That is not the same as
having watched it fire.** `REQ-34.4.1-GAP-11`'s own body reads *"This box stays UNCHECKED —
live-only"*, and plan 30 un-checked it in 2026-08-23 precisely because a checked box with a rider
saying otherwise is worse than an unchecked one.

Every blocking defect in Phase 34.4.1 was found by a human driving the UI; none by automation, while
the suite ran 3279/3279 and then 3387/3387 fully green. **A green suite does not discharge this.**

## Why this one has teeth

An unbounded `keyring_get` can consume the sidecar's **entire 60s RPC budget**, silently. That is the
whole reason the requirement exists. It is the most consequential of 34.4.1's three parked residuals
— the other two are diagnostic-quality.

Note the scope carefully: this is an **OBSERVABILITY** requirement — a classified, bounded error
instead of a silent stall. **It is NOT a root-cause fix for F-9** ([[.]] see the F-9 todo), and
closing it will not close that.

## Greppable landmarks

- `keyring_get` — the sidecar RPC arm
- `issuing keyring_get` — the per-slot log line; the Keychain dialog itself names no item, so
  slot attribution comes from this line and nothing else
- the recorded interaction: **a keyring timeout races Keychain approval** — a slow human approving a
  dialog is not a defect, and the two must not be conflated when reading a live run

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days.

## Discharge condition — concrete, not a category

A live run in which `keyring_get` **actually times out** (or is made to, by an unavailable/blocked
keyring), producing a **classified** error inside the bound rather than a silent consumption of the
RPC budget — and the elapsed time measured, not inferred. A run in which the keyring answers
normally proves only that the happy path works, which was never in doubt.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"). Parked is not
assigned: no phase owns this. It is cheap to fold into any live login gate, and Phase 34.6 runs one —
that is the natural revisit point, not a commitment.
