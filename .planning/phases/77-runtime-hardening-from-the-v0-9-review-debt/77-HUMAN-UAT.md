---
status: complete
phase: 77-runtime-hardening-from-the-v0-9-review-debt
source: [77-VERIFICATION.md]
started: 2026-11-15T23:26:31Z
updated: 2026-11-16T23:27:49Z
---

## Current Test

[testing complete]

## Tests

### 1. Relay capped branch answers a chunked over-cap POST live (HTTP/1.1)
expected: With `pnpm --dir relay exec wrangler tail gamelib-fix-relay --format pretty` running, `curl -sv --http1.1 -X POST -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @"$TMPDIR/gamelib-over2kb.txt" https://gamelib-fix-relay.gamelib.workers.dev/v1/reports` (3000 bytes of 'x') shows `> Transfer-Encoding: chunked` with no `> Content-Length:`, returns 413 `{"status":"rejected","detail":"too large"}`, and the tail prints `relay: body over cap -> 413`. Send once (1 of 10 hourly attempts).
result: issue — sent once 2026-11-16T23:24:22Z, cf-ray a5ba3fafed047256-AKL. Request went out HTTP/1.1 with `> Transfer-Encoding: chunked` and no `> Content-Length:` (3012 bytes sent); response `HTTP/1.1 413 Payload Too Large`, body `{"status":"rejected","detail":"too large"}`. Tail showed the request reached the Worker (`POST .../v1/reports - Ok @ 11/17/2026, 12:24:22 PM`) but printed no `relay: body over cap -> 413` line.
reported: "Successfully created tail, expires at 2026-11-17T05:21:27Z / Connected to gamelib-fix-relay, waiting for logs... / POST https://gamelib-fix-relay.gamelib.workers.dev/v1/reports - Ok @ 11/17/2026, 12:24:22 PM"
severity: minor

### 2. Overlay input smoke WR-01 cases pass on a desktop session
expected: `GAMELIB_DESKTOP_SMOKE=1 pnpm exec jest overlayInputSmoke` on a macOS desktop session runs (not skips) both WR-01 cases and they pass.
result: pass — run 2026-11-17 on the operator's macOS desktop session: 1 suite passed, 7 of 7 tests passed, none skipped (77-02 had recorded the same 7 as skipped), so both WR-01 cases ran and passed.

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "A chunked over-cap POST to the deployed relay is answered by the capped-stream branch, and the tail prints `relay: body over cap -> 413`"
  status: failed
  reason: "User reported: tail shows the POST reached the Worker (Ok) but no `relay: body over cap -> 413` log line; the 413 response itself was correct"
  severity: minor
  test: 1
  root_cause: "Likely the Cloudflare edge buffers a small chunked body and adds a Content-Length before the Worker runs (77-03 assumption A3). The Content-Length fast path at relay/src/handler.ts:121-123 then returns the same 413 without logging, so the capped branch at :126-133 never runs. Not yet confirmed: no Worker has echoed the inbound headers."
  artifacts:
    - path: "relay/src/handler.ts"
      issue: "the Content-Length fast path (:121-123) returns 413 without a log line, so a live probe cannot tell which branch answered"
  missing:
    - "Decide whether live proof of the capped branch is achievable at all (edge buffering may make it unreachable from public clients); if not, accept unit-test proof and retire this item"
    - "Optionally log a distinct fixed string on the fast path (e.g. `relay: declared length over cap -> 413`) so the next probe shows which branch answered"
  debug_session: ""
