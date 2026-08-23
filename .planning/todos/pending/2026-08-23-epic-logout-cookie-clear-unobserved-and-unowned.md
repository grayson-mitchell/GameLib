---
created: 2026-08-23
source: 34.4.1 gap cycle 3, plan 34 (from D-29-08, filed 2026-07-31)
status: pending
severity: medium
resolves_phase: null
blocked_by: "no authenticated Epic session has been available on any gate run to date"
---

# Epic logout's cookie clear is UNOBSERVED — and, until now, unowned

## The claim that may NOT be made

Epic's logout calls the **same** Rust arm that Humble's disconnect proved fixed in Phase 34.4.1's
third live gate. The structural argument is sound.

**It is an inference from shared code, not a measurement.** That distinction is exactly what let
gate run 2's failure hide behind a fully green 3279/3279 suite. **No document may describe Epic's
logout as verified on this basis.**

What was actually observed on 2026-07-31: no authenticated Epic session existed, so the shared arm's
second caller was never exercised. No `clearEpicCookies` count line was seen. The removed-nothing
warning was neither observed to fire nor observed not to fire.

## Why this needed a todo — it was orphaned

`D-29-08` named **Phase 34.5** as owner. That was no longer true, and nothing had inherited it:

| claim | evidence | date |
|---|---|---|
| 34.5 does not own it | `34.5-26-SUMMARY.md:316` — *"The Epic logout path … was NOT specifically re-exercised by this plan … not independently live-verified here."* | — |
| 34.6 inherited only login + save-sync | 34.6's ROADMAP scope names *34.5 UAT test 11 (Epic login from scratch)* and *test 12 (`egsSync`)*. Logout is absent. | 2026-08-22 |
| 34.7 cannot own it | ON HOLD — its premise died (embedded Epic login works again) | 2026-08-22 |
| nothing else references it | `clearEpicCookies` appears in **no phase folder except 34.4.1's own** | 2026-08-23 |

Third recurrence of the `blocked_by`/`parked_to_phase` records-rot-silently shape. The dates are
recorded above precisely so the next reader can diff them instead of trusting the label.

## Greppable landmarks

- `clearEpicCookies` — the instrumented count line, added by `34.4.1-23-PLAN.md` (commit `ff298d657`,
  *"instrument and test Epic's clearEpicCookies, close the second F-6 Defect B caller"*)
- `epicLogout()` — `src/frontend/state/GlobalState.tsx:614-627` → `window.location.reload()`
- the shared origin-scoped storage-clear arm in `src-tauri/src/main.rs` (added by
  `34.4.1-15-PLAN.md`, wired by `34.4.1-16-PLAN.md`)

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days.

## Discharge condition — concrete, not a category

An authenticated Epic session exists, a logout is driven **live through the UI**, and the run
produces a `clearEpicCookies` count line whose count is cross-checked against an independent re-read
of the jar — the same paired-census discipline that closed F-6 for Humble.

A green unit suite does **not** discharge this. Every blocking defect in Phase 34.4.1 was found by a
human driving the UI; none by automation.

## Proposed owner

**Phase 34.6**, which already holds the live Epic surface (it inherited 34.5 UAT tests 11 and 12
from the parked 34.7). Adding it there is an explicit act — the existing inheritance demonstrably did
**not** cover logout.
