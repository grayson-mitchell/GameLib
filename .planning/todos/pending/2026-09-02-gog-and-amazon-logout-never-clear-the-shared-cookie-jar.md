---
created: 2026-09-02T18:20:00.000Z
title: "GOG and Amazon (nile) logout never clear the shared cookie jar their login webviews write to"
area: auth/webview
needs: live-verification-of-a-shipped-fix
status: OPEN
severity: medium
platform: any
ready: live-gate
found_by: quick task 260902-8i2 (audit-login-webview-store-browser-data-store-sharing)
upstream:
  - 68eb1adde (Heroic v2.22.1, #5752) — defect #2 of that commit ("logout did not clear the store's session"), CONCEPT ONLY
files:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/nile/user.ts
  - src-tauri/src/main.rs
---

## STATUS 2026-09-09 — THE FIX SHIPPED; ONE LIVE GATE REMAINS

**Do not implement this todo.** Its prescribed fix landed on 2026-09-04 in `84fc0ea90`
(Phase 40 plan 04, Task 3, D-15) — five days after this file was written, and this file was never
updated to say so. Everything below this block is the original filing. Its evidence and its four
constraints are still the right ones and are kept verbatim; its two *instruction-bearing* sections
are superseded and are marked as such where they appear.

What shipped:

| site | what |
|---|---|
| `src/backend/storeManagers/gog/user.ts:24` | `GOG_COOKIE_HOSTS = ['gog.com']`, `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearGogCookiesForLogout()`; `logout()` became async |
| `src/backend/storeManagers/nile/user.ts` | `AMAZON_COOKIE_HOSTS`, `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`, `clearAmazonCookiesForLogout()` |
| `src-tauri/src/main.rs:3511` | `STORE_LOGOUT_COOKIE_DOMAINS: &[&str] = &["gog.com", "amazon.com"]` + `store_logout_cookie_domain_matches()` |
| `src-tauri/src/main.rs:7001`, `:7507` | that matcher OR'd into both no-window dispatch gates, so GOG and Amazon reach the same macOS default-data-store fallback Epic already used, without widening Epic's own list |
| `gog/__tests__/logoutCookies.test.ts`, `nile/__tests__/logoutCookies.test.ts` | 17 tests, both suites green when re-run 2026-09-09 |

All four of the constraints in "Constraints any fix MUST honour" below are met by the shipped
code — verified by reading the code, not by trusting the plan that wrote it: the sentinel
no-window label is there (1); there is no `clearStorage` step at all, so the ordering trap in (2)
cannot arise; `verified_delete_count` is what the TypeScript consumes, never the removal call's
own signal, and a zero against a non-empty before-census raises a `logWarning` (3); and each
storefront got its own list rather than widening `EPIC_COOKIE_DOMAINS` (4).

**One deliberate divergence, recorded so it does not read as an oversight.** Constraint 4 below
says to expect the Amazon host list to be *narrower* than the registrable domain. The shipped code
uses the `amazon.com` apex, suffix-matched. That was a decision, not a miss — D-15 in
`40-04-SUMMARY.md` records it ("Single apex domain per storefront ... is sufficient"). The jar
being cleared is GameLib's own process-wide jar, not the system browser's, so the user's real
Safari shopping session was never what was at stake; the in-app Amazon browsing session is, and
signing that out alongside an explicit Amazon logout is defensible.

**What is left is exactly one live gate**, and `40-04-SUMMARY.md` flagged it against itself:

> "Live per-domain cookie census before/after logout was NOT performed in this execution ... this
> coverage claim is a structural argument from the comparator's own logic, not a live-measured
> count, and should be flagged as an assumption pending a live UAT pass."

The gate as it now stands is in the superseded severity section below. It is destructive — both
storefronts are currently logged in (`gog_store/auth.json` holds an account id,
`nile_config/nile/user.json` is present), so running it costs two webview re-logins.

### Census 2026-09-09 — the residue is still there, and it grew

Index-walked `~/Library/HTTPStorages/gamelib-shell.binarycookies` (never `strings`, per this
file's own caveat; timestamps converted out of UTC before reading). 71 live records total,
**23 GOG/Amazon against 14 at filing**:

| host | now | at filing | delta |
|---|---|---|---|
| `.gog.com` | 9 | 2 | `checkout_ab` `csrf` `gog_us` `patron_visibility` `utm_campaign` `utm_medium` `utm_source` added, created 09-07/09-08 |
| `login.gog.com` | 3 | 3 | unchanged, created 08-19 |
| `www.gog.com` | 1 | 0 | `CookieConsent`, created 09-07 |
| `.amazon.com` | 8 | 8 | unchanged, created 08-19 |
| `www.amazon.com` | 1 | 1 | unchanged, created 08-19 |

**The growth is not a regression.** The shipped fix is forward-acting only: it runs inside
`logout()`, and no GOG or Amazon logout has been performed since it shipped on 09-04. Every one of
the 23 records is suffix-covered by the shipped `gog.com` / `amazon.com` apexes, so a single
logout of each storefront should clear all 23 — which is precisely what the outstanding gate
measures. A code fix stopped the recurrence; it did not clear the damage already in the jar.

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

> **This table is the 2026-09-02 state and is no longer true — see STATUS at the top.** Both
> logouts now clear their cookies, both line numbers have moved (`GOGUser.logout()` is at
> `gog/user.ts:357`, `NileUser.logout()` at `nile/user.ts:248`), and the "exactly six call sites"
> count above is stale too: `clearGogCookiesForLogout()` and `clearAmazonCookiesForLogout()` are
> the seventh and eighth. Kept unedited because it is the evidence the fix was built from.

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

## SUPERSEDED 2026-09-09: the severity gesture — the fix it gated is already written

> **This section is kept for its reasoning, not its instruction.** Its three-step gesture existed
> to decide whether the fix was worth building. That question closed on 2026-09-04 when the fix
> shipped (see STATUS above). The rationale below is still the record of *why* `severity: medium`,
> so it stays; the gesture itself is replaced at the end of this section by the gate that is
> actually outstanding.

**Severity rationale (recorded 2026-09-08, quick `260908-gye`).** The frontmatter `severity:` was
free text until the todo triage vocabulary landed, and it carried the bound rather than a value:
*upper bound* silent re-auth after logout, *lower bound* stale cookies with no auth value. The
frontmatter now reads `medium`, and this paragraph — not the frontmatter — is where that judgement
lives, so collapsing the key did not delete it.

`medium` is the highest value the evidence supports **today**. The lower bound is already
confirmed real: the 2026-09-02 index-walking census of `gamelib-shell.binarycookies` found 14 live
GOG/Amazon records surviving an explicit logout, so this is at minimum a measured privacy defect
and cannot be `minor`. The upper bound is a hypothesis nobody has run, so promoting to `major` on
it would be scoring a defect by its worst imaginable reading rather than its measured one.

**The bound is still live and still decides the value.** Run the gesture below. Silent completion
⇒ raise this to `major` in the same edit that records the outcome. Credentials required ⇒ it stays
`medium` (or drops to `minor` if the residue is judged to carry no privacy value either), and the
fix is right but not urgent.

**Nobody has observed the consequence.** The finding above is that nothing clears these cookies;
whether that *matters* is untested.

### THE OUTSTANDING GATE (replaces the three-step gesture above)

The question is no longer "is the fix worth writing" but **"does the shipped fix actually work
live"** — the one thing `40-04-SUMMARY.md` could not measure. `wry`'s cookie-delete is known to
lie about deletion, which is exactly why the code consumes `verified_delete_count`; but that
verification has itself never been observed against a real jar.

1. Census the jar (index-walk, never `strings`). Expect 23 GOG/Amazon records or thereabouts.
2. In the running app, log out of GOG. Do **not** restart the app.
3. Re-census. `.gog.com`, `login.gog.com` and `www.gog.com` should all be at **0**.
4. Repeat 2-3 for Amazon; `.amazon.com` and `www.amazon.com` should go to **0**.
5. Read the log for `GOG logout: cleared N cookie(s)` / `Amazon logout: cleared N cookie(s)`, and
   for the `removed 0 cookies ... despite a non-empty before-census` warning. **The final census
   after the last mutation decides the outcome, never the log line** — constraint 3 below.

- Both go to 0 ⇒ the fix is verified live. Close this todo.
- Anything survives ⇒ the fix is a silent no-op on this platform and this becomes `major`; that
  is the `D-35-29-02` failure recurring on a new storefront, and the log's `cleared N` line will
  have said otherwise.

While logged out and before logging back in, the **original** bound is also cheap to settle as a
by-product: click Log in again, and record whether GOG asks for credentials or completes
silently. That answer no longer decides whether to write the fix, but it does decide whether the
23 records were carrying live auth value — which is what this file has always been unable to say.

**Do not spend time on Zoom** — see the non-finding below.

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

## CORRECTED 2026-09-09: the embedded store browser (was "deliberately out of scope")

**The premise of this section expired.** It said the embed "does not exist". It does — Phase 40
shipped it. `store_embed_open` is live in `src-tauri/src/main.rs` behind a full scheme policy, and
`storeEmbedOpen` is registered in `src/backend/sidecar/storeEmbedFlowRegistration.ts`.
`WebView/index.tsx` does still return `WebviewUnavailablePanel`, but as a per-reason fallback —
deep-link escape hatch, `reason="platform"` off macOS, `reason="epic"` for `/store/epic` (D-05) —
not as the unconditional stub this section described. On macOS, every non-Epic store route reaches
the live embed.

Its prediction was right, and the census above measures it coming true: seven of the nine
`.gog.com` records and the `www.gog.com` `CookieConsent` record were created on 09-07/09-08 by
in-app store browsing, not by a login. So the embed does share this jar, which makes the shipped
fix *more* load-bearing, not less. It still changes nothing about the work outstanding here, which
is the live gate and nothing else.
