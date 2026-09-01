---
created: 2026-09-02T18:20:00.000Z
title: "GOG and Amazon (nile) logout never clear the shared cookie jar their login webviews write to"
area: auth/webview
needs: test-then-fix
status: OPEN
severity: unknown-pending-one-gesture (upper bound: silent re-auth after logout; lower bound: stale cookies with no auth value)
found_by: quick task 260902-8i2 (audit-login-webview-store-browser-data-store-sharing)
upstream:
  - 68eb1adde (Heroic v2.22.1, #5752) — defect #2 of that commit ("logout did not clear the store's session"), CONCEPT ONLY
files:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/nile/user.ts
  - src/backend/sidecar/oauthLoginCapture.ts
---

## Problem

**Two of GameLib's live login surfaces write session cookies into the process-wide
`WKWebsiteDataStore::defaultDataStore()` and never remove them on logout.**

> **CORRECTED 2026-09-02, hours after filing.** This todo was filed naming THREE runners. Zoom is
> **not** a live defect and has been demoted to the non-finding at the bottom of this file:
> `authZoom` / `getZoomUserInfo` / `logoutZoom` have preload invokers but **zero** backend handler
> registrations — dropped permanently by Phase 34.5 D-02, a fact `STATE.md:2711` already recorded
> ("Zoom's 3 dropped permanently") and the original filing failed to check. `ZoomUser.logout()` is
> real code that nothing under Tauri can reach. The GOG and Amazon findings are unaffected.

Every login runner opens a real webview into the one shared default data store —
`src/backend/sidecar/oauthLoginCapture.ts` covers `legendary`/`gog`/`nile`/`zoom` and calls
`seam.open(loginUrl, { visible: true, ... })` at `:323`; nothing anywhere sets `incognito` or a
custom `websiteDataStore`. So the store is shared by construction (see the closure record in
`.planning/todos/completed/audit-login-webview-store-browser-data-store-sharing.md`).

But **repo-wide there are exactly six non-test `.clearCookies(` / `.clearStorage(` call sites**,
and all six live in two files:

- `src/backend/humble/user.ts:1011`, `:1127`, `:1212`
- `src/backend/storeManagers/legendary/user.ts:199`, `:259`, `:408`

The other three logouts touch only local credential state:

| runner | logout | what it clears | cookie jar |
|---|---|---|---|
| GOG | `gog/user.ts:263` | `clearCache('gog')`, `configStore.clear()`, unlinks `gogdlAuthConfig`, resets the credentials cache | **untouched** |
| Amazon | `nile/user.ts:171` | `nile auth --logout`, `configStore.delete('userData')`, `clearCache('nile')` | **untouched** |

Live corroboration — index-walking parse of `~/Library/HTTPStorages/gamelib-shell.binarycookies`,
2026-09-02, 51 live records:

```
gog.com          2   gog-al gog_lc
login.gog.com    3   galaxy-login-al galaxy-login-s galaxy-login-tsa
amazon.com       8   i18n-prefs lc-main session-id session-id-time session-token sp-cdn sst-main ubid-main
www.amazon.com   1   csm-hit
```

This is defect #2 of upstream `68eb1adde`, the exact class the audit was filed to look for. It was
invisible to every prior investigation because all of them — `D-35-29-01`, `D-35-29-02`,
`35-AB-RETEST`, the `epic-cookie-clear-read-divergence` debug session — scoped to Epic.

## The one gesture that sets severity — run this BEFORE writing any fix

**Nobody has observed the consequence.** The finding above is that nothing clears these cookies;
whether that *matters* is untested. Do not write it up either way until this is run:

1. Log in to GOG. Log out. Do **not** restart the app.
2. Click Log in again.
3. **Does the GOG page ask for credentials, or does it complete silently?**

- Silent completion ⇒ logout does not log you out; severity is major and the fix is required.
- Credentials required ⇒ the residue carries no auth value; severity drops to hygiene/privacy
  (stale third-party session cookies surviving an explicit logout), and the fix is still probably
  right but is no longer urgent.

Repeat for Amazon. **Do not spend time on Zoom** — see the non-finding below.

Verify by re-reading the jar with an index-walking binarycookies parse, **never `strings`**
(a byte match over a binary format can surface unreferenced remnants as if they were live records
— this is the caveat that let `D-35-29-02` stand undiagnosed for two runs). Convert timestamps out
of UTC before concluding anything from a `created` field; the parser emits UTC and this machine is
UTC+12. A misread on exactly that point invented a phantom fifth survivor last time.

## Constraints any fix MUST honour

The Epic work already paid for these. Ignoring either one recreates `D-35-29-02` verbatim:

1. **On macOS, open NO window for the cookie step.** Pass a label that cannot resolve — that
   unresolvable label *is* the Rust fallback's precondition, so the same
   `clear_default_data_store_cookies_for_domain` code runs with the page load removed. Building a
   WKWebView on an https URL **is a navigation**: it mints the very cookies you are clearing,
   concurrently with the clear loop and for 1-2s after it. Off macOS a window is still needed —
   point it at `https://gamelib.invalid/`, as `legendary/user.ts`'s `COOKIE_HANDLE_ORIGIN` does.
2. **Clear storage BEFORE cookies, never after.** `clearStorage` has no choice but to load the
   origin (localStorage/IDB/Cache are origin-scoped), so it will always mint cookies. Whichever
   step runs last decides what the jar contains.
3. **A final verification census after the LAST mutation decides the reported outcome.** Never the
   mutating call's own success report — on this platform `Ok(())` means only that WebKit's
   completion handler fired. A per-step before/after pair structurally cannot satisfy this; both
   members are mid-sweep.
4. **Do not over-clear.** Cookie clearing is domain-suffix scoped, and clearing a third party's
   cookies is its own harm (REQ-34.4.1-06). `api.hcaptcha.com/hmt_id` partitioned to a login origin
   is correctly out of scope. Amazon is the sharp case: `amazon.com` is the user's shopping session
   too, and GameLib has no business clearing it. Decide the host list deliberately, and expect the
   answer for Amazon to be narrower than "the registrable domain".

`legendary/user.ts` is the worked reference for all four. Follow its shape rather than reinventing
it — but note it is Epic-shaped (five hosts, a FATAL_WIPE_STEP), so lift the structure, not the
host list.

## NON-FINDING: Zoom — real code, unreachable logout

`ZoomUser.logout()` (`src/backend/storeManagers/zoom/user.ts:90`) has the same shape as GOG's and
clears no cookies either. It is **not** a defect, because nothing can call it under Tauri:

- `src/preload/api/zoom.ts` exports `authZoom`, `getZoomUserInfo` and `logoutZoom`, but a
  registration count across `src/backend/` gives **0** for all three, against 1-2 each for
  `authGOG` / `authAmazon` / `logoutGOG` / `logoutAmazon` / `logoutLegendary`.
- `runnerMiscFlowRegistration.ts:25` and `:119` state it outright: "Zoom is exactly three channels
  (`authZoom`, `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02".
  `STATE.md:2711` records the same as a scope decision — "Zoom's 3 dropped permanently".

So Zoom cannot log in under Tauri, and therefore cannot deposit the cookies whose removal would be
at issue. The rest of the runner is live (1564 LOC, registered in `storeManagers/index.ts:19`, in
the `Runner` union at `common/types.ts:28`, with a login tile gated on
`experimentalFeatures.zoomPlatform`) — it is the auth channels specifically that are gone.

**This becomes a real defect the moment those three channels are ported.** Whoever restores Zoom
login inherits this todo's fix as a precondition, not as follow-up work.

## Deliberately out of scope

The embedded store browser. It does not exist (`WebView/index.tsx:528` returns
`WebviewUnavailablePanel`, D-05). When it returns it will share this same jar by default, which
makes this todo's fix *more* load-bearing, not less — but it changes nothing about the work here.
