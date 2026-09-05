---
created: 2026-08-23
title: "Humble's post-login `/api/v1/user/info` returns a 232-byte HTML 404"
source: 34.4.1 gap cycle 3, plan 32 (from D-29-02, observed gate run 4)
status: "RESOLVED 2026-09-05 by quick-260905-q4j. Discharged by the control-verified authenticated probe this todo itself specified. Candidate 2 (interstitial) RULED OUT; candidate 1 (moved) was the wrong framing -- the path never worked. Where identity data now lives remains UNKNOWN and is NOT claimed."
discharged: 2026-09-05
discharged_by: quick-260905-q4j
severity: low
resolves_phase: null
parked: 2026-08-23
parked_by: operator
blocked_by: "nothing external — an AUTHENTICATED probe discriminates the two candidates in one request. Unscheduled, not blocked."
revisit_trigger: "a user-visible symptom appears — this is non-blocking by construction, so absent one there is nothing to chase"
---

# Humble's post-login `/api/v1/user/info` returns a 232-byte HTML 404

## The claim that may NOT be made

Two candidates fit **every offline observation equally**:

1. the endpoint **moved** — the path is simply wrong now; or
2. an **interstitial** (consent, region gate, bot check) is answering in its place.

**An unauthenticated probe cannot discriminate them** — both return HTML, both return 404, both
return roughly that size. So no document may name a cause. Recording "probably the path moved" would
be a correlation shipped as a diagnosis, which this project has done before and paid for.

## Why it is non-blocking, and why that matters here

`finishLogin` gates on **`getGamekeys`**, never on `getAccountIdentity`. The 404 is therefore inert:
login completes, the library populates, and gate run 4's item 1 passed with this 404 occurring. It
was originally suspected of sharing a root cause with D-29-01 (the stale Manage Accounts view); that
was settled by code reading — **the two are unrelated**, not one shared cause.

This is the reason the park is defensible: there is no user-visible symptom to chase.

## Greppable landmarks

- `/api/v1/user/info` — the failing path
- `getAccountIdentity` — the caller
- `getGamekeys` — what `finishLogin` actually gates on; the reason this is inert

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days, and Humble's endpoints are exactly the kind of thing that moves under you.

## Discharge condition — concrete, not a category

One request to `/api/v1/user/info` **with a live authenticated session**, capturing the full response
body and status. That single observation separates the two candidates: a moved path answers
differently to an interstitial. Absent that, the answer stays **UNDETERMINED** and must be written as
such.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"). Parked is not
assigned: no phase owns this. Revisit if a user-visible symptom appears — not on a schedule.

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

34.6's live gate carried this as its "Optional rider — Humble login" (folded todo 4). Its own text
states plainly: "Not required by this phase's own leg. This phase's live gate logs into Epic; the
404 this rider investigates is a Humble surface." The gate's FINAL ADJUDICATION closing statement
confirms: "The optional Humble rider was **not exercised** and is explicitly **not required** by
this phase's own leg (this gate logs into Epic, not Humble) — it remains `NOT DISCHARGED` and
returns to pending, per its own stated rule that folding a todo into a phase's scope is not the
same as that phase discharging it."

No authenticated probe to `/api/v1/user/info` was ever made during 34.6. The two candidates (moved
endpoint vs. interstitial) remain undiscriminated. **Stays pending, UNDETERMINED**, exactly as
before — parked, non-blocking by construction (no user-visible symptom exists to chase), no phase
currently owns it.

---

## Disposition (2026-09-05, quick-260905-q4j) — DISCHARGED

The probe this todo specified as its **only** discharge condition was taken today. The answer is no
longer `UNDETERMINED`.

### The observation

Session source: the `_simpleauth_sess` cookie in the app's own WKWebView jar
(`~/Library/HTTPStorages/com.gamelib.shell.binarycookies`, created 2026-08-30 00:57:17 — the same
second as the `humble-session` Keychain item, i.e. the session the app itself holds). Requests
issued through the project's own axios 1.13.5, replicating `adapter.ts`'s `buildHeaders()` exactly.

| # | Request | Status | Bytes | Body |
|---|---------|--------|-------|------|
| **A** | **AUTH** `/api/v1/user/order` — **the control** | **200** `application/json` | 993 | `ARRAY len=32`, `gamekey` keys |
| B | AUTH `/api/v1/user/info` (app fidelity) | 404 `text/html` | 232 | bare framework 404 |
| C | UNAUTH `/api/v1/user/info` | 404 `text/html` | 232 | identical to B |
| D | AUTH `/api/v1/user/info`, Chrome UA + HTML `Accept` | 404 `text/html` | 232 | identical to B |
| E | AUTH `/api/v1/user/info`, `maxRedirects: 0` | 404 `text/html` | 232 | identical to B; no 3xx hop, final URL unchanged |
| — | UNAUTH `/api/v1/user/order` (sibling baseline) | **401** `text/html` | 48987 | Humble-**branded** "Unauthorized" page |

The 232-byte body, verbatim and identical in every arm:

```html
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">
<title>404 Not Found</title>
<h1>Not Found</h1>
<p>The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again.</p>
```

**Row A is what makes the rest admissible.** Without a live-session control a 404 proves nothing —
an expired cookie fails at every path identically. A returned 32-order array proves the session was
live and the transport sound *at the same instant* the subject path 404'd.

### Candidate 2 — an interstitial answering in its place: RULED OUT

1. The body is the bare WSGI-style framework 404 (HTML 3.2 doctype) — no challenge script, no
   consent UI, no branding.
2. No redirect: `maxRedirects: 0` still yields the 404 directly; final URL equals requested URL.
3. No `cf-mitigated` header; Cloudflare passed through to origin (`cf-ray` present on the 200 too).
4. Auth state makes no difference (B ≡ C byte-for-byte); UA makes no difference (B ≡ D).
5. **Decisive:** an origin- or session-level interstitial would have intercepted the sibling path.
   It did not — `/api/v1/user/order` answered 200 authenticated and 401 unauthenticated, seconds
   apart, same origin, same session.

### Candidate 1 — the path moved: right conclusion, WRONG FRAMING

"Moved" presupposes it once worked. `10-VALIDATION.md:106` records `GET /api/v1/user/info` →
**"404 (hard failure, every attempt)"** at Phase 10, the first time it was ever exercised. It has
never worked in this codebase's history, so it cannot have moved.

This todo was written against a false premise, and the premise came from the source: two comments in
`adapter.ts` asserted the endpoint was "confirmed empirically in Plan 05 (10-VALIDATION.md)" when
that document says the opposite. Both were corrected in `378691798`.

### The claim that MAY now be made

`/api/v1/user/info` is not a route on Humble's API for this auth flow and never has been. Humble's
demonstrated convention for "route exists, caller unauthorized" is 401-with-branded-page; this path
answers bare-404 in *both* auth states, so the request never reaches an auth check. Phase 10 already
recorded exactly this as a "Known Limitation".

### The claim that still may NOT be made

**Where identity data now lives.** Six guessed paths (`/api/v1/user`, `/user/self`, `/user/settings`,
`/user/preferences`, `/user/profile`, `/user/info`) all returned the same bare 404 — but per this
todo's own discipline, a negative on a guessed path proves nothing. **No replacement endpoint is
named.** Anyone wanting a Humble username needs a different identity source, found by observation,
not by guessing.

### Still inert

`finishLogin` gates on `getGamekeys` (`user.ts:653`), never on `getAccountIdentity` (`user.ts:723`)
— and control A proves `getGamekeys` works. The original non-blocking argument survives the
discharge unchanged.

### Left standing deliberately — a scope decision for the operator, not taken here

`getAccountIdentity` (`adapter.ts`) and its advisory call in `validation.ts:58` are now *known* dead
against a route that does not exist. They were **not** removed. Whether to delete them, keep them as
a canary, or repoint them at a real identity source is a separate decision.
