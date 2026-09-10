---
created: 2026-09-10
title: "GOG `getUserDetails()` 404s against `api.gog.com/users/{id}` — upstream and this todo's own prescribed fix both use `users.gog.com`; the user appears logged out even though auth succeeded"
area: store/gog
status: "RESOLVED 2026-09-11 by debug/gog-login-not-registered -- repointed GOGUser.getUserDetails() from https://api.gog.com/users/{userId} to https://users.gog.com/users/{userId} (src/backend/storeManagers/gog/user.ts:254), matching upstream Heroic b1a87c958 and this todo's own prescribed fix. Added a dedicated regression test (user.test.ts) that pins the literal users.gog.com host string independent of the mocked response shape, closing the exact HTTP-mock blindness this todo warned about. Confirmed galaxyUserId/userId sourcing (from resolved credentials, never the response body) is unaffected by the host change, per this todo's own open sub-question. All three required-evidence items from this todo's Candidate fix section were met by a LIVE run, not inference: (1) live curl replay showed api.gog.com 404s, users.gog.com returns 200 with a username; a rebuilt dev sidecar bundle contains no api.gog.com/users/ string; (2) a fresh in-app GOG login shows the Accounts screen as logged in and Saved username to config file in the log; (3) Unable to syncQueued playtime, userData not present is absent from the log following that fresh login (a same-second BOOT-time occurrence of that line, preceding the fix taking effect, is recorded as a known non-blocker in the debug session, not asserted fixed). Full debug trail: .planning/debug/resolved/gog-login-not-registered.md."
severity: major
platform: any
ready: code
source: "observed live on a release packaged build during Phase 43's REQ-43-19 live-gate setup"
---

## Symptom, observed live

Release packaged build (`GameLib_0.7.0_aarch64.dmg`, 2026-09-10). Credentials load correctly from
the real Keychain, then:

```
[Gog]: Logging using GOG credentials
[Gog]: Error getting login information AxiosError: Request failed with status code 404
```

Fires twice — once at startup, once again after an explicit in-app GOG login. Downstream:

```
[Gog]: Unable to syncQueued playtime, userData not present
```

**User-visible result:** the Accounts screen reports GOG as not logged in, and GOG is absent from
the library, despite the login flow appearing to succeed.

## The endpoint disagrees with both upstream and its own todo

`src/backend/storeManagers/gog/user.ts:253` calls:

```
https://api.gog.com/users/${encodeURIComponent(userId)}
```

But:

- **Upstream Heroic `b1a87c958`** (the commit this work was explicitly porting) uses
  `https://users.gog.com/users/${user.user_id}` — verified by `git show b1a87c958`.
- **The originating todo** (`.planning/todos/completed/switch-gog-user-api-off-userdata-json.md`)
  prescribed `https://users.gog.com/users/${user.user_id}` in its Solution section, naming it "the
  endpoint GOG Galaxy itself uses".
- **The closing commit `b0776ab8d` shipped `api.gog.com` instead** — a different host. Its message
  justifies moving off `embed.gog.com/userData.json` on payload-size grounds and records a
  threat-model note about `encodeURIComponent`, but never explains the host substitution or cites
  evidence that `api.gog.com/users/{id}` is a real endpoint.

## Why this matters more than a one-line typo

The original todo's problem statement describes the exact symptom now occurring:

> `getUserDetails()` silently returned undefined, userData was never written, and the user appeared
> logged out even though auth succeeded.

So the migration **replaced one failing endpoint with another failing endpoint and closed the
todo**, because the failure mode is identical and silent. The fix was verified against tests that
mock the HTTP layer, so no test could have caught a wrong host. This is the shape where a
prescribed fix is landed in a form that carries the same defect it was meant to cure.

## Not caused by Phase 43

Checked: no file changed by Phase 43 touches auth, user, secret, vault, keyring or credential
code. The same `userData not present` symptom appears in a dev-build log from before most of
Phase 43's plans ran. Recorded here only because Phase 43's live-gate setup is what surfaced it.

## Candidate fix, and what must be proven

Repoint to `https://users.gog.com/users/${encodeURIComponent(userId)}`, matching upstream.

**Do not land this on inference alone.** The failing call is silent by construction, which is how
it got here. Required evidence:

1. A live run showing a 2xx from the new host with a `username` in the body.
2. The Accounts screen showing GOG logged in, and GOG games present in the library.
3. `Unable to syncQueued playtime, userData not present` absent from the log afterwards.

Also confirm whether `galaxyUserId` is still sourceable — `b0776ab8d` narrowed `UserData` to
`{userId, username, galaxyUserId}` and sources the first and third from credentials rather than
the response body, so a host change may not affect them, but that should be checked rather than
assumed.

A test that pins the literal host string would prevent silent recurrence; the existing tests mock
the HTTP layer and are structurally blind to it.

## Related

- `.planning/todos/completed/switch-gog-user-api-off-userdata-json.md` — the migration that
  introduced this.
- `.planning/todos/completed/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md` —
  adjacent boot-time GOG user reconciliation work.
