---
phase: 77-runtime-hardening-from-the-v0-9-review-debt
plan: 03
subsystem: relay
tags: [relay, deploy, live-probe, records]
requirements-completed: [DEBT-02]
completed: 2026-11-16
---

# Phase 77 Plan 03: Relay deploy + live probe — Summary

DEBT-02 closed to the D-07 bar: the 77-01 fix (cc7df4830) is merged, user-deployed, and probed live with 413.

## Deploy (user action; Claude did not run wrangler deploy)

- Pre-checks: 77-01 commits cd6f7946b + cc7df4830 on main; `readCappedBody(request, KNOWN_FIX_REPORT_MAX_BYTES)` count 1; wrangler 4.156.0; `relay/` clean.
- BEFORE: version `2a984bf9-497d-4061-b40e-d066d6e9e6a7`, 2026-11-02T03:47:23Z
- AFTER: version `86babc74-89b1-48d5-aeda-3494bdddeccf`, 2026-11-15T23:21:54Z (`pnpm --dir relay run deploy`)
- Deviation: `pnpm --dir relay deploy` failed with `ERR_PNPM_NOTHING_TO_DEPLOY` — `pnpm deploy` is a pnpm builtin that shadows the package script. The plan's command is wrong; use `pnpm --dir relay run deploy`.
- wrangler warned that multiple environments are defined and none was targeted; the top-level environment was deployed (bindings shown match production: D1 gamelib-fix-relay, IP_HOURLY_LIMIT 10).

## Probe (user action, sent once)

- 2026-11-15T23:23:32Z, cf-ray a5b201183b98ff2e-AKL, 98s after the deploy.
- Response: `HTTP/2 413`, body `{"status":"rejected","detail":"too large"}` — PASS.
- Request headers: curl negotiated **HTTP/2**, which has no Transfer-Encoding, so the `-H 'Transfer-Encoding: chunked'` header was dropped. The `>` lines show **no Content-Length** — the body was length-unknown on the wire (the HTTP/2 equivalent of chunked). curl reported 3012 bytes sent (3000-byte body + chunk framing), over the 2048 cap.
- Tail marker `relay: body over cap -> 413`: **NOT OBSERVED** (the pasted tail ended at "waiting for logs…"). So this probe does not prove which branch answered: the Cloudflare edge may have added a Content-Length (assumption A3) and the fast path answered. The capped-stream branch is proven by the 77-01 unit tests (chunked over-cap, lying Content-Length, stream error).
- Not resent, per plan. 1 of the prober's 10 hourly attempts used; no D1 row or PR (rejected at the size gate).

## Records

- REQUIREMENTS.md: DEBT-02 `[x]`; traceability `Complete (cc7df4830; deployed 86babc74 + live probe 413 2026-11-15, HTTP/2 no Content-Length; capped-branch tail marker not observed, branch unit-tested)`. DEBT-03/04 remain `[x]` from 77-02.
- v0.9-MILESTONE-AUDIT.md: WR-09 frontmatter item and ranked item 2 annotated with resolved-by notes; original text kept; frontmatter parses as YAML.
- No prettier check: both paths are under `.planning/` (prettier-ignored).

## Deviations

1. Executed inline by the orchestrator (two human checkpoints + one small doc task), not by a spawned executor.
2. Deploy command corrected to `pnpm --dir relay run deploy` (see above).
3. Probe went out over HTTP/2 rather than HTTP/1.1 chunked; recorded as-is. A future live check of the capped branch should add `--http1.1` to the curl.
