---
spike: 014b
name: cookie-read-injected-js
type: comparison
validates: "Given the same webview, when cookies are read via injected JavaScript (document.cookie) instead of the Rust API, then which subset is visible — and does HttpOnly vanish silently"
verdict: INVALIDATED as a login channel (HttpOnly is structurally invisible; remote-origin IPC is denied)
related: [013, 014a, 015]
tags: [tauri, javascript, cookies, httponly, ipc, capabilities, remote-origin, macos]
---

# Spike 014b: the injected-JS `document.cookie` channel

## What This Validates

**Given** the same webview as 014a, **when** cookies are read via injected JavaScript instead
of the Rust API, **then** determine which subset is visible — and specifically whether
`HttpOnly` cookies vanish **silently**, producing the same false "not logged in yet" signal
that this whole spike line exists to rule out.

Head-to-head partner of 014a. Two candidate JS channels were tested.

## Research

Tauri v2 has no "read a value back from `eval`" API — `WebviewWindow::eval` returns
`Result<()>`, fire-and-forget. So a JS read needs a return path. Three candidates:

| Channel | Mechanism | Status |
|---|---|---|
| A — Tauri IPC from the page | injected script calls `window.__TAURI__.core.invoke(...)`; gated by a capability with `remote.urls` (the v2 successor to v1's `dangerousRemoteDomainIpcAccess`) | **denied** — see trail |
| B — `document.title` side channel | eval writes `document.cookie` into `document.title`, Rust reads `WebviewWindow::title()` | **structurally impossible** — see trail |
| C — navigation exfil | eval navigates the page to the loopback control server with `document.cookie` in the query string | **works** |

## How to Run

`SPIKE_AUTORUN=2` in the 013 harness. Evidence in `round2.log`, category `js-channel`.

## Investigation Trail

1. **Channel B failed, and the failure was informative.** Round 1's title side-channel came
   back `channelOk: false` on both windows — the marker never appeared. Cause:
   `WebviewWindow::title()` returns the **native NSWindow title**, which Tauri sets explicitly
   and WKWebView never feeds from `document.title`. This is the same gap 013 recorded as "no
   `page-title-updated` analog", arriving from the other direction. Channel B is not a bug to
   fix; it cannot work by construction.

2. **Channel C built as the replacement.** The page navigates itself to
   `http://localhost:17913/report?dc=<document.cookie>&ipc=<status>&ua=<navigator.userAgent>`.
   Immune to CORS (top-level navigation), and independent of whether Tauri grants the remote
   origin any IPC at all. The control server logs the query. This worked on both the loopback
   origin and on `https://www.humblebundle.com`.

3. **Channel A is denied — with the global still present.** On both origins the injected
   script reported:

   ```
   tauriGlobalPresent = "true"
   remoteIpcStatus    = "rejected: report_from_page not allowed. Plugin not found"
   ```

   despite `capabilities/remote-login.json` declaring `windows: ["login-*"]` and
   `remote.urls: ["http://localhost:17913", "https://*.humblebundle.com"]`. Declaring
   `remote.urls` grants the *webview* remote-IPC eligibility but does **not** grant access to
   app-level commands — those resolve through the ACL, which has no permission entry for a
   `#[tauri::command]` defined in the binary, hence "Plugin not found". Reaching an app command
   from a remote page would require publishing it through a plugin-style permission manifest.

   Two consequences: (a) an injected script on a login page cannot call back into the backend
   without real ACL plumbing; (b) **`window.__TAURI__` is nonetheless injected into
   `https://www.humblebundle.com`** — a live third-party page holds a Tauri global. Every
   invoke is refused, but the surface is real and belongs in the threat model.

4. **The HttpOnly gap, measured.** On the control origin, at the same instant:

   | Channel | cookies seen |
   |---|---|
   | Rust `cookies()` (014a) | `spike_plain`, `spike_httponly`, `spike_domain` |
   | `document.cookie` (channel C) | `spike_plain`, `spike_domain` |

   `spike_httponly` is **absent from `document.cookie` with no error** — the read succeeds and
   simply omits it. Exactly the false-negative shape.

5. **Confirmed on the live site.** `document.cookie` on
   `https://www.humblebundle.com/login` returned **27 names**, a large and healthy-looking
   list:

   ```
   _clsk, _clck, IR_25796, IR_PI, IR_gbd, _fbp, _ga, _ga_521T2JFWQS, _gcl_au, _rdt_uuid,
   _uetsid, _uetvid, zd_session_id, zpack, __lt__cid, __lt__sid, OPTY$$…VMAP, OPTY$$…VPROF,
   OTGPPConsent, OptanonConsent, optimizelySession, usprivacy, v2_humblebundlelive, fu,
   csrf_cookie, optimizelyEndUserId, optimizelySession
   ```

   **`_simpleauth_sess` is not in that list** — it is `HttpOnly=true`. The Rust API saw it in
   the same jar seconds earlier. A `document.cookie`-based `watchForLogin` would poll a
   27-cookie response forever and never find the one it needs.

6. **One useful positive.** `csrf_cookie` **is** visible to JS (`httpOnly=false`), so
   `getLiveCsrfToken()` could in principle use this channel — though there is no reason to,
   since the Rust API already returns it and does not require navigating the page.

## Results

**VERDICT: INVALIDATED as a login-detection channel.**

`document.cookie` cannot see `_simpleauth_sess`, and cannot report that it cannot see it. It
is a strictly weaker channel than 014a's Rust API, with the same silent-failure signature.

### Head-to-head vs 014a

| | 014a — Rust `cookies()` | 014b — `document.cookie` |
|---|---|---|
| Sees `HttpOnly` (`_simpleauth_sess`) | **yes**, full 80-char value | **no**, silently omitted |
| Sees `Secure` | yes | yes (page is https) |
| Needs the page to cooperate | no | yes — needs eval + a return channel |
| Return path | direct `Result<Vec<Cookie>>` | none built in; needs navigation exfil (destroys the page) or ACL plumbing |
| Failure mode | `Err` (loud) or classified empty | silent omission |
| Latency | 2–4 ms | ~2.5 s (a full navigation round trip) |
| **Winner** | **✓ WINNER** | rejected |

### Requirements this produces

4. **The Rust cookie API is the only viable login-detection channel.** Any design that leans
   on injected JS to detect Humble login is wrong by construction, because the deciding cookie
   is `HttpOnly`.
5. **Remote pages cannot invoke app commands.** A `remote.urls` capability is necessary but
   not sufficient; app commands are not in the ACL. Do not design a login flow that depends on
   the login page talking back to the backend.
6. **`window.__TAURI__` leaks onto third-party login origins** and should be threat-modelled
   (and suppressed if Tauri offers a per-window opt-out) before shipping a store browser.
