---
slug: epic-sibling-apex-non-destructive-discharge
status: investigating
trigger: "action todo: D-35-19-15 Epic sibling-apex — can the live gate be discharged WITHOUT the operator's Epic credentials, and without signing them out?"
created: 2026-09-28
updated: 2026-09-28
origin: "Extends .planning/debug/resolved/epic-sibling-apex-seeding.md (2026-09-26), which corrected the todo's blocked_by/trigger_phase but was explicitly a DOCUMENTATION-only fix: its own verification records that the live login+logout jar re-test 'was NOT performed here'. That session never examined whether the sweep half needs credentials at all, nor whether a non-destructive invocation path exists. Both are new ground and both are now measured below."
---

# Debug: is D-35-19-15's live gate actually credential-gated?

## Symptoms

`.planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`
is `ready: live-gate`, and its `blocked_by` states the discharge condition requires

> a live, human-run Epic login (real credentials/2FA) followed by an independent jar read, then a
> logout followed by another independent jar read

Two separate claims are bundled there — that **seeding** needs a real login, and that **the sweep**
needs a logout (hence an authenticated session). The second is measurably false, and the first is
narrower than stated. This session separates them.

The discharge condition itself is NOT being relaxed: a cookie must still be confirmed PRESENT on
one of `fortnite.com` / `unrealengine.com` / `twinmotion.com` / `metahuman.com` in GameLib's own
jar, then confirmed ABSENT after the sweep, both by an independent jar read. A bare `matched=0`
still discharges nothing.

## Goal

Decide which of the four remaining steps genuinely need the operator, and reduce the gate to the
smallest step that actually does. Do not close the todo on a vacuous zero.

## Evidence

All measured 2026-09-28 at HEAD `023e10346`.

### E-1 — the sweep is reachable with NO authenticated Epic session (refutes half the blocker)

`LegendaryUser.logout()` (`src/backend/storeManagers/legendary/user.ts:150`) runs
`legendary auth --delete` first and **returns early** on `res.error || res.abort`, before any
cookie-side cleanup. So whether the cookie sweep runs at all depends on that CLI call's exit
status when unauthenticated.

Measured directly against the bundled binary, `./build/bin/arm64/darwin/legendary/legendary`, in an
isolated `mkdtemp` 0700 fake profile (all eight variables from `jest.setupContainment.ts` set via
`env -i`, profile shredded immediately after — the two-profile rule's isolated-by-default half, and
mandatory here because the same command against the real profile would have destroyed a live
session):

```
[cli] INFO: User data deleted.
EXIT=0
```

`auth --delete` with no session exits **0**. Therefore `res.error` is falsy, `logout()` does NOT
return early, and `clearEpicCookies` is reached. **The sweep half of the discharge condition was
never credential-gated.**

### E-2 — the four apexes are at zero in both live jars right now (the "before" is vacuous)

Read IN PLACE (never copied — an attempt to copy a jar into a scratchpad was correctly denied this
session as PII handling, and this repo has a recorded incident of leaving 103 MB of unredacted
captures on disk). Aggregate per-domain counts only; no cookie names, no values, no other domains.

| jar | records | mtime | epicgames | fortnite | unrealengine | twinmotion | metahuman |
| --- | ------- | ----- | --------- | -------- | ------------ | ---------- | --------- |
| `~/Library/HTTPStorages/gamelib-shell.binarycookies` (dev) | 76 | 2026-09-25 12:49 | **5** | 0 | 0 | 0 | 0 |
| `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` (packaged) | 42 | 2026-09-24 12:59 | 0 | 0 | 0 | 0 | 0 |

Newest `epicgames.com` record created 2026-09-13 02:13.

A real Epic session DOES exist — `~/Library/Application Support/gamelib/legendaryConfig/legendary/user.json`
carries `access_token`, `refresh_token` and `displayName` (6055 bytes; keys inspected, no values
read). So a past login did not leave sibling-apex cookies behind, or they have since expired or
been cleared. **The seeding precondition is not satisfied today**, which is exactly the
`before(matched=0)` the todo warns is evidence of nothing.

### E-3 — the sweep can be driven for ONE domain, non-destructively

`EPIC_COOKIE_HOSTS` (`legendary/user.ts:96`) sweeps by **host**, not by cookie name, so any cookie
on one of the four apexes is a valid fixture — its provenance is irrelevant to whether the sweep
clears it.

`humble_login_clear_cookies` is an arm of `dispatch_rust_channel(channel, args, app)`
(`src-tauri/src/main.rs:5657`, arm at `:7128`) taking `[label, domain]`. That dispatcher answers
sidecar-initiated `kind == "rustInvoke"` requests (`:10033`, dispatched at `:10203`), so the channel
is callable by name with an arbitrary domain. The domain-scoped implementation is
`clear_default_data_store_cookies_for_domain` (`:4181`), and `:3567` documents that
`EPIC_COOKIE_HOSTS`' values are precisely what get passed as `domain`.

The default-data-store path is gated on `existing_window.is_none() && epic_cookie_domain_matches(domain)`.
`EPIC_LOGOUT_WINDOW_LABEL` (`legendary/user.ts:41-52`) is structurally outside
`next_login_window_label()`'s range, so it resolves to `None` for the life of the process — that
`None` is the precondition the macOS cookie arms require, not a degradation.

**Consequence:** the sweep can be exercised against `fortnite.com` alone, without calling
`LegendaryUser.logout()`, without running `auth --delete`, and without touching the operator's Epic
session. The gate does not have to be destructive.

### E-4 — the independent reader already exists; nothing needs building

`.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`
(48 lines) takes a jar path as `argv[1]`, index-walks the pages and extracts
domain/name/path/flags/expiry/created. It extracts **no cookie values**. The todo's "independent jar
read rather than the product's own census" requirement is already instrumented.

## Eliminated

- hypothesis: "The sweep half of the discharge condition requires an authenticated Epic session."
  evidence: E-1 — `auth --delete` exits 0 unauthenticated, so `logout()` does not return early;
  and E-3 — the domain-scoped clear is independently invocable by channel name anyway, bypassing
  `logout()` entirely. timestamp: 2026-09-28
- hypothesis: "An independent jar-read instrument has to be written before the gate can run."
  evidence: E-4 — it exists in-repo and extracts no values. timestamp: 2026-09-28

## Current Focus

**The gate has been reduced to exactly one unresolved question: can a cookie be placed on one of
the four sibling apexes without the operator's Epic credentials?**

Everything else is now either measured or non-destructively executable.

`legendary/user.ts:27-39` records, from a prior live measurement in both a dev and a packaged jar,
that merely *building* a `WKWebView` on `https://www.epicgames.com/id/login?responseType=code` IS a
navigation, and that Epic + Cloudflare answer it by setting `__cf_bm`, `EPIC_DEVICE`,
`EPIC_LOGIN_ID`, `_epicSID` and `_tald` — with `created` timestamps landing on the exact second of
the clear that was supposedly removing them. What that note does NOT establish is which HOSTS those
land on. E-2's `epicgames.com=5` is consistent with `.epicgames.com` only.

So the next step is a **credential-free live probe**, never yet run:

1. Launch the app; open the Epic OAuth login window; **do not authenticate**.
2. Re-read both jars in place, counts only, for the five Epic hosts.
3. If any of the four sibling apexes becomes non-zero → a credential-free seeding vehicle exists.
   Drive the domain-scoped clear for that one host via E-3's channel, re-read, and the gate
   discharges today with no credentials and no logout.
4. If all four stay zero → seeding genuinely requires an authenticated Epic login (Epic's own SSO
   propagation to its sibling properties), and only the operator can perform it. `ready: live-gate`
   stays correct, but the blocker narrows to that single step.

`ready:` stays `live-gate` either way — step 1 needs a live app run. It is not `code`, and it is not
`blocked`.

## Operator decision required

Step 1 above is safe and non-destructive. It is not yet run because it needs a live app run, and
because the branch beyond it touches the operator's own account:

- **A full login+logout gate would sign the operator out of Epic.** A live session exists (E-2).
  `LegendaryUser.logout()` runs `auth --delete`, which destroys it. That has NOT been run and must
  not be, without explicit confirmation.
- Whether to spend real credentials/2FA on this at all is the operator's call, and per E-3 it may
  not be necessary.
