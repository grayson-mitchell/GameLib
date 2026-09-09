---
quick_id: 260909-p4m
slug: correct-the-stale-record-on-the-gog-amaz
status: complete
completed: 2026-09-09
---

# Quick Task 260909-p4m: correct the stale record on the GOG/Amazon cookie-jar todo

**Actioned `2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md` and found its
prescribed fix had already shipped five days after filing. Corrected the record rather than
re-doing the fix; re-scoped the todo to the one live gate that is genuinely outstanding.**

## What was actually wrong

The todo read as though nothing in the repo cleared GOG or Amazon cookies on logout. That stopped
being true on 2026-09-04 in `84fc0ea90` (Phase 40 plan 04, Task 3, D-15). Two sections were not
merely stale but actively instruction-bearing in the wrong direction:

1. **"The one gesture that sets severity — run this BEFORE writing any fix."** The fix was already
   written. As filed, it told the next reader to run a login/logout cycle before touching code
   that already existed.
2. **"Deliberately out of scope: the embedded store browser. It does not exist."** It shipped in
   Phase 40 and is, per this task's own census, actively depositing GOG cookies into the jar.

This is the `a-todos-prescribed-fix-can-already-be-shipped` shape: a stale trap that deters the
work it asks for.

## Verification performed (all re-derived this session, none quoted from the todo)

**The shipped fix, read rather than trusted:**

| site | what |
|---|---|
| `src/backend/storeManagers/gog/user.ts:24` | `GOG_COOKIE_HOSTS`, `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearGogCookiesForLogout()`; `logout()` at `:357` is async |
| `src/backend/storeManagers/nile/user.ts` | `AMAZON_COOKIE_HOSTS`, `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearAmazonCookiesForLogout()`; `logout()` at `:248` |
| `src-tauri/src/main.rs:3511` | `STORE_LOGOUT_COOKIE_DOMAINS` + `store_logout_cookie_domain_matches()` |
| `src-tauri/src/main.rs:7001`, `:7507` | matcher OR'd into both no-window dispatch gates |
| `runnerAuthFlowRegistration.ts:238`, `:242` | `logoutAmazon` (handle) and `logoutGOG` (send) both registered — the path is reachable, not dead under Tauri |

All four of the todo's constraints are met by that code. `npx jest` over both `logoutCookies`
suites: **17 passed, 2 suites passed**.

**Census, index-walked (never `strings`), 71 live records, 23 GOG/Amazon vs 14 at filing:**
`.gog.com` 9 (was 2), `login.gog.com` 3, `www.gog.com` 1 (was 0), `.amazon.com` 8,
`www.amazon.com` 1. The growth is not a regression — the fix is forward-acting only, running
inside `logout()`, and no GOG or Amazon logout has run since it shipped. All 23 are suffix-covered
by the shipped apexes. A code fix stopped the recurrence; it did not clear the damage.

**Embed liveness, checked before asserting it:** `WebView/index.tsx` returns
`WebviewUnavailablePanel` only as a per-reason fallback (deep link, `reason="platform"` off macOS,
`reason="epic"` for `/store/epic` per D-05) — on macOS every non-Epic store route reaches the live
embed. Seven of the nine new `.gog.com` records plus `www.gog.com/CookieConsent` were created
09-07/09-08 by in-app browsing, not by a login.

## Changes

Single file: the todo itself.

- Frontmatter: `needs: test-then-fix` -> `needs: live-verification-of-a-shipped-fix`; `files:`
  repointed at the three real fix sites (`src-tauri/src/main.rs` replaces
  `oauthLoginCapture.ts`, which was jar-sharing evidence and never a fix site — the
  `todo-files-frontmatter-can-name-the-wrong-file` shape). `severity: medium`, `platform: any`,
  `ready: live-gate`, `status: OPEN` all unchanged and still correct.
- New `## STATUS 2026-09-09` block under the title: commit, sites, test result, census, and the
  one deliberate divergence from constraint 4 (`amazon.com` apex, recorded as D-15's decision
  rather than an oversight).
- Severity section retitled `## SUPERSEDED 2026-09-09`, its reasoning kept (it is the record of
  *why* `medium`), its three-step gesture replaced by the gate that is actually outstanding.
- "Deliberately out of scope" rewritten on true premises; its prediction was right and is now
  measured.
- The preserved 2026-09-02 "untouched" table got an inline marker — it is the most quotable line
  in the file and would otherwise be lifted out of context. Both its line numbers were re-checked
  against source (`gog/user.ts:357`, `nile/user.ts:248`) and the "exactly six call sites" count
  noted as stale.

Zoom non-finding left alone — re-verified as still accurate.

## PART 2 — the live gate, DRIVEN on operator go-ahead: **PASSED**

Driven 18:18-18:26 against the live `tauri dev` session. Todo now RESOLVED and moved to
`completed/`.

**Artifact freshness verified before measuring anything** — scoring a FAIL against a stale dev
build is the trap. Rust binary (mtime 14:57) carries the `store_logout_cookie_domain_matches`
symbol and the packed `gog.comamazon.com` rodata; `build/main/sidecar.js` (14:56) carries both
sentinel labels. (My first freshness grep returned 0 and looked damning — it was my own anchor
error: I searched the Rust binary for the *TypeScript* sentinel labels, and used `^…$` anchors
against packed Rust `&str` literals that carry no separators.)

| step | driver | log line | jar |
|---|---|---|---|
| GOG | real gesture: ACCOUNTS -> LOG OUT | `GOG logout: cleared 13 cookie(s) for gog.com` @18:18:56 | 71 -> 58 |
| Amazon | `window.api.logoutAmazon()` in console | `Amazon logout: cleared 9 cookie(s) for amazon.com` @18:26:13 | 58 -> 49 |

Both counts match the pre-gate per-host census exactly (13 = 9+3+1 GOG hosts; 9 = 8+1 Amazon).
Final census after the last mutation: **all 5 GOG/Amazon host groups at 0, all 12 non-target hosts
byte-identical** — including `api.hcaptcha.com`, the case the todo named as correctly out of
scope, plus `store.steampowered.com` and `.humblebundle.com`. Zero `removed 0 cookies` /
`cookie clear failed` / `cookie census failed` warnings. Constraints 3 (independent final census)
and 4 (no over-clear) both hold live, not merely by unit test.

### A claim in PART 1 that was WRONG, corrected

PART 1's SUMMARY and STATE row said "both storefronts are currently logged in ... costs two webview
re-logins". **Amazon was not logged in.** I inferred it from `nile_config/nile/user.json` (nile's
own CLI config) when `NileUser.isLoggedIn()` reads `userData` from `nile_store/config.json`, which
is empty `{}`. The ACCOUNTS screen said "AMAZON LOGIN" and was right. Real cost of the gate was one
re-login (GOG), not two. The 9 stale `.amazon.com` records were residue from an 2026-08-19 session
— which is exactly the defect, surviving a credential-side teardown.

Consequence for method: Amazon had no logout button to click, so it was driven through
`window.api.logoutAmazon()`. `NileUser.logout()` reaches `clearAmazonCookiesForLogout()`
unconditionally (only a user-abort of `nile auth --logout` returns early), so the cookie path is
identical to the UI's, and it cost nothing because there was no session to lose. A
`window.api.logInfo('GATE_PROBE_A1')` control ran first and reached the backend log, proving the
console executes rather than merely echoes.

### The flush trap that nearly manufactured a false FAIL

Pre-run the jar's mtime was 14:03:15 while the app had run since 14:57 — 4h15m with no flush.
WebKit buffers; a naive post-logout census could have read a stale jar and scored a working fix as
a no-op. The deletion itself forces a flush (file rewritten 18:18:58 and 18:26:15, 2-3s after each
clear), so the census is trustworthy immediately after a clear — but only for that reason.

### The original severity bound: moot, not answered

The todo's three-step gesture asked whether a post-logout re-login completes silently. Now
**unanswerable by construction** — the fix removes the residue the question was about. Recorded as
moot. `severity: medium` stands as the last value the evidence supported.

## Operator-visible state change

You are now **logged out of GOG** in GameLib and will need to log back in. Amazon needed no
re-login (it was already logged out). The Web Inspector was closed and reopened during the run and
is left open, as found.

## Gates

- `pnpm planning-gates` — **9/9 passed** (including `todo-frontmatter-gate.py`; file stays in
  `pending/`, which is the gate's scope)
- `npx prettier --check` on both touched markdown files — clean
- Both `logoutCookies` jest suites — 17/17 green
- No production code changed. `git diff -- src/ src-tauri/` is empty for this task.

## Deviation

Tasks executed inline by the orchestrator rather than dispatched to `gsd-executor`. The entire
substance of this task is a live measurement (the binarycookies index-walk) that existed only in
this session's context; an executor would have had to re-derive it, and the failure mode being
corrected here is precisely a record composed from a stale premise. Same precedent as `260909-nzb`.
STATE row written BY HAND — the `gsd-sdk` state-write ban holds.
