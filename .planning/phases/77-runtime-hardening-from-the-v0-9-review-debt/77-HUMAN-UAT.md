---
status: partial
phase: 77-runtime-hardening-from-the-v0-9-review-debt
source: [77-VERIFICATION.md]
started: 2026-11-15T23:26:31Z
updated: 2026-11-15T23:26:31Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Relay capped branch answers a chunked over-cap POST live (HTTP/1.1)
expected: With `pnpm --dir relay exec wrangler tail gamelib-fix-relay --format pretty` running, `curl -sv --http1.1 -X POST -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @"$TMPDIR/gamelib-over2kb.txt" https://gamelib-fix-relay.gamelib.workers.dev/v1/reports` (3000 bytes of 'x') shows `> Transfer-Encoding: chunked` with no `> Content-Length:`, returns 413 `{"status":"rejected","detail":"too large"}`, and the tail prints `relay: body over cap -> 413`. Send once (1 of 10 hourly attempts).
result: [pending]

### 2. Overlay input smoke WR-01 cases pass on a desktop session
expected: `GAMELIB_DESKTOP_SMOKE=1 pnpm exec jest overlayInputSmoke` on a macOS desktop session runs (not skips) both WR-01 cases and they pass.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
