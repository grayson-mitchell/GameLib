# Phase 78: Verification records and test health after v0.9 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 78-verification-records-and-test-health-after-v0-9
**Areas discussed:** Test 'done' bar, How to correct records, Evidence for closures, Record scope edges

Scout before discussion: the four flagged suites passed 4/4, 209/209, on a dirty working tree.

---

## Todo folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold none | Matches are keyword noise | |
| Fold lint-red todo | 2026-11-14-lint-workflow-red-masks-ratchet-steps as test health | ✓ |

## Test 'done' bar

| Question | Options | Selected |
|---|---|---|
| Proof run | Clean HEAD + full suite / Clean HEAD targeted only / Today's green | Clean HEAD + full suite |
| Root cause | Attribute each / Only macArch / Just record green | Attribute each |
| Arch check | Both mocked x64 + Linux CI / Mocked only / You decide | Both |
| If red | Fix in this phase / Fix test only / Record + todo | Fix in this phase |

## How to correct records

| Question | Options | Selected |
|---|---|---|
| 52-VERIFICATION body | New current body, old kept / Dated addendum on top / Full rewrite | New current body, old kept |
| Gap status | superseded + pointer / resolved-accepted per row / Leave + note | superseded + pointer |
| 58 follow-ups | Drop fixed, cite fix / Keep all, mark each | Drop fixed, cite fix |
| Archive edit | Edit in place / Edit + audit note / Leave archive | Edit in place |

## Evidence for closures

| Question | Options | Selected |
|---|---|---|
| Fix proof | Code + test / Code only / Trust REVIEW-FIX | Code + test |
| ELEX Friends row | Live re-check / Close on attribution + code / Leave open + todo | Close on attribution + code |
| Live gates | Human UAT item in 78 / Separate todo / None | Human UAT item in 78 |
| 52 WR-03 half | Deferred + todo / Won't-do / Build in 78 | Deferred + todo |

## Record scope edges

| Question | Options | Selected |
|---|---|---|
| Stale comments | Include both / Exclude | Include both |
| 53 open substance | Record truthfully, don't fix / Re-check vs shim | Record truthfully |
| Wider sweep | 52/53/58 only / Records sweep 51–60 / File todos for rest | 52/53/58 only |
| Lint scope | Both halves / Under ceiling only / Un-mask only | Both halves |

## Claude's Discretion

- Attribution method (log reading versus a real bisect)
- Mechanism for the mocked-arch check

## Deferred Ideas

- Other v0.9 phases' stale items stay in the audit tech-debt list
- 52 WR-03 display acknowledgement → todo
- 53-UAT open substance → existing todos
