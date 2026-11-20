# Phase 77: Runtime hardening from the v0.9 review debt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 77-runtime-hardening-from-the-v0-9-review-debt
**Areas discussed:** Closing DEBT-03/04, Relay body-bound method, Relay 'done' bar

Pre-discussion scout: DEBT-03 (56 WR-02) fixed in `4f41cfab7` and generalised by 66.2 `0d5742ed3`;
DEBT-04 (60 WR-01) fixed in `2d3f1f5e8` and live-verified 2026-11-04 (`1ba023f7f`). Only DEBT-02 is open.

---

## Closing DEBT-03/04

| Option | Description | Selected |
|--------|-------------|----------|
| Close on evidence | Re-run tests, cite commits, mark done, correct out-of-date 56/60 VERIFICATION + audit; no new live run | ✓ |
| Evidence + live overlay re-check | As above, plus a new live open, kill-helper, input-returns check | |
| Mark done now, drop from phase | Tick outside the phase; Phase 77 = DEBT-02 only | |

**User's choice:** Close on evidence

---

## Relay body-bound method

| Option | Description | Selected |
|--------|-------------|----------|
| Capped stream read | Reader with byte cap → 413; chunked bodies still accepted; Content-Length fast-path kept | ✓ |
| 411 when Content-Length is missing | Simplest; trusts the declared length unless the stream is also capped | |
| Both | Require Content-Length and cap the stream | |

**User's choice:** Capped stream read

---

## Relay 'done' bar

| Option | Description | Selected |
|--------|-------------|----------|
| Merged + deployed + probed | Unit tests, user-run `wrangler deploy`, one live chunked over-cap probe → 413 | ✓ |
| Merged with tests only | Deploy happens whenever the relay is next shipped | |

**User's choice:** Merged + deployed + probed

---

## Claude's Discretion

- Factoring of the capped-read helper; wording of resolved-by annotations; plan split.
- Added (not asked): cap applies even when Content-Length is present (a lying header); a sweep of
  non-runner `child_process` users as part of DEBT-03 closure.

## Deferred Ideas

None.
