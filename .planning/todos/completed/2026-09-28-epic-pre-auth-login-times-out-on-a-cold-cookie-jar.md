---
created: 2026-09-28T00:00:00.000Z
title: "A genuinely logged-out Epic sign-in times out at 300s on a cold cookie jar — so logging out of Epic locks the user out of Epic, and F-34.5-G6-01's CLOSED status covers only the post-auth half"
area: auth/webview
severity: major
platform: macos
ready: live-gate
status: "RESOLVED 2026-09-28 via debug session `.planning/debug/resolved/epic-cold-jar-login-timeout.md`. Root cause was an AND-gate: `humble_login_clear_cookies`/`clearEpicCookies`'s cookie-only removal scope (code) + the shared, persistent `WKWebsiteDataStore.default()` (environment) let a stale HTTP disk-cache entry from an earlier authenticated session survive a cookie clear and get replayed on the next cold-jar sign-in — NOT the Talon-403 theory this todo's Solution section led with. Fixed in `src-tauri/src/main.rs` by widening the native removal type-set to also evict `WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache`. Fix-Acceptance Guardrail: accepted (target test pass, no-op/deletion pass, adjacent tests pass 287/290 Rust + 52/52 Jest, revert-and-reconfirm pass, mutation check honestly skipped — no Rust mutation tool in this repo, formatter check honestly not_applicable — no Rust parser in prettier). Live recovery/sign-in on the operator's machine is supported by independently-verified filesystem evidence (see the debug session's Recovery Procedure and Resolution.verification.live_epic_verification), not asserted on a report's word alone. An identical, unconfirmed-exercised twin call site was deliberately left unfixed and filed separately: `.planning/todos/pending/2026-09-28-epic-cookie-clear-window-branch-shares-the-disk-cache-gap.md`. `.planning/debug/resolved/epic-login-non-interactive.md` (F-34.5-G6-01) was updated the same day so its pre-auth gap no longer silently inherits a CLOSED green."
source: "debug/resolved/epic-sibling-apex-non-destructive-discharge, 2026-09-28 — reproduced live while driving D-35-19-15's seeding step; it is the reason that gate could not be completed"
files:
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/loginRoutes.ts
  - src-tauri/src/main.rs
  - src/backend/storeManagers/legendary/user.ts
---

## Problem

**Logging out of Epic in GameLib is not reversible on this build.** An Epic sign-in attempted with
no Epic cookies in the jar never produces a usable login form; it sits on a blurred
skeleton/placeholder, never navigates off `www.epicgames.com`, and ends `status=timeout` after the
full 300s deadline.

Reproduced live on macOS 2026-09-28 (packaged-equivalent run, dev shell jar
`gamelib-shell.binarycookies`), with the operator at the keyboard:

```
10:45:50  Legendary logout: Epic cookie clear removed 8 cookie(s) across 5 Epic-owned domain(s)
          — epicgames.com=8, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0
10:45:52  [TauriLoginPanel] declared-blocked: runner=legendary channel=login -- lands in Phase 34.5
10:45:52  [oauthLoginCapture] runner=legendary label=loginwin-1-18d94bb17bbc0100-26cc1e95
10:45:53  [oauthLoginCapture] runner=legendary nav host=www.epicgames.com
10:46:12  [BLANKPROBE] {"at":"t+30000ms", ... }
10:50:52  [oauthLoginCapture] runner=legendary status=timeout
10:50:52  [useTauriOAuthLogin] runner=legendary phase=timeout
```

`10:45:52` → `10:50:52` is exactly 300s. **One** `nav host=` line for the whole attempt.

Operator-visible symptom, verbatim: *"logging in seems to have hanged, window was blank (white for
a few seconds, now is sitting on preloaded login page)"*.

### Why this is not a new diagnosis, and why it is still open

This is `F-34.5-G6-01`. `.planning/debug/resolved/epic-login-non-interactive.md` is
`status: resolved` / `finding_status: CLOSED`, but **its own `root_cause_scope` field says the fix
covers the POST-AUTHENTICATION half only** and that the pre-auth half

> is UNVERIFIED. Every single observation in this entire multi-cycle investigation came from an
> ALREADY-AUTHENTICATED webview (cookies persisted from an earlier manual login); nobody has ever
> driven this shell through a fresh, logged-out Epic sign-in.

That same file already records what the pre-auth failure is, from its Branch B arm: *"the
sign-out/sign-back-in test found NO usable login form — a SECOND, independent pre-authentication
defect, the deterministic Talon anti-bot 403"*. Branch B fired as designed and its instruction was
to diagnose that defect separately. **That separate diagnosis was never filed as a tracked item** —
this todo is it. The 2026-09-28 run is the first end-to-end confirmation of Branch B's finding with
a real operator account on a cold jar.

### The mechanism, as far as it is established

Warm jar → login succeeds. Cold jar → Talon 403, no form, 300s timeout. Both halves observed the
same morning, same build, ~7 minutes apart:

| time | Epic cookies in jar before the attempt | outcome |
| ---- | -------------------------------------- | ------- |
| 10:38 | 5 (stale, created 2026-09-13, incl. `cf_clearance`) | login SUCCEEDED |
| 10:45:52 | 0 (the 10:45:50 logout removed all 8) | `status=timeout` after 300s |

So the pre-existing `cf_clearance`/Talon state is load-bearing for Epic login on this build, and
GameLib's own logout destroys it along with the session cookies. `EPIC_COOKIE_HOSTS`' sweep is
correct about Epic's session cookies; the side effect is that it also removes the anti-bot clearance
the next login needs.

**Not established, and worth knowing before designing a fix:** a bare standalone `WKWebView`
navigating the identical `EPIC_LOGIN_URL` with an empty store the same morning was **not** blocked —
it acquired 9 cookies including `cf_clearance` and `EPIC_SESSION_AP` (recorded as E-5 in
`debug/resolved/epic-sibling-apex-non-destructive-discharge.md`). So the block is not "WKWebView cannot pass
Talon" in general; something about GameLib's login-window configuration differs. That asymmetry is
the most promising diagnostic lead and it has not been chased.

## Impact

- **A logged-out user cannot add an Epic account on macOS.** This is the first-run path for every
  new Epic user, not an edge case.
- **Logging out is a one-way door** for an existing user, which is worse than never logging in: the
  operator was signed in this morning, is now signed out, and cannot get back in.
- It silently blocks any live gate whose precondition is a fresh Epic login — it is exactly what
  stopped `D-35-19-15`'s discharge
  (`2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`).

## Solution

Not decided — diagnose before fixing. Ordered by what the evidence above supports:

1. **Chase the asymmetry.** A bare `WKWebView` passes Talon on a cold store; GameLib's login window
   does not. Diff the two configurations: user agent, `WKWebViewConfiguration`, whether the window
   is `open_pristine_epic_login_window` (`main.rs`, routed via the `humble_login_open` arm's
   `is_epic_login` check) versus a stock `WebviewWindowBuilder`, and any injected init script.
   **Do NOT change `USER_AGENTS`, `EPIC_LOGIN_URL` or `matchOAuthRedirect` as a first move** — the
   parent session's Routing section authorised instrumentation only, and the UA hypothesis (R1) was
   already falsified once.
2. **Read the login window's JS console.** The parent session's lead was that
   `open_devtools()` is called only for the `main` webview (`main.rs:2476-2487`), so the login
   window's console has never been seen. That is still the cheapest way to see a Talon 403 rejection
   directly.
3. **Consider not destroying the clearance cookies on logout.** If `cf_clearance` (and whatever
   Talon state accompanies it) is what the next login needs, sweeping it on logout is
   self-defeating. This interacts with `EPIC_COOKIE_HOSTS` and with REQ-34.4.1-06's ban on blanket
   wipes — the sweep is domain-scoped by design, so excluding a specific cookie NAME within
   `epicgames.com` would be a new capability, not a config change. Decide it deliberately; do not
   widen the sweep's blast radius while doing it.

## Verification

A fix is verified only by the run that was never possible before: sign out of Epic, then sign back
in, on a cold jar, and reach a captured OAuth redirect rather than `status=timeout`. The negative
control is already recorded above — `one nav host, 300s, phase=timeout` — so a run that produces a
second `nav host=` and a non-timeout phase is attributable.

Note the parent session's standing warning when scoring this: every historical observation of this
flow came from an already-authenticated webview, which is precisely why the defect survived a CLOSED
finding. Assert the jar is cold **before** the attempt (independent jar read, counts only), not
afterwards.
