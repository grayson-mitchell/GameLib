---
phase: 77
slug: runtime-hardening-from-the-v0-9-review-debt
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-16
---

# Phase 77 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Internet client -> relay Worker | Unauthenticated POST /v1/reports | Request body (untrusted, length may be absent or lying) |
| Operator -> Cloudflare | User-run wrangler deploy | Cloudflare credentials (user only) |
| Sidecar -> OS processes | Process spawning via ProcessRunner | argv, child handles |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-77-01 | DoS | handler body read | mitigate | relay/src/readCappedBody.ts:30-36 (total > max -> `reader.cancel()`, too-large); handler.ts:126,131-133 answers 413; test handler.test.ts:243 and readCappedBody.test.ts:54 | closed |
| T-77-02 | Tampering | lying Content-Length | mitigate | handler.ts:121-126 declared check only rejects over-cap, capped read always runs; lying-CL test handler.test.ts:296-317 expects 413 | closed |
| T-77-03 | DoS | slow/never-closing stream | mitigate (partial) / accept residual | cancel on overflow proven by readCappedBody.test.ts:54 (never-closing stream). Slow under-cap residual accepted (see log) | closed |
| T-77-04 | Info Disclosure | new log line | mitigate | handler.ts:132 fixed string `relay: body over cap -> 413`, no IP/header/body interpolated (also :128 fixed string) | closed |
| T-77-05 | DoS | stream read error | mitigate | readCappedBody.ts:22-27 catches read error; handler.ts:127-130 answers 400 (changed from 503 by review fix d29d9067b, WR-03; still handled, never throws); test handler.test.ts:323 | closed |
| T-77-06 | Abuse | rate-limit bypass | mitigate | handler.ts:102 `checkIpLimit` precedes body read at :126 (D-15) | closed |
| T-77-07 | Repudiation | closure records | mitigate | v0.9-MILESTONE-AUDIT.md:50,53,163,164 RESOLVED notes with hashes; 56-VERIFICATION.md/60-VERIFICATION.md:64 annotated; original text retained; commits 803348a3c, a8d47d736; hashes 4f41cfab7, 0d5742ed3, 2d3f1f5e8, 1ba023f7f, cc7df4830 exist in git | closed |
| T-77-08 | DoS | spawn bypass | mitigate | 77-02-SUMMARY.md D-03 classified hit list (no runtime bypass); re-verified: only src/backend/process/runner.ts imports child_process (line 18, spawns at 67/156/306/372) | closed |
| T-77-09 | Repudiation | false pass for skipped tests | mitigate | 77-02-SUMMARY.md test table records overlayInputSmoke as SKIPPED, not passed; DEBT-04 rests on 1ba023f7f + overlaySignal stated explicitly | closed |
| T-77-10 | EoP | Cloudflare credentials | mitigate | 77-03-SUMMARY.md: "user action; Claude did not run wrangler deploy" | closed |
| T-77-11 | Tampering | wrong code deployed | mitigate | 77-03-SUMMARY.md: pre-checks (cd6f7946b + cc7df4830 on main, readCappedBody count 1, relay/ clean); BEFORE 2a984bf9 / AFTER 86babc74 versions recorded | closed |
| T-77-12 | Info Disclosure | wrangler tail | accept | See Accepted Risks Log | closed |
| T-77-13 | Tampering | probe creating row/PR | mitigate | 77-03-SUMMARY.md: 3000-byte non-JSON body, sent once, 413 at size gate, no D1 row or PR; handler.ts size gate precedes JSON.parse (:126-138) | closed |
| T-77-14 | DoS | probe consuming rate limit | accept | See Accepted Risks Log | closed |

*Status: open · closed*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-77-01 | T-77-03 | Slow-but-under-cap streams are bounded only by Cloudflare Workers CPU/wall limits; no app-level timeout | plan 77-01 threat model | 2026-11-16 |
| AR-77-02 | T-77-12 | wrangler tail is live-only, no retention; the log marker carries no IP/header/body | plan 77-03 threat model | 2026-11-16 |
| AR-77-03 | T-77-14 | Probe uses 1 of 10 hourly attempts, by design | plan 77-03 threat model | 2026-11-16 |

## Notes (non-blocking)

- T-77-05 status code changed 503 -> 400 by review fix WR-03 (d29d9067b); the threat (unhandled read error) remains mitigated. The review fix report flags the intent change for human confirmation.
- The live probe (77-03) did not observe the tail marker and went over HTTP/2, so it does not prove the capped-stream branch live; that branch is unit-tested. Re-probe with `--http1.1` if live proof is wanted.
- Review-fix changes (WR-01, WR-03) are on main but not deployed (per 77-REVIEW-FIX.md); the deployed version 86babc74 predates them. The deployed code contains the cap itself (cc7df4830).
- Memory bound is max + one chunk (readCappedBody.ts:4-8), documented.
- No Threat Flags in summaries; no unregistered flags.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-16 | 14 | 14 | 0 | gsd-security-auditor |
| 2026-11-17 | 14 | 14 | 0 | orchestrator re-audit (State A short-circuit) |

## Security Audit 2026-11-17

| Metric | Count |
|--------|-------|
| Threats found | 14 |
| Closed | 14 |
| Open | 0 |

Re-audit of the existing register (all threats plan-time, all closed, so the auditor was not re-spawned). Evidence re-checked against HEAD: the only commit touching `relay/` or `src/backend/process/runner.ts` since the 2026-11-16 audit is 194734595 (one-line lint fix in `relay/src/__tests__/handler.test.ts`); `handler.ts` order still `checkIpLimit` (:102) -> `readCappedBody` (:126) -> 413 fixed-string log (:132) -> `JSON.parse` (:138); `readCappedBody.ts` still cancels the reader on overflow; `src/backend/process/runner.ts` is still the only `src/` module importing `child_process`.

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-16
