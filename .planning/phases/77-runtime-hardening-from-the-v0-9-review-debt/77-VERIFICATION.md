---
phase: 77-runtime-hardening-from-the-v0-9-review-debt
verified: 2026-11-16T00:00:00Z
status: human_needed
score: 3/3 roadmap goals verified in code; 2 residual live-proof items routed to human
re_verification: false
human_verification:
  - test: "Send the over-cap probe over HTTP/1.1 chunked (curl --http1.1 -H 'Transfer-Encoding: chunked' --data-binary @3000x) while `wrangler tail` runs"
    expected: "413 { status: 'rejected', detail: 'too large' } AND tail shows 'relay: body over cap -> 413'"
    why_human: "Needs the user's Cloudflare credentials and hits the public Worker. The 77-03 probe went over HTTP/2 and the capped-branch marker was not observed, so the deployed capped branch is proven only by unit tests."
  - test: "Run meta/__tests__/overlayInputSmoke.test.ts with GAMELIB_DESKTOP_SMOKE=1 on a desktop session"
    expected: "Both 'WR-01:' cases pass (live publisher never self-closes; dead publisher closes once)"
    why_human: "Suite is describe.skip by design (warps cursor, opens windows). DEBT-04 currently rests on the 2026-11-04 live spot-check (1ba023f7f) plus the fix present in source."
---

# Phase 77: Runtime hardening from the v0.9 review debt - Verification Report

**Phase Goal:** Close 57 WR-09 (relay unbounded body), 56 WR-02 (execFile handle holds sidecar event loop), 60 WR-01 (missed overlay close leaves game input blocked).
**Status:** human_needed (no gaps; residual live evidence is optional hardening)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Relay bounds body when Content-Length missing (DEBT-02) | VERIFIED | `relay/src/readCappedBody.ts` streams, counts bytes, `reader.cancel()` and returns `{ok:false}` past max; `handler.ts:126-130` calls it on every request after the CL fast path (line 121), logs marker, returns 413; rate-limit still precedes the read. `pnpm exec jest --selectProjects Relay`: 10 suites, 183 tests pass. Commit cc7df4830 exists. |
| 2 | Deployed and probed | VERIFIED (with caveat) | Deploy version 86babc74 and live 413 recorded in 77-03 SUMMARY (user action). Probe was HTTP/2 with no Content-Length; tail marker not observed, so which branch answered is unproven. |
| 3 | Sidecar exit not held by execFile handle (DEBT-03) | VERIFIED | Fix commits 4f41cfab7 and 0d5742ed3 exist on main; `src/backend/process/runner.ts` unref()s child and stdio handles (lines 104-107, 163, 313, 379); 77-02 spawn-bypass grep found no bypass; runner drain and boundedListing tests reported passing. |
| 4 | Game input released when overlay close missed (DEBT-04) | VERIFIED (code) / human for live re-run | Commit 2d3f1f5e8 exists; `native/steam-bridge/overlay-input/overlay_input.m` contains `publisher_check` (2 hits). WR-01 smoke cases are SKIPPED (desktop-only), so no automated pass; live spot-check 1ba023f7f (2026-11-04) is the evidence. |

## Judgement on the orchestrator notes

- 77-03 literal must_have expected chunked; HTTP/2 makes that impossible. Intent (deployed fix returns 413 on length-unknown over-cap body) was met; the stronger claim (capped branch answered) was honestly recorded as unobserved. Requirement is satisfied by code plus unit tests; not a gap, but the live branch proof is left as a human item.
- Skipped overlay smoke cases cannot count as passes; they are routed to human verification rather than failed, because the fix is present in source and was live-verified earlier.

## Requirements Coverage

| Requirement | Plan | Status | Evidence |
|---|---|---|---|
| DEBT-02 | 77-01, 77-03 | SATISFIED | Code, 183 relay tests, deploy and 413 probe |
| DEBT-03 | 77-02 | SATISFIED | Commits + runner unref + bypass grep |
| DEBT-04 | 77-02 | SATISFIED (live evidence dated) | Commits + native source + earlier live check |

All three IDs ticked in REQUIREMENTS.md (lines 57-59, traceability 95-97). No orphaned requirements.

## Anti-Patterns

No TBD/FIXME/XXX in `relay/src/readCappedBody.ts` or `relay/src/handler.ts`.

## Gaps Summary

None blocking. Two optional live-proof items above.

_Verified: 2026-11-16_
_Verifier: Claude (gsd-verifier)_
