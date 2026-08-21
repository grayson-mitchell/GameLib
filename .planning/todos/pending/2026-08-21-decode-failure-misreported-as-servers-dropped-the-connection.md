---
created: 2026-08-21
title: "A chunk DECODE failure is reported to the user as \"Steam servers dropped the connection\""
area: steam-depot
status: OPEN
severity: minor
files:
  - src/backend/storeManagers/steam/depotErrors.ts
resolves_phase: 37
planned_as: 37-02
---

## Symptom

An install that failed on **142 chunk decode errors, every one of them HTTP 200**, told the
user:

> The installation of  failed: **Steam servers dropped the connection.** Retry to continue.

The servers never dropped anything. Anyone debugging from that message starts on the network
and finds nothing wrong, because nothing is.

## Cause — exact line

`depotErrors.ts:174` classifies on:

```js
/failed after \d+ attempts|CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers/i
```

`failed after N attempts` is `fetchChunk`'s **retry-exhaustion wrapper**, which is emitted
regardless of WHY the retries were exhausted. A decode-stage failure exhausts retries exactly
like a network-stage one, so it lands in the connection-dropped branch and inherits network
copy.

The alternation's other terms are all genuine network signatures. The retry-exhaustion term is
the odd one out: it describes the *shape* of the failure, not its *cause*.

## Already half-known

`depot.ts:525` refers to this same string as "the misleading \"Steam servers dropped the
connection\" copy", and `depot/stallTracker.ts:13` carries a similar note. The misattribution
was recognised; the classifier was not fixed.

## How to apply

`fetchChunk` already distinguishes decode-stage from network-stage failures — `decompressPool.ts:201`
names `ChunkDecodeError` explicitly. Carry that distinction into the exhaustion message (or into
a structured field on the error) so `depotErrors.ts` can branch on cause instead of pattern-matching
a cause-agnostic wrapper. A decode failure deserves its own user-facing string.

**Test that fails first:** feed the classifier a retry-exhaustion message originating from
`ChunkDecodeError` and assert it does NOT return `steam.download.error.connectionDropped`.

## Scope WIDENED by the 2026-08-22 live runs — it is not only retry-exhaustion

Two new mis-classifications observed on real hardware, both non-network causes wearing network copy:

1. **An AUTH failure reported as a download failure.** With no stored refresh token, plan-build
   aborted in **1ms** — before any depot was attempted, before a single byte moved — and the user
   was told *"The Steam download failed. Retry to continue."* The log's own adjacent lines say
   `no authenticated Steam CM connection` and `logged in but no stored refresh token`. "Retry to
   continue" is actively harmful here: retrying without signing in can only fail again, which the
   operator then did.
2. **Confirmation the classifier CAN get it right.** When cycle 1's fix reclassified the decode
   failure as `sha1_mismatch`, the user-facing copy became *"A downloaded file failed
   verification"* — accurate, and no code change to `depotErrors.ts` was needed. So the defect is
   specifically the **cause-agnostic wrapper** terms, not the classifier's structure.

Suggested addition to the test matrix: a plan-build failure with NO authenticated CM connection
must NOT produce download-failure copy, and must not offer "Retry" as the only affordance.
