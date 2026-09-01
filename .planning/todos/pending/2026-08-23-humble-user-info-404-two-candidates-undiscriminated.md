---
created: 2026-08-23
title: "Humble's post-login `/api/v1/user/info` returns a 232-byte HTML 404"
source: 34.4.1 gap cycle 3, plan 32 (from D-29-02, observed gate run 4)
status: pending
severity: low
resolves_phase: null
parked: 2026-08-23
parked_by: operator
blocked_by: "nothing external — an AUTHENTICATED probe discriminates the two candidates in one request. Unscheduled, not blocked."
revisit_trigger: "a user-visible symptom appears — this is non-blocking by construction, so absent one there is nothing to chase"
---

# Humble's post-login `/api/v1/user/info` returns a 232-byte HTML 404

## The claim that may NOT be made

Two candidates fit **every offline observation equally**:

1. the endpoint **moved** — the path is simply wrong now; or
2. an **interstitial** (consent, region gate, bot check) is answering in its place.

**An unauthenticated probe cannot discriminate them** — both return HTML, both return 404, both
return roughly that size. So no document may name a cause. Recording "probably the path moved" would
be a correlation shipped as a diagnosis, which this project has done before and paid for.

## Why it is non-blocking, and why that matters here

`finishLogin` gates on **`getGamekeys`**, never on `getAccountIdentity`. The 404 is therefore inert:
login completes, the library populates, and gate run 4's item 1 passed with this 404 occurring. It
was originally suspected of sharing a root cause with D-29-01 (the stale Manage Accounts view); that
was settled by code reading — **the two are unrelated**, not one shared cause.

This is the reason the park is defensible: there is no user-visible symptom to chase.

## Greppable landmarks

- `/api/v1/user/info` — the failing path
- `getAccountIdentity` — the caller
- `getGamekeys` — what `finishLogin` actually gates on; the reason this is inert

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days, and Humble's endpoints are exactly the kind of thing that moves under you.

## Discharge condition — concrete, not a category

One request to `/api/v1/user/info` **with a live authenticated session**, capturing the full response
body and status. That single observation separates the two candidates: a moved path answers
differently to an interstitial. Absent that, the answer stays **UNDETERMINED** and must be written as
such.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"). Parked is not
assigned: no phase owns this. Revisit if a user-visible symptom appears — not on a schedule.

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

34.6's live gate carried this as its "Optional rider — Humble login" (folded todo 4). Its own text
states plainly: "Not required by this phase's own leg. This phase's live gate logs into Epic; the
404 this rider investigates is a Humble surface." The gate's FINAL ADJUDICATION closing statement
confirms: "The optional Humble rider was **not exercised** and is explicitly **not required** by
this phase's own leg (this gate logs into Epic, not Humble) — it remains `NOT DISCHARGED` and
returns to pending, per its own stated rule that folding a todo into a phase's scope is not the
same as that phase discharging it."

No authenticated probe to `/api/v1/user/info` was ever made during 34.6. The two candidates (moved
endpoint vs. interstitial) remain undiscriminated. **Stays pending, UNDETERMINED**, exactly as
before — parked, non-blocking by construction (no user-visible symptom exists to chase), no phase
currently owns it.
