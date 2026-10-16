---
phase: 25
slug: steam-depot-download-multi-host-fan-out-throughput
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-19
---

# Phase 25 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CDN content-server host → GameLib backend (`fetchChunk`) | Chunk bytes served by a Steam CDN edge cross into GameLib; the host set is the untrusted-network side. Phase 25 only re-orders WHICH already-vetted host a concurrent worker selects — it introduces no new host source, header, or hostname input. | Compressed depot chunk bytes (untrusted until SHA1-verified) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-25-01 | Spoofing (SSRF / host injection) | `pickHost` / `fetchChunk` host selection | mitigate | `workerSlot` is a bounded small integer used ONLY as an array index (`healthy[workerSlot % N]`, `hostHealth.ts:322-324`) into the pre-vetted `hosts` set from `getContentServerHosts`; `rotated`/`healthy`/`unhealthy` are all partitions of the input `hosts` array. It is never concatenated/parsed into a URL or hostname. Wiring verified end-to-end (`decompress.ts:844,864` → `depot.ts:931/978,1084/1166,1612/1656`). Membership asserted by `depotPrimitives.test.ts:572-632` and `hostHealth.test.ts` fan-out suite. | closed |
| T-25-02 | Tampering (chunk integrity) | `decodeChunk` SHA1 gate | mitigate | The per-chunk `sha1(data) === expectedSha` gate (`decompress.ts:354-360`, sha1 at `261-262`; T-21-03) is byte-for-byte unchanged. `fetchChunk` still routes every chunk through `decode()` regardless of which host attempt-0 fanned out to — spreading across more healthy hosts does not relax verification. SHA1-rotation + cancel/abort regression tests remain green. | closed |
| T-25-03 | Denial of Service (self-inflicted fan-out onto marginal hosts) | fan-out width | accept | Bounded by `TOP_N_FANOUT = 3` (`hostHealth.ts:139`); `N = Math.min(TOP_N_FANOUT, healthy.length)` (`L322`) selects only from the `healthy` bucket, never `unhealthy`. Circuit-breaker constants unchanged (`MAX_CONSECUTIVE_FAILURES=5`, `MIN_SAMPLES_FOR_UNHEALTHY=5`, `MIN_SUCCESS_RATE_FOR_HEALTHY=0.35`); `isUnhealthy()` untouched. Reliability risk, not a security threat; monitored by the Plan 25-03 hardware check (err=0, no unhealthy churn observed). | closed |
| T-25-SC | Tampering (supply chain) | dependencies | accept | No package installs this phase. `git diff` across the phase-25 commit range shows zero added `import`/`require(` lines in the three modified files (`hostHealth.ts` has no imports at all); `package.json` / `package-lock.json` unchanged. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-25-01 | T-25-03 | Self-inflicted DoS from fan-out onto marginal hosts is bounded by `TOP_N_FANOUT=3` selecting only from the healthy bucket, with the unhealthy circuit breaker untouched. Reliability (not security) risk; hardware check (25-03) observed err=0 and no unhealthy escalation. | grayson.mitchell@gmail.com | 2026-07-19 |
| AR-25-SC | T-25-SC | No dependencies added or changed in this phase; supply-chain surface is unchanged. | grayson.mitchell@gmail.com | 2026-07-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-19 | 4 | 4 | 0 | gsd-security-auditor (sonnet), ASVS L1 |

Supporting verification runs: `npm test -- --testPathPattern=hostHealth` → 20/20; `npm test -- --testPathPattern=depotPrimitives` → 65/65. No unregistered `## Threat Flags` in any Phase 25 SUMMARY.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-19
