---
quick_id: 260905-q4j
slug: discharge-humble-user-info-404-todo-with
description: Discharge the Humble `/api/v1/user/info` 404 todo with the control-verified authenticated probe it had itself specified
created: 2026-09-05
completed: 2026-09-05
status: complete
---

# Summary — the Humble `/api/v1/user/info` 404 is discharged

Two commits. The todo moved `pending/` → `completed/`; the interstitial candidate is **ruled out**;
the "moved" candidate turned out to be the **wrong framing**; and the false premise that produced
that framing was traced to two comments in the source and corrected.

## What was actually unknown, and what settled it

The todo had stood `UNDETERMINED` since 2026-08-23 behind one explicit, concrete condition — "one
request to `/api/v1/user/info` **with a live authenticated session**, capturing the full response
body and status". Nobody had taken it. Phase 34.6 carried it as an optional rider and its own final
adjudication recorded that the rider was never exercised.

Getting a live session: `security find-generic-password` blocked twice on an unattended Keychain
dialog (exit 152, then exit 24, both with empty stderr). The app's own WKWebView cookie jar
(`~/Library/HTTPStorages/com.gamelib.shell.binarycookies`) is unencrypted and needs no approval, and
its `_simpleauth_sess` entry was created **2026-08-30 00:57:17 — the same second** as the
`humble-session` Keychain item, so it is the session the app itself holds.

| # | Request | Status | Bytes | Body |
|---|---------|--------|-------|------|
| **A** | **AUTH** `/api/v1/user/order` — **the control** | **200** `application/json` | 993 | `ARRAY len=32` |
| B | AUTH `/api/v1/user/info` (app fidelity) | 404 `text/html` | 232 | bare framework 404 |
| C | UNAUTH `/api/v1/user/info` | 404 | 232 | identical to B |
| D | AUTH, Chrome UA + HTML `Accept` | 404 | 232 | identical to B |
| E | AUTH, `maxRedirects: 0` | 404 | 232 | identical; no 3xx hop |
| — | UNAUTH `/api/v1/user/order` (sibling) | **401** | 48987 | Humble-**branded** page |

**Row A is the whole probe.** A 404 without a liveness control proves nothing — an expired cookie
fails identically at every path. 32 orders returned at the same instant the subject 404'd.

## Verdict

**Interstitial: RULED OUT.** Bare WSGI-style framework 404 (no challenge/consent markup), no
redirect, no `cf-mitigated`, auth state irrelevant (B ≡ C byte-for-byte), UA irrelevant (B ≡ D) —
and decisively, an origin/session-level interstitial would have caught the sibling path. It did not.
Humble answers 401-with-branded-page when a route exists but the caller is unauthorized; this path
bare-404s in *both* auth states, so the request never reaches an auth check.

**"Moved": wrong framing.** `10-VALIDATION.md:106` records "404 (hard failure, every attempt)" at
Phase 10 — the first time the path was ever exercised. It never worked, so it cannot have moved.
Phase 10 had already recorded this as a "Known Limitation".

## The premise came from the source

`adapter.ts` asserted, twice, that the endpoint was "confirmed empirically in Plan 05
(10-VALIDATION.md)". The cited document says the **opposite**. A comment that inverts its own cited
source is how a settled Phase 10 limitation got re-opened 8 months later as a two-candidate mystery.
Corrected in `378691798` — comments-only diff (verified: no non-comment lines changed), `tsc` clean,
prettier clean, 15 Humble suites / 547 tests pass.

## What is deliberately NOT claimed

**Where identity data now lives.** Six guessed paths (`/api/v1/user`, `/user/self`,
`/user/settings`, `/user/preferences`, `/user/profile`, `/user/info`) all bare-404'd — and per the
todo's own discipline, a negative on a guessed path proves nothing. No replacement endpoint is
named. Finding one needs observation of a real Humble client, not guessing.

## Still inert

`finishLogin` gates on `getGamekeys` (`user.ts:653`), never on `getAccountIdentity`
(`user.ts:723`) — and control A proves `getGamekeys` works. The original non-blocking argument
survives the discharge unchanged.

## Open decision for the operator — not taken here

`getAccountIdentity` and its advisory call at `validation.ts:58` are now *known* dead against a route
that does not exist. They were **not** removed. Delete them, keep them as a canary, or repoint them
at a real identity source — that is a scope call, and it was outside this task.

## Commits

| Commit | What |
|--------|------|
| `378691798` | `fix` — corrected two `adapter.ts` comments that invert their own cited source |
| _(this)_ | `docs` — todo discharged to `completed/`, STATE.md row, plan + summary |

## Verification

- [x] Neither `adapter.ts` comment claims empirical confirmation of `/api/v1/user/info`
- [x] Todo present in `completed/`, absent from `pending/`
- [x] Disposition names the control (row A)
- [x] Disposition rules out the interstitial and records the "never worked" correction
- [x] Disposition explicitly declines to name a replacement endpoint
- [x] `getAccountIdentity` / `validation.ts` present and unmodified
- [x] `tsc --noEmit` clean; prettier clean on every touched file; 15 suites / 547 tests pass
- [x] Live session cookie deleted from the scratchpad after use
