---
quick_id: 260905-q4j
slug: discharge-humble-user-info-404-todo-with
date: 2026-09-05
description: "Discharge the Humble `/api/v1/user/info` 404 todo with a control-verified live authenticated probe"
status: planned
---

# Quick Task 260905-q4j — Discharge the Humble `/api/v1/user/info` 404

## Why this is actionable now

Pending todo `2026-08-23-humble-user-info-404-two-candidates-undiscriminated` has stood
`UNDETERMINED` since 2026-08-23, parked with a **concrete, single-observation discharge condition**:

> One request to `/api/v1/user/info` **with a live authenticated session**, capturing the full
> response body and status.

That observation was taken today (2026-09-05). It discriminates the two candidates. The todo's own
rule — "absent that, the answer stays UNDETERMINED and must be written as such" — is satisfied, so
the answer may now be written.

## Evidence (captured 2026-09-05)

Session source: the `_simpleauth_sess` cookie in the app's own WKWebView jar
(`~/Library/HTTPStorages/com.gamelib.shell.binarycookies`, created 2026-08-30 00:57:17 — the same
second as the `humble-session` Keychain item, i.e. the session the app itself holds). Requests were
issued through the project's own axios 1.13.5 replicating `adapter.ts`'s `buildHeaders()` exactly.

| # | Request | Status | Bytes | Body |
|---|---------|--------|-------|------|
| **A** | **AUTH** `/api/v1/user/order` — **the control** | **200** `application/json` | 993 | `ARRAY len=32`, `gamekey` keys |
| B | AUTH `/api/v1/user/info` (app fidelity) | 404 `text/html` | 232 | bare framework 404 page |
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

**Row A is what makes the rest admissible.** Without a live-session control, a 404 proves nothing —
an expired cookie would produce failures at every path. A returned 32-order array proves the session
is live and the transport is sound at the same instant the subject path 404s.

## Verdict

**Candidate 2 — an interstitial (consent / region gate / bot check) answering in its place: RULED OUT.**
Five independent reasons, no one of which is load-bearing alone:
1. The body is the bare WSGI-style framework 404 (HTML 3.2 doctype) — no challenge script, no consent
   UI, no branding.
2. No redirect: `maxRedirects: 0` still yields the 404 directly; final URL equals requested URL.
3. No `cf-mitigated` header; Cloudflare passed through to origin (`cf-ray` is present on the 200 too).
4. Auth state makes no difference (B ≡ C byte-for-byte); UA makes no difference (B ≡ D).
5. **Decisive:** an origin- or session-level interstitial would have intercepted the sibling path.
   It did not — `/api/v1/user/order` answered 200 authenticated and 401 unauthenticated, seconds
   apart, on the same origin and session.

**Candidate 1 — the path moved: right conclusion, WRONG FRAMING.** "Moved" presupposes it once
worked. `10-VALIDATION.md:106` records `GET /api/v1/user/info` → **"404 (hard failure, every
attempt)"** at Phase 10 — the first time it was ever exercised. It has never worked in this
codebase's history.

**The claim that may now be made:** `/api/v1/user/info` is not a route on Humble's API for this auth
flow and never has been. Humble's demonstrated convention for "route exists, caller unauthorized" is
401-with-branded-page; this path answers bare-404 in *both* auth states, so the request never reaches
an auth check. Phase 10 already recorded exactly this as a "Known Limitation" — the todo re-opened a
settled question under a false premise.

**What may still NOT be claimed:** where identity data now lives. Six guessed paths (`/api/v1/user`,
`/user/self`, `/user/settings`, `/user/preferences`, `/user/profile`, `/user/info`) all returned the
same bare 404, but per the todo's own discipline a negative on a guessed path proves nothing. No
replacement endpoint is named.

**Still inert.** `finishLogin` gates on `getGamekeys` (`user.ts:653`), never on `getAccountIdentity`
(`user.ts:723`) — and control A proves `getGamekeys` works. No user-visible symptom exists.

## Tasks

### Task 1 — Correct two false comments in `src/backend/humble/adapter.ts`

Both sites read `D-02/D-13 point 4: endpoint confirmed empirically in Plan 05 (10-VALIDATION.md)`:
- `~L113`, above `AccountIdentitySchema`
- `~L566`, inside `getAccountIdentity`

The cited document records the **opposite** at its line 106. The comment asserts empirical
confirmation that its own cited source contradicts — a reader trusting it would conclude the endpoint
once worked and regressed. Replace with what `10-VALIDATION.md` actually says, plus today's probe.

Commit: `fix(quick-260905-q4j): correct two adapter comments that invert their own cited source`

### Task 2 — Discharge the todo

Move `.planning/todos/pending/2026-08-23-humble-user-info-404-two-candidates-undiscriminated.md` →
`.planning/todos/completed/humble-user-info-404-two-candidates-undiscriminated.md` (completed/ drops
the date prefix, per existing convention), with `status:` updated and a Disposition section carrying
the evidence table, the verdict, and the explicit limits on what was proven.

Commit: `docs(quick-260905-q4j): discharge the Humble user/info 404 todo — interstitial RULED OUT`

## Out of scope — flagged for the user, not decided here

`getAccountIdentity` and its advisory call in `validation.ts:58` are now known-dead against a route
that does not exist. **Deliberately not removed.** Whether to delete them, keep them as a probe, or
repoint them at a real identity source is a scope decision for the user.

## Success criteria

- [ ] Neither `adapter.ts` comment claims empirical confirmation of `/api/v1/user/info`
- [ ] Todo file is in `completed/`, absent from `pending/`
- [ ] Disposition names the control (row A) — a 404 record without its liveness control is worthless
- [ ] Disposition rules out the interstitial and states the "never worked" correction
- [ ] Disposition explicitly declines to name a replacement endpoint
- [ ] `getAccountIdentity` / `validation.ts` still present and unmodified
